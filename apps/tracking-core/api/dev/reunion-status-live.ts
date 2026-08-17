import {
  methodNotAllowed,
  send,
  type VercelRequest,
  type VercelResponse,
} from "../_lib/http.js";
import {
  createDentalinkClient,
  createWindsorClient,
  getDentalinkConfig,
} from "../../src/index.js";
import { trailingRange, previousRange, type RangeDays } from "../../src/lib/date-ranges.js";
import { createGoogleAdsClient } from "../../src/modules/google-ads/client.js";
import { mergeDirectGoogleAds } from "../../src/modules/google-ads/marketing-merge.js";
import type { WindsorMarketingRow } from "../../src/modules/windsor/client.js";

interface ReunionStatusLiveBody {
  ok: true;
  generatedAt: string;
  range: {
    days: RangeDays;
    fromIso: string;
    toIso: string;
  };
  sources: {
    windsor: "ok" | "not_configured" | "error";
    googleAds: "ok" | "not_configured" | "error";
    dentalink: "ok" | "stub" | "error";
    supabase: "ok" | "not_configured" | "error";
  };
  marketing: {
    impressions: number | null;
    clicks: number | null;
    spend: number | null;
    bySource: Array<{
      source: string;
      impressions: number;
      clicks: number;
      spend: number;
    }>;
  };
  leads: {
    total: number | null;
    byAccount: Record<string, number>;
    bySource: Array<{ source: string; count: number }>;
  };
  appointments: {
    total: number | null;
    byAccount: Record<string, number>;
    byBranch: Record<string, number>;
    bySource: Array<{ source: string; count: number }>;
  };
  revenue: {
    total: number | null;
    payments: number | null;
    averagePayment: number | null;
    byBranch: Record<string, { revenue: number; payments: number }>;
  };
  funnel: {
    clickToLeadPct: number | null;
    leadToAppointmentPct: number | null;
    appointmentToPaymentPct: number | null;
    revenuePerLead: number | null;
    spendToRevenueRatio: number | null;
  };
  sac: {
    reportsCount: number | null;
    leadsReceived: number | null;
    leadsContacted: number | null;
    followUpsSent: number | null;
    promoWhatsappSent: number | null;
    callsReceived: number | null;
    appointmentsBooked: number | null;
  };
  comparison: {
    leadsDeltaPct: number | null;
    appointmentsDeltaPct: number | null;
    revenueDeltaPct: number | null;
  };
  notes: string[];
}

interface SupabaseConfig {
  url: string | null;
  serviceKey: string | null;
}

interface SupabaseLeadRow {
  account: string | null;
  source: string | null;
}

interface SupabaseAppointmentRow {
  account: string | null;
  branch: string | null;
  source: string | null;
}

interface SupabaseDailyReportPayload {
  leadsReceived?: number;
  leadsContacted?: number;
  followUpsSent?: number;
  promoWhatsappSent?: number;
  callsReceived?: number;
  appointmentsBooked?: number;
}

interface SupabaseDailyReportRow {
  payload: SupabaseDailyReportPayload;
}

export default async function handler(
  request: VercelRequest,
  response: VercelResponse,
): Promise<void> {
  if (request.method !== "GET") {
    methodNotAllowed(response);
    return;
  }

  const days = parseRangeDays(request.query?.rangeDays);
  const range = trailingRange(days, new Date());
  const previous = previousRange(range);
  const notes: string[] = [];

  const body: ReunionStatusLiveBody = {
    ok: true,
    generatedAt: new Date().toISOString(),
    range: {
      days,
      fromIso: range.fromIso,
      toIso: range.toIso,
    },
    sources: {
      windsor: "not_configured",
      googleAds: "not_configured",
      dentalink: "stub",
      supabase: "not_configured",
    },
    marketing: {
      impressions: null,
      clicks: null,
      spend: null,
      bySource: [],
    },
    leads: {
      total: null,
      byAccount: {},
      bySource: [],
    },
    appointments: {
      total: null,
      byAccount: {},
      byBranch: {},
      bySource: [],
    },
    revenue: {
      total: null,
      payments: null,
      averagePayment: null,
      byBranch: {},
    },
    funnel: {
      clickToLeadPct: null,
      leadToAppointmentPct: null,
      appointmentToPaymentPct: null,
      revenuePerLead: null,
      spendToRevenueRatio: null,
    },
    sac: {
      reportsCount: null,
      leadsReceived: null,
      leadsContacted: null,
      followUpsSent: null,
      promoWhatsappSent: null,
      callsReceived: null,
      appointmentsBooked: null,
    },
    comparison: {
      leadsDeltaPct: null,
      appointmentsDeltaPct: null,
      revenueDeltaPct: null,
    },
    notes,
  };

  await hydrateMarketing(body, notes, range.fromIso, range.toIso);
  await hydrateRevenue(body, notes, range.fromIso);
  await hydrateSupabase(body, notes, range.fromIso, range.toIso, previous.fromIso, previous.toIso);
  computeDerived(body);

  send(response, { status: 200, body });
}

