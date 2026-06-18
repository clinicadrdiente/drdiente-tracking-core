import type {
  DailyBranchReport,
  LeadContactChannel,
} from "../../types/domain.js";

const ALLOWED_CHANNELS: ReadonlySet<string> = new Set<LeadContactChannel>([
  "llamada",
  "whatsapp",
  "google_maps",
  "email",
  "visita_directa",
  "otro",
]);

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export type DailyReportInput = Omit<
  DailyBranchReport,
  "reportId" | "submittedAt"
>;

export interface ValidationResult {
  ok: true;
  input: DailyReportInput;
}

export interface ValidationError {
  ok: false;
  error: string;
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
    if (
      typeof c.count !== "number" ||
      !Number.isInteger(c.count) ||
      c.count < 0
    ) {
      return {
        ok: false,
        error: "each contact count must be a non-negative integer",
      };
    }
  }

  if (
    b.notes !== undefined &&
    b.notes !== null &&
    typeof b.notes !== "string"
  ) {
    return { ok: false, error: "notes must be a string or null" };
  }

  return {
    ok: true,
    input: {
      branch: b.branch.trim(),
      date: b.date,
      contacts: (b.contacts as Array<{ channel: string; count: number }>).map(
        (c) => ({
          channel: c.channel as LeadContactChannel,
          count: c.count,
        }),
      ),
      leadsReceived: b.leadsReceived as number,
      leadsContacted: b.leadsContacted as number,
      followUpsSent: b.followUpsSent as number,
      promoWhatsappSent: b.promoWhatsappSent as number,
      emailsSent: b.emailsSent as number,
      postsPublished: b.postsPublished as number,
      notes: typeof b.notes === "string" ? b.notes : null,
    },
  };
}
