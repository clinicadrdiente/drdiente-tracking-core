// Recomendaciones automáticas (reglas deterministas) para el dashboard del
// cliente. Función pura: recibe los agregados ya calculados (canales, KPIs,
// cartera, pipeline, margen) y devuelve una lista priorizada de acciones en
// lenguaje simple. Sin IA, sin estado, sin red — fácil de testear.

export type RecommendationSeverity = "alta" | "media" | "oportunidad";

export interface Recommendation {
  id: string;
  severity: RecommendationSeverity;
  title: string;
  detail: string;
}

export interface RecommendationChannelInput {
  label: string;
  isMarketing: boolean;
  spend: number;
  revenue: number;
  roas: number | null;
  payingPatients: number;
}

export interface RecommendationsInput {
  channels: RecommendationChannelInput[];
  kpis: {
    roas: number | null;
    ltv: number;
    cac: number | null;
    ltvCac: number | null;
  };
  cartera: { saldoSinCita: number } | null;
  pipeline: { montoPresupuestado: number; tasaInicio: number } | null;
  topTreatmentMargin: { category: string; marginPct: number } | null;
}

const SEVERITY_ORDER: Record<RecommendationSeverity, number> = {
  alta: 0,
  media: 1,
  oportunidad: 2,
};

function money(value: number): string {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  }).format(value);
}

function pct(value: number): string {
  return `${Math.round(value)}%`;
}

// Umbrales de negocio. Centralizados para que sean fáciles de ajustar.
const ROAS_BAD = 1; // por debajo: cada $1 invertido devuelve menos de $1
const ROAS_GREAT = 3; // por encima: candidato a escalar
const LTV_CAC_HEALTHY = 3;
const PIPELINE_START_RATE_LOW = 50; // % de presupuestos que arrancan
const MIN_SPEND_FOR_CHANNEL_RULE = 1; // ignora canales con gasto ~0

export function buildRecommendations(
  input: RecommendationsInput,
): Recommendation[] {
  const recs: Recommendation[] = [];

  for (const channel of input.channels) {
    if (!channel.isMarketing || channel.spend < MIN_SPEND_FOR_CHANNEL_RULE) {
      continue;
    }
    if (channel.roas !== null && channel.roas < ROAS_BAD) {
      recs.push({
        id: `roas-bajo-${channel.label}`,
        severity: "alta",
        title: `${channel.label} no es rentable`,
        detail: `ROAS ${channel.roas.toFixed(1)}x: con ${money(channel.spend)} invertidos solo regresaron ${money(channel.revenue)}. Pausar o reenfocar la inversión de este canal.`,
      });
    } else if (channel.roas !== null && channel.roas >= ROAS_GREAT) {
      recs.push({
        id: `roas-alto-${channel.label}`,
        severity: "oportunidad",
        title: `Escalar ${channel.label}`,
        detail: `ROAS ${channel.roas.toFixed(1)}x: cada $1 devuelve ${channel.roas.toFixed(1)}. Es el mejor candidato para subir presupuesto.`,
      });
    }
  }

  if (input.kpis.ltvCac !== null && input.kpis.ltvCac < LTV_CAC_HEALTHY) {
    recs.push({
      id: "ltv-cac",
      severity: "media",
      title: "Relación LTV/CAC por debajo de lo sano",
      detail: `LTV/CAC ${input.kpis.ltvCac.toFixed(1)}x (lo sano es ≥${LTV_CAC_HEALTHY}x). Bajar el costo de adquisición o subir la recompra/ticket por paciente.`,
    });
  }

  if (input.cartera && input.cartera.saldoSinCita > 0) {
    recs.push({
      id: "cartera-sin-cita",
      severity: "oportunidad",
      title: "Recuperar cartera sin cita",
      detail: `Hay ${money(input.cartera.saldoSinCita)} ya vendidos pero pendientes de cobro en pacientes sin próxima cita. Reactivarlos es ingreso sin gasto en anuncios.`,
    });
  }

  if (
    input.pipeline &&
    input.pipeline.montoPresupuestado > 0 &&
    input.pipeline.tasaInicio < PIPELINE_START_RATE_LOW
  ) {
    recs.push({
      id: "pipeline-cierre",
      severity: "media",
      title: "Cerrar presupuestos creados",
      detail: `${money(input.pipeline.montoPresupuestado)} en presupuestos y solo ${pct(input.pipeline.tasaInicio)} arrancaron tratamiento. Reforzar el seguimiento para subir la tasa de inicio.`,
    });
  }

  if (input.topTreatmentMargin) {
    recs.push({
      id: "tratamiento-margen",
      severity: "oportunidad",
      title: `Empujar ${input.topTreatmentMargin.category}`,
      detail: `Es el tratamiento con mejor margen (${pct(input.topTreatmentMargin.marginPct)}). Priorizarlo en campañas y en la conversación de venta mejora la utilidad por paciente.`,
    });
  }

  return recs.sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity],
  );
}
