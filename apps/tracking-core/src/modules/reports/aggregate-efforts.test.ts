import { describe, it, expect } from "vitest";
import { aggregateEfforts } from "./aggregate-efforts.js";
import type { DailyBranchReport } from "../../types/domain.js";
import type { WindsorSourceSummary } from "../windsor/client.js";

const RANGE = {
  fromIso: "2026-06-01T00:00:00.000Z",
  toIso: "2026-06-30T23:59:59.999Z",
};

function makeReport(
  overrides: Partial<DailyBranchReport> = {},
): DailyBranchReport {
  return {
    reportId: "centro_2026-06-10",
    branch: "centro",
    date: "2026-06-10",
    submittedAt: "2026-06-10T18:00:00.000Z",
    contacts: [{ channel: "llamada", count: 3 }],
    leadsReceived: 5,
    leadsContacted: 4,
    followUpsSent: 2,
    promoWhatsappSent: 1,
    emailsSent: 1,
    postsPublished: 2,
    notes: null,
    ...overrides,
  };
}

function makeWindsorSource(
  overrides: Partial<WindsorSourceSummary> = {},
): WindsorSourceSummary {
  return {
    source: "facebook",
    spend: 1000,
    impressions: 50000,
    reach: 30000,
    clicks: 500,
    videoTrueviewViews: 0,
    campaigns: 3,
    ...overrides,
  };
}

describe("aggregateEfforts", () => {
  it("returns all zeros and empty arrays when given null windsor and no reports", () => {
    const result = aggregateEfforts(null, [], RANGE);
    expect(result.platforms).toEqual([]);
    expect(result.totals).toEqual({
      spend: 0,
      impressions: 0,
      reach: 0,
      clicks: 0,
    });
    expect(result.manual.postsPublished).toBe(0);
    expect(result.manual.leadsReceived).toBe(0);
    expect(result.manual.callsReceived).toBe(0);
    expect(result.manual.reportingBranches).toBe(0);
    expect(result.manual.daysWithReports).toBe(0);
  });

  it("sums manual fields across multiple reports from multiple branches", () => {
    const reports = [
      makeReport({
        reportId: "centro_2026-06-10",
        branch: "centro",
        date: "2026-06-10",
        leadsReceived: 5,
        leadsContacted: 4,
        followUpsSent: 2,
        promoWhatsappSent: 1,
        emailsSent: 1,
        postsPublished: 2,
        contacts: [{ channel: "llamada", count: 3 }],
      }),
      makeReport({
        reportId: "norte_2026-06-10",
        branch: "norte",
        date: "2026-06-10",
        leadsReceived: 3,
        leadsContacted: 2,
        followUpsSent: 1,
        promoWhatsappSent: 0,
        emailsSent: 2,
        postsPublished: 1,
        contacts: [
          { channel: "whatsapp", count: 10 },
          { channel: "llamada", count: 2 },
        ],
      }),
    ];

    const result = aggregateEfforts(null, reports, RANGE);
    expect(result.manual.leadsReceived).toBe(8);
    expect(result.manual.leadsContacted).toBe(6);
    expect(result.manual.followUpsSent).toBe(3);
    expect(result.manual.promoWhatsappSent).toBe(1);
    expect(result.manual.emailsSent).toBe(3);
    expect(result.manual.postsPublished).toBe(3);
    // Only llamada channels count as calls
    expect(result.manual.callsReceived).toBe(5);
    expect(result.manual.reportingBranches).toBe(2);
    expect(result.manual.daysWithReports).toBe(1);
  });

  it("callsReceived counts only 'llamada' channel contacts", () => {
    const reports = [
      makeReport({
        contacts: [
          { channel: "llamada", count: 4 },
          { channel: "whatsapp", count: 20 },
          { channel: "google_maps", count: 5 },
          { channel: "email", count: 3 },
          { channel: "visita_directa", count: 2 },
          { channel: "otro", count: 1 },
        ],
      }),
    ];
    const result = aggregateEfforts(null, reports, RANGE);
    expect(result.manual.callsReceived).toBe(4);
  });

  it("counts distinct branches and days correctly across multiple reports", () => {
    const reports = [
      makeReport({
        reportId: "centro_2026-06-10",
        branch: "centro",
        date: "2026-06-10",
      }),
      makeReport({
        reportId: "norte_2026-06-10",
        branch: "norte",
        date: "2026-06-10",
      }),
      makeReport({
        reportId: "centro_2026-06-11",
        branch: "centro",
        date: "2026-06-11",
      }),
    ];
    const result = aggregateEfforts(null, reports, RANGE);
    expect(result.manual.reportingBranches).toBe(2);
    expect(result.manual.daysWithReports).toBe(2);
  });

  it("maps windsor bySource to platforms correctly", () => {
    const windsor = {
      bySource: [
        makeWindsorSource({
          source: "facebook",
          spend: 2000,
          impressions: 100000,
          reach: 60000,
          clicks: 1200,
        }),
        makeWindsorSource({
          source: "google",
          spend: 1500,
          impressions: 80000,
          reach: 50000,
          clicks: 900,
        }),
      ],
      totals: { spend: 3500, impressions: 180000, reach: 110000, clicks: 2100 },
    };

    const result = aggregateEfforts(windsor, [], RANGE);
    expect(result.platforms).toHaveLength(2);
    expect(result.platforms[0]).toEqual({
      source: "facebook",
      spend: 2000,
      impressions: 100000,
      reach: 60000,
      clicks: 1200,
    });
    expect(result.totals).toEqual({
      spend: 3500,
      impressions: 180000,
      reach: 110000,
      clicks: 2100,
    });
  });

  it("null windsor yields empty platforms and zero totals even when daily reports present", () => {
    const reports = [makeReport()];
    const result = aggregateEfforts(null, reports, RANGE);
    expect(result.platforms).toEqual([]);
    expect(result.totals.spend).toBe(0);
    expect(result.totals.impressions).toBe(0);
    // manual should still aggregate
    expect(result.manual.leadsReceived).toBe(5);
  });

  it("preserves the range in the result", () => {
    const range = {
      fromIso: "2026-01-01T00:00:00.000Z",
      toIso: "2026-01-07T23:59:59.999Z",
    };
    const result = aggregateEfforts(null, [], range);
    expect(result.range).toEqual(range);
  });
});
