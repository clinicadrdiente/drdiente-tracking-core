// Cartera (saldos) y pipeline comercial (presupuestos) desde los reportes
// exportables de Dentalink.
//   - "tratamientos_resumen_saldos": snapshot ACTUAL por plan de tratamiento
//     (presupuesto, abonado, realizado, saldo pendiente). No tiene fecha → es
//     una foto del momento, no se filtra por rango.
//   - "tratamientos_presupuestos_capturados": presupuestos creados, CON fecha de
//     captura + Referencia (canal) + estado → pipeline comercial filtrable.
//
// Funciones puras (el llamador parsea el archivo a filas). Reutiliza utilidades
// de financial-detail.

import {
  inRange,
  normalizeRange,
  toIsoDate,
  toNumber,
  type DateRange,
} from "./financial-detail.js";
import {
  CHANNEL_LABELS,
  isMarketingChannel,
  referenceToChannel,
  type MarketingChannel,
} from "./marketing-channels.js";

function normalizeHeader(header: string): string {
  return header
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

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

function readString(value: unknown): string | null {
  if (typeof value === "string") {
    const t = value.trim();
    return t === "" || t === "-" ? null : t;
  }
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function readId(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === "string") {
    const digits = value.replace(/[^0-9]/g, "");
    if (digits) return Number.parseInt(digits, 10);
  }
  return 0;
}

// ---------- Saldos / cartera ----------

export interface SaldoRecord {
  patientId: number;
  treatmentId: string;
  total: number;
  realizado: number;
  abonado: number;
  saldoGlobal: number;
  proximaCita: string | null;
  agendada: boolean;
}

export function parseSaldos(rows: Record<string, unknown>[]): SaldoRecord[] {
  if (rows.length === 0) return [];
  const headers = Object.keys(rows[0]);
  const col = {
    patientId: resolveColumn(headers, [(n) => n === "paciente", (n) => n === "n paciente"]),
    treatmentId: resolveColumn(headers, [(n) => n === "tratamiento", (n) => n === "n tratamiento"]),
    total: resolveColumn(headers, [(n) => n.includes("total") && n.includes("tratamiento")]),
    realizado: resolveColumn(headers, [(n) => n.includes("total") && n.includes("realizado")]),
    abonado: resolveColumn(headers, [(n) => n.includes("total") && n.includes("abonado")]),
    saldoGlobal: resolveColumn(headers, [
      (n) => n.includes("saldo") && n.includes("global"),
      (n) => n.includes("saldo"),
    ]),
    proximaCita: resolveColumn(headers, [(n) => n.includes("proxima") && n.includes("cita")]),
  };

  return rows.map((row): SaldoRecord => {
    const proximaCita = col.proximaCita ? readString(row[col.proximaCita]) : null;
    return {
      patientId: col.patientId ? readId(row[col.patientId]) : 0,
      treatmentId: col.treatmentId ? String(readString(row[col.treatmentId]) ?? "") : "",
      total: col.total ? toNumber(row[col.total]) : 0,
      realizado: col.realizado ? toNumber(row[col.realizado]) : 0,
      abonado: col.abonado ? toNumber(row[col.abonado]) : 0,
      saldoGlobal: col.saldoGlobal ? toNumber(row[col.saldoGlobal]) : 0,
      proximaCita,
      agendada: Boolean(proximaCita && /\d{4}-\d{2}-\d{2}/.test(proximaCita)),
    };
  });
}

export interface CarteraSummary {
  totalPresupuestado: number;
  totalAbonado: number;
  totalRealizado: number;
  saldoPendiente: number;
  /** % del presupuesto ya cobrado. */
  cobradoPct: number;
  planes: number;
  planesConSaldo: number;
  pacientesConSaldo: number;
  /** Saldo pendiente de planes con próxima cita agendada (recuperable pronto). */
  saldoConCitaAgendada: number;
  saldoSinCita: number;
}

export function buildCartera(saldos: SaldoRecord[]): CarteraSummary {
  let totalPresupuestado = 0;
  let totalAbonado = 0;
  let totalRealizado = 0;
  let saldoPendiente = 0;
  let planesConSaldo = 0;
  let saldoConCitaAgendada = 0;
  let saldoSinCita = 0;
  const pacientesConSaldo = new Set<number>();

  for (const s of saldos) {
    totalPresupuestado += s.total;
    totalAbonado += s.abonado;
    totalRealizado += s.realizado;
    saldoPendiente += s.saldoGlobal;
    if (s.saldoGlobal > 0) {
      planesConSaldo += 1;
      if (s.patientId > 0) pacientesConSaldo.add(s.patientId);
      if (s.agendada) saldoConCitaAgendada += s.saldoGlobal;
      else saldoSinCita += s.saldoGlobal;
    }
  }

  return {
    totalPresupuestado,
    totalAbonado,
    totalRealizado,
    saldoPendiente,
    cobradoPct: totalPresupuestado > 0 ? (totalAbonado / totalPresupuestado) * 100 : 0,
    planes: saldos.length,
    planesConSaldo,
    pacientesConSaldo: pacientesConSaldo.size,
    saldoConCitaAgendada,
    saldoSinCita,
  };
}

// ---------- Presupuestos / pipeline ----------

export interface PresupuestoRecord {
  treatmentId: string;
  patientId: number;
  reference: string | null;
  channel: MarketingChannel;
  captureDate: string | null;
  total: number;
  totalPagos: number;
  iniciado: boolean;
  branch: string | null;
}

export function parsePresupuestos(
  rows: Record<string, unknown>[],
): PresupuestoRecord[] {
  if (rows.length === 0) return [];
  const headers = Object.keys(rows[0]);
  const col = {
    treatmentId: resolveColumn(headers, [(n) => n === "tratamiento", (n) => n === "n tratamiento"]),
    patientId: resolveColumn(headers, [(n) => n === "paciente", (n) => n === "n paciente"]),
    reference: resolveColumn(headers, [(n) => n.includes("referencia")]),
    captureDate: resolveColumn(headers, [
      (n) => n.includes("fecha") && n.includes("captura"),
      (n) => n.includes("fecha") && n.includes("generacion"),
    ]),
    total: resolveColumn(headers, [(n) => n.includes("total") && n.includes("presupuesto")]),
    totalPagos: resolveColumn(headers, [(n) => n.includes("total") && n.includes("pago")]),
    iniciado: resolveColumn(headers, [(n) => n.includes("iniciado")]),
    branch: resolveColumn(headers, [(n) => n.includes("sucursal")]),
  };

  return rows.map((row): PresupuestoRecord => {
    const reference = col.reference ? readString(row[col.reference]) : null;
    const iniciadoRaw = col.iniciado ? (readString(row[col.iniciado]) ?? "") : "";
    return {
      treatmentId: col.treatmentId ? String(readString(row[col.treatmentId]) ?? "") : "",
      patientId: col.patientId ? readId(row[col.patientId]) : 0,
      reference,
      channel: referenceToChannel(reference),
      captureDate: col.captureDate ? toIsoDate(row[col.captureDate]) : null,
      total: col.total ? toNumber(row[col.total]) : 0,
      totalPagos: col.totalPagos ? toNumber(row[col.totalPagos]) : 0,
      // "Iniciado" => iniciado; "No iniciado"/"No existen..." => false
      iniciado: /\biniciado\b/i.test(iniciadoRaw) && !/no\s+iniciado/i.test(iniciadoRaw),
      branch: col.branch ? readString(row[col.branch]) : null,
    };
  });
}

export interface PipelineChannelRow {
  channel: MarketingChannel;
  label: string;
  isMarketing: boolean;
  presupuestos: number;
  montoPresupuestado: number;
  montoPagado: number;
}

export interface PipelineSummary {
  range: DateRange;
  count: number;
  montoPresupuestado: number;
  montoPagado: number;
  iniciados: number;
  /** % de presupuestos que arrancaron tratamiento. */
  tasaInicio: number;
  /** % del monto presupuestado que ya se cobró. */
  tasaCobro: number;
  byChannel: PipelineChannelRow[];
}

export function buildPipeline(
  presupuestos: PresupuestoRecord[],
  rawRange: DateRange = {},
): PipelineSummary {
  const range = normalizeRange(rawRange);
  const inWindow = presupuestos.filter((p) => inRange(p.captureDate, range));

  let montoPresupuestado = 0;
  let montoPagado = 0;
  let iniciados = 0;
  const byChannel = new Map<
    MarketingChannel,
    { presupuestos: number; monto: number; pagado: number }
  >();

  for (const p of inWindow) {
    montoPresupuestado += p.total;
    montoPagado += p.totalPagos;
    if (p.iniciado) iniciados += 1;
    const agg = byChannel.get(p.channel) ?? { presupuestos: 0, monto: 0, pagado: 0 };
    agg.presupuestos += 1;
    agg.monto += p.total;
    agg.pagado += p.totalPagos;
    byChannel.set(p.channel, agg);
  }

  return {
    range,
    count: inWindow.length,
    montoPresupuestado,
    montoPagado,
    iniciados,
    tasaInicio: inWindow.length > 0 ? (iniciados / inWindow.length) * 100 : 0,
    tasaCobro: montoPresupuestado > 0 ? (montoPagado / montoPresupuestado) * 100 : 0,
    byChannel: [...byChannel.entries()]
      .map(([channel, agg]) => ({
        channel,
        label: CHANNEL_LABELS[channel],
        isMarketing: isMarketingChannel(channel),
        presupuestos: agg.presupuestos,
        montoPresupuestado: agg.monto,
        montoPagado: agg.pagado,
      }))
      .sort((a, b) => b.montoPresupuestado - a.montoPresupuestado),
  };
}
