import {
  methodNotAllowed,
  send,
  toHttpRequest,
  type VercelRequest,
  type VercelResponse,
} from "../_lib/http.js";
import { requireTrackingSecret, serverError, trackingHttpHandlers } from "../../src/index.js";
import { getDentalinkConfig } from "../../src/modules/dentalink/config.js";
import {
  buildMarketingAttribution,
  type MarketingAttributionSummary,
} from "../../src/modules/dentalink/reference-attribution.js";
import { trailingRange, groupByMonth, previousRange, type RangeDays, type MonthBucket } from "../../src/lib/date-ranges.js";

interface MonthlyPaymentBlock {
  paymentId: number;
  patientId: number;
  patientName: string | null;
  patientEmail: string | null;
  patientPhone: string | null;
  patientReference: string | null;
  treatmentId: number;
  treatmentName: string | null;
  treatmentBudgetTotal: number;
  branch: string | null;
  paymentMethod: string | null;
  folio: string | null;
  reference: string | null;
  amount: number;
  createdAt: string | null;
  digitalSource?: string | null;
}

interface DayBlock {
  day: number;
  date: string;
  label: string;
  revenue: number;
  payments: number;
  patients: MonthlyPaymentBlock[];
}

interface BranchSummary {
  branch: string;
  revenue: number;
  payments: number;
  uniquePatients: number;
  averagePaymentValue: number;
  share: number;
  topPatients: MonthlyPaymentBlock[];
}

interface MonthlyDashboardBody {
  ok: true;
  mode: string;
  month?: {
    label: string;
    fromIso: string;
    toIso: string;
  };
  range: {
    days: number | null;
    fromIso: string;
    toIso: string;
  };
  months: MonthBucket[];
  revenueTotal: number;
  paymentsTotal: number;
  uniquePatientsTotal: number;
  averagePaymentValue: number;
  days: DayBlock[];
  patients: MonthlyPaymentBlock[];
  treatmentShare: ReturnType<typeof buildTreatmentShare>;
  branchShare: BranchSummary[];
  marketingAttribution: MarketingAttributionSummary;
  comparison?: {
    fromIso: string;
    toIso: string;
    revenueTotal: number;
    paymentsTotal: number;
    uniquePatientsTotal: number;
    averagePaymentValue: number;
    branchShare: Array<{ branch: string; revenue: number; payments: number }>;
    marketingAttribution: MarketingAttributionSummary;
  };
  cache: {
    hit: boolean;
    stale: boolean;
    cachedAt: string;
    ttlSeconds: number;
  };
}

const MAX_PAYMENT_PAGES = 20;
const CACHE_TTL_MS = 10 * 60 * 1000;
const STALE_CACHE_TTL_MS = 60 * 60 * 1000;
const REFERENCE_CATALOG_CACHE_TTL_MS = 60 * 60 * 1000;
const REFERENCE_CATALOG_PATHS = [
  "/referencias/",
  "/referencias",
  "/referencias_pacientes/",
  "/referencias_pacientes",
  "/pacientes/referencias/",
  "/origenes/",
  "/fuentes/",
];

let monthlyDashboardCache: {
  key: string;
  cachedAtMs: number;
  body: MonthlyDashboardBody;
} | null = null;

