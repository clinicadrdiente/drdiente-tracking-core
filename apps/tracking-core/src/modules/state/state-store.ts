import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, resolve } from "node:path";
import { getAppConfig } from "../../config/app-config.js";
import type { DailyBranchReport, PatientTreatmentRecord, PatientTreatmentSummary } from "../../types/domain.js";

export interface PaymentSyncState {
  lastCheckIso?: string;
  processedPaymentIds: string[];
}

export interface StateStore {
  getPaymentSyncState(): Promise<PaymentSyncState>;
  savePaymentSyncState(state: PaymentSyncState): Promise<void>;
  hasProcessedPayment(paymentId: string): Promise<boolean>;
  markPaymentProcessed(paymentId: string): Promise<void>;
  /** Atomically marks as processed. Returns true if this call claimed it (first time), false if already existed. */
  claimPaymentProcessed(paymentId: string): Promise<boolean>;
  /** Removes a claimed key so it can be re-claimed (used to roll back a failed dispatch). No-op if absent. */
  releasePaymentClaim(paymentId: string): Promise<void>;
  writeHeartbeat(key: string, isoTimestamp: string): Promise<void>;
  readHeartbeat(key: string): Promise<string | null>;
  /** Upsert by reportId (same branch+date overwrites). */
  saveDailyReport(report: DailyBranchReport): Promise<void>;
  /** Reports with date in [fromDate, toDate] (inclusive, "YYYY-MM-DD"), newest first. */
  listDailyReports(fromDate: string, toDate: string): Promise<DailyBranchReport[]>;
  /** Store the digital marketing source for a contact (phone or email). TTL: 90 days. */
  setContactLeadSource(contact: string, source: string): Promise<void>;
  getContactLeadSource(contact: string): Promise<string | null>;
  batchGetContactLeadSources(contacts: string[]): Promise<Map<string, string>>;
  /** Upsert a treatment for a patient. Dedupes by treatmentId; updates lastPaymentAt on subsequent calls. */
  recordPatientTreatment(record: PatientTreatmentRecord): Promise<void>;
  /** Patients sorted by treatmentCount desc. minTreatments defaults to 1 (all). */
  listRecurringPatients(minTreatments?: number): Promise<PatientTreatmentSummary[]>;
}

export class InMemoryStateStore implements StateStore {
  private paymentSyncState: PaymentSyncState = {
    processedPaymentIds: [],
  };
  private heartbeats: Map<string, string> = new Map();
  private dailyReports: Map<string, DailyBranchReport> = new Map();
  private contactLeadSources: Map<string, string> = new Map();
  private patientTreatments: Map<number, Map<number, PatientTreatmentRecord>> = new Map();

  async getPaymentSyncState(): Promise<PaymentSyncState> {
    return {
      lastCheckIso: this.paymentSyncState.lastCheckIso,
      processedPaymentIds: [...this.paymentSyncState.processedPaymentIds],
    };
  }

  async savePaymentSyncState(state: PaymentSyncState): Promise<void> {
    // An empty processedPaymentIds is a no-op for the dedupe set: ids are
    // persisted per-key by claim/mark, so an empty save only updates the cursor
    // (mirrors RedisStateStore, which guards its SADD on length > 0).
    this.paymentSyncState = {
      lastCheckIso: state.lastCheckIso,
      processedPaymentIds:
        state.processedPaymentIds.length > 0
          ? [...state.processedPaymentIds]
          : this.paymentSyncState.processedPaymentIds,
    };
  }

  async hasProcessedPayment(paymentId: string): Promise<boolean> {
    return this.paymentSyncState.processedPaymentIds.includes(paymentId);
  }

  async markPaymentProcessed(paymentId: string): Promise<void> {
    if (!this.paymentSyncState.processedPaymentIds.includes(paymentId)) {
      this.paymentSyncState.processedPaymentIds.push(paymentId);
    }
  }

  async claimPaymentProcessed(paymentId: string): Promise<boolean> {
    if (this.paymentSyncState.processedPaymentIds.includes(paymentId)) {
      return false;
    }
    this.paymentSyncState.processedPaymentIds.push(paymentId);
    return true;
  }

  async releasePaymentClaim(paymentId: string): Promise<void> {
    this.paymentSyncState.processedPaymentIds =
      this.paymentSyncState.processedPaymentIds.filter((id) => id !== paymentId);
  }

