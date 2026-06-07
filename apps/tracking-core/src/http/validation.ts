import type { AppointmentEvent, AttributionData, LeadInput } from "../types/domain.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asOptionalString(value: unknown): string | null | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  return typeof value === "string" ? value : undefined;
}

export function parseLeadInput(body: unknown): LeadInput | null {
  if (!isRecord(body) || !isRecord(body.attribution)) {
    return null;
  }

  if (
    typeof body.firstName !== "string" ||
    typeof body.phone !== "string" ||
    typeof body.branch !== "string"
  ) {
    return null;
  }

  const attribution: AttributionData = {
    fbclid: asOptionalString(body.attribution.fbclid),
    gclid: asOptionalString(body.attribution.gclid),
    ttclid: asOptionalString(body.attribution.ttclid),
    utmSource: asOptionalString(body.attribution.utmSource),
    utmMedium: asOptionalString(body.attribution.utmMedium),
    utmCampaign: asOptionalString(body.attribution.utmCampaign),
    campaignId: asOptionalString(body.attribution.campaignId),
    landingUrl: asOptionalString(body.attribution.landingUrl),
  };

  return {
    firstName: body.firstName,
    lastName: asOptionalString(body.lastName),
    phone: body.phone,
    email: asOptionalString(body.email),
    branch: body.branch,
    attribution,
  };
}

export function parseAppointmentInput(body: unknown): AppointmentEvent | null {
  if (!isRecord(body)) {
    return null;
  }

  if (
    typeof body.appointmentId !== "number" ||
    typeof body.patientId !== "number" ||
    typeof body.scheduledAt !== "string"
  ) {
    return null;
  }

  return {
    appointmentId: body.appointmentId,
    patientId: body.patientId,
    scheduledAt: body.scheduledAt,
    branch: asOptionalString(body.branch),
  };
}