let referenceCatalogCache: {
  cachedAtMs: number;
  catalog: ReferenceCatalog;
} | null = null;

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

  try {
    const config = getDentalinkConfig();
    const now = new Date();
    const rangeDaysParam = parseRangeDays(request.query?.rangeDays);

    let fromDate: Date;
    let toDate: Date;
    let rangeField: { days: number | null; fromIso: string; toIso: string };

    if (rangeDaysParam !== null) {
      const { fromIso, toIso } = trailingRange(rangeDaysParam, now);
      fromDate = new Date(fromIso);
      toDate = new Date(toIso);
      rangeField = { days: rangeDaysParam, fromIso, toIso };
    } else {
      // Default: current-month behavior (byte-identical to before)
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      fromDate = monthStart;
      toDate = new Date(nextMonthStart.getTime() - 1000);
      rangeField = { days: null, fromIso: fromDate.toISOString(), toIso: toDate.toISOString() };
    }

    const monthStart = fromDate;
    const monthEnd = toDate;
    const compareParam = parseCompareParam(request.query?.compare);
    const rangeSuffix = rangeDaysParam !== null ? `:range${rangeDaysParam}` : "";
    const compareSuffix = compareParam === "previous" ? ":compare" : "";
    const cacheKey = `${config.mode}:${monthStart.toISOString()}:${monthEnd.toISOString()}${rangeSuffix}${compareSuffix}`;
    const cached = readMonthlyDashboardCache(cacheKey);

    if (cached && !isForceRefresh(request)) {
      send(response, {
        status: 200,
        body: withCacheMetadata(cached.body, cached.cachedAtMs, {
          hit: true,
          stale: false,
        }),
      });
      return;
    }

    if (config.mode !== "api") {
      const body: MonthlyDashboardBody = {
        ok: true,
        mode: config.mode,
        range: rangeField,
        months: [],
        revenueTotal: 0,
        paymentsTotal: 0,
        uniquePatientsTotal: 0,
        averagePaymentValue: 0,
        days: [],
        patients: [],
        treatmentShare: [],
        branchShare: [],
        marketingAttribution: buildMarketingAttribution([]),
        cache: buildCacheMetadata(Date.now(), { hit: false, stale: false }),
      };
      send(response, {
        status: 200,
        body,
      });
      return;
    }

    const paymentRecords = await fetchMonthlyPaymentRecords(
      config.baseUrl,
      config.apiAuthScheme,
      config.apiToken,
      config.paymentsPath,
      config.paymentDateField,
      monthStart,
      monthEnd,
    );

    const referenceCatalog = await fetchReferenceCatalog(
      config.baseUrl,
      config.apiAuthScheme,
      config.apiToken,
    );
    const patientCache = new Map<number, PatientDetail>();
    const treatmentCache = new Map<number, TreatmentDetail>();
    const payments: MonthlyPaymentBlock[] = [];

    for (const record of paymentRecords) {
      const patientId = readNumber(record, config.paymentPatientIdField);
      const treatmentId = readNumber(record, config.paymentTreatmentIdField);
      const patient = await getCachedPatient(
        patientCache,
        config.baseUrl,
        config.apiAuthScheme,
        config.apiToken,
        config.patientsPathTemplate,
        patientId,
        {
          emailField: config.patientEmailField,
          phoneField: config.patientPhoneField,
          firstNameField: config.patientFirstNameField,
          lastNameField: config.patientLastNameField,
          referenceField: config.patientReferenceField,
          referenceCatalog,
        },
      );
      const treatment = await getCachedTreatment(
        treatmentCache,
        config.baseUrl,
        config.apiAuthScheme,
        config.apiToken,
        config.treatmentsPathTemplate,
        treatmentId,
        {
          nameField: config.treatmentNameField,
          budgetTotalField: config.treatmentBudgetTotalField,
        },
      );

      payments.push({
        paymentId: readNumber(record, config.paymentIdField),
        patientId,
        patientName:
          readString(record, config.paymentPatientNameField) ??
          patient.fullName,
        patientEmail: patient.email,
        patientPhone: patient.phone,
        patientReference: patient.reference,
        treatmentId,
        treatmentName: treatment.name,
        treatmentBudgetTotal: treatment.budgetTotal,
        branch: readString(record, config.paymentBranchField),
        paymentMethod: readString(record, config.paymentMethodField),
        folio: readString(record, config.paymentFolioField),
        reference: readString(record, config.paymentReferenceField),
        amount: readNumber(record, config.paymentAmountField),
        createdAt: readString(record, config.paymentDateField),
      });
    }

    payments.sort((a, b) => Date.parse(b.createdAt ?? "") - Date.parse(a.createdAt ?? ""));

    const days = buildDayBlocks(monthStart, monthEnd, payments);
    const revenueTotal = payments.reduce((sum, payment) => sum + payment.amount, 0);
    const uniquePatientsTotal = new Set(
      payments.map((payment) => payment.patientId).filter((id) => id > 0),
    ).size;
    const months = groupByMonth(days);

    // Comparison window (optional — only when compare=previous and rangeDays is valid)
    let comparison: MonthlyDashboardBody["comparison"];
    if (compareParam === "previous" && rangeDaysParam !== null) {
      const prevRange = previousRange(rangeField);
      const prevFromDate = new Date(prevRange.fromIso);
      const prevToDate = new Date(prevRange.toIso);
      const prevPaymentRecords = await fetchMonthlyPaymentRecords(
        config.baseUrl,
        config.apiAuthScheme,
        config.apiToken,
        config.paymentsPath,
        config.paymentDateField,
        prevFromDate,
        prevToDate,
      );
      const prevPaymentCache = new Map<number, PatientDetail>();
      const prevTreatmentCache = new Map<number, TreatmentDetail>();
      const prevPayments: MonthlyPaymentBlock[] = [];
      for (const record of prevPaymentRecords) {
        const patientId = readNumber(record, config.paymentPatientIdField);
        const treatmentId = readNumber(record, config.paymentTreatmentIdField);
        const patient = await getCachedPatient(
          prevPaymentCache,
          config.baseUrl,
          config.apiAuthScheme,
          config.apiToken,
          config.patientsPathTemplate,
          patientId,
          {
            emailField: config.patientEmailField,
            phoneField: config.patientPhoneField,
            firstNameField: config.patientFirstNameField,
            lastNameField: config.patientLastNameField,
            referenceField: config.patientReferenceField,
            referenceCatalog,
          },
        );
        const treatment = await getCachedTreatment(
          prevTreatmentCache,
          config.baseUrl,
          config.apiAuthScheme,
          config.apiToken,
          config.treatmentsPathTemplate,
          treatmentId,
          {
            nameField: config.treatmentNameField,
            budgetTotalField: config.treatmentBudgetTotalField,
          },
        );
        prevPayments.push({
          paymentId: readNumber(record, config.paymentIdField),
          patientId,
          patientName:
            readString(record, config.paymentPatientNameField) ??
            patient.fullName,
          patientEmail: patient.email,
          patientPhone: patient.phone,
          patientReference: patient.reference,
          treatmentId,
          treatmentName: treatment.name,
          treatmentBudgetTotal: treatment.budgetTotal,
          branch: readString(record, config.paymentBranchField),
          paymentMethod: readString(record, config.paymentMethodField),
          folio: readString(record, config.paymentFolioField),
          reference: readString(record, config.paymentReferenceField),
          amount: readNumber(record, config.paymentAmountField),
          createdAt: readString(record, config.paymentDateField),
        });
      }
      const prevRevenue = prevPayments.reduce((sum, p) => sum + p.amount, 0);
      const prevUnique = new Set(prevPayments.map((p) => p.patientId).filter((id) => id > 0)).size;
      const prevBranchShare = buildBranchShare(prevPayments).map((b) => ({
        branch: b.branch,
        revenue: b.revenue,
        payments: b.payments,
      }));
      comparison = {
        fromIso: prevRange.fromIso,
        toIso: prevRange.toIso,
        revenueTotal: prevRevenue,
        paymentsTotal: prevPayments.length,
        uniquePatientsTotal: prevUnique,
        averagePaymentValue: prevPayments.length > 0 ? prevRevenue / prevPayments.length : 0,
        branchShare: prevBranchShare,
        marketingAttribution: buildMarketingAttribution(
          await enrichWithDigitalSources(
            await enrichWithReportReferences(prevPayments),
          ),
        ),
      };
    }

    const enrichedPayments = await enrichWithDigitalSources(
      await enrichWithReportReferences(payments),
    );

    const body: MonthlyDashboardBody = {
      ok: true,
      mode: config.mode,
      month: rangeDaysParam === null ? {
        label: monthStart.toLocaleDateString("es-MX", {
          month: "long",
          year: "numeric",
        }),
        fromIso: monthStart.toISOString(),
        toIso: monthEnd.toISOString(),
      } : undefined,
      range: rangeField,
      months,
      revenueTotal,
      paymentsTotal: payments.length,
      uniquePatientsTotal,
      averagePaymentValue: payments.length > 0 ? revenueTotal / payments.length : 0,
      days,
      patients: payments,
      treatmentShare: buildTreatmentShare(payments),
      branchShare: buildBranchShare(payments),
      marketingAttribution: buildMarketingAttribution(enrichedPayments),
      comparison,
      cache: buildCacheMetadata(Date.now(), { hit: false, stale: false }),
    };

    writeMonthlyDashboardCache(cacheKey, body);

    send(response, {
      status: 200,
      body,
    });
  } catch (error) {
    const cached = readAnyFreshEnoughMonthlyDashboardCache();
    if (cached) {
      send(response, {
        status: 200,
        body: withCacheMetadata(cached.body, cached.cachedAtMs, {
          hit: true,
          stale: true,
        }),
      });
      return;
    }

    send(
      response,
      serverError("failed to build monthly Dentalink dashboard", {
        message: error instanceof Error ? error.message : "unknown error",
      }),
    );
  }
}

