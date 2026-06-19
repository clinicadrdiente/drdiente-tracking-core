import { describe, expect, it } from "vitest";
import {
  buildSearchTrafficSummary,
  toWindsorPreset,
} from "./search-traffic.js";
import type { WindsorSearchConsoleReport } from "../windsor/client.js";

function report(
  dimension: "page" | "query",
  rows: WindsorSearchConsoleReport["rows"],
): WindsorSearchConsoleReport {
  return {
    connector: "searchconsole",
    dimension,
    dateFrom: null,
    dateTo: null,
    datePreset: "last_28d",
    rowCount: rows.length,
    rows,
    totals: {
      clicks: rows.reduce((s, r) => s + r.clicks, 0),
      impressions: rows.reduce((s, r) => s + r.impressions, 0),
    },
  };
}

describe("buildSearchTrafficSummary", () => {
  const pages = report("page", [
    { page: "/dentista-roma-norte", query: null, clicks: 105, impressions: 2000, position: 3 },
    { page: "/diseno-de-sonrisa", query: null, clicks: 26, impressions: 1000, position: 6 },
  ]);
  const queries = report("query", [
    { page: null, query: "dentista roma norte", clicks: 80, impressions: 1500, position: 2 },
    { page: null, query: "diseño de sonrisa precio", clicks: 20, impressions: 800, position: 5 },
  ]);
  const s = buildSearchTrafficSummary(pages, queries, 28);

  it("computes totals with CTR and impression-weighted avg position", () => {
    expect(s.totals.clicks).toBe(131);
    expect(s.totals.impressions).toBe(3000);
    expect(s.totals.ctrPct).toBeCloseTo((131 / 3000) * 100, 5);
    // weighted: (3*2000 + 6*1000) / 3000 = 12000/3000 = 4
    expect(s.totals.avgPosition).toBeCloseTo(4, 5);
  });

  it("returns top pages sorted by clicks with per-row CTR", () => {
    expect(s.topPages[0].page).toBe("/dentista-roma-norte");
    expect(s.topPages[0].ctrPct).toBeCloseTo((105 / 2000) * 100, 5);
  });

  it("returns top queries sorted by clicks", () => {
    expect(s.topQueries[0].query).toBe("dentista roma norte");
    expect(s.topQueries[0].clicks).toBe(80);
  });

  it("handles empty reports", () => {
    const empty = buildSearchTrafficSummary(report("page", []), report("query", []), 7);
    expect(empty.totals.clicks).toBe(0);
    expect(empty.totals.ctrPct).toBeNull();
    expect(empty.totals.avgPosition).toBeNull();
    expect(empty.topPages).toEqual([]);
  });
});

describe("toWindsorPreset", () => {
  it("maps day windows to valid presets", () => {
    expect(toWindsorPreset(7)).toBe("last_7d");
    expect(toWindsorPreset(28)).toBe("last_28d");
    expect(toWindsorPreset(30)).toBe("last_30d");
    expect(toWindsorPreset(90)).toBe("last_90d");
    expect(toWindsorPreset(365)).toBe("last_180d");
  });
});
