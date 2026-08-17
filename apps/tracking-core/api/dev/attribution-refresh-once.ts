import { createHash, timingSafeEqual } from "node:crypto";
import { methodNotAllowed, send, type VercelRequest, type VercelResponse } from "../_lib/http.js";
import { trackingHttpHandlers } from "../../src/index.js";
import { getDentalinkConfig } from "../../src/modules/dentalink/config.js";
import { parsePatientReferenceReport } from "../../src/modules/dentalink/patient-reference-report.js";
import { CHANNEL_LABELS, referenceToChannel } from "../../src/modules/reports/marketing-channels.js";

const TOKEN_HASH = "7200fe224e0cb3b09867f3b222cdfc240766a627ce6b90f2977f11a028fc9c3e";
const MAX_PAYMENT_PAGES = 40;
const PERSIST_CONCURRENCY = 25;

interface RequestPayload {
  rows: Record<string, unknown>[];
  dateFrom: string;
  dateTo: string;
}

interface PaymentRow {
  patientId: number;
  date: string;
  clinic: "polanco" | "roma" | "unknown";
  amount: number;
}

export default async function handler(request: VercelRequest, response: VercelResponse): Promise<void> {
  if (request.method !== "POST") {
    methodNotAllowed(response);
    return;
  }
  if (!hasOneTimeToken(request)) {
    send(response, { status: 401, body: { error: "unauthorized" } });
    return;
  }

  const payload = parseBody(request.body);
  if (!payload || payload.rows.length === 0) {
    send(response, { status: 400, body: { error: "invalid payload" } });
    return;
  }

  const ingestion = parsePatientReferenceReport(payload.rows);
  if (ingestion.records.length === 0) {
    send(response, { status: 422, body: { error: "missing patient id column" } });
    return;
  }

  const store = trackingHttpHandlers.stateStore;
  const withReference = ingestion.records.filter(
    (record): record is typeof record & { reference: string } => Boolean(record.reference),
  );
  for (let i = 0; i < withReference.length; i += PERSIST_CONCURRENCY) {
    await Promise.all(
      withReference.slice(i, i + PERSIST_CONCURRENCY).map((record) =>
        store.setPatientReference(record.patientId, record.reference),
      ),
    );
  }

  const payments = await fetchPayments(payload.dateFrom, payload.dateTo);
  const patientIds = [...new Set(payments.map((payment) => payment.patientId))];
  const references = await store.batchGetPatientReferences(patientIds);
  const newReferences = new Map(
    ingestion.records
      .filter((record): record is typeof record & { reference: string } => Boolean(record.reference))
      .map((record) => [record.patientId, record.reference]),
  );

  const aggregated = new Map<string, { fecha: string; clinica: string; canal: string; caja: number; pagos: number }>();
  let unattributedPayments = 0;
  let unattributedRevenue = 0;
  for (const payment of payments) {
    const reference = newReferences.get(payment.patientId) ?? references.get(payment.patientId);
    if (!reference) {
      unattributedPayments += 1;
      unattributedRevenue += payment.amount;
      continue;
    }
    const channel = CHANNEL_LABELS[referenceToChannel(reference)];
    const key = `${payment.date}|${payment.clinic}|${channel}`;
    const current = aggregated.get(key) ?? {
      fecha: payment.date,
      clinica: payment.clinic,
      canal: channel,
      caja: 0,
      pagos: 0,
    };
    current.caja += payment.amount;
    current.pagos += 1;
    aggregated.set(key, current);
  }

  send(response, {
    status: 200,
    body: {
      ok: true,
      dateFrom: payload.dateFrom,
      dateTo: payload.dateTo,
      ingestion: {
        totalRows: ingestion.totalRows,
        patients: ingestion.records.length,
        withReference: ingestion.withReference,
        coverage: ingestion.coverage,
        persistedReferences: withReference.length,
      },
      paymentsRead: payments.length,
      attribution: [...aggregated.values()]
        .map((row) => ({ ...row, caja: Math.round(row.caja * 100) / 100 }))
        .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.clinica.localeCompare(b.clinica) || a.canal.localeCompare(b.canal)),
      unattributed: {
        payments: unattributedPayments,
        revenue: Math.round(unattributedRevenue * 100) / 100,
      },
    },
  });
}