  async writeHeartbeat(key: string, isoTimestamp: string): Promise<void> {
    this.heartbeats.set(key, isoTimestamp);
  }

  async readHeartbeat(key: string): Promise<string | null> {
    return this.heartbeats.get(key) ?? null;
  }

  async saveDailyReport(report: DailyBranchReport): Promise<void> {
    this.dailyReports.set(report.reportId, { ...report });
  }

  async listDailyReports(fromDate: string, toDate: string): Promise<DailyBranchReport[]> {
    return Array.from(this.dailyReports.values())
      .filter((r) => r.date >= fromDate && r.date <= toDate)
      .sort((a, b) => b.date.localeCompare(a.date));
  }

  async setContactLeadSource(contact: string, source: string): Promise<void> {
    this.contactLeadSources.set(contact, source);
  }

  async getContactLeadSource(contact: string): Promise<string | null> {
    return this.contactLeadSources.get(contact) ?? null;
  }

  async batchGetContactLeadSources(contacts: string[]): Promise<Map<string, string>> {
    const result = new Map<string, string>();
    for (const contact of contacts) {
      const source = this.contactLeadSources.get(contact);
      if (source) result.set(contact, source);
    }
    return result;
  }

  async recordPatientTreatment(record: PatientTreatmentRecord): Promise<void> {
    let byTreatment = this.patientTreatments.get(record.patientId);
    if (!byTreatment) {
      byTreatment = new Map();
      this.patientTreatments.set(record.patientId, byTreatment);
    }
    const existing = byTreatment.get(record.treatmentId);
    byTreatment.set(record.treatmentId, {
      ...record,
      firstPaymentAt: existing ? existing.firstPaymentAt : record.firstPaymentAt,
      lastPaymentAt: record.lastPaymentAt > (existing?.lastPaymentAt ?? "") ? record.lastPaymentAt : (existing?.lastPaymentAt ?? record.lastPaymentAt),
    });
  }

  async listRecurringPatients(minTreatments = 1): Promise<PatientTreatmentSummary[]> {
    return buildSummaries(this.patientTreatments, minTreatments);
  }
}

export class FileStateStore implements StateStore {
  constructor(private readonly filePath: string) {}

  async getPaymentSyncState(): Promise<PaymentSyncState> {
    return this.readState();
  }

  async savePaymentSyncState(state: PaymentSyncState): Promise<void> {
    // An empty processedPaymentIds is a no-op for the dedupe set: ids are
    // persisted per-key by claim/mark, so an empty save only updates the cursor
    // (mirrors RedisStateStore, which guards its SADD on length > 0).
    if (state.processedPaymentIds.length === 0) {
      const existing = await this.readState();
      await this.writeState({
        lastCheckIso: state.lastCheckIso,
        processedPaymentIds: existing.processedPaymentIds,
      });
      return;
    }
    await this.writeState(state);
  }

  async hasProcessedPayment(paymentId: string): Promise<boolean> {
    const state = await this.readState();
    return state.processedPaymentIds.includes(paymentId);
  }

  async markPaymentProcessed(paymentId: string): Promise<void> {
    const state = await this.readState();
    if (!state.processedPaymentIds.includes(paymentId)) {
      state.processedPaymentIds.push(paymentId);
      await this.writeState(state);
    }
  }

  async claimPaymentProcessed(paymentId: string): Promise<boolean> {
    const state = await this.readState();
    if (state.processedPaymentIds.includes(paymentId)) {
      return false;
    }
    state.processedPaymentIds.push(paymentId);
    await this.writeState(state);
    return true;
  }

  async releasePaymentClaim(paymentId: string): Promise<void> {
    const state = await this.readState();
    const next = state.processedPaymentIds.filter((id) => id !== paymentId);
    if (next.length !== state.processedPaymentIds.length) {
      state.processedPaymentIds = next;
      await this.writeState(state);
    }
  }

  async writeHeartbeat(key: string, isoTimestamp: string): Promise<void> {
    const state = await this.readRawState();
    (state as Record<string, unknown>).heartbeats = {
      ...((state as Record<string, unknown>).heartbeats as Record<string, string> | undefined ?? {}),
      [key]: isoTimestamp,
    };
    await this.writeRawState(state as Record<string, unknown>);
  }

  async readHeartbeat(key: string): Promise<string | null> {
    const state = await this.readRawState() as Record<string, unknown>;
    const heartbeats = state.heartbeats as Record<string, string> | undefined;
    return heartbeats?.[key] ?? null;
  }

