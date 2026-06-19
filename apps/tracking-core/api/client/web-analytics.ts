import {
  methodNotAllowed,
  send,
  toHttpRequest,
  type VercelRequest,
  type VercelResponse,
} from "../_lib/http.js";
import { serverError } from "../../src/index.js";
import {
  fetchWebAnalytics,
  readGa4Config,
  type WebAnalytics,
} from "../../src/modules/analytics/ga4.js";

// Analítica web del sitio (Google Analytics 4) para el dashboard del cliente.
// Acceso abierto por URL (sin PII a nivel persona). Cachea ~10 min para no
// agotar la cuota del Data API. Si GA4 no está configurado, responde
// analytics:null y la UI muestra un estado claro.
const CACHE_TTL_MS = 10 * 60 * 1000;
let cache: { key: string; data: WebAnalytics; expMs: number } | undefined;

export default async function handler(
  request: VercelRequest,
  response: VercelResponse,
): Promise<void> {
  if (request.method !== "GET") {
    methodNotAllowed(response);
    return;
  }

  const config = readGa4Config();
  if (!config) {
    send(response, { status: 200, body: { ok: true, analytics: null, reason: "not_configured" } });
    return;
  }

  const req = toHttpRequest(request);
  const rangeDays = clampDays(Number(req.query?.days));
  const key = `${config.propertyId}:${rangeDays}`;

  if (cache && cache.key === key && cache.expMs > Date.now()) {
    send(response, { status: 200, body: { ok: true, analytics: cache.data, rangeDays } });
    return;
  }

  try {
    const data = await fetchWebAnalytics(config, rangeDays);
    cache = { key, data, expMs: Date.now() + CACHE_TTL_MS };
    send(response, { status: 200, body: { ok: true, analytics: data, rangeDays } });
  } catch (error) {
    // No reventamos la UI: devolvemos null + motivo.
    send(response, {
      status: 200,
      body: {
        ok: true,
        analytics: null,
        reason: "error",
        message: error instanceof Error ? error.message : "unknown error",
      },
    });
  }
}

function clampDays(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 28;
  return Math.min(365, Math.round(value));
}
