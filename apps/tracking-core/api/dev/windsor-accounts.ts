import {
  methodNotAllowed,
  send,
  toHttpRequest,
  type VercelRequest,
  type VercelResponse,
} from "../_lib/http.js";
import { requireTrackingSecret } from "../../src/http/auth.js";
import {
  createWindsorClient,
  WindsorRequestError,
} from "../../src/modules/windsor/client.js";

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

  const client = createWindsorClient();
  const datePreset = readQueryString(request.query?.datePreset);

  if (!client.isConfigured()) {
    send(response, {
      status: 200,
      body: {
        ok: true,
        configured: false,
        message: "WINDSOR_API_KEY is not configured.",
      },
    });
    return;
  }

  try {
    const summary = await client.getAccountSummaries(datePreset ?? undefined);
    send(response, {
      status: 200,
      body: {
        ok: true,
        configured: true,
        ...summary,
      },
    });
  } catch (error) {
    send(response, {
      status: error instanceof WindsorRequestError ? error.status : 500,
      body: {
        ok: false,
        configured: true,
        error: "failed to detect Windsor accounts",
        details: {
          message: error instanceof Error ? error.message : "unknown error",
        },
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
