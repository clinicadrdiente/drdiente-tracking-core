import {
  methodNotAllowed,
  send,
  toHttpRequest,
  type VercelRequest,
  type VercelResponse,
} from "../_lib/http.js";
import { requireTrackingSecret } from "../../src/http/auth.js";
import { trackingHttpHandlers } from "../../src/index.js";
import { trailingRange, type RangeDays } from "../../src/lib/date-ranges.js";
import {
  createWindsorClient,
  type WindsorSourceSummary,
} from "../../src/modules/windsor/client.js";
import { aggregateEfforts } from "../../src/modules/reports/aggregate-efforts.js";

/** Maps rangeDays to the Windsor date_preset string. Windsor does not have a 180-day preset;
 *  we use "last_90d" as the closest available option and document it in the response. */
function rangeDaysToPreset(days: RangeDays): { preset: string; note?: string } {
  if (days === 7) return { preset: "last_7d" };
  if (days === 30) return { preset: "last_30d" };
  // 180 days: Windsor has no matching preset — use last_90d and flag it
  return {
    preset: "last_90d",
    note: "Windsor no tiene preset de 180 días — se usó last_90d (90 días)",
  };
}

export default async function handler(
  request: VercelRequest,
  response: VercelResponse,
): Promise<void> {
  if (request.method !== "GET") {
    methodNotAllowed(response);
    return;
  }

  const authError = requireTrackingSecret(toHttpRequest(request));
  if (authError) {
    send(response, authError);
    return;
  }

  const rangeDays = readRangeDays(request.query?.rangeDays) ?? 30;
  const range = trailingRange(rangeDays, new Date());

  // Derive date-only strings for the state store query
  const fromDate = range.fromIso.slice(0, 10);
  const toDate = range.toIso.slice(0, 10);

  // Fetch Windsor (optional — degrade gracefully on error or missing config)
  let windsorData: {
    bySource: WindsorSourceSummary[];
    totals: {
      spend: number;
      impressions: number;
      reach: number;
      clicks: number;
    };
  } | null = null;
  let windsorError: string | undefined;
  let windsorPresetNote: string | undefined;

  const windsorClient = createWindsorClient();
  if (windsorClient.isConfigured()) {
    const { preset, note } = rangeDaysToPreset(rangeDays);
    windsorPresetNote = note;
    try {
      const summary = await windsorClient.getMarketingSummary(preset);
      windsorData = {
        bySource: summary.bySource,
        totals: summary.totals,
      };
    } catch (err) {
      windsorError =
        err instanceof Error ? err.message : "Windsor request failed";
    }
  }

  // Fetch daily reports from state store
  let dailyReports: Awaited<
    ReturnType<typeof trackingHttpHandlers.stateStore.listDailyReports>
  >;
  try {
    dailyReports = await trackingHttpHandlers.stateStore.listDailyReports(
      fromDate,
      toDate,
    );
  } catch (err) {
    send(response, {
      status: 500,
      body: {
        ok: false,
        error: "failed to list daily reports",
        details: {
          message: err instanceof Error ? err.message : "unknown error",
        },
      },
    });
    return;
  }

  const efforts = aggregateEfforts(windsorData, dailyReports, range);

  send(response, {
    status: 200,
    body: {
      ok: true,
      ...efforts,
      ...(windsorError !== undefined ? { windsorError } : {}),
      ...(windsorPresetNote !== undefined ? { windsorPresetNote } : {}),
    },
  });
}

function readRangeDays(value: string | string[] | undefined): RangeDays | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== "string") return null;
  const n = parseInt(raw, 10);
  if (n === 7 || n === 30 || n === 180) return n;
  return null;
}
