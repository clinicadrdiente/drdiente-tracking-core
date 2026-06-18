export type RangeDays = 7 | 30 | 180;

/**
 * The equal-length window immediately before {fromIso,toIso} (no overlap, no gap).
 * The returned window ends 1 ms before the given window starts and spans the same duration.
 */
export function previousRange(range: { fromIso: string; toIso: string }): {
  fromIso: string;
  toIso: string;
} {
  const from = new Date(range.fromIso).getTime();
  const to = new Date(range.toIso).getTime();
  const durationMs = to - from;
  const prevTo = from - 1; // 1 ms before the current window starts — no gap, no overlap
  const prevFrom = prevTo - durationMs;
  return {
    fromIso: new Date(prevFrom).toISOString(),
    toIso: new Date(prevTo).toISOString(),
  };
}

/**
 * Returns the percent change from previous to current as a number (e.g. 12.4 for +12.4%).
 * Returns null when previous is 0 (division by zero — caller should show "nuevo" in UI).
 */
export function percentDelta(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

/**
 * Returns {fromIso, toIso} for the trailing N days ending now (UTC, inclusive of today).
 * "Today" means the end of today UTC (23:59:59.999).
 */
export function trailingRange(
  days: RangeDays,
  now: Date,
): { fromIso: string; toIso: string } {
  // toIso = end of today UTC
  const toDate = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      23,
      59,
      59,
      999,
    ),
  );
  // fromIso = start of (today - (days - 1)) UTC, so that the range spans exactly N days
  const fromDate = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() - (days - 1),
      0,
      0,
      0,
      0,
    ),
  );
  return {
    fromIso: fromDate.toISOString(),
    toIso: toDate.toISOString(),
  };
}

export interface MonthBucket {
  monthKey: string; // "2026-06"
  label: string; // "Junio 2026"
  revenue: number;
  payments: number;
}

/**
 * Groups DayBlock-like rows ({date, revenue, payments}) into month buckets,
 * ordered oldest → newest. Buckets by YYYY-MM prefix of the date string
 * to avoid timezone off-by-one at month edges.
 */
export function groupByMonth(
  days: Array<{ date: string; revenue: number; payments: number }>,
): MonthBucket[] {
  const buckets = new Map<string, MonthBucket>();

  for (const day of days) {
    const monthKey = day.date.slice(0, 7); // "YYYY-MM"
    const existing = buckets.get(monthKey);
    if (existing) {
      existing.revenue += day.revenue;
      existing.payments += day.payments;
    } else {
      // Build a label from the monthKey: parse year/month and format
      const [yearStr, monthStr] = monthKey.split("-");
      const year = parseInt(yearStr, 10);
      const month = parseInt(monthStr, 10) - 1; // 0-based
      const labelDate = new Date(year, month, 1);
      const label = new Intl.DateTimeFormat("es-MX", {
        month: "long",
        year: "numeric",
      }).format(labelDate);
      buckets.set(monthKey, {
        monthKey,
        label,
        revenue: day.revenue,
        payments: day.payments,
      });
    }
  }

  // Sort oldest → newest by monthKey (lexicographic works for YYYY-MM)
  return [...buckets.values()].sort((a, b) =>
    a.monthKey < b.monthKey ? -1 : a.monthKey > b.monthKey ? 1 : 0,
  );
}