function parseRangeDays(value: string | string[] | undefined): RangeDays {
  const raw = Array.isArray(value) ? value[0] : value;
  const numeric = Number(raw);
  return numeric === 30 || numeric === 180 ? numeric : 7;
}

async function hydrateMarketing(
  body: ReunionStatusLiveBody,
  notes: string[],
  fromIso: string,
  toIso: string,
) {
  const windsor = createWindsorClient();
  let windsorRows: WindsorMarketingRow[] = [];
  if (!windsor.isConfigured()) {
    notes.push("Windsor no configurado en este entorno.");
  } else {
    try {
      const result = await windsor.getMarketingSummary({
        dateFrom: fromIso.slice(0, 10),
        dateTo: toIso.slice(0, 10),
      });
      body.sources.windsor = "ok";
      windsorRows = result.rows;
      body.marketing.impressions = result.totals.impressions;
      body.marketing.clicks = result.totals.clicks;
      body.marketing.spend = result.totals.spend;
      body.marketing.bySource = result.bySource.map((item) => ({
        source: item.source,
        impressions: item.impressions,
        clicks: item.clicks,
        spend: item.spend,
      }));
    } catch (error) {
      body.sources.windsor = "error";
      notes.push(`Windsor error: ${error instanceof Error ? error.message : "desconocido"}`);
    }
  }

  const googleAds = createGoogleAdsClient();
  if (!googleAds.isConfigured()) {
    notes.push("Google Ads directo no configurado en este entorno.");
    return;
  }

  try {
    const result = await googleAds.getSummary({
      from: fromIso.slice(0, 10),
      to: toIso.slice(0, 10),
    });
    const merged = mergeDirectGoogleAds(windsorRows, result.accounts);
    body.sources.googleAds = "ok";
    body.marketing.bySource = merged.bySource;
    body.marketing.impressions = merged.totals.impressions;
    body.marketing.clicks = merged.totals.clicks;
    body.marketing.spend = merged.totals.spend;
    for (const accountError of result.errors) {
      notes.push(
        `Google Ads ${accountError.name} no disponible (status ${accountError.status}).`,
      );
    }
  } catch (error) {
    body.sources.googleAds = "error";
    notes.push(`Google Ads error: ${error instanceof Error ? error.message : "desconocido"}`);
  }
}

async function hydrateRevenue(
  body: ReunionStatusLiveBody,
  notes: string[],
  fromIso: string,
) {
  const dentalinkConfig = getDentalinkConfig();
  if (dentalinkConfig.mode !== "api") {
    body.sources.dentalink = "stub";
    notes.push("Dentalink está en modo stub en este entorno.");
    return;
  }

  try {
    const client = createDentalinkClient();
    const payments = await client.listRecentPayments(fromIso, 500);
    body.sources.dentalink = "ok";
    body.revenue.total = payments.reduce((sum, payment) => sum + payment.paymentAmount, 0);
    body.revenue.payments = payments.length;
    body.revenue.averagePayment = payments.length > 0 ? body.revenue.total / payments.length : 0;
    for (const payment of payments) {
      const branch = payment.branch ?? "Sin sucursal";
      const current = body.revenue.byBranch[branch] ?? { revenue: 0, payments: 0 };
      current.revenue += payment.paymentAmount;
      current.payments += 1;
      body.revenue.byBranch[branch] = current;
    }
  } catch (error) {
    body.sources.dentalink = "error";
    notes.push(`Dentalink error: ${error instanceof Error ? error.message : "desconocido"}`);
  }
}

