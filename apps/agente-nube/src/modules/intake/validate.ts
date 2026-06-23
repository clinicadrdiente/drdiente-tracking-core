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

  // Algunos sistemas (GHL/Elevator) anidan los campos personalizados bajo
  // `customData`. Aplanamos para leer todo desde un solo objeto; los campos
  // estándar de nivel superior tienen prioridad sobre los anidados.
  const custom = asRecord(record.customData) ?? asRecord(record.custom_data) ?? {};
  const data: Record<string, unknown> = { ...custom, ...record };

  const acc = account(data.account);
  if (!acc) {
    return { ok: false, error: 'account is required and must be "roma" or "general"' };
  }

  const firstName = str(
    data.firstName ?? data.first_name ?? data.full_name ?? data.name,
  );
  if (!firstName) return { ok: false, error: "firstName is required" };

  // Basta con teléfono O email: hay leads que dejan solo uno de los dos.
  const phone = optStr(data.phone);
  const email = optStr(data.email);
  if (!phone && !email) {
    return { ok: false, error: "phone or email is required" };
  }

  const elevatorId = optStr(data.elevatorId ?? data.elevator_id ?? data.contact_id);
  const eventId =
    str(data.eventId ?? data.event_id) ??
    `lead_${acc}_${elevatorId ?? phone ?? email}_${isoOrNow(
      data.occurredAt ?? data.occurred_at,
    ).slice(0, 10)}`;

  return {
    ok: true,
    input: {
      eventId,
      occurredAt: isoOrNow(data.occurredAt ?? data.occurred_at),
      account: acc,
      elevatorId,
      firstName,
      lastName: optStr(data.lastName ?? data.last_name),
      email,
      phone,
      source: optStr(data.source ?? data.contact_source),
      location: optStr(data.city) ?? optStr(data.location),
      initialMessage: optStr(data.initialMessage ?? data.initial_message),
      utmSource: optStr(data.utmSource ?? data.utm_source),
      utmMedium: optStr(data.utmMedium ?? data.utm_medium),
      utmCampaign: optStr(data.utmCampaign ?? data.utm_campaign),
      fbclid: optStr(data.fbclid),
      gclid: optStr(data.gclid),
      ttclid: optStr(data.ttclid),
      landingUrl: optStr(data.landingUrl ?? data.landing_url),
      distributedTo: stringArray(data.distributedTo ?? data.distributed_to),
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