function isForceRefresh(request: VercelRequest): boolean {
  const value = request.query?.force;
  return value === "1" || value === "true";
}

function readMonthlyDashboardCache(cacheKey: string) {
  if (!monthlyDashboardCache || monthlyDashboardCache.key !== cacheKey) {
    return null;
  }

  if (Date.now() - monthlyDashboardCache.cachedAtMs > CACHE_TTL_MS) {
    return null;
  }

  return monthlyDashboardCache;
}

function readAnyFreshEnoughMonthlyDashboardCache() {
  if (!monthlyDashboardCache) {
    return null;
  }

  if (Date.now() - monthlyDashboardCache.cachedAtMs > STALE_CACHE_TTL_MS) {
    return null;
  }

  return monthlyDashboardCache;
}

function writeMonthlyDashboardCache(cacheKey: string, body: MonthlyDashboardBody) {
  monthlyDashboardCache = {
    key: cacheKey,
    cachedAtMs: Date.now(),
    body,
  };
}

function withCacheMetadata(
  body: MonthlyDashboardBody,
  cachedAtMs: number,
  options: { hit: boolean; stale: boolean },
): MonthlyDashboardBody {
  return {
    ...body,
    cache: buildCacheMetadata(cachedAtMs, options),
  };
}

function buildCacheMetadata(
  cachedAtMs: number,
  options: { hit: boolean; stale: boolean },
) {
  return {
    hit: options.hit,
    stale: options.stale,
    cachedAt: new Date(cachedAtMs).toISOString(),
    ttlSeconds: Math.max(
      0,
      Math.ceil((CACHE_TTL_MS - (Date.now() - cachedAtMs)) / 1000),
    ),
  };
}