  async saveDailyReport(report: DailyBranchReport): Promise<void> {
    const state = await this.readRawState();
    const existing = (state.dailyReports as Record<string, DailyBranchReport> | undefined) ?? {};
    existing[report.reportId] = report;
    state.dailyReports = existing;
    await this.writeRawState(state);
  }

  async listDailyReports(fromDate: string, toDate: string): Promise<DailyBranchReport[]> {
    const state = await this.readRawState();
    const reports = Object.values(
      (state.dailyReports as Record<string, DailyBranchReport> | undefined) ?? {},
    ) as DailyBranchReport[];
    return reports
      .filter((r) => r.date >= fromDate && r.date <= toDate)
      .sort((a, b) => b.date.localeCompare(a.date));
  }

  async setContactLeadSource(contact: string, source: string): Promise<void> {
    const state = await this.readRawState();
    const existing = (state.contactLeadSources as Record<string, string> | undefined) ?? {};
    existing[contact] = source;
    state.contactLeadSources = existing;
    await this.writeRawState(state);
  }

  async getContactLeadSource(contact: string): Promise<string | null> {
    const state = await this.readRawState() as Record<string, unknown>;
    const map = state.contactLeadSources as Record<string, string> | undefined;
    return map?.[contact] ?? null;
  }

  async batchGetContactLeadSources(contacts: string[]): Promise<Map<string, string>> {
    const state = await this.readRawState() as Record<string, unknown>;
    const map = state.contactLeadSources as Record<string, string> | undefined ?? {};
    const result = new Map<string, string>();
    for (const contact of contacts) {
      if (map[contact]) result.set(contact, map[contact]);
    }
    return result;
  }

  async recordPatientTreatment(record: PatientTreatmentRecord): Promise<void> {
    const state = await this.readRawState();
    const all = (state.patientTreatments as Record<string, Record<string, PatientTreatmentRecord>> | undefined) ?? {};
    const pid = String(record.patientId);
    const tid = String(record.treatmentId);
    const existing = all[pid]?.[tid];
    all[pid] = all[pid] ?? {};
    all[pid][tid] = {
      ...record,
      firstPaymentAt: existing ? existing.firstPaymentAt : record.firstPaymentAt,
      lastPaymentAt: record.lastPaymentAt > (existing?.lastPaymentAt ?? "") ? record.lastPaymentAt : (existing?.lastPaymentAt ?? record.lastPaymentAt),
    };
    state.patientTreatments = all;
    await this.writeRawState(state);
  }

  async listRecurringPatients(minTreatments = 1): Promise<PatientTreatmentSummary[]> {
    const state = await this.readRawState();
    const all = (state.patientTreatments as Record<string, Record<string, PatientTreatmentRecord>> | undefined) ?? {};
    const asMap = new Map<number, Map<number, PatientTreatmentRecord>>();
    for (const [pid, treatments] of Object.entries(all)) {
      const inner = new Map<number, PatientTreatmentRecord>();
      for (const [tid, rec] of Object.entries(treatments)) {
        inner.set(Number(tid), rec);
      }
      asMap.set(Number(pid), inner);
    }
    return buildSummaries(asMap, minTreatments);
  }

  private async readState(): Promise<PaymentSyncState> {
    const raw = await this.readRawState();
    const parsed = raw as unknown as PaymentSyncState;
    return {
      lastCheckIso: parsed.lastCheckIso,
      processedPaymentIds: Array.isArray(parsed.processedPaymentIds)
        ? parsed.processedPaymentIds
        : [],
    };
  }

  private async writeState(state: PaymentSyncState): Promise<void> {
    const existing = await this.readRawState();
    await this.writeRawState({ ...existing, ...state });
  }

  private async readRawState(): Promise<Record<string, unknown>> {
    try {
      const raw = await readFile(this.absolutePath(), "utf8");
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return { processedPaymentIds: [] };
    }
  }

  private async writeRawState(state: Record<string, unknown>): Promise<void> {
    const path = this.absolutePath();
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, JSON.stringify(state, null, 2), "utf8");
  }

  private absolutePath(): string {
    if (!isAbsolute(this.filePath) && process.env.VERCEL) {
      return resolve(tmpdir(), this.filePath);
    }

    return resolve(process.cwd(), this.filePath);
  }
}

