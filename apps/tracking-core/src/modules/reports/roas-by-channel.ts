// Reporte de Inversión vs Beneficio (ROAS) por canal.
//
// Une dos fuentes ya normalizadas al mismo canal (ver marketing-channels.ts):
//   - Beneficio: ingresos reales por paciente (pagos de Dentalink) atribuidos a
//     un canal vía la Referencia del reporte de pacientes nuevos.
//   - Inversión: gasto publicitario por canal (conector Windsor).
//
// Es una función pura: recibe datos ya agregados/atribuidos y devuelve la tabla
// por canal con ROAS, CAC y participación de ingresos.

import {
  CHANNEL_LABELS,
  isDigitalChannel,
  type MarketingChannel,
} from "./marketing-channels.js";

export interface ChannelSpendInput {
  channel: MarketingChannel;
  spend: number;
  clicks?: number;
  impressions?: number;
}

export interface AttributedRevenueInput {
  patientId: number;
  channel: MarketingChannel;
  /** Ingreso realizado del paciente (suma de pagos). Puede ser 0. */
  revenue: number;
}

export interface ChannelRoasRow {
  channel: MarketingChannel;
  label: string;
  spend: number;
  revenue: number;
  patients: number;
  payingPatients: number;
  clicks: number;
  impressions: number;
  /** revenue / spend. null cuando no hay inversión en el canal. */
  roas: number | null;
  /** spend / payingPatients (costo por paciente que pagó). null sin inversión. */
  cac: number | null;
  /** spend / patients (costo por paciente captado). null sin inversión. */
  costPerPatient: number | null;
  /** % del ingreso total atribuido. */
  revenueShare: number;
}

export interface RoasByChannelReport {
  channels: ChannelRoasRow[];
  totals: {
    spend: number;
    revenue: number;
    patients: number;
    payingPatients: number;
    roas: number | null;
  };
  /** Sólo canales digitales con inversión > 0 (ROAS pagado real). */
  paid: {
    spend: number;
    revenue: number;
    roas: number | null;
  };
}

interface ChannelAccumulator {
  spend: number;
  revenue: number;
  patientIds: Set<number>;
  payingPatientIds: Set<number>;
  clicks: number;
  impressions: number;
}

function emptyAccumulator(): ChannelAccumulator {
  return {
    spend: 0,
    revenue: 0,
    patientIds: new Set<number>(),
    payingPatientIds: new Set<number>(),
    clicks: 0,
    impressions: 0,
  };
}

function ratio(numerator: number, denominator: number): number | null {
  return denominator > 0 ? numerator / denominator : null;
}

export function buildRoasByChannel(
  revenues: AttributedRevenueInput[],
  spends: ChannelSpendInput[],
): RoasByChannelReport {
  const byChannel = new Map<MarketingChannel, ChannelAccumulator>();
  const accumulatorFor = (channel: MarketingChannel): ChannelAccumulator => {
    const existing = byChannel.get(channel);
    if (existing) {
      return existing;
    }
    const created = emptyAccumulator();
    byChannel.set(channel, created);
    return created;
  };

  for (const entry of revenues) {
    const acc = accumulatorFor(entry.channel);
    acc.revenue += entry.revenue;
    if (entry.patientId > 0) {
      acc.patientIds.add(entry.patientId);
      if (entry.revenue > 0) {
        acc.payingPatientIds.add(entry.patientId);
      }
    }
  }

  for (const entry of spends) {
    const acc = accumulatorFor(entry.channel);
    acc.spend += entry.spend;
    acc.clicks += entry.clicks ?? 0;
    acc.impressions += entry.impressions ?? 0;
  }

  const totalRevenue = [...byChannel.values()].reduce(
    (sum, acc) => sum + acc.revenue,
    0,
  );

  const channels: ChannelRoasRow[] = [...byChannel.entries()]
    .map(([channel, acc]) => {
      const patients = acc.patientIds.size;
      const payingPatients = acc.payingPatientIds.size;
      // Sin inversión, CAC y costo por paciente no aplican (null, no 0).
      const hasSpend = acc.spend > 0;
      return {
        channel,
        label: CHANNEL_LABELS[channel],
        spend: acc.spend,
        revenue: acc.revenue,
        patients,
        payingPatients,
        clicks: acc.clicks,
        impressions: acc.impressions,
        roas: ratio(acc.revenue, acc.spend),
        cac: hasSpend ? ratio(acc.spend, payingPatients) : null,
        costPerPatient: hasSpend ? ratio(acc.spend, patients) : null,
        revenueShare:
          totalRevenue > 0 ? (acc.revenue / totalRevenue) * 100 : 0,
      };
    })
    // Primero los canales con inversión (mayor gasto), luego por ingreso.
    .sort((a, b) => b.spend - a.spend || b.revenue - a.revenue);

  const totalSpend = channels.reduce((sum, row) => sum + row.spend, 0);
  const totalPatients = new Set(
    revenues.filter((r) => r.patientId > 0).map((r) => r.patientId),
  ).size;
  const totalPaying = new Set(
    revenues
      .filter((r) => r.patientId > 0 && r.revenue > 0)
      .map((r) => r.patientId),
  ).size;

  const paidRows = channels.filter(
    (row) => row.spend > 0 && isDigitalChannel(row.channel),
  );
  const paidSpend = paidRows.reduce((sum, row) => sum + row.spend, 0);
  const paidRevenue = paidRows.reduce((sum, row) => sum + row.revenue, 0);

  return {
    channels,
    totals: {
      spend: totalSpend,
      revenue: totalRevenue,
      patients: totalPatients,
      payingPatients: totalPaying,
      roas: ratio(totalRevenue, totalSpend),
    },
    paid: {
      spend: paidSpend,
      revenue: paidRevenue,
      roas: ratio(paidRevenue, paidSpend),
    },
  };
}
