import { requireTrackingSecret, serverError } from "../../src/index.js";
import { getDentalinkConfig } from "../../src/modules/dentalink/config.js";
import { classifyReference, buildMarketingAttribution } from "../../src/modules/dentalink/reference-attribution.js";
import {
  methodNotAllowed,
  send,
  toHttpRequest,
  type VercelRequest,
  type VercelResponse,
} from "../_lib/http.js";

// ---- Constants ----

const HIGH_VALUE_KEYWORDS = [
  "carilla", "implante", "all-on-4", "all-on-6", "all on 4", "all on 6",
  "allon4", "allon6", "arco completo", "arco dental", "rehabilitacion completa",
  "rehabilitación completa", "carga inmediata", "maxilar completo",
];

const PLATFORM_KEYWORDS: Record<string, string[]> = {
  google: ["google", "maps", "adwords", "gmb", "my business"],
  meta:    ["meta", "facebook", "instagram", "fb", "ig", "messenger", "threads"],
  tiktok:  ["tiktok", "tt"],
};

const REFERENCE_CATALOG_PATHS = [
  "/referencias/", "/referencias",
  "/referencias_pacientes/", "/referencias_pacientes",
  "/pacientes/referencias/", "/pacientes/referencias",
  "/origenes/", "/fuentes/",
];

const MAX_PAYMENT_PAGES = 20;

// ---- Types ----

interface EnrichedPayment {
  paymentId: number;
  patientId: number;
  patientName: string | null;
  treatmentName: string | null;
  treatmentBudgetTotal: number;
  amount: number;
  branch: string | null;
  paidAt: string;
  isVoided: boolean;
  patientReference: string | null;
  digitalSource: string | null;
  monthKey: string; // "YYYY-MM"
}

interface MonthBlock {
  monthKey: string;
  label: string;
  revenue: number;
  payments: number;
  patients: number;
}

interface AttributionBlock {
  marketing: { patients: number; revenue: number };
  organico: { patients: number; revenue: number };
  desconocido: { patients: number; revenue: number };
}

// ---- Main handler ----

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

    if (config.mode !== "api") {
      send(response, {
        status: 200,
        body: { ok: false, error: "Dentalink no está configurado en modo API (stub mode). Configura DENTALINK_MODE=api y DENTALINK_API_TOKEN en Vercel." },
      });
      return;
    }

    if (!config.apiToken) {
      send(response, {
        status: 500,
        body: { ok: false, error: "DENTALINK_API_TOKEN no está configurado en el entorno." },
      });
      return;
    }

    // Parse date range — default July 2025 → June 2026
    const fromStr = typeof request.query?.from === "string" ? request.query.from : "2025-07-01";
    const toStr = typeof request.query?.to === "string" ? request.query.to : "2026-06-30";
    const fromDate = new Date(`${fromStr}T00:00:00.000Z`);
    const toDate = new Date(`${toStr}T23:59:59.999Z`);

    if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
      send(response, { status: 400, body: { ok: false, error: "Formato de fecha inválido. Usa YYYY-MM-DD." } });
      return;
    }

    // 1. Fetch all payment records in range
    const referenceCatalog = await fetchReferenceCatalog(config);
    const paymentRecords = await fetchAllPayments(config, fromDate, toDate);
    const patientCache = new Map<number, PatientDetail>();
    const treatmentCache = new Map<number, TreatmentDetail>();

    // 2. Enrich payments
    const enriched: EnrichedPayment[] = [];
    for (const record of paymentRecords) {
      const isVoided = readBooleanish(record, config.paymentVoidedField);
      if (isVoided) continue; // Exclude voided payments

      const paymentId = readNumber(record, config.paymentIdField);
      const patientId = readNumber(record, config.paymentPatientIdField);
      const treatmentId = readNumber(record, config.paymentTreatmentIdField);
      const amount = readNumber(record, config.paymentAmountField);
      const paidAt = readString(record, config.paymentDateField) ?? "";
      const monthKey = paidAt.slice(0, 7);

      const patient = await getCachedPatient(patientCache, config, patientId, referenceCatalog);
      const treatment = await getCachedTreatment(treatmentCache, config, treatmentId);

      enriched.push({
        paymentId,
        patientId,
        patientName: readString(record, config.paymentPatientNameField) ?? patient.fullName,
        treatmentName: treatment.name,
        treatmentBudgetTotal: treatment.budgetTotal,
        amount,
        branch: readString(record, config.paymentBranchField),
        paidAt,
        isVoided: false,
        patientReference: patient.reference,
        digitalSource: null, // Would come from Elevator enrichment
        monthKey,
      });
    }

    if (enriched.length === 0) {
      send(response, {
        status: 200,
        body: { ok: true, range: { from: fromStr, to: toStr }, totalPayments: 0, totalRevenue: 0, message: "No se encontraron pagos en el período." },
      });
      return;
    }

    // 3. Classify treatments
    const isHighValue = (name: string | null): boolean => {
      if (!name) return false;
      const n = name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
      return HIGH_VALUE_KEYWORDS.some((kw) => n.includes(kw));
    };

    // 4. Resolve platform from reference
    const resolvePlatform = (reference: string | null): string | null => {
      if (!reference) return null;
      const n = reference.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
      for (const [platform, kws] of Object.entries(PLATFORM_KEYWORDS)) {
        if (kws.some((kw) => n.includes(kw))) return platform;
      }
      return null;
    };

    // 5. Build all 5 blocks
    const blocks = buildBlocks(enriched, isHighValue, resolvePlatform, classifyReference);

    send(response, {
      status: 200,
      body: {
        ok: true,
        range: { from: fromStr, to: toStr },
        generatedAt: new Date().toISOString(),
        blocks,
      },
    });
  } catch (error) {
    send(
      response,
      serverError("Error al generar presentación anual", {
        message: error instanceof Error ? error.message : "unknown error",
      }),
    );
  }
}

