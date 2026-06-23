import type {
  DailyBranchReport,
  DailyLeadDetail,
  LeadContactChannel,
  LeadInterestTreatment,
  LeadLostReason,
  LeadOriginChannel,
  LeadQuestionTopic,
  LeadStatus,
} from "../../types/domain.js";

const ALLOWED_CHANNELS: ReadonlySet<string> = new Set<LeadContactChannel>([
  "llamada",
  "whatsapp",
  "google_maps",
  "email",
  "visita_directa",
  "otro",
]);

const ALLOWED_ORIGINS: ReadonlySet<string> = new Set<LeadOriginChannel>([
  "meta_ads",
  "facebook_organico",
  "instagram_organico",
  "google",
  "google_maps",
  "whatsapp_directo",
  "referido",
  "walk_in",
  "tiktok",
  "otro",
]);

const ALLOWED_INTERESTS: ReadonlySet<string> = new Set<LeadInterestTreatment>([
  "limpieza",
  "blanqueamiento",
  "ortodoncia",
  "implantes",
  "endodoncia",
  "estetica",
  "urgencia",
  "protesis",
  "otro",
]);

const ALLOWED_QUESTIONS: ReadonlySet<string> = new Set<LeadQuestionTopic>([
  "precio",
  "disponibilidad",
  "ubicacion",
  "financiamiento",
  "duracion",
  "garantia",
  "dolor_miedo",
  "solo_info",
  "otro",
]);

const ALLOWED_STATUSES: ReadonlySet<string> = new Set<LeadStatus>([
  "solo_consulto",
  "agendo",
  "asistio",
  "convirtio",
  "no_contesto",
  "perdido",
]);

const ALLOWED_LOST_REASONS: ReadonlySet<string> = new Set<LeadLostReason>([
  "precio",
  "no_respondio",
  "eligio_otra_clinica",
  "solo_curioseaba",
  "sin_horario",
  "otro",
]);

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export type DailyReportInput = Omit<DailyBranchReport, "reportId" | "submittedAt">;

export interface ValidationResult {
  ok: true;
  input: DailyReportInput;
}

export interface ValidationError {
  ok: false;
  error: string;
}

/** Optional non-negative number. Returns null when absent; an error string when present-but-invalid. */
function readOptionalNonNegativeNumber(
  value: unknown,
  field: string,
): { value: number | null } | { error: string } {
  if (value === undefined || value === null || value === "") {
    return { value: null };
  }
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return { error: `${field} must be a non-negative number` };
  }
  return { value };
}

function readOptionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function validateLead(item: unknown, index: number): DailyLeadDetail | { error: string } {
  if (typeof item !== "object" || item === null) {
    return { error: `leads[${index}] must be an object` };
  }
  const l = item as Record<string, unknown>;

  const name = readOptionalString(l.name);
  if (!name) {
    return { error: `leads[${index}].name must be a non-empty string` };
  }
  if (!ALLOWED_ORIGINS.has(l.origin as string)) {
    return { error: `leads[${index}].origin "${String(l.origin)}" is not allowed` };
  }
  if (!ALLOWED_INTERESTS.has(l.interest as string)) {
    return { error: `leads[${index}].interest "${String(l.interest)}" is not allowed` };
  }
  if (!ALLOWED_QUESTIONS.has(l.question as string)) {
    return { error: `leads[${index}].question "${String(l.question)}" is not allowed` };
  }
  if (!ALLOWED_STATUSES.has(l.status as string)) {
    return { error: `leads[${index}].status "${String(l.status)}" is not allowed` };
  }
  if (
    l.lostReason !== undefined &&
    l.lostReason !== null &&
    l.lostReason !== "" &&
    !ALLOWED_LOST_REASONS.has(l.lostReason as string)
  ) {
    return { error: `leads[${index}].lostReason "${String(l.lostReason)}" is not allowed` };
  }
  if (l.appointmentDate !== undefined && l.appointmentDate !== null && l.appointmentDate !== "") {
    if (typeof l.appointmentDate !== "string" || !DATE_RE.test(l.appointmentDate)) {
      return { error: `leads[${index}].appointmentDate must be YYYY-MM-DD` };
    }
  }
  const quoted = readOptionalNonNegativeNumber(l.quotedValue, `leads[${index}].quotedValue`);
  if ("error" in quoted) {
    return { error: quoted.error };
  }

  return {
    name,
    contact: readOptionalString(l.contact),
    origin: l.origin as LeadOriginChannel,
    campaign: readOptionalString(l.campaign),
    interest: l.interest as LeadInterestTreatment,
    question: l.question as LeadQuestionTopic,
    status: l.status as LeadStatus,
    appointmentDate:
      typeof l.appointmentDate === "string" && l.appointmentDate !== ""
        ? l.appointmentDate
        : null,
    lostReason:
      typeof l.lostReason === "string" && l.lostReason !== ""
        ? (l.lostReason as LeadLostReason)
        : null,
    quotedValue: quoted.value,
    note: readOptionalString(l.note),
  };
}

