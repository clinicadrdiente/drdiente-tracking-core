import { isAuthorizedCron } from "../../src/http/auth.js";
import { getAgentConfig } from "../../src/config.js";
import { clinicDayRange } from "../../src/lib/dates.js";
import { gatherDailyData } from "../../src/modules/reports/gather.js";
import { buildDailySummary } from "../../src/modules/reports/daily-summary.js";
import { SupabaseStore } from "../../src/modules/supabase/client.js";
import { ElevatorWhatsapp } from "../../src/modules/whatsapp/elevator-client.js";
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
  const message = buildDailySummary({
    dateLabel: range.label,
    currency: config.reportCurrency,
    leads: data.leads,
    appointments: data.appointments,
    marketing: data.marketing,
  });

  // Idempotencia: no reenviar el mismo día si Supabase puede registrar el envío.
  const supabase = new SupabaseStore();
  if (supabase.isConfigured()) {
    try {
      const first = await supabase.claimReportSend(`daily_${range.date}`);
      if (!first) {
        response.status(200).json({ ok: true, sent: false, reason: "already sent", date: range.date });
        return;
      }
    } catch {
      // Si el guard falla, preferimos enviar a perder el reporte.
    }
  }

  const delivery = await new ElevatorWhatsapp().sendToOwners(message);
  response.status(200).json({
    ok: true,
    sent: !delivery.skipped,
    delivery,
    date: range.date,
    notes: data.notes,
    message,
  });
}
