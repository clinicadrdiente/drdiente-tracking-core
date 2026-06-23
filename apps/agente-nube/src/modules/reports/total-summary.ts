import type { DailyBranchReport } from "../../types/domain.js";
import { buildDailySummary, formatInt, type DailySummaryInput } from "./daily-summary.js";

export interface ReceptionTotals {
  leadsReceived: number;
  leadsContacted: number;
  followUpsSent: number;
  callsReceived: number;
  promoWhatsappSent: number;
  emailsSent: number;
  postsPublished: number;
  appointmentsBooked: number;
  reportingBranches: number;
  daysWithReports: number;
}

/** Suma los reportes diarios de recepción (plataforma SAC). */
export function aggregateReception(reports: DailyBranchReport[]): ReceptionTotals {
  const totals: ReceptionTotals = {
    leadsReceived: 0,
    leadsContacted: 0,
    followUpsSent: 0,
    callsReceived: 0,
    promoWhatsappSent: 0,
    emailsSent: 0,
    postsPublished: 0,
    appointmentsBooked: 0,
    reportingBranches: 0,
    daysWithReports: 0,
  };

  const branches = new Set<string>();
  const days = new Set<string>();

  for (const report of reports) {
    totals.leadsReceived += report.leadsReceived ?? 0;
    totals.leadsContacted += report.leadsContacted ?? 0;
    totals.followUpsSent += report.followUpsSent ?? 0;
    totals.promoWhatsappSent += report.promoWhatsappSent ?? 0;
    totals.emailsSent += report.emailsSent ?? 0;
    totals.postsPublished += report.postsPublished ?? 0;
    totals.appointmentsBooked += report.appointmentsBooked ?? 0;

    const callsFromContacts = (report.contacts ?? [])
      .filter((contact) => contact.channel === "llamada")
      .reduce((sum, contact) => sum + contact.count, 0);
    totals.callsReceived += (report.callsReceived ?? 0) + callsFromContacts;

    branches.add(report.branch);
    days.add(report.date);
  }

  totals.reportingBranches = branches.size;
  totals.daysWithReports = days.size;
  return totals;
}

/** Reporte total de fin de día: resumen digital + sección de recepción (SAC). */
export function buildTotalSummary(
  daily: DailySummaryInput,
  reception: ReceptionTotals,
): string {
  const head = buildDailySummary(daily);

  if (reception.reportingBranches === 0) {
    return `${head}\n\n— Recepción (SAC) —\nSin reportes de recepción hoy.`;
  }

  const lines = [
    head,
    "",
    `— Recepción (SAC) — ${reception.reportingBranches} sucursal(es)`,
    `Contactados: ${formatInt(reception.leadsContacted)} · Seguimientos: ${formatInt(
      reception.followUpsSent,
    )}`,
    `Llamadas: ${formatInt(reception.callsReceived)} · WhatsApp promo: ${formatInt(
      reception.promoWhatsappSent,
    )}`,
    `Emails: ${formatInt(reception.emailsSent)} · Posts: ${formatInt(
      reception.postsPublished,
    )}`,
  ];

  if (reception.appointmentsBooked > 0) {
    lines.push(`Agendamientos (recepción): ${formatInt(reception.appointmentsBooked)}`);
  }

  return lines.join("\n");
}
