import {
  methodNotAllowed,
  send,
  toHttpRequest,
  type VercelRequest,
  type VercelResponse,
} from "../_lib/http.js";
import { requireTrackingSecret, serverError } from "../../src/index.js";
import { getDentalinkConfig } from "../../src/modules/dentalink/config.js";

interface DaySummaryBranch {
  branch: string;
  revenue: number;
  payments: number;
}

interface DaySummaryBody {
  ok: true;
  date: string;
  revenueTotal: number;
  paymentsCount: number;
  uniquePatients: number;
  branches: DaySummaryBranch[];
}

const MAX_PAGES = 10;

export default async function handler(
  request: VercelRequest,
  response: VercelResponse,
): Promise<void> {
  if (request.method !== "GET") {
    methodNotAllowed(response);
    return;
  }

  const authError = requireTrackingSecret(toHttpRequest(request));
  if (authError) {
    send(response, authError);
    return;
  }

  const dateParam = typeof request.query?.date === "string" ? request.query.date.trim() : null;
  if (!dateParam || !/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
    response.status(400).json({ ok: false, error: "date param required (YYYY-MM-DD)" });
    return;
  }

  try {
    const config = getDentalinkConfig();

    if (config.mode !== "api") {
      send(response, {
        status: 200,
        body: { ok: true, date: dateParam, revenueTotal: 0, paymentsCount: 0, uniquePatients: 0, branches: [] } satisfies DaySummaryBody,
      });
      return;
    }

    // Build date window: full calendar day in local time (ISO)
    const dayStart = new Date(`${dateParam}T00:00:00.000Z`);
    const dayEnd = new Date(`${dateParam}T23:59:59.999Z`);

    const records = await fetchDayPayments(
      config.baseUrl,
      config.apiAuthScheme,
      config.apiToken,
      config.paymentsPath,
      config.paymentDateField,
      config.paymentAmountField,
      config.paymentBranchField,
      config.paymentPatientIdField,
      dayStart,
      dayEnd,
    );

    const branchMap = new Map<string, DaySummaryBranch>();
    const patientIds = new Set<number>();
    let revenueTotal = 0;

    for (const r of records) {
      revenueTotal += r.amount;
      if (r.patientId > 0) patientIds.add(r.patientId);
      const branch = r.branch || "Sin sucursal";
      const b = branchMap.get(branch) ?? { branch, revenue: 0, payments: 0 };
      b.revenue += r.amount;
      b.payments += 1;
      branchMap.set(branch, b);
    }

    const branches = [...branchMap.values()].sort((a, b) => b.revenue - a.revenue);

    send(response, {
      status: 200,
      body: {
        ok: true,
        date: dateParam,
        revenueTotal,
        paymentsCount: records.length,
        uniquePatients: patientIds.size,
        branches,
      } satisfies DaySummaryBody,
    });
  } catch (error) {
    send(
      response,
      serverError("failed to build day summary", {
        message: error instanceof Error ? error.message : "unknown error",
      }),
    );
  }
}

async function fetchDayPayments(
  baseUrl: string,
  apiAuthScheme: string,
  apiToken: string,
  paymentsPath: string,
  dateField: string,
  amountField: string,
  branchField: string,
  patientIdField: string,
  dayStart: Date,
  dayEnd: Date,
): Promise<Array<{ amount: number; branch: string | null; patientId: number }>> {
  const results: Array<{ amount: number; branch: string | null; patientId: number }> = [];
  const fromIso = dayStart.toISOString().replace("T", " ").slice(0, 19);
  const toIso = dayEnd.toISOString().replace("T", " ").slice(0, 19);

  let pageUrl: URL | null = new URL(paymentsPath.replace(/^\/+/, ""), baseUrl);
  pageUrl.searchParams.set(dateField + "_desde", fromIso);
  pageUrl.searchParams.set(dateField + "_hasta", toIso);
  pageUrl.searchParams.set("estado", "1");

  let page = 0;
  while (pageUrl && page < MAX_PAGES) {
    const resp = await fetch(pageUrl.toString(), {
      headers: {
        Accept: "application/json",
        Authorization: `${apiAuthScheme} ${apiToken}`,
      },
    });

    if (!resp.ok) break;

    const json = (await resp.json()) as unknown;
    const data = extractArray(json);
    if (data.length === 0) break;

    for (const record of data) {
      if (typeof record !== "object" || record === null) continue;
      const r = record as Record<string, unknown>;
      const amount = readNumber(r, amountField);
      const branch = readString(r, branchField);
      const patientId = readNumber(r, patientIdField);
      if (amount > 0) {
        results.push({ amount, branch, patientId });
      }
    }

    // Pagination: Dentalink uses `siguiente` link
    const nextLink = extractNextLink(json);
    pageUrl = nextLink ? new URL(nextLink.replace(/^\/+/, ""), baseUrl) : null;
    page++;
  }

  return results;
}

function extractArray(json: unknown): unknown[] {
  if (Array.isArray(json)) return json;
  if (typeof json === "object" && json !== null) {
    const obj = json as Record<string, unknown>;
    const candidate = obj.data ?? obj.pagos ?? obj.items ?? obj.results;
    if (Array.isArray(candidate)) return candidate;
  }
  return [];
}

function extractNextLink(json: unknown): string | null {
  if (typeof json === "object" && json !== null) {
    const obj = json as Record<string, unknown>;
    const link = obj.siguiente ?? obj.next;
    return typeof link === "string" ? link : null;
  }
  return null;
}

function readNumber(record: Record<string, unknown>, key: string): number {
  const value = record[key];
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim()) {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function readString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  if (typeof value === "string" && value.trim()) return value.trim();
  return null;
}
