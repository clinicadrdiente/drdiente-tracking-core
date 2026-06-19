import {
  methodNotAllowed,
  send,
  toHttpRequest,
  type VercelRequest,
  type VercelResponse,
} from "../_lib/http.js";
import {
  fetchWebAnalytics,
  readGa4Config,
  type WebAnalytics,
} from "../../src/modules/analytics/ga4.js";
import {
  buildSearchTrafficSummary,
  toWindsorPreset,
  type SearchTrafficSummary,
} from "../../src/modules/analytics/search-traffic.js";
import { createWindsorClient } from "../../src/modules/windsor/client.js";

// Analítica web para el dashboard del cliente. Prioridad de fuente:
//   1. Google Analytics 4 (Data API) — completo (visitas/países/dispositivos),
//      si están las env GA4_*.
//   2. Google Search Console (vía Windsor, ya configurado) — tráfico orgánico
//      de Google (clics/impresiones/páginas/búsquedas), sin necesitar Google Console.
// Cachea ~10 min para no agotar cuotas. Acceso abierto por URL (sin PII).
type CacheValue =
  | { source: "ga4"; ga4: WebAnalytics }
  | { source: "search_console"; search: SearchTrafficSummary };

const CACHE_TTL_MS = 10 * 60 * 1000;
let cache: { key: string; value: CacheValue; expMs: number } | undefined;

export default async function handler(
  request: VercelRequest,
  response: VercelResponse,
): Promise<void> {
  if (request.method !== "GET") {
    methodNotAllowed(response);
    return;
  }

  const rangeDays = clampDays(Number(toHttpRequest(request).query?.days));
  const key = String(rangeDays);

  if (cache && cache.key === key && cache.expMs > Date.now()) {
    sendValue(response, cache.value, rangeDays);
    return;
  }

  // 1 — Google Analytics 4 (si está configurado).
  const ga = readGa4Config();
  if (ga) {
    try {
      const ga4 = await fetchWebAnalytics(ga, rangeDays);
      cache = { key, value: { source: "ga4", ga4 }, expMs: Date.now() + CACHE_TTL_MS };
      sendValue(response, cache.value, rangeDays);
      return;
    } catch {
      // GA4 configurado pero falló → caemos a Search Console.
    }
  }

  // 2 — Google Search Console vía Windsor.
  const windsor = createWindsorClient();
  if (windsor.isConfigured()) {
    try {
      const datePreset = toWindsorPreset(rangeDays);
      const [pageReport, queryReport] = await Promise.all([
        windsor.getSearchConsoleReport({ dimension: "page", datePreset }),
        windsor.getSearchConsoleReport({ dimension: "query", datePreset }),
      ]);
      const search = buildSearchTrafficSummary(pageReport, queryReport, rangeDays);
      cache = { key, value: { source: "search_console", search }, expMs: Date.now() + CACHE_TTL_MS };
      sendValue(response, cache.value, rangeDays);
      return;
    } catch (error) {
      send(response, {
        status: 200,
        body: {
          ok: true,
          source: null,
          reason: "error",
          message: error instanceof Error ? error.message : "unknown error",
        },
      });
      return;
    }
  }

  send(response, { status: 200, body: { ok: true, source: null, reason: "not_configured" } });
}

function sendValue(response: VercelResponse, value: CacheValue, rangeDays: number): void {
  if (value.source === "ga4") {
    send(response, { status: 200, body: { ok: true, source: "ga4", analytics: value.ga4, rangeDays } });
  } else {
    send(response, { status: 200, body: { ok: true, source: "search_console", search: value.search, rangeDays } });
  }
}

function clampDays(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 28;
  return Math.min(365, Math.round(value));
}
