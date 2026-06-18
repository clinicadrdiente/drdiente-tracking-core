// Agregación financiera a partir de los reportes de detalle de Dentalink.
//
// La API REST de Dentalink no liga pagos con tratamientos ni expone la
// Referencia (origen). Los reportes exportables sí: este módulo parsea dos de
// ellos y produce los agregados que el dashboard necesita, sin depender de la
// API:
//   - "finanzas_pagos_detalle_accion": cada fila = un pago aplicado a una
//     prestación, con tratamiento + categoría + paciente + Referencia + fecha +
//     monto. Es la tabla de hechos para revenue por canal × tratamiento × fecha.
//   - "tratamientos_acciones_realizadas": trae precio, costo de laboratorio y
//     honorario del profesional → margen de contribución por tratamiento.
//
// Funciones puras: el llamador parsea el Excel a filas (objetos por encabezado)
// y filtra por rango de fechas aquí.

import {
  CHANNEL_LABELS,
  isMarketingChannel,
  referenceToChannel,
  type MarketingChannel,
} from "./marketing-channels.js";

export interface PagoDetalleRecord {
  paymentId: string;
  treatmentId: string;
  patientId: number;
  category: string;
  prestacion: string;
  reference: string | null;
  channel: MarketingChannel;
  amount: number;
  date: string | null;
  branch: string | null;
}

export interface AccionRecord {
  category: string;
  patientId: number;
  price: number;
  paid: number;
  labCost: number;
  professionalCost: number;
  margin: number;
  date: string | null;
}

export interface DateRange {
  from?: string | null;
  to?: string | null;
}

function normalizeHeader(header: string): string {
  return header
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// Resuelve el encabezado real para una columna lógica probando predicados sobre
// el nombre normalizado, en orden.
function resolveColumn(
  headers: string[],
  predicates: Array<(normalized: string) => boolean>,
): string | undefined {
  const normalized = headers.map((header) => ({
    original: header,
    norm: normalizeHeader(header),
  }));
  for (const predicate of predicates) {
    const match = normalized.find((entry) => predicate(entry.norm));
    if (match) return match.original;
  }
  return undefined;
}

// Parsea montos tolerando formato es-MX ("2.000,50"), US ("2,000.50"),
// negativos con signo o contables "(500)". Detecta el separador decimal por el
// último que aparece; un único separador con exactamente 3 dígitos detrás se
// trata como miles (ej. "1,234" / "2.000" → 1234 / 2000).
export function toNumber(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value !== "string") return 0;

  let s = value.trim();
  if (s === "" || s === "-") return 0;

  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  if (s.includes("-")) negative = true;

  s = s.replace(/[^0-9.,]/g, "");
  if (s === "") return 0;

  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  let decimalSep: "," | "." | null = null;

  if (lastComma !== -1 && lastDot !== -1) {
    decimalSep = lastComma > lastDot ? "," : ".";
  } else if (lastComma !== -1 || lastDot !== -1) {
    const sep = lastComma !== -1 ? "," : ".";
    const occurrences = s.split(sep).length - 1;
    const digitsAfter = s.length - 1 - (lastComma !== -1 ? lastComma : lastDot);
    decimalSep = occurrences > 1 || digitsAfter === 3 ? null : sep;
  }

  if (decimalSep === null) {
    s = s.replace(/[.,]/g, "");
  } else {
    const thousandSep = decimalSep === "," ? "." : ",";
    s = s.split(thousandSep).join("").replace(decimalSep, ".");
  }

  const parsed = Number(s);
  if (!Number.isFinite(parsed)) return 0;
  return negative ? -Math.abs(parsed) : parsed;
}

function toStringValue(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed === "" || trimmed === "-" ? null : trimmed;
  }
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function toPatientId(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === "string") {
    const digits = value.replace(/[^0-9]/g, "");
    if (digits) return Number.parseInt(digits, 10);
  }
  return 0;
}

