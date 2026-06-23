import { requireTrackingSecret } from "../../src/http/auth.js";
import { validateDailyReport } from "../../src/modules/reports/validate-daily.js";
import { SupabaseStore } from "../../src/modules/supabase/client.js";
import type { DailyBranchReport } from "../../src/types/domain.js";
import {
  methodNotAllowed,
  parseBody,
  readQueryString,
  send,
  type VercelRequest,
  type VercelResponse,
} from "../_lib/http.js";

export default async function handler(
  request: VercelRequest,
  response: VercelResponse,
): Promise<void> {
  if (request.method === "POST") {
    await handlePost(request, response);
    return;
  }
  if (request.method === "GET") {
    await handleGet(request, response);
    return;
  }
  methodNotAllowed(response);
}

async function handlePost(
  request: VercelRequest,
  response: VercelResponse,
): Promise<void> {
  const authError = requireTrackingSecret({ headers: request.headers });
  if (authError) {
    send(response, authError);
    return;
  }

  const validation = validateDailyReport(parseBody(request.body));
  if (!validation.ok) {
    send(response, { status: 400, body: { ok: false, error: validation.error } });
    return;
  }

  const report: DailyBranchReport = {
    ...validation.input,
    reportId: `${validation.input.branch}_${validation.input.date}`,
    submittedAt: new Date().toISOString(),
  };

  const supabase = new SupabaseStore();
  if (!supabase.isConfigured()) {
    send(response, {
      status: 200,
      body: { ok: true, persisted: false, reason: "supabase not configured", report },
    });
    return;
  }

  try {
    await supabase.saveDailyReport(report);
    send(response, { status: 201, body: { ok: true, persisted: true, report } });
  } catch (error) {
    send(response, {
      status: 500,
      body: {
        ok: false,
        error: "failed to save daily report",
        details: { message: error instanceof Error ? error.message : "unknown error" },
      },
    });
  }
}

async function handleGet(
  request: VercelRequest,
  response: VercelResponse,
): Promise<void> {
  const authError = requireTrackingSecret({ headers: request.headers });
  if (authError) {
    send(response, authError);
    return;
  }

  const today = new Date().toISOString().slice(0, 10);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  const from = readQueryString(request.query?.from) ?? thirtyDaysAgo;
  const to = readQueryString(request.query?.to) ?? today;

  const supabase = new SupabaseStore();
  if (!supabase.isConfigured()) {
    send(response, {
      status: 200,
      body: { ok: true, reports: [], reason: "supabase not configured" },
    });
    return;
  }

  try {
    const reports = await supabase.listDailyReports(from, to);
    send(response, { status: 200, body: { ok: true, reports } });
  } catch (error) {
    send(response, {
      status: 500,
      body: {
        ok: false,
        error: "failed to list daily reports",
        details: { message: error instanceof Error ? error.message : "unknown error" },
      },
    });
  }
}