async function fetchMonthlyPaymentRecords(
  baseUrl: string,
  apiAuthScheme: string,
  apiToken: string,
  paymentsPath: string,
  paymentDateField: string,
  monthStart: Date,
  monthEnd: Date,
): Promise<Record<string, unknown>[]> {
  const records: Record<string, unknown>[] = [];
  let pageUrl: URL | null = new URL(paymentsPath.replace(/^\/+/, ""), baseUrl);
  pageUrl.search = buildMonthlyPaymentsQuery(paymentDateField, monthStart, monthEnd);

  for (let page = 0; pageUrl && page < MAX_PAYMENT_PAGES; page += 1) {
    const body = await requestDentalink(pageUrl, apiAuthScheme, apiToken);
    const collection = readCollection(body).filter((record) =>
      isRecordInsideDateRange(record, paymentDateField, monthStart, monthEnd),
    );
    records.push(...collection);
    pageUrl = readNextPageUrl(body, baseUrl);
  }

  return records;
}

function buildMonthlyPaymentsQuery(
  dateField: string,
  monthStart: Date,
  monthEnd: Date,
): string {
  const filter = JSON.stringify({
    [dateField]: {
      gte: toDentalinkDateTime(monthStart),
    },
  });
  return `q=${encodeURIComponent(filter)}`;
}

