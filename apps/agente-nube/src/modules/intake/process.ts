import { normalizeEmail, normalizePhone } from "../../lib/normalize.js";
import type { CanonicalLead, LeadHandoffInput } from "../../types/domain.js";
import { SheetsMirror } from "../sheets/client.js";
import { SupabaseStore } from "../supabase/client.js";

export type IntegrationStatus = "ok" | "skipped" | "error";

export interface LeadPersistence {
  isConfigured(): boolean;
  upsertLead(lead: CanonicalLead): Promise<{ inserted: boolean }>;
}

export interface LeadMirror {
  isConfigured(): boolean;
  appendLead(lead: CanonicalLead): Promise<void>;
}

export interface IntakeDeps {
  supabase?: LeadPersistence;
  sheets?: LeadMirror;
  now?: () => string;
}

export interface IntakeResult {
  eventId: string;
  deduped: boolean;
  supabase: IntegrationStatus;
  sheets: IntegrationStatus;
}

export function toCanonicalLead(
  input: LeadHandoffInput,
  receivedAtIso: string,
): CanonicalLead {
  return {
    ...input,
    phoneNormalized: input.phone ? normalizePhone(input.phone) : null,
    emailNormalized: normalizeEmail(input.email),
    receivedAt: receivedAtIso,
  };
}

/**
 * Persiste un lead recibido del workflow de salida: Supabase (idempotente) y,
 * si no es duplicado, Google Sheets. Cada destino degrada por separado: un fallo
 * de Sheets no rompe Supabase ni la respuesta 200.
 */
export async function processLeadHandoff(
  input: LeadHandoffInput,
  deps: IntakeDeps = {},
): Promise<IntakeResult> {
  const supabase = deps.supabase ?? new SupabaseStore();
  const sheets = deps.sheets ?? new SheetsMirror();
  const now = deps.now ?? (() => new Date().toISOString());

  const lead = toCanonicalLead(input, now());

  let deduped = false;
  let supabaseStatus: IntegrationStatus = "skipped";
  if (supabase.isConfigured()) {
    try {
      const result = await supabase.upsertLead(lead);
      deduped = !result.inserted;
      supabaseStatus = "ok";
    } catch {
      supabaseStatus = "error";
    }
  }

  let sheetsStatus: IntegrationStatus = "skipped";
  // Solo reflejamos en Sheets cuando es un alta nueva (evita filas duplicadas).
  if (sheets.isConfigured() && !deduped) {
    try {
      await sheets.appendLead(lead);
      sheetsStatus = "ok";
    } catch {
      sheetsStatus = "error";
    }
  }

  return { eventId: lead.eventId, deduped, supabase: supabaseStatus, sheets: sheetsStatus };
}
