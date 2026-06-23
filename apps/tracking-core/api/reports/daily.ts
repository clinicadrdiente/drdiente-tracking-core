import {
  methodNotAllowed,
  send,
  toHttpRequest,
  type VercelRequest,
  type VercelResponse,
} from "../_lib/http.js";
import { requireTrackingSecret } from "../../src/http/auth.js";
import { trackingHttpHandlers } from "../../src/index.js";
import { validateDailyReportInput } from "../../src/modules/reports/validate.js";

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

async function handlePost(request: VercelRequest, response: VercelResponse): Promise<void> {
  // Sin auth: recepción envía el cierre diario sin PIN. El GET (lectura del
  // dashboard) sigue protegido con TRACKING_API_SECRET.
  const validation = validateDailyReportInput(request.body);
  if (!validation.ok) {
    send(response, { status: 400, body: { error: validation.error } });
    return;
  }

  const { input } = validation;
  const reportId = `${input.branch}_${input.date}`;
  const submittedAt = new Date().toISOString();

  const report = { ...input, reportId, submittedAt };

  try {
    await trackingHttpHandlers.stateStore.saveDailyReport(report);
    send(response, { status: 201, body: { ok: true, report } });
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

async function handleGet(request: VercelRequest, response: VercelResponse): Promise<void> {
  const authError = requireTrackingSecret(toHttpRequest(request));
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

  try {
    const reports = await trackingHttpHandlers.stateStore.listDailyReports(from, to);
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

function readQueryString(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}