function hasOneTimeToken(request: VercelRequest): boolean {
  const raw = request.headers?.["x-maintenance-token"];
  const token = Array.isArray(raw) ? raw[0] : raw;
  if (!token) return false;
  const actual = createHash("sha256").update(token).digest();
  const expected = Buffer.from(TOKEN_HASH, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function parseBody(body: unknown): RequestPayload | null {
  const value = typeof body === "string" ? JSON.parse(body) as unknown : body;
  if (!isRecord(value) || !Array.isArray(value.rows)) return null;
  const dateFrom = typeof value.dateFrom === "string" ? value.dateFrom : "";
  const dateTo = typeof value.dateTo === "string" ? value.dateTo : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateFrom) || !/^\d{4}-\d{2}-\d{2}$/.test(dateTo)) return null;
  return {
    rows: value.rows.filter(isRecord),
    dateFrom,
    dateTo,
  };
}

async function fetchPayments(dateFrom: string, dateTo: string): Promise<PaymentRow[]> {
  const config = getDentalinkConfig();
  const filter = JSON.stringify({ [config.paymentDateField]: { gte: `${dateFrom} 00:00:00` } });
  let pageUrl: URL | null = new URL(config.paymentsPath.replace(/^\/+/, ""), config.baseUrl);
  pageUrl.search = `q=${encodeURIComponent(filter)}`;
  const payments: PaymentRow[] = [];

  for (let page = 0; pageUrl && page < MAX_PAYMENT_PAGES; page += 1) {
    const body = await requestDentalink(pageUrl, config.apiAuthScheme, config.apiToken);
    for (const record of readCollection(body)) {
      const date = readString(record, config.paymentDateField).slice(0, 10);
      const patientId = readNumber(record, config.paymentPatientIdField);
      const amount = readNumber(record, config.paymentAmountField);
      if (date < dateFrom || date > dateTo || patientId <= 0 || amount <= 0 || readBoolean(record, config.paymentVoidedField)) continue;
      payments.push({
        patientId,
        date,
        clinic: normalizeClinic(readString(record, config.paymentBranchField)),
        amount,
      });
    }
    pageUrl = readNextPageUrl(body, config.baseUrl);
  }
  return payments;
}

function normalizeClinic(value: string): "polanco" | "roma" | "unknown" {
  const normalized = value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
  if (normalized.includes("ARIZA") || normalized.includes("TORCAT") || normalized.includes("ROMA")) return "roma";
  if (normalized.includes("DRDIENTE") || normalized.includes("POLANCO")) return "polanco";
  return "unknown";
}

async function requestDentalink(url: URL, scheme: string, token: string): Promise<unknown> {
  const response = await fetch(url, {
    headers: { Accept: "application/json", Authorization: `${scheme} ${token}` },
  });
  if (!response.ok) throw new Error(`Dentalink respondió ${response.status}`);
  return await response.json() as unknown;
}

function readCollection(body: unknown): Record<string, unknown>[] {
  if (Array.isArray(body)) return body.filter(isRecord);
  if (isRecord(body) && Array.isArray(body.data)) return body.data.filter(isRecord);
  return [];
}

function readNextPageUrl(body: unknown, baseUrl: string): URL | null {
  if (!isRecord(body) || !isRecord(body.links)) return null;
  const next = body.links.next;
  return typeof next === "string" && next.trim() ? new URL(next, baseUrl) : null;
}

function readNumber(record: Record<string, unknown>, key: string): number {
  const value = record[key];
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function readString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  return typeof value === "string" ? value.trim() : value == null ? "" : String(value);
}

function readBoolean(record: Record<string, unknown>, key: string): boolean {
  const value = record[key];
  if (value === true || value === 1) return true;
  if (typeof value !== "string") return false;
  return ["1", "true", "si", "sí", "yes"].includes(value.trim().toLowerCase());
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
