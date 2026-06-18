import type {
  AppointmentEvent,
  AttributionData,
  LeadInput,
} from "../types/domain.js";

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
  if (!isRecord(body)) {
    return null;
  }

  // Accept both nested { attribution: {...} } and flat webhook format from landing page
  const flat = body;
  const nested = isRecord(body.attribution) ? body.attribution : null;

  const firstName = body.firstName ?? body.first_name;
  const phone = body.phone;
  const branch = body.branch ?? body.sucursal_interes ?? "unknown";

  if (typeof firstName !== "string" || typeof phone !== "string") {
    return null;
  }

  const rawUtmSource = asOptionalString(nested?.utmSource ?? flat.utm_source);
  const firstTouchSource = asOptionalString(
    nested?.firstTouchSource ?? flat.first_touch_source,
  );

  const attribution: AttributionData = {
    fbclid: asOptionalString(nested?.fbclid ?? flat.fbclid),
    gclid: asOptionalString(nested?.gclid ?? flat.gclid),
    ttclid: asOptionalString(nested?.ttclid ?? flat.ttclid),
    // Use first_touch_source as fallback when utm_source is absent
    utmSource: rawUtmSource || firstTouchSource || null,
    utmMedium: asOptionalString(nested?.utmMedium ?? flat.utm_medium),
    utmCampaign: asOptionalString(nested?.utmCampaign ?? flat.utm_campaign),
    campaignId: asOptionalString(nested?.campaignId ?? flat.campaign_id),
    landingUrl: asOptionalString(nested?.landingUrl ?? flat.landing_page_url),
    firstTouchSource,
  };

  return {
    firstName,
    lastName: asOptionalString(body.lastName ?? body.last_name),
    phone,
    email: asOptionalString(body.email),
    branch: typeof branch === "string" ? branch : "unknown",
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
