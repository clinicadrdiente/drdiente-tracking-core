import { getAgentConfig, type SupabaseConfig } from "../../config";
import type {
  AppointmentIntakeInput,
  CanonicalLead,
  ClinicAccount,
  DailyBranchReport,
} from "../../types/domain";

export interface LeadCountByAccount {
  total: number;
  byAccount: Record<ClinicAccount, number>;
}

/**
 * Acceso a Supabase vía la API REST (PostgREST) con `fetch`, sin SDK.
 * Si faltan credenciales, `isConfigured()` es false y los callers degradan.
 */
export class SupabaseStore {
  constructor(private readonly config: SupabaseConfig = getAgentConfig().supabase) {}

  isConfigured(): boolean {
    return Boolean(this.config.url && this.config.serviceKey);
  }

  async upsertLead(lead: CanonicalLead): Promise<{ inserted: boolean }> {
    const rows = await this.insertIgnoreDuplicates("leads", "event_id", {
      event_id: lead.eventId,
      occurred_at: lead.occurredAt,
      received_at: lead.receivedAt,
      account: lead.account,
      elevator_id: lead.elevatorId,
      first_name: lead.firstName,
      last_name: lead.lastName,
      email: lead.emailNormalized,
      phone: lead.phoneNormalized,
      source: lead.source,
      location: lead.location,
      initial_message: lead.initialMessage,
      utm_source: lead.utmSource,
      utm_medium: lead.utmMedium,
      utm_campaign: lead.utmCampaign,
      fbclid: lead.fbclid,
      gclid: lead.gclid,
      ttclid: lead.ttclid,
      landing_url: lead.landingUrl,
      distributed_to: lead.distributedTo ?? [],
    });
    return { inserted: rows.length > 0 };
  }

  async upsertAppointment(
    appt: AppointmentIntakeInput,
  ): Promise<{ inserted: boolean }> {
    const rows = await this.insertIgnoreDuplicates("appointments", "event_id", {
      event_id: appt.eventId,
      occurred_at: appt.occurredAt,
      account: appt.account,
      appointment_id: appt.appointmentId,
      elevator_id: appt.elevatorId,
      patient_id: appt.patientId,
      branch: appt.branch,
      scheduled_at: appt.scheduledAt,
      source: appt.source,
    });
    return { inserted: rows.length > 0 };
  }

  async saveDailyReport(report: DailyBranchReport): Promise<void> {
    await this.rest(`daily_reports?on_conflict=report_id`, {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify([
        {
          report_id: report.reportId,
          branch: report.branch,
          date: report.date,
          account: report.account ?? null,
          submitted_at: report.submittedAt,
          payload: report,
        },
      ]),
    });
  }

  async listDailyReports(
    fromDate: string,
    toDate: string,
  ): Promise<DailyBranchReport[]> {
    const query =
      `daily_reports?select=payload` +
      `&date=gte.${encodeURIComponent(fromDate)}` +
      `&date=lte.${encodeURIComponent(toDate)}`;
    const rows = await this.rest<Array<{ payload: DailyBranchReport }>>(query, {
      method: "GET",
    });
    return rows.map((row) => row.payload).filter(Boolean);
  }

  async countLeads(fromIso: string, toIso: string): Promise<LeadCountByAccount> {
    const rows = await this.selectInRange<{ account: ClinicAccount | null }>(
      "leads",
      "account",
      "occurred_at",
      fromIso,
      toIso,
    );
    const byAccount: Record<ClinicAccount, number> = { roma: 0, general: 0 };
    for (const row of rows) {
      if (row.account === "roma" || row.account === "general") {
        byAccount[row.account] += 1;
      }
    }
    return { total: rows.length, byAccount };
  }

  async countAppointments(fromIso: string, toIso: string): Promise<number> {
    const rows = await this.selectInRange<{ event_id: string }>(
      "appointments",
      "event_id",
      "occurred_at",
      fromIso,
      toIso,
    );
    return rows.length;
  }

  /** Marca un envío de reporte como hecho. true = primer claim (debe enviar). */
  async claimReportSend(key: string): Promise<boolean> {
    const rows = await this.insertIgnoreDuplicates("report_sends", "send_key", {
      send_key: key,
      sent_at: new Date().toISOString(),
    });
    return rows.length > 0;
  }

  private async selectInRange<T>(
    table: string,
    select: string,
    column: string,
    fromIso: string,
    toIso: string,
  ): Promise<T[]> {
    const query =
      `${table}?select=${select}` +
      `&${column}=gte.${encodeURIComponent(fromIso)}` +
      `&${column}=lt.${encodeURIComponent(toIso)}`;
    return this.rest<T[]>(query, { method: "GET" });
  }

  private async insertIgnoreDuplicates(
    table: string,
    onConflict: string,
    row: Record<string, unknown>,
  ): Promise<unknown[]> {
    return this.rest<unknown[]>(`${table}?on_conflict=${onConflict}`, {
      method: "POST",
      headers: { Prefer: "resolution=ignore-duplicates,return=representation" },
      body: JSON.stringify([row]),
    });
  }

  private async rest<T = unknown>(path: string, init: RequestInit): Promise<T> {
    if (!this.isConfigured()) {
      throw new Error("supabase is not configured");
    }
    const url = `${this.config.url!.replace(/\/$/, "")}/rest/v1/${path}`;
    const response = await fetch(url, {
      ...init,
      headers: {
        apikey: this.config.serviceKey!,
        Authorization: `Bearer ${this.config.serviceKey!}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(init.headers ?? {}),
      },
    });

    const text = await response.text();
    if (!response.ok) {
      throw new Error(`supabase ${response.status}: ${text.slice(0, 300)}`);
    }
    return (text ? JSON.parse(text) : []) as T;
  }
}

export function createSupabaseStore(): SupabaseStore {
  return new SupabaseStore();
}
