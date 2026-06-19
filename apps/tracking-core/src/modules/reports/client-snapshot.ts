// Construye el snapshot client-safe para el dashboard del cliente.
//
// Reproduce, en una función pura y testeable, las mismas agregaciones que el
// "Resumen de dueños" interno (owner-resumen.tsx) calcula en memoria, pero
// emite SOLO agregados: nada de nombres/contactos de pacientes ni datos crudos.
// El equipo de marketing lo genera (con los reportes ya cargados) y lo publica;
// el cliente solo lo lee.

import {
  buildFinancialSummary,
  buildTreatmentMargin,
  type AccionRecord,
  type PagoDetalleRecord,
  type DateRange,
} from "./financial-detail.js";
import {
  type CarteraSummary,
  type PipelineSummary,
} from "./cartera.js";
import { computeKpis } from "./projections.js";
import {
  CHANNEL_LABELS,
  isMarketingChannel,
  windsorSourceToChannel,
  type MarketingChannel,
} from "./marketing-channels.js";
import {
  buildRecommendations,
  type Recommendation,
} from "./recommendations.js";

export interface WindsorDailyRow {
  date: string;
  source: string;
  spend: number;
  clicks?: number;
  impressions?: number;
}

export interface ClientChannelRow {
  channel: MarketingChannel;
  label: string;
  isMarketing: boolean;
  patients: number;
  payingPatients: number;
  revenue: number;
  spend: number;
  clicks: number;
  impressions: number;
  roas: number | null;
  cac: number | null;
  ctr: number | null;
  cpc: number | null;
  share: number;
}

export interface ClientTreatmentRow {
  category: string;
  revenue: number;
  share: number;
  marginPct: number | null;
}

export interface ClientMonthRow {
  key: string;
  label: string;
  ingreso: number;
  marketing: number;
  spend: number;
  roas: number | null;
  pacientes: number;
  ticket: number;
}

export interface ClientSummarySnapshot {
  schemaVersion: 1;
  generatedAt: string;
  bounds: { min: string; max: string } | null;
  totals: {
    revenue: number;
    marketingRevenue: number;
    nonMarketingRevenue: number;
    spend: number;
    margin: number | null;
    marginPct: number;
  };
  kpis: {
    roas: number | null;
    roiPct: number | null;
    aov: number;
    cac: number | null;
    ltv: number;
    ltvCac: number | null;
    payingPatients: number;
  };
  channels: ClientChannelRow[];
  treatments: ClientTreatmentRow[];
  cartera: CarteraSummary | null;
  pipeline: PipelineSummary | null;
  months: ClientMonthRow[];
  recommendations: Recommendation[];
}

export interface ClientSnapshotInput {
  pagos: PagoDetalleRecord[];
  acciones?: AccionRecord[] | null;
  windsorDaily?: WindsorDailyRow[] | null;
  cartera?: CarteraSummary | null;
  pipeline?: PipelineSummary | null;
  marginPct: number;
  repurchase: number;
  bounds: { min: string; max: string } | null;
  nowIso: string;
}

const MONTH_NAMES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

const TOP_TREATMENTS = 8;

interface SpendAcc {
  spend: number;
  clicks: number;
  impressions: number;
}

function aggregateSpend(
  windsorDaily: WindsorDailyRow[],
  range: DateRange,
): { byChannel: Map<MarketingChannel, SpendAcc>; total: number } {
  const byChannel = new Map<MarketingChannel, SpendAcc>();
  let total = 0;
  for (const row of windsorDaily) {
    const d = (row.date || "").slice(0, 10);
    if (range.from && d < range.from) continue;
    if (range.to && d > range.to) continue;
    const ch = windsorSourceToChannel(row.source);
    const acc = byChannel.get(ch) ?? { spend: 0, clicks: 0, impressions: 0 };
    acc.spend += row.spend || 0;
    acc.clicks += row.clicks ?? 0;
    acc.impressions += row.impressions ?? 0;
    byChannel.set(ch, acc);
    total += row.spend || 0;
  }
  return { byChannel, total };
}

function monthsInRange(min: string, max: string): Array<{ key: string; label: string; from: string; to: string }> {
  const res: Array<{ key: string; label: string; from: string; to: string }> = [];
  let y = Number(min.slice(0, 4));
  let m = Number(min.slice(5, 7));
  const ey = Number(max.slice(0, 4));
  const em = Number(max.slice(5, 7));
  let guard = 0;
  while ((y < ey || (y === ey && m <= em)) && guard < 60) {
    const mm = String(m).padStart(2, "0");
    const lastDay = new Date(y, m, 0).getDate();
    res.push({
      key: `${y}-${mm}`,
      label: `${MONTH_NAMES[m - 1]} ${y}`,
      from: `${y}-${mm}-01`,
      to: `${y}-${mm}-${String(lastDay).padStart(2, "0")}`,
    });
    m += 1;
    if (m > 12) { m = 1; y += 1; }
    guard += 1;
  }
  return res;
}

