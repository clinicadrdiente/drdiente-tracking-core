import {
  methodNotAllowed,
  send,
  toHttpRequest,
  type VercelRequest,
  type VercelResponse,
} from "../_lib/http.js";
import { requireTrackingSecret } from "../../src/http/auth.js";
import { createWindsorClient, WindsorRequestError } from "../../src/modules/windsor/client.js";
import { getWindsorConfig } from "../../src/modules/windsor/config.js";

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

  const config = getWindsorConfig();
  const client = createWindsorClient();

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
    const connectors = await client.listConnectors();
    send(response, {
      status: 200,
      body: {
        ok: true,
        configured: true,
        baseUrl: config.baseUrl,
        defaultConnector: config.defaultConnector,
        defaultDatePreset: config.defaultDatePreset,
        defaultFields: config.defaultFields,
        connectorsPreview: preview(connectors),
      },
    });
  } catch (error) {
    send(response, {
      status: error instanceof WindsorRequestError ? error.status : 500,
      body: {
        ok: false,
        configured: true,
        error: "failed to ping Windsor",
        details: {
          message: error instanceof Error ? error.message : "unknown error",
        },
      },
    });
  }
}

function preview(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.slice(0, 20);
  }

  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(Object.entries(value).slice(0, 20));
  }

  return value;
}