async function requestDentalink(
  url: URL,
  apiAuthScheme: string,
  apiToken: string,
): Promise<unknown> {
  const response = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: `${apiAuthScheme} ${apiToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(
      `Dentalink API request failed with status ${response.status} for ${url.pathname}`,
    );
  }

  return (await response.json()) as unknown;
}

interface PatientDetail {
  email: string | null;
  phone: string | null;
  reference: string | null;
  fullName: string | null;
}

interface ReferenceCatalog {
  labelsById: Map<string, string>;
}

interface TreatmentDetail {
  name: string | null;
  budgetTotal: number;
}

async function getCachedPatient(
  cache: Map<number, PatientDetail>,
  baseUrl: string,
  apiAuthScheme: string,
  apiToken: string,
  patientsPathTemplate: string,
  patientId: number,
  fields: {
    emailField: string;
    phoneField: string;
    firstNameField: string;
    lastNameField: string;
    referenceField: string;
    referenceCatalog: ReferenceCatalog;
  },
): Promise<PatientDetail> {
  if (!Number.isFinite(patientId) || patientId <= 0) {
    return emptyPatient();
  }

  const cached = cache.get(patientId);
  if (cached) {
    return cached;
  }

  const path = patientsPathTemplate.replace("{id}", String(patientId));
  const url = new URL(path.replace(/^\/+/, ""), baseUrl);

  try {
    const record = unwrapRecord(await requestDentalink(url, apiAuthScheme, apiToken));
    const firstName = readString(record, fields.firstNameField);
    const lastName = readString(record, fields.lastNameField);
    const patient = {
      email: readString(record, fields.emailField),
      phone: readFirstString(record, [
        fields.phoneField,
        "telefono_movil",
        "telefono_celular",
        "celular",
        "movil",
        "telefono_fijo",
        "fono",
      ]),
      // La Referencia se rellena después vía enrichWithReportReferences (reporte
      // subido); el endpoint /pacientes/{id}/adicionales viene vacío en este
      // Dentalink, así que NO se consulta (evita una llamada por paciente).
      reference: readPatientReference(
        record,
        fields.referenceField,
        fields.referenceCatalog,
      ),
      fullName: [firstName, lastName].filter(Boolean).join(" ") || null,
    };
    cache.set(patientId, patient);
    return patient;
  } catch {
    const patient = emptyPatient();
    cache.set(patientId, patient);
    return patient;
  }
}

async function fetchReferenceCatalog(
  baseUrl: string,
  apiAuthScheme: string,
  apiToken: string,
): Promise<ReferenceCatalog> {
  if (
    referenceCatalogCache &&
    Date.now() - referenceCatalogCache.cachedAtMs < REFERENCE_CATALOG_CACHE_TTL_MS
  ) {
    return referenceCatalogCache.catalog;
  }

  for (const path of REFERENCE_CATALOG_PATHS) {
    try {
      const url = new URL(path.replace(/^\/+/, ""), baseUrl);
      const body = await requestDentalink(url, apiAuthScheme, apiToken);
      const labelsById = new Map<string, string>();

      for (const record of readCollection(body)) {
        const id = readReferenceId(record);
        const label = readReferenceLabel(record);
        if (id && label) {
          labelsById.set(id, label);
        }
      }

      if (labelsById.size > 0) {
        const catalog = { labelsById };
        referenceCatalogCache = {
          cachedAtMs: Date.now(),
          catalog,
        };
        return catalog;
      }
    } catch {
      // Dentalink reference catalogs differ by account/permissions.
    }
  }

  const emptyCatalog = { labelsById: new Map<string, string>() };
  referenceCatalogCache = {
    cachedAtMs: Date.now(),
    catalog: emptyCatalog,
  };
  return emptyCatalog;
}

async function getCachedTreatment(
  cache: Map<number, TreatmentDetail>,
  baseUrl: string,
  apiAuthScheme: string,
  apiToken: string,
  treatmentsPathTemplate: string,
  treatmentId: number,
  fields: {
    nameField: string;
    budgetTotalField: string;
  },
): Promise<TreatmentDetail> {
  if (!Number.isFinite(treatmentId) || treatmentId <= 0) {
    return emptyTreatment();
  }

  const cached = cache.get(treatmentId);
  if (cached) {
    return cached;
  }

  const path = treatmentsPathTemplate.replace("{id}", String(treatmentId));
  const url = new URL(path.replace(/^\/+/, ""), baseUrl);

  try {
    const record = unwrapRecord(await requestDentalink(url, apiAuthScheme, apiToken));
    const treatment = {
      name: readString(record, fields.nameField),
      budgetTotal: readNumber(record, fields.budgetTotalField),
    };
    cache.set(treatmentId, treatment);
    return treatment;
  } catch {
    const treatment = emptyTreatment();
    cache.set(treatmentId, treatment);
    return treatment;
  }
}

function buildDayBlocks(
  monthStart: Date,
  monthEnd: Date,
  payments: MonthlyPaymentBlock[],
): DayBlock[] {
  const days: DayBlock[] = [];
  const cursor = new Date(monthStart);

  while (cursor <= monthEnd) {
    const dateKey = toDateKey(cursor);
    const patients = payments.filter((payment) =>
      payment.createdAt ? toDateKey(new Date(payment.createdAt)) === dateKey : false,
    );
    days.push({
      day: cursor.getDate(),
      date: dateKey,
      label: cursor.toLocaleDateString("es-MX", {
        day: "numeric",
        month: "short",
      }),
      revenue: patients.reduce((sum, payment) => sum + payment.amount, 0),
      payments: patients.length,
      patients,
    });
    cursor.setDate(cursor.getDate() + 1);
  }

  return days;
}

function buildTreatmentShare(payments: MonthlyPaymentBlock[]) {
  const totals = new Map<string, number>();
  const revenueTotal = payments.reduce((sum, payment) => sum + payment.amount, 0);

  for (const payment of payments) {
    const key = payment.treatmentName ?? `Tratamiento #${payment.treatmentId || "sin-id"}`;
    totals.set(key, (totals.get(key) ?? 0) + payment.amount);
  }

  return [...totals.entries()]
    .map(([category, revenue]) => ({
      category,
      revenue,
      share: revenueTotal > 0 ? (revenue / revenueTotal) * 100 : 0,
    }))
    .sort((a, b) => b.revenue - a.revenue);
}

