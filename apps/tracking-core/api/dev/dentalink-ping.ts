import {
  methodNotAllowed,
  send,
  toHttpRequest,
  type VercelRequest,
  type VercelResponse,
} from "../_lib/http.js";
import { requireTrackingSecret, serverError } from "../../src/index.js";
import { getDentalinkConfig } from "../../src/modules/dentalink/config.js";

interface ProbeResult {
  label: string;
  url: string;
  ok: boolean;
  status: number;
  statusText: string;
  contentType: string | null;
}

const PROBE_PATHS = [
  { label: "base", path: "" },
  { label: "sucursales", path: "sucursales/" },
  { label: "pacientes", path: "pacientes/" },
  { label: "pagos", path: "pagos/" },
  { label: "pagos-no-slash", path: "pagos" },
  { label: "citas", path: "citas/" },
  { label: "tratamientos", path: "tratamientos/" },
  { label: "campos-adicionales", path: "campos_adicionales/" },
];

function buildUrl(baseUrl: string, path: string): string {
  return new URL(path, baseUrl).toString();
}

async function probeEndpoint(
  baseUrl: string,
  apiAuthScheme: string,
  apiToken: string,
  label: string,
  path: string,
): Promise<ProbeResult> {
  const url = buildUrl(baseUrl, path);
  const response = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: `${apiAuthScheme} ${apiToken}`,
    },
  });

  return {
    label,
    url,
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
    contentType: response.headers.get("content-type"),
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
    const config = getDentalinkConfig();

    if (config.mode !== "api") {
      send(response, {
        status: 200,
        body: {
          ok: true,
          mode: config.mode,
          message: "Dentalink is running in stub mode.",
        },
      });
      return;
    }

    if (!config.apiToken) {
      send(response, {
        status: 500,
        body: {
          ok: false,
          error: "Dentalink API token is not configured.",
        },
      });
      return;
    }

    const probes = await Promise.all(
      PROBE_PATHS.map((probe) =>
        probeEndpoint(
          config.baseUrl,
          config.apiAuthScheme,
          config.apiToken,
          probe.label,
          probe.path,
        ),
      ),
    );

    send(response, {
      status: 200,
      body: {
        ok: probes.some((probe) => probe.ok),
        mode: config.mode,
        baseUrl: config.baseUrl,
        authScheme: config.apiAuthScheme,
        tokenConfigured: true,
        probes,
      },
    });
  } catch (error) {
    send(
      response,
      serverError("failed to ping dentalink", {
        message: error instanceof Error ? error.message : "unknown error",
      }),
    );
  }
}