// ---- Block builders ----

function buildBlocks(
  payments: EnrichedPayment[],
  isHighValue: (name: string | null) => boolean,
  resolvePlatform: (ref: string | null) => string | null,
  _classifyReference: (ref: string | null) => { channel: string; matchedKeyword: string | null },
) {
  // Group by month
  const byMonth = new Map<string, EnrichedPayment[]>();
  for (const p of payments) {
    const existing = byMonth.get(p.monthKey) ?? [];
    existing.push(p);
    byMonth.set(p.monthKey, existing);
  }

  const allMonthKeys = [...byMonth.keys()].sort();
  const monthLabels = allMonthKeys.map((mk) => {
    const [y, m] = mk.split("-").map(Number);
    return { monthKey: mk, label: new Date(y, m - 1).toLocaleDateString("es-MX", { month: "long", year: "numeric" }) };
  });

  // ---- Block 1: Monthly revenue ----
  const block1 = allMonthKeys.map((mk, i) => {
    const ms = byMonth.get(mk)!;
    const revenue = ms.reduce((s, p) => s + p.amount, 0);
    const patients = new Set(ms.map((p) => p.patientId)).size;
    const prevMk = i > 0 ? allMonthKeys[i - 1] : null;
    const prevRevenue = prevMk ? byMonth.get(prevMk)!.reduce((s, p) => s + p.amount, 0) : null;
    const vsPrevMonth = prevRevenue && prevRevenue > 0 ? ((revenue - prevRevenue) / prevRevenue) * 100 : null;
    return {
      mes: monthLabels[i].label,
      ingresos: Math.round(revenue),
      pagos: ms.length,
      pacientes: patients,
      variacion_mes_anterior: vsPrevMonth !== null ? `${vsPrevMonth >= 0 ? "+" : ""}${vsPrevMonth.toFixed(1)}%` : "—",
      variacion_mismo_mes_anio_anterior: null as string | null, // No tenemos datos de 2024
    };
  });

  // ---- Block 2: Marketing efficiency (revenue only; spend filled externally) ----
  const block2 = monthLabels.map((ml) => {
    const ms = byMonth.get(ml.monthKey)!;
    const revenue = ms.reduce((s, p) => s + p.amount, 0);
    return {
      mes: ml.label,
      ingresos_mxn: Math.round(revenue),
      inversion_publicitaria_mxn: null as number | null, // El usuario cruza desde Windsor
      eficiencia_pct: null as string | null, // Calculado tras llenar inversión
    };
  });

  // ---- Block 3: ROAS by platform (Apr–Jun 2026) ----
  const q2Payments = payments.filter((p) => p.monthKey >= "2026-04" && p.monthKey <= "2026-06");
  const byPlatform: Record<string, EnrichedPayment[]> = {};
  for (const p of q2Payments) {
    const classified = _classifyReference(p.patientReference);
    const platform = classified.channel === "marketing" ? resolvePlatform(p.patientReference) ?? "otro_marketing" : null;
    if (!platform) continue; // Only marketing-attributed patients
    const bucket = byPlatform[platform] ?? [];
    bucket.push(p);
    byPlatform[platform] = bucket;
  }

  const block3 = Object.entries(byPlatform)
    .filter(([k]) => ["google", "meta", "tiktok"].includes(k))
    .map(([platform, ps]) => {
      const revenue = ps.reduce((s, p) => s + p.amount, 0);
      const patients = new Set(ps.map((p) => p.patientId)).size;
      return {
        plataforma: platform.charAt(0).toUpperCase() + platform.slice(1),
        pacientes_cerrados: patients,
        ingresos_cobrados_mxn: Math.round(revenue),
        inversion_periodo_mxn: null as number | null, // Lo cruza el usuario desde Windsor
        roas_resultante: null as string | null,
      };
    });

  // ---- Block 4: Average ticket by patient type ----
  const block4 = allMonthKeys.map((mk) => {
    const ms = byMonth.get(mk)!;
    const highVal = ms.filter((p) => isHighValue(p.treatmentName));
    const general = ms.filter((p) => !isHighValue(p.treatmentName));

    const highValRevenue = highVal.reduce((s, p) => s + p.amount, 0);
    const generalRevenue = general.reduce((s, p) => s + p.amount, 0);
    const highValPatients = new Set(highVal.map((p) => p.patientId)).size;
    const generalPatients = new Set(general.map((p) => p.patientId)).size;

    // Unique patients per type for the month (a patient may have both HV and general)
    const allPatients = new Set(ms.map((p) => p.patientId)).size;

    return {
      mes: monthLabels.find((l) => l.monthKey === mk)!.label,
      alto_valor_pacientes: highValPatients,
      alto_valor_ingresos: Math.round(highValRevenue),
      alto_valor_ticket_promedio: highValPatients > 0 ? Math.round(highValRevenue / highValPatients) : 0,
      general_pacientes: generalPatients,
      general_ingresos: Math.round(generalRevenue),
      general_ticket_promedio: generalPatients > 0 ? Math.round(generalRevenue / generalPatients) : 0,
      total_pacientes: allPatients,
      mix_alto_valor_pct: allPatients > 0 ? ((highValPatients / allPatients) * 100).toFixed(1) + "%" : "0%",
    };
  });

  // ---- Block 5: New patients by origin ----
  // We classify by patientReference + digitalSource
  // Group by month + reference channel
  const block5 = allMonthKeys.map((mk) => {
    const ms = byMonth.get(mk)!;
    const patientsByRef = new Map<number, { patientId: number; reference: string | null; amount: number }>();
    for (const p of ms) {
      if (!patientsByRef.has(p.patientId)) {
        patientsByRef.set(p.patientId, { patientId: p.patientId, reference: p.patientReference, amount: 0 });
      }
      patientsByRef.get(p.patientId)!.amount += p.amount;
    }

    let campañas = 0;
    let organico = 0;
    let referidos = 0;
    let sinOrigen = 0;

    for (const [, entry] of patientsByRef) {
      const classified = classifyReference(entry.reference);
      if (classified.channel === "marketing") {
        campañas++;
      } else if (classified.channel === "organico") {
        // Further split organic vs referrals
        const n = (entry.reference ?? "").toLowerCase();
        if (["recomendacion", "recomendado", "referido", "familiar", "amigo", "paciente", "conocido"].some((kw) => n.includes(kw))) {
          referidos++;
        } else {
          organico++;
        }
      } else {
        sinOrigen++;
      }
    }

    const total = pacientesUnicos(ms).size;
    return {
      mes: monthLabels.find((l) => l.monthKey === mk)!.label,
      pacientes_nuevos: total,
      campanas_pagadas: campañas,
      organico_directo: organico,
      referidos,
      sin_origen_registrado: sinOrigen,
      pct_sin_origen: total > 0 ? ((sinOrigen / total) * 100).toFixed(1) + "%" : "0%",
    };
  });

  // Build executive summary
  const totalRevenue = payments.reduce((s, p) => s + p.amount, 0);
  const avgTicket = pacientesUnicos(payments).size > 0
    ? Math.round(totalRevenue / pacientesUnicos(payments).size)
    : 0;
  const highValPayments = payments.filter((p) => isHighValue(p.treatmentName));
  const highValRevenue = highValPayments.reduce((s, p) => s + p.amount, 0);
  const highValPct = totalRevenue > 0 ? ((highValRevenue / totalRevenue) * 100) : 0;
  const allRefs = payments.map((p) => p.patientReference).filter(Boolean);
  const unknownPct = allRefs.length > 0
    ? (allRefs.filter((r) => classifyReference(r).channel === "desconocido").length / allRefs.length * 100).toFixed(1)
    : "N/A";

  const summary = [
    `Ingreso total jul 2025 – jun 2026: $${(totalRevenue / 1000).toFixed(0)}k MXN, con ${payments.length} pagos.`,
    `Ticket promedio: $${avgTicket.toLocaleString()} MXN por paciente.`,
    `Tratamientos de alto valor representan el ${highValPct.toFixed(1)}% del revenue.`,
    `Pacientes sin origen registrado: ${unknownPct}% — oportunidad de mejora en captura de Referencia.`,
    `${Object.keys(byPlatform).length} plataformas de marketing detectadas en Q2 con atribución vía campo Referencia.`,
  ];

  return {
    bloque_1_ingresos_mensuales: block1,
    bloque_2_eficiencia_marketing: block2,
    bloque_3_roas_por_plataforma_q2: block3,
    bloque_4_ticket_promedio: block4,
    bloque_5_pacientes_nuevos_por_origen: block5,
    resumen_ejecutivo: summary,
  };
}

