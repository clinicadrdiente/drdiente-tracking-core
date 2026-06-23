import { isAuthorizedCron } from "../../src/http/auth.js";
import { getAgentConfig } from "../../src/config.js";
import { clinicDayRange } from "../../src/lib/dates.js";
import { gatherDailyData } from "../../src/modules/reports/gather.js";
import { aggregateReception, buildTotalSummary } from "../../src/modules/reports/total-summary.js";
import { SupabaseStore } from "../../src/modules/supabase/client.js";
import { ElevatorWhatsapp } from "../../src/modules/whatsapp/elevator-client.js";
import type { DailyBranchReport } from "../../src/types/domain.js";
import { methodNotAllowed, type VercelRequest, type VercelResponse } from "../_lib/http.js";

export default async function handler(
  request: VercelRequest,
  response: VercelResponse,
): Promise<void> {
  if (request.method !== "GET" && request.method !== "POST") {
    methodNotAllowed(response);
    return;
  }

  if (!isAuthorizedCron({ headers: request.headers })) {
    response.status(401).json({ error: "unauthorized cron request" });
    return;
  }

  const config = getAgentConfig();
  const range = clinicDayRange(Date.now(), config.clinicUtcOffsetHours);
  const data = await gatherDailyData(range);

  const supabase = new SupabaseStore();
  let reports: DailyBranchReport[] = [];
  if (supabase.isConfigured()) {
    try {
      reports = await supabase.listDailyReports(range.date, range.date);
    } catch (error) {
      data.notes.push(`reportes SAC: ${error instanceof Error ? error.message : "error"}`);
    }
  }

  const message = buildTotalSummary(
    {
      dateLabel: range.label,
      currency: config.reportCurrency,
      leads: data.leads,
      appointments: data.appointments,
      marketing: data.marketing,
    },
    aggregateReception(reports),
  );

  if (supabase.isConfigured()) {
    try {
      const first = await supabase.claimReportSend(`eod_${range.date}`);
      if (!first) {
        response.status(200).json({ ok: true, sent: false, reason: "already sent", date: range.date });
        return;
      }
    } catch {
      // continuar y enviar
    }
  }

  const delivery = await new ElevatorWhatsapp().sendToOwners(message);
  response.status(200).json({
    ok: true,
    sent: !delivery.skipped,
    delivery,
    date: range.date,
    reportsCount: reports.length,
    notes: data.notes,
    message,
  });
}
