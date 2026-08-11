import {
  methodNotAllowed,
  send,
  toHttpRequest,
  type VercelRequest,
  type VercelResponse,
} from "../_lib/http.js";
import { requireTrackingSecret } from "../../src/http/auth.js";
import {
  createGoogleAdsClient,
  GoogleAdsRequestError,
  GoogleAdsValidationError,
} from "../../src/modules/google-ads/client.js";

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

  const client = createGoogleAdsClient();
  if (!client.isConfigured()) {
    send(response, {
      status: 200,
      body: {
        ok: true,
        configured: false,
        message: "Google Ads server-side credentials are not configured.",
      },
    });
    return;
  }

  const defaults = defaultRange();
  const from = readQueryString(request.query?.from) ?? defaults.from;
  const to = readQueryString(request.query?.to) ?? defaults.to;
  try {
    const summary = await client.getSummary({ from, to });
    send(response, {
      status: 200,
      body: { ok: true, configured: true, ...summary },
    });
  } catch (error) {
    send(response, {
      status:
        error instanceof GoogleAdsValidationError
          ? 400
          : error instanceof GoogleAdsRequestError
            ? error.status
            : 500,
      body: {
        ok: false,
        configured: true,
        error: "failed to read Google Ads summary",
        details: {
          message: error instanceof Error ? error.message : "unknown error",
        },
      },
    });
  }
}

function defaultRange(): { from: string; to: string } {
  const to = new Date();
  const from = new Date(to);
  from.setUTCDate(from.getUTCDate() - 29);
  return { from: isoDate(from), to: isoDate(to) };
}

function isoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function readQueryString(value: string | string[] | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  return typeof raw === "string" && raw.trim() ? raw.trim() : null;
}
