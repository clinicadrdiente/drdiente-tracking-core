import {
  CLINIC_ACCOUNTS,
  type AppointmentIntakeInput,
  type ClinicAccount,
  type LeadHandoffInput,
} from "../../types/domain.js";

export type ValidationResult<T> =
  | { ok: true; input: T }
  | { ok: false; error: string };

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

function optStr(value: unknown): string | null {
  return str(value) ?? null;
}

function account(value: unknown): ClinicAccount | undefined {
  const candidate = str(value)?.toLowerCase();
  return CLINIC_ACCOUNTS.find((item) => item === candidate);
}

function isoOrNow(value: unknown): string {
  const candidate = str(value);
  if (candidate) {
    const time = Date.parse(candidate);
    if (Number.isFinite(time)) return new Date(time).toISOString();
  }
  return new Date().toISOString();
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter((item) => item !== "");
}

/** Valida el payload del workflow de salida (lead.handoff). */
export function validateLeadHandoff(
  body: unknown,
): ValidationResult<LeadHandoffInput> {
  const record = asRecord(body);
  if (!record) return { ok: false, error: "body must be a JSON object" };

  const acc = account(record.account);
  if (!acc) {
    return { ok: false, error: 'account is required and must be "roma" or "general"' };
  }

  const firstName = str(record.firstName ?? record.first_name);
  if (!firstName) return { ok: false, error: "firstName is required" };

  const phone = str(record.phone);
  if (!phone) return { ok: false, error: "phone is required" };

  const eventId =
    str(record.eventId ?? record.event_id) ??
    `lead_${acc}_${str(record.elevatorId ?? record.elevator_id) ?? phone}_${isoOrNow(
      record.occurredAt ?? record.occurred_at,
    ).slice(0, 10)}`;

  return {
    ok: true,
    input: {
      eventId,
      occurredAt: isoOrNow(record.occurredAt ?? record.occurred_at),
      account: acc,
      elevatorId: optStr(record.elevatorId ?? record.elevator_id),
      firstName,
      lastName: optStr(record.lastName ?? record.last_name),
      email: optStr(record.email),
      phone,
      source: optStr(record.source),
      location: optStr(record.location),
      initialMessage: optStr(record.initialMessage ?? record.initial_message),
      utmSource: optStr(record.utmSource ?? record.utm_source),
      utmMedium: optStr(record.utmMedium ?? record.utm_medium),
      utmCampaign: optStr(record.utmCampaign ?? record.utm_campaign),
      fbclid: optStr(record.fbclid),
      gclid: optStr(record.gclid),
      ttclid: optStr(record.ttclid),
      landingUrl: optStr(record.landingUrl ?? record.landing_url),
      distributedTo: stringArray(record.distributedTo ?? record.distributed_to),
    },
  };
}

/** Valida el webhook de agendamiento. */
export function validateAppointment(
  body: unknown,
): ValidationResult<AppointmentIntakeInput> {
  const record = asRecord(body);
  if (!record) return { ok: false, error: "body must be a JSON object" };

  const acc = account(record.account);
  if (!acc) {
    return { ok: false, error: 'account is required and must be "roma" or "general"' };
  }

  const appointmentId = str(record.appointmentId ?? record.appointment_id);
  if (!appointmentId) return { ok: false, error: "appointmentId is required" };

  const eventId = str(record.eventId ?? record.event_id) ?? `appt_${acc}_${appointmentId}`;

  return {
    ok: true,
    input: {
      eventId,
      occurredAt: isoOrNow(record.occurredAt ?? record.occurred_at),
      account: acc,
      appointmentId,
      elevatorId: optStr(record.elevatorId ?? record.elevator_id),
      patientId: optStr(record.patientId ?? record.patient_id),
      branch: optStr(record.branch),
      scheduledAt: optStr(record.scheduledAt ?? record.scheduled_at),
      source: optStr(record.source),
    },
  };
}
