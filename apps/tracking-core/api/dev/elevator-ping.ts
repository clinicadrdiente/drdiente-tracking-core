import {
  methodNotAllowed,
  send,
  toHttpRequest,
  type VercelRequest,
  type VercelResponse,
} from "../_lib/http.js";
import { requireTrackingSecret, serverError } from "../../src/index.js";
import { getElevatorConfig } from "../../src/modules/elevator/config.js";
import { buildSearchPayload } from "../../src/modules/elevator/payloads.js";

interface ProbeResult {
  label: string;
  path: string;
  ok: boolean;
  status: number;
  statusText: string;
  contentType: string | null;
  responseShape: string[];
}

async function probeSearch(): Promise<ProbeResult> {
  const config = getElevatorConfig();
  const payload = buildSearchPayload(config, "+52 00 0000 0000", null);
  const response = await fetch(new URL(config.searchPath, config.baseUrl), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
      Version: config.apiVersion,
    },
    body: JSON.stringify(payload),
  });

  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  return {
    label: "contacts-search",
    path: config.searchPath,
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
    contentType: response.headers.get("content-type"),
    responseShape:
      typeof body === "object" && body !== null ? Object.keys(body) : [],
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

  try {
    const config = getElevatorConfig();

    if (config.mode !== "api") {
      send(response, {
        status: 200,
        body: {
          ok: true,
          mode: config.mode,
          message: "Elevator is running in stub mode.",
        },
      });
      return;
    }

    if (!config.apiKey || !config.locationId) {
      send(response, {
        status: 500,
        body: {
          ok: false,
          error: "Elevator API key or location id is not configured.",
          tokenConfigured: Boolean(config.apiKey),
          locationConfigured: Boolean(config.locationId),
        },
      });
      return;
    }

    const probe = await probeSearch();

    send(response, {
      status: 200,
      body: {
        ok: probe.ok,
        mode: config.mode,
        baseUrl: config.baseUrl,
        apiVersion: config.apiVersion,
        tokenConfigured: true,
        locationConfigured: true,
        probes: [probe],
      },
    });
  } catch (error) {
    send(
      response,
      serverError("failed to ping elevator", {
        message: error instanceof Error ? error.message : "unknown error",
      }),
    );
  }
}
