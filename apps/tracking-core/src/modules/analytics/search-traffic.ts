// Resumen de tráfico orgánico desde Google Search Console (vía el conector
// `searchconsole` de Windsor, ya configurado en el repo). No necesita Google
// Console ni service account — usa la WINDSOR_API_KEY existente. Función pura,
// testeable; recibe los dos reportes (por página y por búsqueda) ya traídos.

import type { WindsorSearchConsoleReport } from "../windsor/client.js";

export interface SearchTrafficPageRow {
  page: string;
  clicks: number;
  impressions: number;
  ctrPct: number | null;
  position: number | null;
}

export interface SearchTrafficQueryRow {
  query: string;
  clicks: number;
  impressions: number;
  position: number | null;
}

export interface SearchTrafficSummary {
  rangeDays: number;
  totals: {
    clicks: number;
    impressions: number;
    ctrPct: number | null;
    avgPosition: number | null;
  };
  topPages: SearchTrafficPageRow[];
  topQueries: SearchTrafficQueryRow[];
}

const TOP = 12;

function ctrPct(clicks: number, impressions: number): number | null {
  return impressions > 0 ? (clicks / impressions) * 100 : null;
}

export function buildSearchTrafficSummary(
  pageReport: WindsorSearchConsoleReport,
  queryReport: WindsorSearchConsoleReport,
  rangeDays: number,
): SearchTrafficSummary {
  // Posición promedio ponderada por impresiones (más representativa que el simple promedio).
  let weighted = 0;
  let impForPos = 0;
  for (const row of pageReport.rows) {
    if (row.position !== null && row.impressions > 0) {
      weighted += row.position * row.impressions;
      impForPos += row.impressions;
    }
  }
  const avgPosition = impForPos > 0 ? weighted / impForPos : null;

  const topPages: SearchTrafficPageRow[] = [...pageReport.rows]
    .sort((a, b) => b.clicks - a.clicks)
    .slice(0, TOP)
    .map((r) => ({
      page: r.page ?? "(sin página)",
      clicks: r.clicks,
      impressions: r.impressions,
      ctrPct: ctrPct(r.clicks, r.impressions),
      position: r.position,
    }));

  const topQueries: SearchTrafficQueryRow[] = [...queryReport.rows]
    .sort((a, b) => b.clicks - a.clicks)
    .slice(0, TOP)
    .map((r) => ({
      query: r.query ?? "(sin búsqueda)",
      clicks: r.clicks,
      impressions: r.impressions,
      position: r.position,
    }));

  return {
    rangeDays,
    totals: {
      clicks: pageReport.totals.clicks,
      impressions: pageReport.totals.impressions,
      ctrPct: ctrPct(pageReport.totals.clicks, pageReport.totals.impressions),
      avgPosition,
    },
    topPages,
    topQueries,
  };
}

// Mapea una ventana en días al preset de fecha que entiende Windsor.
export function toWindsorPreset(rangeDays: number): string {
  if (rangeDays <= 7) return "last_7d";
  if (rangeDays <= 14) return "last_14d";
  if (rangeDays <= 28) return "last_28d";
  if (rangeDays <= 30) return "last_30d";
  if (rangeDays <= 90) return "last_90d";
  return "last_180d";
}
