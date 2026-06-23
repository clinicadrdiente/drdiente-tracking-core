import type { ClinicDayRange } from "../../lib/dates.js";
import { SupabaseStore } from "../supabase/client.js";
import { WindsorClient, type WindsorSummary } from "../windsor/client.js";
import type { ClinicAccount } from "../../types/domain.js";

export interface DailyData {
  leads: { total: number; byAccount: Record<ClinicAccount, number> } | null;
  appointments: number | null;
  marketing: WindsorSummary | null;
  notes: string[];
}

export interface GatherDeps {
  supabase?: SupabaseStore;
  windsor?: WindsorClient;
}

/**
 * Reúne los datos del día con degradación: cada fuente que falte o falle queda
 * en null y deja una nota, en vez de romper el reporte.
 */
export async function gatherDailyData(
  range: ClinicDayRange,
  deps: GatherDeps = {},
): Promise<DailyData> {
  const supabase = deps.supabase ?? new SupabaseStore();
  const windsor = deps.windsor ?? new WindsorClient();
  const notes: string[] = [];

  let leads: DailyData["leads"] = null;
  let appointments: number | null = null;
  if (supabase.isConfigured()) {
    try {
      leads = await supabase.countLeads(range.fromIso, range.toIso);
    } catch (error) {
      notes.push(`leads: ${message(error)}`);
    }
    try {
      appointments = await supabase.countAppointments(range.fromIso, range.toIso);
    } catch (error) {
      notes.push(`appointments: ${message(error)}`);
    }
  } else {
    notes.push("supabase no configurado");
  }

  let marketing: WindsorSummary | null = null;
  if (windsor.isConfigured()) {
    try {
      marketing = await windsor.getDailySummary(range.date);
    } catch (error) {
      notes.push(`windsor: ${message(error)}`);
    }
  } else {
    notes.push("windsor no configurado");
  }

  return { leads, appointments, marketing, notes };
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : "error desconocido";
}