function pacientesUnicos(payments: EnrichedPayment[]): Set<number> {
  return new Set(payments.map((p) => p.patientId).filter((id) => id > 0));
}

// ---- Dentalink API helpers ----

interface PatientDetail {
  email: string | null;
  phone: string | null;
  reference: string | null;
  fullName: string | null;
}

interface TreatmentDetail {
  name: string | null;
  budgetTotal: number;
}

interface ReferenceCatalog {
  labelsById: Map<string, string>;
}

let referenceCatalogCache: { cachedAtMs: number; catalog: ReferenceCatalog } | null = null;

async function fetchReferenceCatalog(config: ReturnType<typeof getDentalinkConfig>): Promise<ReferenceCatalog> {
  if (referenceCatalogCache && Date.now() - referenceCatalogCache.cachedAtMs < 3600000) {
    return referenceCatalogCache.catalog;
  }

  for (const path of REFERENCE_CATALOG_PATHS) {
    try {
      const url = new URL(path.replace(/^\/+/, ""), config.baseUrl);
      const body = await requestDentalink(url, config);
      const labelsById = new Map<string, string>();
      for (const record of readCollection(body)) {
        const id = String((record as Record<string, unknown>).id ?? "");
        const label = readString(record as Record<string, unknown>, "nombre") ?? readString(record as Record<string, unknown>, "label");
        if (id && label) labelsById.set(id, label);
      }
      if (labelsById.size > 0) {
        const catalog: ReferenceCatalog = { labelsById };
        referenceCatalogCache = { cachedAtMs: Date.now(), catalog };
        return catalog;
      }
    } catch { /* try next path */ }
  }

  const empty: ReferenceCatalog = { labelsById: new Map() };
  referenceCatalogCache = { cachedAtMs: Date.now(), catalog: empty };
  return empty;
}