function buildBranchShare(payments: MonthlyPaymentBlock[]): BranchSummary[] {
  const groups = new Map<string, MonthlyPaymentBlock[]>();
  const revenueTotal = payments.reduce((sum, payment) => sum + payment.amount, 0);

  for (const payment of payments) {
    const branch = payment.branch?.trim() || "Sin sucursal";
    const branchPayments = groups.get(branch) ?? [];
    branchPayments.push(payment);
    groups.set(branch, branchPayments);
  }

  return [...groups.entries()]
    .map(([branch, branchPayments]) => {
      const revenue = branchPayments.reduce((sum, payment) => sum + payment.amount, 0);
      const uniquePatients = new Set(
        branchPayments.map((payment) => payment.patientId).filter((id) => id > 0),
      ).size;

      return {
        branch,
        revenue,
        payments: branchPayments.length,
        uniquePatients,
        averagePaymentValue:
          branchPayments.length > 0 ? revenue / branchPayments.length : 0,
        share: revenueTotal > 0 ? (revenue / revenueTotal) * 100 : 0,
        topPatients: branchPayments
          .slice()
          .sort((a, b) => b.amount - a.amount)
          .slice(0, 5),
      };
    })
    .sort((a, b) => b.revenue - a.revenue);
}

function readNextPageUrl(body: unknown, baseUrl: string): URL | null {
  if (!isRecord(body) || !isRecord(body.links)) {
    return null;
  }

  const next = body.links.next;
  if (typeof next !== "string" || next.trim() === "") {
    return null;
  }

  return new URL(next, baseUrl);
}

function readCollection(body: unknown): Record<string, unknown>[] {
  if (Array.isArray(body)) {
    return body.filter(isRecord);
  }

  if (isRecord(body) && Array.isArray(body.data)) {
    return body.data.filter(isRecord);
  }

  return [];
}

function unwrapRecord(response: unknown): Record<string, unknown> {
  if (isRecord(response) && isRecord(response.data)) {
    return response.data;
  }

  return isRecord(response) ? response : {};
}

function isRecordInsideDateRange(
  record: Record<string, unknown>,
  dateField: string,
  monthStart: Date,
  monthEnd: Date,
): boolean {
  const value = readString(record, dateField);
  if (!value) {
    return false;
  }

  const time = Date.parse(value);
  return Number.isFinite(time) && time >= monthStart.getTime() && time <= monthEnd.getTime();
}

