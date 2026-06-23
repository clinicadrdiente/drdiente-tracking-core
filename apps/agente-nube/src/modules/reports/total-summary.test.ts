import { describe, expect, it } from "vitest";
import { aggregateReception, buildTotalSummary } from "./total-summary.js";
import type { DailySummaryInput } from "./daily-summary.js";
import type { DailyBranchReport } from "../../types/domain.js";

const daily: DailySummaryInput = {
  dateLabel: "23 jun",
  currency: "MXN",
  leads: { total: 14, byAccount: { roma: 6, general: 8 } },
  appointments: 5,
  marketing: null,
};

function report(overrides: Partial<DailyBranchReport>): DailyBranchReport {
  return {
    reportId: "x",
    submittedAt: "2026-06-23T23:00:00.000Z",
    branch: "Roma",
    date: "2026-06-23",
    ...overrides,
  };
}

describe("aggregateReception", () => {
  it("suma métricas, cuenta llamadas de contacts y sucursales distintas", () => {
    const totals = aggregateReception([
      report({ branch: "Roma", leadsContacted: 4, callsReceived: 2 }),
      report({
        branch: "Polanco",
        leadsContacted: 3,
        contacts: [{ channel: "llamada", count: 5 }],
      }),
    ]);
    expect(totals.leadsContacted).toBe(7);
    expect(totals.callsReceived).toBe(7); // 2 + 5
    expect(totals.reportingBranches).toBe(2);
    expect(totals.daysWithReports).toBe(1);
  });
});

describe("buildTotalSummary", () => {
  it("indica cuando no hay reportes de recepción", () => {
    const text = buildTotalSummary(daily, aggregateReception([]));
    expect(text).toContain("Sin reportes de recepción hoy.");
  });

  it("incluye la sección de recepción cuando hay reportes", () => {
    const text = buildTotalSummary(
      daily,
      aggregateReception([report({ leadsContacted: 4, postsPublished: 3 })]),
    );
    expect(text).toContain("— Recepción (SAC) — 1 sucursal(es)");
    expect(text).toContain("Contactados: 4");
    expect(text).toContain("Posts: 3");
  });
});
