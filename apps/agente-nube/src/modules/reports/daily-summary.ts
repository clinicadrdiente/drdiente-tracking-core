import type { ClinicAccount } from "../../types/domain.js";
import type { WindsorSummary } from "../windsor/client.js";

export interface DailySummaryInput {
  dateLabel: string;
  currency: string;
  /** null = Supabase no configurado, conteo desconocido. */
  leads: { total: number; byAccount: Record<ClinicAccount, number> } | null;
  /** null = conteo de agendamientos desconocido. */
  appointments: number | null;
  /** null = Windsor no configurado o falló. */
  marketing: WindsorSummary | null;
}

export function formatInt(value: number): string {
  try {
    return new Intl.NumberFormat("es-MX").format(Math.round(value));
  } catch {
    return String(Math.round(value));
  }
}

export function formatMoney(value: number, currency: string): string {
  try {
    return new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `${currency} ${formatInt(value)}`;
  }
}

/** Arma el texto del resumen diario para WhatsApp. Determinista (sin Date.now). */
export function buildDailySummary(input: DailySummaryInput): string {
  const lines: string[] = [`📊 Dr Diente — Resumen del día (${input.dateLabel})`, ""];

  if (input.leads) {
    lines.push(
      `Leads: ${formatInt(input.leads.total)}  (Roma ${formatInt(
        input.leads.byAccount.roma,
      )} · General ${formatInt(input.leads.byAccount.general)})`,
    );
  } else {
    lines.push("Leads: sin datos (Supabase no configurado)");
  }

  lines.push(
    input.appointments === null
      ? "Agendamientos: sin datos"
      : `Agendamientos: ${formatInt(input.appointments)}`,
  );

  lines.push("", "Campañas (Windsor):");
  if (input.marketing && input.marketing.platforms.length > 0) {
    for (const platform of input.marketing.platforms) {
      lines.push(
        `• ${platform.source} — ${formatInt(platform.impressions)} impresiones · ${formatInt(
          platform.clicks,
        )} clics · ${formatMoney(platform.spend, input.currency)}`,
      );
    }
  } else {
    lines.push("• sin datos");
  }

  lines.push("", buildFunnelLine(input));
  return lines.join("\n");
}

function buildFunnelLine(input: DailySummaryInput): string {
  const steps: string[] = [];
  if (input.marketing) {
    steps.push(`${formatInt(input.marketing.totals.impressions)} impresiones`);
    steps.push(`${formatInt(input.marketing.totals.clicks)} clics`);
  }
  if (input.leads) steps.push(`${formatInt(input.leads.total)} leads`);
  if (input.appointments !== null) {
    steps.push(`${formatInt(input.appointments)} agendamientos`);
  }
  return steps.length > 0 ? `Embudo: ${steps.join(" → ")}` : "Embudo: sin datos";
}