export function toIsoDate(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  // Serial de Excel (días desde 1899-12-30) si llega como número crudo.
  if (typeof value === "number" && value > 20000 && value < 80000) {
    const ms = Math.round((value - 25569) * 86400000);
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  }
  const raw = toStringValue(value);
  if (!raw) return null;
  const match = raw.match(/\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : null;
}

export function normalizeRange(range: DateRange): DateRange {
  return {
    from: range.from ? range.from.slice(0, 10) : range.from,
    to: range.to ? range.to.slice(0, 10) : range.to,
  };
}

// Filas sin fecha sólo cuentan cuando NO hay ventana acotada: así no se filtran
// hacia todos los periodos consultados (evita inflar revenue por fecha nula).
export function inRange(date: string | null, range: DateRange): boolean {
  const bounded = Boolean(range.from || range.to);
  if (!date) return !bounded;
  if (range.from && date < range.from) return false;
  if (range.to && date > range.to) return false;
  return true;
}

export function parsePagosDetalle(
  rows: Record<string, unknown>[],
): PagoDetalleRecord[] {
  if (rows.length === 0) return [];
  const headers = Object.keys(rows[0]);
  const col = {
    date: resolveColumn(headers, [
      (n) => n.includes("fecha") && n.includes("recepcion") && n.includes("pago"),
      (n) => n.includes("fecha") && n.includes("pago"),
    ]),
    reference: resolveColumn(headers, [(n) => n.includes("referencia")]),
    category: resolveColumn(headers, [
      (n) => n.includes("nombre") && n.includes("categoria"),
      (n) => n === "categoria",
    ]),
    prestacion: resolveColumn(headers, [
      (n) => n.includes("nombre") && n.includes("prestacion"),
    ]),
    amount: resolveColumn(headers, [
      (n) => n === "pagado prestacion",
      (n) => n.includes("pagado") && n.includes("prestacion") && !n.includes("paciente"),
    ]),
    paymentId: resolveColumn(headers, [(n) => n === "pago", (n) => n === "n pago"]),
    treatmentId: resolveColumn(headers, [(n) => n === "tratamiento", (n) => n === "n tratamiento"]),
    patientId: resolveColumn(headers, [(n) => n === "paciente", (n) => n === "n paciente"]),
    branch: resolveColumn(headers, [(n) => n.includes("sucursal")]),
  };

  return rows
    .map((row): PagoDetalleRecord => {
      const reference = col.reference ? toStringValue(row[col.reference]) : null;
      return {
        paymentId: col.paymentId ? String(toStringValue(row[col.paymentId]) ?? "") : "",
        treatmentId: col.treatmentId ? String(toStringValue(row[col.treatmentId]) ?? "") : "",
        patientId: col.patientId ? toPatientId(row[col.patientId]) : 0,
        category: (col.category ? toStringValue(row[col.category]) : null) ?? "(sin categoría)",
        prestacion: (col.prestacion ? toStringValue(row[col.prestacion]) : null) ?? "",
        reference,
        channel: referenceToChannel(reference),
        amount: col.amount ? toNumber(row[col.amount]) : 0,
        date: col.date ? toIsoDate(row[col.date]) : null,
        branch: col.branch ? toStringValue(row[col.branch]) : null,
      };
    })
    .filter((record) => record.amount !== 0 || record.patientId > 0);
}

export function parseAccionesRealizadas(
  rows: Record<string, unknown>[],
): AccionRecord[] {
  if (rows.length === 0) return [];
  const headers = Object.keys(rows[0]);
  const col = {
    category: resolveColumn(headers, [
      (n) => n.includes("nombre") && n.includes("categoria"),
      (n) => n === "categoria",
    ]),
    price: resolveColumn(headers, [
      (n) => n === "precio prestacion",
      (n) => n.includes("precio") && !n.includes("original"),
    ]),
    paid: resolveColumn(headers, [(n) => n.includes("pagado") && n.includes("abonado")]),
    labCost: resolveColumn(headers, [
      (n) => n.includes("costo") && n.includes("laboratorio"),
      (n) => n.includes("costo") && n.includes("clinica"),
    ]),
    professionalCost: resolveColumn(headers, [
      (n) => n.includes("pagar") && n.includes("profesional"),
      (n) => n.includes("total") && n.includes("profesional"),
    ]),
    date: resolveColumn(headers, [
      (n) => n.includes("fecha") && n.includes("realizacion"),
      (n) => n.includes("fecha") && n.includes("recepcion"),
    ]),
    patientId: resolveColumn(headers, [(n) => n === "paciente", (n) => n === "n paciente"]),
  };

  return rows.map((row): AccionRecord => {
    const price = col.price ? toNumber(row[col.price]) : 0;
    const labCost = col.labCost ? toNumber(row[col.labCost]) : 0;
    const professionalCost = col.professionalCost ? toNumber(row[col.professionalCost]) : 0;
    return {
      category: (col.category ? toStringValue(row[col.category]) : null) ?? "(sin categoría)",
      patientId: col.patientId ? toPatientId(row[col.patientId]) : 0,
      price,
      paid: col.paid ? toNumber(row[col.paid]) : 0,
      labCost,
      professionalCost,
      margin: price - labCost - professionalCost,
      date: col.date ? toIsoDate(row[col.date]) : null,
    };
  });
}

export interface ChannelRow {
  channel: MarketingChannel;
  label: string;
  isMarketing: boolean;
  revenue: number;
  patients: number;
  payingPatients: number;
  share: number;
}

export interface TreatmentRow {
  category: string;
  revenue: number;
  patients: number;
  share: number;
}

export interface TreatmentByChannelRow {
  channel: MarketingChannel;
  label: string;
  top: Array<{ category: string; revenue: number }>;
}

export interface FinancialSummary {
  range: DateRange;
  totals: {
    revenue: number;
    payments: number;
    patients: number;
    payingPatients: number;
  };
  marketing: { revenue: number; patients: number };
  nonMarketing: { revenue: number; patients: number };
  byChannel: ChannelRow[];
  byTreatment: TreatmentRow[];
  treatmentByChannel: TreatmentByChannelRow[];
}

const TOP_TREATMENTS_PER_CHANNEL = 3;

export function buildFinancialSummary(
  payments: PagoDetalleRecord[],
  rawRange: DateRange = {},
): FinancialSummary {
  const range = normalizeRange(rawRange);
  const inWindow = payments.filter((p) => inRange(p.date, range));

  const channelAgg = new Map<
    MarketingChannel,
    { revenue: number; patients: Set<number>; paying: Set<number> }
  >();
  const treatmentAgg = new Map<string, { revenue: number; patients: Set<number> }>();
  const crossAgg = new Map<MarketingChannel, Map<string, number>>();
  const paymentIds = new Set<string>();
  const allPatients = new Set<number>();
  const payingPatients = new Set<number>();
  let revenue = 0;

  for (const p of inWindow) {
    revenue += p.amount;
    if (p.paymentId) paymentIds.add(p.paymentId);
    if (p.patientId > 0) {
      allPatients.add(p.patientId);
      if (p.amount > 0) payingPatients.add(p.patientId);
    }

    const channel = channelAgg.get(p.channel) ?? {
      revenue: 0,
      patients: new Set<number>(),
      paying: new Set<number>(),
    };
    channel.revenue += p.amount;
    if (p.patientId > 0) {
      channel.patients.add(p.patientId);
      if (p.amount > 0) channel.paying.add(p.patientId);
    }
    channelAgg.set(p.channel, channel);

    const treatment = treatmentAgg.get(p.category) ?? {
      revenue: 0,
      patients: new Set<number>(),
    };
    treatment.revenue += p.amount;
    if (p.patientId > 0) treatment.patients.add(p.patientId);
    treatmentAgg.set(p.category, treatment);

    const cross = crossAgg.get(p.channel) ?? new Map<string, number>();
    cross.set(p.category, (cross.get(p.category) ?? 0) + p.amount);
    crossAgg.set(p.channel, cross);
  }

  const byChannel: ChannelRow[] = [...channelAgg.entries()]
    .map(([channel, agg]) => ({
      channel,
      label: CHANNEL_LABELS[channel],
      isMarketing: isMarketingChannel(channel),
      revenue: agg.revenue,
      patients: agg.patients.size,
      payingPatients: agg.paying.size,
      share: revenue > 0 ? (agg.revenue / revenue) * 100 : 0,
    }))
    .sort((a, b) => b.revenue - a.revenue);

  const byTreatment: TreatmentRow[] = [...treatmentAgg.entries()]
    .map(([category, agg]) => ({
      category,
      revenue: agg.revenue,
      patients: agg.patients.size,
      share: revenue > 0 ? (agg.revenue / revenue) * 100 : 0,
    }))
    .sort((a, b) => b.revenue - a.revenue);

  const treatmentByChannel: TreatmentByChannelRow[] = [...crossAgg.entries()]
    .filter(([channel]) => isMarketingChannel(channel))
    .map(([channel, categories]) => ({
      channel,
      label: CHANNEL_LABELS[channel],
      top: [...categories.entries()]
        .map(([category, value]) => ({ category, revenue: value }))
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, TOP_TREATMENTS_PER_CHANNEL),
    }))
    .sort(
      (a, b) =>
        b.top.reduce((s, t) => s + t.revenue, 0) -
        a.top.reduce((s, t) => s + t.revenue, 0),
    );

  const marketingRevenue = byChannel
    .filter((c) => c.isMarketing)
    .reduce((s, c) => s + c.revenue, 0);
  const marketingPatients = new Set<number>();
  const nonMarketingPatients = new Set<number>();
  let nonMarketingRevenue = 0;
  for (const p of inWindow) {
    if (isMarketingChannel(p.channel)) {
      if (p.patientId > 0) marketingPatients.add(p.patientId);
    } else {
      nonMarketingRevenue += p.amount;
      if (p.patientId > 0) nonMarketingPatients.add(p.patientId);
    }
  }

  return {
    range,
    totals: {
      revenue,
      payments: paymentIds.size,
      patients: allPatients.size,
      payingPatients: payingPatients.size,
    },
    marketing: { revenue: marketingRevenue, patients: marketingPatients.size },
    nonMarketing: { revenue: nonMarketingRevenue, patients: nonMarketingPatients.size },
    byChannel,
    byTreatment,
    treatmentByChannel,
  };
}

export interface TreatmentMarginRow {
  category: string;
  revenue: number;
  directCost: number;
  margin: number;
  marginPct: number;
  patients: number;
}

export function buildTreatmentMargin(
  actions: AccionRecord[],
  rawRange: DateRange = {},
): TreatmentMarginRow[] {
  const range = normalizeRange(rawRange);
  const inWindow = actions.filter((a) => inRange(a.date, range));
  const agg = new Map<
    string,
    { revenue: number; cost: number; patients: Set<number> }
  >();

  for (const a of inWindow) {
    const entry = agg.get(a.category) ?? {
      revenue: 0,
      cost: 0,
      patients: new Set<number>(),
    };
    entry.revenue += a.price;
    entry.cost += a.labCost + a.professionalCost;
    if (a.patientId > 0) entry.patients.add(a.patientId);
    agg.set(a.category, entry);
  }

  return [...agg.entries()]
    .map(([category, entry]) => {
      const margin = entry.revenue - entry.cost;
      return {
        category,
        revenue: entry.revenue,
        directCost: entry.cost,
        margin,
        marginPct: entry.revenue > 0 ? (margin / entry.revenue) * 100 : 0,
        patients: entry.patients.size,
      };
    })
    .sort((a, b) => b.margin - a.margin);
}