async function hydrateSupabase(
  body: ReunionStatusLiveBody,
  notes: string[],
  fromIso: string,
  toIso: string,
  previousFromIso: string,
  previousToIso: string,
) {
  const config = getSupabaseConfig();
  if (!config.url || !config.serviceKey) {
    notes.push("Supabase de agente-nube no configurado en este entorno.");
    return;
  }

  body.sources.supabase = "ok";

  try {
    const [leadRows, previousLeadRows, appointmentRows, previousAppointmentRows, reportRows] = await Promise.all([
      supabaseSelect<SupabaseLeadRow>(config, `leads?select=account,source&occurred_at=gte.${encodeURIComponent(fromIso)}&occurred_at=lt.${encodeURIComponent(toIso)}`),
      supabaseSelect<SupabaseLeadRow>(config, `leads?select=account,source&occurred_at=gte.${encodeURIComponent(previousFromIso)}&occurred_at=lt.${encodeURIComponent(previousToIso)}`),
      supabaseSelect<SupabaseAppointmentRow>(config, `appointments?select=account,branch,source&occurred_at=gte.${encodeURIComponent(fromIso)}&occurred_at=lt.${encodeURIComponent(toIso)}`),
      supabaseSelect<SupabaseAppointmentRow>(config, `appointments?select=account,branch,source&occurred_at=gte.${encodeURIComponent(previousFromIso)}&occurred_at=lt.${encodeURIComponent(previousToIso)}`),
      supabaseSelect<SupabaseDailyReportRow>(config, `daily_reports?select=payload&date=gte.${encodeURIComponent(fromIso.slice(0, 10))}&date=lte.${encodeURIComponent(toIso.slice(0, 10))}`),
    ]);

    body.leads.total = leadRows.length;
    body.leads.byAccount = countByKey(leadRows, (row) => row.account ?? "sin_account");
    body.leads.bySource = toSortedEntries(countByKey(leadRows, (row) => row.source ?? "sin_source"), "count");

    body.appointments.total = appointmentRows.length;
    body.appointments.byAccount = countByKey(appointmentRows, (row) => row.account ?? "sin_account");
    body.appointments.byBranch = countByKey(appointmentRows, (row) => row.branch ?? "sin_sucursal");
    body.appointments.bySource = toSortedEntries(countByKey(appointmentRows, (row) => row.source ?? "sin_source"), "count");

    const sac = reportRows.reduce(
      (acc, row) => {
        acc.reportsCount += 1;
        acc.leadsReceived += numberOrZero(row.payload?.leadsReceived);
        acc.leadsContacted += numberOrZero(row.payload?.leadsContacted);
        acc.followUpsSent += numberOrZero(row.payload?.followUpsSent);
        acc.promoWhatsappSent += numberOrZero(row.payload?.promoWhatsappSent);
        acc.callsReceived += numberOrZero(row.payload?.callsReceived);
        acc.appointmentsBooked += numberOrZero(row.payload?.appointmentsBooked);
        return acc;
      },
      {
        reportsCount: 0,
        leadsReceived: 0,
        leadsContacted: 0,
        followUpsSent: 0,
        promoWhatsappSent: 0,
        callsReceived: 0,
        appointmentsBooked: 0,
      },
    );

    body.sac = sac;
    body.comparison.leadsDeltaPct = pctDelta(leadRows.length, previousLeadRows.length);
    body.comparison.appointmentsDeltaPct = pctDelta(appointmentRows.length, previousAppointmentRows.length);
  } catch (error) {
    body.sources.supabase = "error";
    notes.push(`Supabase error: ${error instanceof Error ? error.message : "desconocido"}`);
  }
}

function computeDerived(body: ReunionStatusLiveBody) {
  const impressions = body.marketing.impressions ?? 0;
  const clicks = body.marketing.clicks ?? 0;
  const spend = body.marketing.spend ?? 0;
  const leads = body.leads.total ?? 0;
  const appointments = body.appointments.total ?? 0;
  const payments = body.revenue.payments ?? 0;
  const revenue = body.revenue.total ?? 0;

  body.funnel.clickToLeadPct = clicks > 0 && leads > 0 ? (leads / clicks) * 100 : null;
  body.funnel.leadToAppointmentPct = leads > 0 && appointments > 0 ? (appointments / leads) * 100 : null;
  body.funnel.appointmentToPaymentPct = appointments > 0 && payments > 0 ? (payments / appointments) * 100 : null;
  body.funnel.revenuePerLead = leads > 0 ? revenue / leads : null;
  body.funnel.spendToRevenueRatio = spend > 0 && revenue > 0 ? revenue / spend : null;
  body.comparison.revenueDeltaPct = body.revenue.total === null ? null : null;

  if (impressions === 0) {
    body.notes.push("Marketing live sin impresiones en el rango o sin campañas filtradas.");
  }
}

function getSupabaseConfig(): SupabaseConfig {
  return {
    url: process.env.SUPABASE_URL ?? null,
    serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? null,
  };
}

async function supabaseSelect<T>(config: SupabaseConfig, path: string): Promise<T[]> {
  const url = `${config.url!.replace(/\/$/, "")}/rest/v1/${path}`;
  const response = await fetch(url, {
    method: "GET",
    headers: {
      apikey: config.serviceKey!,
      Authorization: `Bearer ${config.serviceKey!}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`supabase ${response.status}: ${text.slice(0, 200)}`);
  }
  return text ? (JSON.parse(text) as T[]) : [];
}

function countByKey<T>(rows: T[], getKey: (row: T) => string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const row of rows) {
    const key = getKey(row);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

function toSortedEntries(
  counts: Record<string, number>,
  valueKey: "count",
): Array<{ source: string; count: number }> {
  return Object.entries(counts)
    .map(([source, count]) => ({ source, [valueKey]: count }))
    .sort((a, b) => b.count - a.count);
}

function numberOrZero(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function pctDelta(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return ((current - previous) / previous) * 100;
}