async function fetchAllPayments(
  config: ReturnType<typeof getDentalinkConfig>,
  fromDate: Date,
  toDate: Date,
): Promise<Record<string, unknown>[]> {
  const records: Record<string, unknown>[] = [];
  let pageUrl: URL | null = new URL(config.paymentsPath.replace(/^\/+/, ""), config.baseUrl);
  pageUrl.search = buildPaymentsQuery(config.paymentDateField, fromDate);

  for (let page = 0; pageUrl && page < MAX_PAYMENT_PAGES; page += 1) {
    const body = await requestDentalink(pageUrl, config);
    const collection = readCollection(body).filter((record) =>
      isRecordInsideDateRange(record, config.paymentDateField, fromDate, toDate),
    );
    records.push(...collection);
    pageUrl = readNextPageUrl(body, config.baseUrl);
  }

  return records;
}

function buildPaymentsQuery(dateField: string, fromDate: Date): string {
  const filter = JSON.stringify({ [dateField]: { gte: toDentalinkDateTime(fromDate) } });
  return `q=${encodeURIComponent(filter)}`;
}

async function getCachedPatient(
  cache: Map<number, PatientDetail>,
  config: ReturnType<typeof getDentalinkConfig>,
  patientId: number,
  _referenceCatalog: ReferenceCatalog,
): Promise<PatientDetail> {
  if (!Number.isFinite(patientId) || patientId <= 0) return emptyPatient();
  const cached = cache.get(patientId);
  if (cached) return cached;

  const path = config.patientsPathTemplate.replace("{id}", String(patientId));
  try {
    const url = new URL(path.replace(/^\/+/, ""), config.baseUrl);
    const record = unwrapRecord(await requestDentalink(url, config));
    const firstName = readString(record, config.patientFirstNameField);
    const lastName = readString(record, config.patientLastNameField);
    const patient: PatientDetail = {
      email: readString(record, config.patientEmailField),
      phone: readString(record, config.patientPhoneField),
      reference: readString(record, config.patientReferenceField),
      fullName: [firstName, lastName].filter(Boolean).join(" ") || null,
    };
    cache.set(patientId, patient);
    return patient;
  } catch {
    const p = emptyPatient();
    cache.set(patientId, p);
    return p;
  }
}