export function validateDailyReportInput(
  body: unknown,
): ValidationResult | ValidationError {
  if (typeof body !== "object" || body === null) {
    return { ok: false, error: "request body must be a JSON object" };
  }

  const b = body as Record<string, unknown>;

  if (typeof b.branch !== "string" || b.branch.trim() === "") {
    return { ok: false, error: "branch must be a non-empty string" };
  }

  if (typeof b.date !== "string" || !DATE_RE.test(b.date)) {
    return { ok: false, error: "date must be a string in YYYY-MM-DD format" };
  }

  const counters = [
    "leadsReceived",
    "leadsContacted",
    "followUpsSent",
    "promoWhatsappSent",
    "emailsSent",
    "postsPublished",
  ] as const;

  for (const field of counters) {
    const v = b[field];
    if (typeof v !== "number" || !Number.isInteger(v) || v < 0) {
      return { ok: false, error: `${field} must be a non-negative integer` };
    }
  }

  if (!Array.isArray(b.contacts)) {
    return { ok: false, error: "contacts must be an array" };
  }

  for (const item of b.contacts as unknown[]) {
    if (typeof item !== "object" || item === null) {
      return { ok: false, error: "each contact entry must be an object" };
    }
    const c = item as Record<string, unknown>;
    if (!ALLOWED_CHANNELS.has(c.channel as string)) {
      return {
        ok: false,
        error: `unknown channel "${String(c.channel)}"; allowed: ${[...ALLOWED_CHANNELS].join(", ")}`,
      };
    }
    if (typeof c.count !== "number" || !Number.isInteger(c.count) || c.count < 0) {
      return { ok: false, error: "each contact count must be a non-negative integer" };
    }
  }

  if (b.notes !== undefined && b.notes !== null && typeof b.notes !== "string") {
    return { ok: false, error: "notes must be a string or null" };
  }

  // --- Bloque A: agregados opcionales del embudo del día.
  const optionalAggregates = [
    "appointmentsCreated",
    "appointmentsAttended",
    "noShows",
    "conversions",
    "revenueTotal",
    "adSpend",
  ] as const;
  const aggregates: Record<string, number | null> = {};
  for (const field of optionalAggregates) {
    const parsed = readOptionalNonNegativeNumber(b[field], field);
    if ("error" in parsed) {
      return { ok: false, error: parsed.error };
    }
    aggregates[field] = parsed.value;
  }

  // --- Bloque B: detalle por lead (opcional).
  let leads: DailyLeadDetail[] = [];
  if (b.leads !== undefined && b.leads !== null) {
    if (!Array.isArray(b.leads)) {
      return { ok: false, error: "leads must be an array" };
    }
    const collected: DailyLeadDetail[] = [];
    for (let i = 0; i < b.leads.length; i++) {
      const result = validateLead(b.leads[i], i);
      if ("error" in result) {
        return { ok: false, error: result.error };
      }
      collected.push(result);
    }
    leads = collected;
  }

  return {
    ok: true,
    input: {
      branch: b.branch.trim(),
      date: b.date,
      recepcionist: readOptionalString(b.recepcionist),
      contacts: (b.contacts as Array<{ channel: string; count: number }>).map((c) => ({
        channel: c.channel as LeadContactChannel,
        count: c.count,
      })),
      leadsReceived: b.leadsReceived as number,
      leadsContacted: b.leadsContacted as number,
      followUpsSent: b.followUpsSent as number,
      promoWhatsappSent: b.promoWhatsappSent as number,
      emailsSent: b.emailsSent as number,
      postsPublished: b.postsPublished as number,
      appointmentsCreated: aggregates.appointmentsCreated,
      appointmentsAttended: aggregates.appointmentsAttended,
      noShows: aggregates.noShows,
      conversions: aggregates.conversions,
      revenueTotal: aggregates.revenueTotal,
      adSpend: aggregates.adSpend,
      leads,
      notes: typeof b.notes === "string" ? b.notes : null,
    },
  };
}