export class RedisStateStore implements StateStore {
  private readonly stateKey: string;
  private readonly processedSetKey: string;
  private readonly dailyReportsKey: string;
  private readonly patientTreatmentsIndexKey: string;

  constructor(
    private readonly restUrl: string,
    private readonly restToken: string,
    keyPrefix: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    this.stateKey = `${keyPrefix}:payment-sync:state`;
    this.processedSetKey = `${keyPrefix}:payment-sync:processed`;
    this.dailyReportsKey = `${keyPrefix}:daily-reports`;
    this.patientTreatmentsIndexKey = `${keyPrefix}:patient-treatments:_index`;
  }

  async getPaymentSyncState(): Promise<PaymentSyncState> {
    const stateJson = await this.command<string | null>(["GET", this.stateKey]);
    const parsedState = parsePaymentSyncState(stateJson);

    return {
      lastCheckIso: parsedState.lastCheckIso,
      // processed ids are stored as per-key TTL strings (no cheap "list all"),
      // and only the cursor (lastCheckIso) is consumed downstream.
      processedPaymentIds: [],
    };
  }

  async savePaymentSyncState(state: PaymentSyncState): Promise<void> {
    const payload = JSON.stringify({ lastCheckIso: state.lastCheckIso });
    await this.command(["SET", this.stateKey, payload]);

    if (state.processedPaymentIds.length > 0) {
      await Promise.all(
        state.processedPaymentIds.map((id) =>
          this.command([
            "SET",
            this.processedKey(id),
            "1",
            "EX",
            this.processedTtlSeconds(),
          ]),
        ),
      );
    }
  }

  private processedKey(id: string): string {
    return `${this.processedSetKey}:k:${id}`;
  }

  private processedTtlSeconds(): number {
    const lookbackSec = getAppConfig().paymentsSyncLookbackMinutes * 60;
    return Math.max(7 * 24 * 60 * 60, lookbackSec * 2);
  }

  async hasProcessedPayment(paymentId: string): Promise<boolean> {
    const r = await this.command<number>(["EXISTS", this.processedKey(paymentId)]);
    return r === 1;
  }

  async markPaymentProcessed(paymentId: string): Promise<void> {
    await this.command([
      "SET",
      this.processedKey(paymentId),
      "1",
      "EX",
      this.processedTtlSeconds(),
    ]);
  }

  async claimPaymentProcessed(paymentId: string): Promise<boolean> {
    // SET NX returns "OK" when it set the key, null when it already existed.
    const r = await this.command<string | null>([
      "SET",
      this.processedKey(paymentId),
      "1",
      "NX",
      "EX",
      this.processedTtlSeconds(),
    ]);
    return r === "OK";
  }

  async releasePaymentClaim(paymentId: string): Promise<void> {
    await this.command(["DEL", this.processedKey(paymentId)]);
  }

  async writeHeartbeat(key: string, isoTimestamp: string): Promise<void> {
    const fullKey = `${this.stateKey}:heartbeat:${key}`;
    await this.command(["SET", fullKey, isoTimestamp, "EX", 172800]); // 48h TTL
  }

  async readHeartbeat(key: string): Promise<string | null> {
    const fullKey = `${this.stateKey}:heartbeat:${key}`;
    return await this.command<string | null>(["GET", fullKey]);
  }

  async saveDailyReport(report: DailyBranchReport): Promise<void> {
    await this.command(["HSET", this.dailyReportsKey, report.reportId, JSON.stringify(report)]);
  }

  async listDailyReports(fromDate: string, toDate: string): Promise<DailyBranchReport[]> {
    const raw = await this.command<Record<string, string> | null>(["HGETALL", this.dailyReportsKey]);
    if (!raw || typeof raw !== "object") {
      return [];
    }
    const reports = Object.values(raw).map((v) => JSON.parse(v) as DailyBranchReport);
    return reports
      .filter((r) => r.date >= fromDate && r.date <= toDate)
      .sort((a, b) => b.date.localeCompare(a.date));
  }

  async setContactLeadSource(contact: string, source: string): Promise<void> {
    const key = `${this.stateKey}:contact-source:${contact}`;
    await this.command(["SET", key, source, "EX", 7776000]); // 90 days
  }

  async getContactLeadSource(contact: string): Promise<string | null> {
    const key = `${this.stateKey}:contact-source:${contact}`;
    return await this.command<string | null>(["GET", key]);
  }