async function getCachedTreatment(
  cache: Map<number, TreatmentDetail>,
  config: ReturnType<typeof getDentalinkConfig>,
  treatmentId: number,
): Promise<TreatmentDetail> {
  if (!Number.isFinite(treatmentId) || treatmentId <= 0) return emptyTreatment();
  const cached = cache.get(treatmentId);
  if (cached) return cached;

  const path = config.treatmentsPathTemplate.replace("{id}", String(treatmentId));
  try {
    const url = new URL(path.replace(/^\/+/, ""), config.baseUrl);
    const record = unwrapRecord(await requestDentalink(url, config));
    const treatment: TreatmentDetail = {
      name: readString(record, config.treatmentNameField),
      budgetTotal: readNumber(record, config.treatmentBudgetTotalField),
    };
    cache.set(treatmentId, treatment);
    return treatment;
  } catch {
    const t = emptyTreatment();
    cache.set(treatmentId, t);
    return t;
  }
}

async function requestDentalink(
  url: URL,
  config: ReturnType<typeof getDentalinkConfig>,
): Promise<unknown> {
  const response = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: `${config.apiAuthScheme} ${config.apiToken}`,
    },
  });
  if (!response.ok) {
    throw new Error(`Dentalink API error: ${response.status} ${response.statusText} for ${url.pathname}`);
  }
  return response.json() as unknown;
}

// ---- Generic record helpers ----

function readNextPageUrl(body: unknown, baseUrl: string): URL | null {
  if (isRecord(body) && isRecord(body.links)) {
    const next = (body.links as Record<string, unknown>).next;
    if (typeof next === "string" && next.trim() !== "") return new URL(next, baseUrl);
  }
  return null;
}

function readCollection(body: unknown): Record<string, unknown>[] {
  if (Array.isArray(body)) return body.filter(isRecord);
  if (isRecord(body) && Array.isArray(body.data)) return (body.data as unknown[]).filter(isRecord);
  return [];
}

function unwrapRecord(response: unknown): Record<string, unknown> {
  if (isRecord(response) && isRecord(response.data)) return response.data as Record<string, unknown>;
  return isRecord(response) ? response : {};
}

function isRecordInsideDateRange(
  record: Record<string, unknown>,
  dateField: string,
  fromDate: Date,
  toDate: Date,
): boolean {
  const value = readString(record, dateField);
  if (!value) return false;
  const time = Date.parse(value);
  return Number.isFinite(time) && time >= fromDate.getTime() && time <= toDate.getTime();
}

function toDentalinkDateTime(date: Date): string {
  return date.toISOString().replace("T", " ").replace(/\.\d{3}Z$/, "");
}

function emptyPatient(): PatientDetail {
  return { email: null, phone: null, reference: null, fullName: null };
}

function emptyTreatment(): TreatmentDetail {
  return { name: null, budgetTotal: 0 };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function readNumber(record: Record<string, unknown>, key: string): number {
  const value = record[key];
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim() !== "") return Number(value);
  return 0;
}

function readBooleanish(record: Record<string, unknown>, key: string): boolean {
  const value = record[key];
  return value === true || value === 1 || value === "1";
}
