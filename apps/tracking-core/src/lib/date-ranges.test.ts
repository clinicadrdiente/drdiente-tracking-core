import { describe, expect, it } from "vitest";
import { trailingRange, groupByMonth } from "./date-ranges.js";

const FIXED_NOW = new Date("2026-06-10T15:00:00.000Z");

describe("trailingRange", () => {
  it("7-day range starts 6 days before today and ends at end of today UTC", () => {
    const { fromIso, toIso } = trailingRange(7, FIXED_NOW);
    expect(fromIso).toBe("2026-06-04T00:00:00.000Z");
    expect(toIso).toBe("2026-06-10T23:59:59.999Z");
  });

  it("30-day range starts 29 days before today", () => {
    const { fromIso, toIso } = trailingRange(30, FIXED_NOW);
    expect(fromIso).toBe("2026-05-12T00:00:00.000Z");
    expect(toIso).toBe("2026-06-10T23:59:59.999Z");
  });

  it("180-day range starts 179 days before today", () => {
    const { fromIso, toIso } = trailingRange(180, FIXED_NOW);
    expect(fromIso).toBe("2025-12-13T00:00:00.000Z");
    expect(toIso).toBe("2026-06-10T23:59:59.999Z");
  });

  it("7-day range spans exactly 7 days", () => {
    const { fromIso, toIso } = trailingRange(7, FIXED_NOW);
    const diffMs = new Date(toIso).getTime() - new Date(fromIso).getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    // 6 full days + 23:59:59.999 of the last day ≈ 6.999...
    expect(diffDays).toBeGreaterThan(6.99);
    expect(diffDays).toBeLessThanOrEqual(7);
  });
});

describe("groupByMonth", () => {
  it("returns empty array for empty input", () => {
    expect(groupByMonth([])).toEqual([]);
  });

  it("groups days spanning 3 months into 3 buckets, oldest first", () => {
    const days = [
      { date: "2026-04-29", revenue: 100, payments: 1 },
      { date: "2026-05-01", revenue: 200, payments: 2 },
      { date: "2026-05-31", revenue: 300, payments: 3 },
      { date: "2026-06-01", revenue: 400, payments: 4 },
      { date: "2026-04-30", revenue: 50, payments: 1 },
    ];
    const result = groupByMonth(days);
    expect(result).toHaveLength(3);
    expect(result[0].monthKey).toBe("2026-04");
    expect(result[1].monthKey).toBe("2026-05");
    expect(result[2].monthKey).toBe("2026-06");
  });

  it("sums revenue and payments within the same month", () => {
    const days = [
      { date: "2026-05-01", revenue: 200, payments: 2 },
      { date: "2026-05-31", revenue: 300, payments: 3 },
    ];
    const result = groupByMonth(days);
    expect(result).toHaveLength(1);
    expect(result[0].revenue).toBe(500);
    expect(result[0].payments).toBe(5);
  });

  it("label is a non-empty Spanish string", () => {
    const days = [{ date: "2026-06-10", revenue: 1000, payments: 5 }];
    const result = groupByMonth(days);
    expect(result[0].label).toBeTruthy();
    expect(result[0].label.length).toBeGreaterThan(3);
  });

  it("single month with single day has correct monthKey", () => {
    const days = [{ date: "2026-03-15", revenue: 999, payments: 1 }];
    const result = groupByMonth(days);
    expect(result[0].monthKey).toBe("2026-03");
    expect(result[0].revenue).toBe(999);
    expect(result[0].payments).toBe(1);
  });
});