  async batchGetContactLeadSources(contacts: string[]): Promise<Map<string, string>> {
    if (contacts.length === 0) return new Map();
    const keys = contacts.map((c) => `${this.stateKey}:contact-source:${c}`);
    const values = await this.command<(string | null)[]>(["MGET", ...keys]);
    const result = new Map<string, string>();
    if (Array.isArray(values)) {
      for (let i = 0; i < contacts.length; i++) {
        const v = values[i];
        if (v) result.set(contacts[i], v);
      }
    }
    return result;
  }

  async recordPatientTreatment(record: PatientTreatmentRecord): Promise<void> {
    const hashKey = `${this.stateKey}:patient-treatments:${record.patientId}`;
    const existing = await this.command<string | null>(["HGET", hashKey, String(record.treatmentId)]);
    const prev = existing ? (JSON.parse(existing) as PatientTreatmentRecord) : null;
    const toStore: PatientTreatmentRecord = {
      ...record,
      firstPaymentAt: prev ? prev.firstPaymentAt : record.firstPaymentAt,
      lastPaymentAt: record.lastPaymentAt > (prev?.lastPaymentAt ?? "") ? record.lastPaymentAt : (prev?.lastPaymentAt ?? record.lastPaymentAt),
    };
    await Promise.all([
      this.command(["HSET", hashKey, String(record.treatmentId), JSON.stringify(toStore)]),
      this.command(["SADD", this.patientTreatmentsIndexKey, String(record.patientId)]),
    ]);
  }

  async listRecurringPatients(minTreatments = 1): Promise<PatientTreatmentSummary[]> {
    const patientIds = await this.command<string[]>(["SMEMBERS", this.patientTreatmentsIndexKey]);
    if (!Array.isArray(patientIds) || patientIds.length === 0) return [];

    const asMap = new Map<number, Map<number, PatientTreatmentRecord>>();
    await Promise.all(
      patientIds.map(async (pid) => {
        const hashKey = `${this.stateKey}:patient-treatments:${pid}`;
        const raw = await this.command<Record<string, string> | null>(["HGETALL", hashKey]);
        if (!raw || typeof raw !== "object") return;
        const inner = new Map<number, PatientTreatmentRecord>();
        for (const [tid, json] of Object.entries(raw)) {
          inner.set(Number(tid), JSON.parse(json) as PatientTreatmentRecord);
        }
        asMap.set(Number(pid), inner);
      }),
    );

    return buildSummaries(asMap, minTreatments);
  }

  private async command<T = unknown>(
    command: Array<string | number>,
  ): Promise<T> {
    const response = await this.fetchImpl(this.restUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.restToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(command),
    });

    if (!response.ok) {
      throw new Error(`Redis request failed with status ${response.status}`);
    }

    const body = (await response.json()) as {
      result?: T;
      error?: string;
    };

    if (body.error) {
      throw new Error(`Redis command failed: ${body.error}`);
    }

    return body.result as T;
  }
}

function buildSummaries(
  map: Map<number, Map<number, PatientTreatmentRecord>>,
  minTreatments: number,
): PatientTreatmentSummary[] {
  const summaries: PatientTreatmentSummary[] = [];
  for (const [patientId, byTreatment] of map.entries()) {
    const treatments = Array.from(byTreatment.values());
    if (treatments.length < minTreatments) continue;
    const sorted = [...treatments].sort((a, b) => a.firstPaymentAt.localeCompare(b.firstPaymentAt));
    summaries.push({
      patientId,
      patientName: treatments[0].patientName,
      branch: treatments[0].branch,
      treatments: sorted,
      treatmentCount: treatments.length,
      totalBudget: treatments.reduce((sum, t) => sum + t.budgetTotal, 0),
      firstPaymentAt: sorted[0].firstPaymentAt,
      lastPaymentAt: treatments.reduce((max, t) => t.lastPaymentAt > max ? t.lastPaymentAt : max, ""),
    });
  }
  return summaries.sort((a, b) => b.treatmentCount - a.treatmentCount || b.totalBudget - a.totalBudget);
}

function parsePaymentSyncState(value: string | null): Pick<PaymentSyncState, "lastCheckIso"> {
  if (!value) {
    return {};
  }

  try {
    const parsed = JSON.parse(value) as PaymentSyncState;
    return {
      lastCheckIso:
        typeof parsed.lastCheckIso === "string"
          ? parsed.lastCheckIso
          : undefined,
    };
  } catch {
    return {};
  }
}
