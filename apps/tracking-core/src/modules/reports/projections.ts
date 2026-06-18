// Motor de KPIs y proyecciones para la calculadora del Resumen de dueños
// ("dónde estoy / de dónde vengo / hacia dónde voy"). Funciones puras.
//
// El revenue que entra aquí debe ser SOLO el de marketing (pacientes de origen
// digital), nunca el total, para que el ROAS/ROI no quede inflado por orgánico.
// El margen y la recompra (LTV) los aporta el usuario porque no están en los
// datos de Dentalink.

export interface KpiInputs {
  marketingRevenue: number;
  spend: number;
  payingPatients: number;
  /** Ingreso promedio por paciente que pagó (ticket). */
  avgTicket: number;
  /** Margen de contribución 0–100 (% del ingreso que es margen). */
  marginPct: number;
  /** Multiplicador de recompra para LTV (pagos/tratamientos de por vida). */
  repurchase: number;
}

export interface Kpis {
  roas: number | null;
  roiPct: number | null;
  cac: number | null;
  ltv: number;
  ltvCac: number | null;
  paybackPayments: number | null;
}

function ratio(numerator: number, denominator: number): number | null {
  return denominator > 0 ? numerator / denominator : null;
}

export function computeKpis(input: KpiInputs): Kpis {
  const margin = clampMargin(input.marginPct) / 100;
  const roas = ratio(input.marketingRevenue, input.spend);
  const roiPct =
    input.spend > 0
      ? ((input.marketingRevenue * margin - input.spend) / input.spend) * 100
      : null;
  const cac = ratio(input.spend, input.payingPatients);
  const ltv = input.avgTicket * Math.max(1, input.repurchase) * margin;
  const ticketMargin = input.avgTicket * margin;
  return {
    roas,
    roiPct,
    cac,
    ltv,
    ltvCac: cac !== null && cac > 0 ? ltv / cac : null,
    paybackPayments: ticketMargin > 0 && cac !== null ? cac / ticketMargin : null,
  };
}

function clampMargin(marginPct: number): number {
  if (!Number.isFinite(marginPct)) return 0;
  return Math.min(100, Math.max(0, marginPct));
}

export type ProjectionMode = "runrate" | "scale" | "goal";

export interface ProjectionInputs {
  mode: ProjectionMode;
  marketingRevenue: number;
  spend: number;
  payingPatients: number;
  avgTicket: number;
  marginPct: number;
  /** Días del periodo seleccionado y días ya transcurridos (para run-rate). */
  periodDays?: number;
  elapsedDays?: number;
  /** Modo "scale": % de cambio del gasto (ej. 50 = +50%). */
  scalePct?: number;
  /** Caída de eficiencia por cada +50% de gasto (0–1). Default 0.15. */
  decayPer50?: number;
  /** Modo "goal": ingreso objetivo de marketing. */
  goalRevenue?: number;
  /** Ancho de banda de confianza (0–1). Default 0.15. */
  bandPct?: number;
}

export interface ProjectionResult {
  mode: ProjectionMode;
  projectedSpend: number;
  projectedRevenue: number;
  projectedPatients: number;
  projectedRoas: number | null;
  low: number;
  high: number;
  assumptions: string;
}

export function project(input: ProjectionInputs): ProjectionResult {
  const band = input.bandPct ?? 0.15;
  const roas = ratio(input.marketingRevenue, input.spend) ?? 0;
  const cac = ratio(input.spend, input.payingPatients);
  const withBand = (value: number) => {
    const a = value * (1 - band);
    const b = value * (1 + band);
    return { low: Math.min(a, b), high: Math.max(a, b) };
  };

  if (input.mode === "scale") {
    // No se puede recortar más del 100% del gasto; recortar gasto no mejora la
    // eficiencia por peso (eficiencia acotada a [0.4, 1]).
    const scalePct = Math.max(-100, input.scalePct ?? 0);
    const decay = input.decayPer50 ?? 0.15;
    const efficiency = Math.min(1, Math.max(0.4, 1 - decay * (scalePct / 50)));
    const projectedSpend = Math.max(0, input.spend * (1 + scalePct / 100));
    const projectedRevenue = projectedSpend * roas * efficiency;
    const projectedPatients =
      cac && cac > 0 ? (projectedSpend / cac) * efficiency : 0;
    const { low, high } = withBand(projectedRevenue);
    return {
      mode: "scale",
      projectedSpend,
      projectedRevenue,
      projectedPatients,
      projectedRoas: ratio(projectedRevenue, projectedSpend),
      low,
      high,
      assumptions: `Gasto ${scalePct >= 0 ? "+" : ""}${Math.round(scalePct)}%, ROAS ${roas.toFixed(1)}x con eficiencia ${(efficiency * 100).toFixed(0)}% (rendimientos decrecientes).`,
    };
  }

  if (input.mode === "goal") {
    const goal = input.goalRevenue ?? 0;
    const hasRoas = roas > 0;
    // Sin un ROAS base la inversión necesaria es indefinida (no $0).
    const projectedSpend = hasRoas ? goal / roas : Number.NaN;
    const projectedPatients = input.avgTicket > 0 ? goal / input.avgTicket : 0;
    const { low, high } = withBand(hasRoas ? projectedSpend : 0);
    return {
      mode: "goal",
      projectedSpend,
      projectedRevenue: goal,
      projectedPatients,
      projectedRoas: hasRoas ? ratio(goal, projectedSpend) : null,
      low,
      high,
      assumptions: hasRoas
        ? `Para ${formatGoal(goal)} de ingreso marketing a ROAS ${roas.toFixed(1)}x se necesitan ~${formatGoal(projectedSpend)} de inversión (asume ROAS estable).`
        : "Falta un ROAS base: carga el gasto de Windsor del periodo para estimar la inversión necesaria.",
    };
  }

  // run-rate: proyecta el próximo periodo de igual longitud sin cambiar nada.
  const periodDays = input.periodDays ?? 0;
  const elapsedDays = input.elapsedDays ?? periodDays;
  // Nunca proyectar por debajo de lo ya acumulado (factor >= 1).
  const factor = elapsedDays > 0 && periodDays > 0 ? Math.max(1, periodDays / elapsedDays) : 1;
  const projectedRevenue = input.marketingRevenue * factor;
  const projectedSpend = input.spend * factor;
  const projectedPatients = input.payingPatients * factor;
  const { low, high } = withBand(projectedRevenue);
  return {
    mode: "runrate",
    projectedSpend,
    projectedRevenue,
    projectedPatients,
    projectedRoas: ratio(projectedRevenue, projectedSpend),
    low,
    high,
    assumptions:
      factor > 1
        ? `Ritmo actual proyectado al periodo completo (×${factor.toFixed(2)}).`
        : "Mantiene el ritmo y el gasto actuales.",
  };
}

function formatGoal(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `$${Math.round(value / 1_000)}k`;
  return `$${Math.round(value)}`;
}
