import { describe, expect, it } from "vitest";
import { buildDailySummary, type DailySummaryInput } from "./daily-summary.js";

const base: DailySummaryInput = {
  dateLabel: "23 jun",
  currency: "MXN",
  leads: { total: 14, byAccount: { roma: 6, general: 8 } },
  appointments: 5,
  marketing: {
    platforms: [
      { source: "Meta", impressions: 12400, clicks: 320, spend: 1250, reach: 9000 },
      { source: "Google", impressions: 8100, clicks: 210, spend: 980, reach: 6000 },
    ],
    totals: { impressions: 20500, clicks: 530, spend: 2230, reach: 15000 },
  },
};

describe("buildDailySummary", () => {
  it("incluye leads por cuenta, agendamientos, plataformas y embudo", () => {
    const text = buildDailySummary(base);
    expect(text).toContain("Resumen del día (23 jun)");
    expect(text).toContain("Leads: 14  (Roma 6 · General 8)");
    expect(text).toContain("Agendamientos: 5");
    expect(text).toContain("Meta — 12,400 impresiones · 320 clics");
    expect(text).toContain("Embudo: 20,500 impresiones → 530 clics → 14 leads → 5 agendamientos");
  });

  it("degrada cuando faltan fuentes", () => {
    const text = buildDailySummary({
      ...base,
      leads: null,
      appointments: null,
      marketing: null,
    });
    expect(text).toContain("Leads: sin datos");
    expect(text).toContain("Agendamientos: sin datos");
    expect(text).toContain("• sin datos");
    expect(text).toContain("Embudo: sin datos");
  });
});