function toDentalinkDateTime(date: Date): string {
  return date.toISOString().replace("T", " ").replace(/\.\d{3}Z$/, "");
}

function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function emptyPatient(): PatientDetail {
  return {
    email: null,
    phone: null,
    reference: null,
    fullName: null,
  };
}

function emptyTreatment(): TreatmentDetail {
  return {
    name: null,
    budgetTotal: 0,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function readFirstString(
  record: Record<string, unknown>,
  keys: string[],
): string | null {
  for (const key of keys) {
    const value = readString(record, key);
    if (value) {
      return value;
    }
  }

  return null;
}

function readPatientReference(
  record: Record<string, unknown>,
  preferredField: string,
  catalog: ReferenceCatalog,
): string | null {
  const direct = readReferenceValue(record[preferredField], catalog);
  if (direct) {
    return direct;
  }

  for (const key of [
    "referencia",
    "nombre_referencia",
    "referencia_nombre",
    "id_referencia",
    "referido_por",
    "referido",
    "fuente",
    "nombre_fuente",
    "id_fuente",
    "origen",
    "nombre_origen",
    "id_origen",
    "medio_referencia",
    "nombre_medio_referencia",
    "id_medio_referencia",
    "canal",
    "nombre_canal",
    "id_canal",
  ]) {
    const value = readReferenceValue(record[key], catalog);
    if (value) {
      return value;
    }
  }

  for (const key of ["campos_adicionales", "camposAdicionales", "custom_fields"]) {
    const value = readReferenceFromAdditionalFields(record[key], catalog);
    if (value) {
      return value;
    }
  }

  return null;
}

function readReferenceFromAdditionalFields(
  value: unknown,
  catalog: ReferenceCatalog,
): string | null {
  if (isRecord(value) && Array.isArray(value.data)) {
    return readReferenceFromAdditionalFields(value.data, catalog);
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      if (!isRecord(item)) {
        continue;
      }

      const key = readAdditionalFieldLabel(item, catalog);
      if (!key || !isReferenceKey(key)) {
        continue;
      }

      const reference = readReferenceValue(
        item.valor ??
          item.value ??
          item.respuesta ??
          item.contenido ??
          item.valor_campo ??
          item.valorCampo,
        catalog,
      );
      if (reference) {
        return reference;
      }
    }
  }

  if (isRecord(value)) {
    for (const [key, entry] of Object.entries(value)) {
      if (isReferenceKey(key)) {
        const reference = readReferenceValue(entry, catalog);
        if (reference) {
          return reference;
        }
      }

      if (isRecord(entry)) {
        const label = readAdditionalFieldLabel(entry, catalog);
        if (label && isReferenceKey(label)) {
          const reference = readReferenceValue(
            entry.valor ??
              entry.value ??
              entry.respuesta ??
              entry.contenido ??
              entry.valor_campo ??
              entry.valorCampo,
            catalog,
          );
          if (reference) {
            return reference;
          }
        }
      }
    }
  }

  return null;
}

function readAdditionalFieldLabel(
  record: Record<string, unknown>,
  catalog: ReferenceCatalog,
): string | null {
  return (
    readAdditionalFieldName(record) ??
    (isRecord(record.campo) ? readAdditionalFieldName(record.campo) : null) ??
    (isRecord(record.campo_adicional)
      ? readAdditionalFieldName(record.campo_adicional)
      : null) ??
    (isRecord(record.campoAdicional)
      ? readAdditionalFieldName(record.campoAdicional)
      : null) ??
    readAdditionalFieldId(record, catalog) ??
    readReferenceLabel(record)
  );
}

function readAdditionalFieldName(record: Record<string, unknown>): string | null {
  return readFirstString(record, [
    "nombre",
    "nombre_campo",
    "nombreCampo",
    "name",
    "campo",
    "etiqueta",
    "titulo",
    "label",
    "descripcion",
    "description",
    "texto",
  ]);
}

function readAdditionalFieldId(
  record: Record<string, unknown>,
  catalog: ReferenceCatalog,
): string | null {
  for (const key of [
    "id_campo_adicional",
    "idCampoAdicional",
    "campo_adicional_id",
    "campoAdicionalId",
  ]) {
    const raw = record[key];
    const id =
      typeof raw === "number" && Number.isFinite(raw)
        ? String(raw)
        : typeof raw === "string" && raw.trim() !== ""
          ? raw.trim()
          : null;

    if (id && catalog.labelsById.has(id)) {
      return catalog.labelsById.get(id) ?? null;
    }
  }

  return null;
}

function readReferenceValue(value: unknown, catalog: ReferenceCatalog): string | null {
  if (typeof value === "string" && value.trim() !== "") {
    const trimmed = value.trim();
    return catalog.labelsById.get(trimmed) ?? trimmed;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    const id = String(value);
    return catalog.labelsById.get(id) ?? `Referencia #${id}`;
  }

  if (isRecord(value)) {
    const label = readReferenceLabel(value);
    if (label) {
      return label;
    }

    const id = readReferenceId(value);
    if (id) {
      return catalog.labelsById.get(id) ?? `Referencia #${id}`;
    }
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const reference = readReferenceValue(item, catalog);
      if (reference) {
        return reference;
      }
    }
  }

  return null;
}

