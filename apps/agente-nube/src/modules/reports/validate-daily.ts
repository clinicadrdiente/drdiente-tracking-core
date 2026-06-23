import {
  CLINIC_ACCOUNTS,
  type ClinicAccount,
  type DailyBranchReportInput,
  type LeadContactChannel,
} from "../../types/domain";
import type { ValidationResult } from "../intake/validate";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const CHANNELS: readonly LeadContactChannel[] = [
  "whatsapp",
  "llamada",
  "email",
  "instagram",
  "facebook",
  "formulario",
  "otro",
];

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

function count(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.floor(parsed);
}

function account(value: unknown): ClinicAccount | null {
  const candidate = str(value)?.toLowerCase();
  return CLINIC_ACCOUNTS.find((item) => item === candidate) ?? null;
}

function contacts(
  value: unknown,
): Array<{ channel: LeadContactChannel; count: number }> {
  if (!Array.isArray(value)) return [];
  const result: Array<{ channel: LeadContactChannel; count: number }> = [];
  for (const item of value) {
    const record = asRecord(item);
    if (!record) continue;
    const channel = str(record.channel)?.toLowerCase() as LeadContactChannel | undefined;
    if (!channel || !CHANNELS.includes(channel)) continue;
    result.push({ channel, count: count(record.count) });
  }
  return result;
}

/** Valida el reporte diario de recepción / plataforma SAC. */
export function validateDailyReport(
  body: unknown,
): ValidationResult<DailyBranchReportInput> {
  const record = asRecord(body);
  if (!record) return { ok: false, error: "body must be a JSON object" };

  const branch = str(record.branch);
  if (!branch) return { ok: false, error: "branch is required" };

  const date = str(record.date);
  if (!date || !DATE_PATTERN.test(date)) {
    return { ok: false, error: "date is required in YYYY-MM-DD format" };
  }

  return {
    ok: true,
    input: {
      branch,
      date,
      account: account(record.account),
      contacts: contacts(record.contacts),
      leadsReceived: count(record.leadsReceived ?? record.leads_received),
      leadsContacted: count(record.leadsContacted ?? record.leads_contacted),
      followUpsSent: count(record.followUpsSent ?? record.follow_ups_sent),
      promoWhatsappSent: count(record.promoWhatsappSent ?? record.promo_whatsapp_sent),
      emailsSent: count(record.emailsSent ?? record.emails_sent),
      postsPublished: count(record.postsPublished ?? record.posts_published),
      callsReceived: count(record.callsReceived ?? record.calls_received),
      appointmentsBooked: count(record.appointmentsBooked ?? record.appointments_booked),
      notes: str(record.notes) ?? null,
    },
  };
}
