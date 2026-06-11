import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, resolve } from "node:path";
import type { DailyBranchReport } from "../../types/domain.js";

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
  writeHeartbeat(key: string, isoTimestamp: string): Promise<void>;
  readHeartbeat(key: string): Promise<string | null>;
  /** Upsert by reportId (same branch+date overwrites). */
  saveDailyReport(report: DailyBranchReport): Promise<void>;
  /** Reports with date in [fromDate, toDate] (inclusive, "YYYY-MM-DD"), newest first. */
  listDailyReports(fromDate: string, toDate: string): Promise<DailyBranchReport[]>;
}

export class InMemoryStateStore implements StateStore {
  private paymentSyncState: PaymentSyncState = {
    processedPaymentIds: [],
  };
  private heartbeats: Map<string, string> = new Map();
  private dailyReports: Map<string, DailyBranchReport> = new Map();

  async getPaymentSyncState(): Promise<PaymentSyncState> {
    return {
      lastCheckIso: this.paymentSyncState.lastCheckIso,
      processedPaymentIds: [...this.paymentSyncState.processedPaymentIds],
    };
  }

  async savePaymentSyncState(state: PaymentSyncState): Promise<void> {
    this.paymentSyncState = {
      lastCheckIso: state.lastCheckIso,
      processedPaymentIds: [...state.processedPaymentIds],
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
}

export class FileStateStore implements StateStore {
  constructor(private readonly filePath: string) {}

  async getPaymentSyncState(): Promise<PaymentSyncState> {
    return this.readState();
  }

  async savePaymentSyncState(state: PaymentSyncState): Promise<void> {
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

  constructor(
    private readonly restUrl: string,
    private readonly restToken: string,
    keyPrefix: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    this.stateKey = `${keyPrefix}:payment-sync:state`;
    this.processedSetKey = `${keyPrefix}:payment-sync:processed`;
    this.dailyReportsKey = `${keyPrefix}:daily-reports`;
  }

  async getPaymentSyncState(): Promise<PaymentSyncState> {
    const [stateJson, processedPaymentIds] = await Promise.all([
      this.command<string | null>(["GET", this.stateKey]),
      this.command<string[]>(["SMEMBERS", this.processedSetKey]),
    ]);
    const parsedState = parsePaymentSyncState(stateJson);

    return {
      lastCheckIso: parsedState.lastCheckIso,
      processedPaymentIds: Array.isArray(processedPaymentIds)
        ? processedPaymentIds
        : [],
    };
  }

  async savePaymentSyncState(state: PaymentSyncState): Promise<void> {
    const payload = JSON.stringify({ lastCheckIso: state.lastCheckIso });
    await this.command(["SET", this.stateKey, payload]);

    if (state.processedPaymentIds.length > 0) {
      await this.command([
        "SADD",
        this.processedSetKey,
        ...state.processedPaymentIds,
      ]);
    }
  }

  async hasProcessedPayment(paymentId: string): Promise<boolean> {
    const result = await this.command<number>([
      "SISMEMBER",
      this.processedSetKey,
      paymentId,
    ]);
    return result === 1;
  }

  async markPaymentProcessed(paymentId: string): Promise<void> {
    await this.command(["SADD", this.processedSetKey, paymentId]);
  }

  async claimPaymentProcessed(paymentId: string): Promise<boolean> {
    const added = await this.command<number>(["SADD", this.processedSetKey, paymentId]);
    return added === 1;
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