function readReferenceId(record: Record<string, unknown>): string | null {
  for (const key of [
    "id",
    "id_referencia",
    "id_fuente",
    "id_origen",
    "id_canal",
    "codigo",
  ]) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }

    if (typeof value === "string" && value.trim() !== "") {
      return value.trim();
    }
  }

  return null;
}

function readReferenceLabel(record: Record<string, unknown>): string | null {
  return readFirstString(record, [
    "nombre",
    "nombre_campo",
    "nombreCampo",
    "name",
    "campo",
    "etiqueta",
    "titulo",
    "valor",
    "value",
    "descripcion",
    "description",
    "texto",
    "label",
  ]);
}

// La Referencia (origen) no la expone la API de Dentalink; se persiste por
// patientId al subir el reporte "Pacientes nuevos" (ver api/dev/roas-by-channel).
// Aquí se rellena patientReference cuando la API no la trajo, para que
// buildMarketingAttribution atribuya la inversión sólo a pacientes de marketing.
async function enrichWithReportReferences(
  payments: MonthlyPaymentBlock[],
): Promise<MonthlyPaymentBlock[]> {
  try {
    const patientIds = [
      ...new Set(payments.map((p) => p.patientId).filter((id) => id > 0)),
    ];
    if (patientIds.length === 0) return payments;
    const referenceMap =
      await trackingHttpHandlers.stateStore.batchGetPatientReferences(patientIds);
    if (referenceMap.size === 0) return payments;
    return payments.map((p) =>
      p.patientReference
        ? p
        : { ...p, patientReference: referenceMap.get(p.patientId) ?? null },
    );
  } catch {
    return payments;
  }
}

async function enrichWithDigitalSources(
  payments: MonthlyPaymentBlock[],
): Promise<MonthlyPaymentBlock[]> {
  try {
    const contacts = new Set<string>();
    for (const p of payments) {
      if (p.patientEmail) contacts.add(p.patientEmail);
      if (p.patientPhone) contacts.add(p.patientPhone);
    }
    if (contacts.size === 0) return payments;
    const sourceMap = await trackingHttpHandlers.stateStore.batchGetContactLeadSources(
      Array.from(contacts),
    );
    if (sourceMap.size === 0) return payments;
    return payments.map((p) => ({
      ...p,
      digitalSource:
        (p.patientEmail && sourceMap.get(p.patientEmail)) ||
        (p.patientPhone && sourceMap.get(p.patientPhone)) ||
        null,
    }));
  } catch {
    return payments;
  }
}

function isReferenceKey(value: string): boolean {
  const normalized = value.toLowerCase();
  return (
    normalized.includes("refer") ||
    normalized.includes("fuente") ||
    normalized.includes("origen") ||
    normalized.includes("canal")
  );
}

function parseCompareParam(value: unknown): "previous" | null {
  if (value === "previous") return "previous";
  return null;
}

function parseRangeDays(value: unknown): RangeDays | null {
  if (value === "7") return 7;
  if (value === "30") return 30;
  if (value === "180") return 180;
  return null;
}

function readNumber(record: Record<string, unknown>, key: string): number {
  const value = record[key];

  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}