export function buildClientSnapshot(input: ClientSnapshotInput): ClientSummarySnapshot {
  const windsorDaily = input.windsorDaily ?? [];
  const fullRange: DateRange = {}; // todo el periodo

  const summary = buildFinancialSummary(input.pagos, fullRange);
  const margins = input.acciones ? buildTreatmentMargin(input.acciones, fullRange) : null;
  const totalMargin = margins ? margins.reduce((s, m) => s + m.margin, 0) : null;

  const { byChannel: spendByChannel, total: totalSpend } = aggregateSpend(windsorDaily, fullRange);

  // Filas por canal: ingreso (financiero) cruzado con inversión (Windsor).
  const channels: ClientChannelRow[] = [];
  const shown = new Set<MarketingChannel>();
  for (const c of summary.byChannel) {
    const sp = c.isMarketing ? spendByChannel.get(c.channel) : undefined;
    const spend = sp?.spend ?? 0;
    const clicks = sp?.clicks ?? 0;
    const impressions = sp?.impressions ?? 0;
    channels.push({
      channel: c.channel,
      label: c.label,
      isMarketing: c.isMarketing,
      patients: c.patients,
      payingPatients: c.payingPatients,
      revenue: c.revenue,
      spend,
      clicks,
      impressions,
      roas: spend > 0 ? c.revenue / spend : null,
      cac: spend > 0 && c.payingPatients > 0 ? spend / c.payingPatients : null,
      ctr: impressions > 0 ? clicks / impressions : null,
      cpc: clicks > 0 ? spend / clicks : null,
      share: c.share,
    });
    shown.add(c.channel);
  }
  // Canales con gasto pero sin ingreso atribuido (para que la inversión cuadre).
  for (const [ch, sp] of spendByChannel) {
    if (sp.spend > 0 && !shown.has(ch)) {
      channels.push({
        channel: ch,
        label: CHANNEL_LABELS[ch],
        isMarketing: isMarketingChannel(ch),
        patients: 0,
        payingPatients: 0,
        revenue: 0,
        spend: sp.spend,
        clicks: sp.clicks,
        impressions: sp.impressions,
        roas: 0,
        cac: null,
        ctr: sp.impressions > 0 ? sp.clicks / sp.impressions : null,
        cpc: sp.clicks > 0 ? sp.spend / sp.clicks : null,
        share: 0,
      });
    }
  }
  channels.sort((a, b) => b.spend - a.spend || b.revenue - a.revenue);

  const mktPaying = summary.byChannel
    .filter((c) => c.isMarketing)
    .reduce((s, c) => s + c.payingPatients, 0);
  const avgTicket = mktPaying > 0 ? summary.marketing.revenue / mktPaying : 0;

  const kpis = computeKpis({
    marketingRevenue: summary.marketing.revenue,
    spend: totalSpend,
    payingPatients: mktPaying,
    avgTicket,
    marginPct: input.marginPct,
    repurchase: input.repurchase,
  });

  const treatments: ClientTreatmentRow[] = summary.byTreatment
    .slice(0, TOP_TREATMENTS)
    .map((t) => ({
      category: t.category,
      revenue: t.revenue,
      share: t.share,
      marginPct: margins?.find((m) => m.category === t.category)?.marginPct ?? null,
    }));

  const months: ClientMonthRow[] = input.bounds
    ? monthsInRange(input.bounds.min, input.bounds.max).map((m) => {
        const s = buildFinancialSummary(input.pagos, { from: m.from, to: m.to });
        const { total: spend } = aggregateSpend(windsorDaily, { from: m.from, to: m.to });
        return {
          key: m.key,
          label: m.label,
          ingreso: s.totals.revenue,
          marketing: s.marketing.revenue,
          spend,
          roas: spend > 0 ? s.marketing.revenue / spend : null,
          pacientes: s.totals.payingPatients,
          ticket: s.totals.payingPatients > 0 ? s.totals.revenue / s.totals.payingPatients : 0,
        };
      })
    : [];

  // Mejor tratamiento por margen % (con ingreso real) para la recomendación.
  const topTreatmentMargin = margins
    ? [...margins]
        .filter((m) => m.revenue > 0)
        .sort((a, b) => b.marginPct - a.marginPct)[0] ?? null
    : null;

  const recommendations = buildRecommendations({
    channels: channels.map((c) => ({
      label: c.label,
      isMarketing: c.isMarketing,
      spend: c.spend,
      revenue: c.revenue,
      roas: c.roas,
      payingPatients: c.payingPatients,
    })),
    kpis: { roas: kpis.roas, ltv: kpis.ltv, cac: kpis.cac, ltvCac: kpis.ltvCac },
    cartera: input.cartera ? { saldoSinCita: input.cartera.saldoSinCita } : null,
    pipeline: input.pipeline
      ? { montoPresupuestado: input.pipeline.montoPresupuestado, tasaInicio: input.pipeline.tasaInicio }
      : null,
    topTreatmentMargin: topTreatmentMargin
      ? { category: topTreatmentMargin.category, marginPct: topTreatmentMargin.marginPct }
      : null,
  });

  return {
    schemaVersion: 1,
    generatedAt: input.nowIso,
    bounds: input.bounds,
    totals: {
      revenue: summary.totals.revenue,
      marketingRevenue: summary.marketing.revenue,
      nonMarketingRevenue: summary.nonMarketing.revenue,
      spend: totalSpend,
      margin: totalMargin,
      marginPct: input.marginPct,
    },
    kpis: {
      roas: kpis.roas,
      roiPct: kpis.roiPct,
      aov: avgTicket,
      cac: kpis.cac,
      ltv: kpis.ltv,
      ltvCac: kpis.ltvCac,
      payingPatients: mktPaying,
    },
    channels,
    treatments,
    cartera: input.cartera ?? null,
    pipeline: input.pipeline ?? null,
    months,
    recommendations,
  };
}
