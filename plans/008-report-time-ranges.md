# Plan 008: Reports support 7/30/180-day ranges and month-by-month separation

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 56742e6..HEAD -- apps/tracking-core/api/dev/dentalink-monthly-dashboard.ts apps/tracking-core/src/components/`
> Plan 007 is EXPECTED to have restructured `src/components/` — that is not drift.
> What counts as drift: the API file's response shape differing from the excerpt below.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED (touches the main data endpoint; mitigated by keeping the default behavior identical)
- **Depends on**: plans/007-dashboard-modularization.md
- **Category**: direction (stakeholder-requested feature)
- **Planned at**: commit `56742e6`, 2026-06-10

## Why this matters

Today the dashboard can only show **the current month**: `api/dev/dentalink-monthly-dashboard.ts` computes a fixed from/to for "this month" and the UI has no range control. The stakeholder needs to answer "how did the last 7 / 30 / 180 days go?" and to see long ranges **separated by month**. Without this, every business review requires manual data pulls.

## Current state

- `apps/tracking-core/api/dev/dentalink-monthly-dashboard.ts` — the dashboard data endpoint. Facts verified at planning time:
  - It takes **no date/range query parameter** (grep for `query` finds none related to dates; `month` appears only in the response body, lines 51, 238).
  - Response shape (lines 48–69): `MonthlyDashboardBody` with `month {label, fromIso, toIso}`, `revenueTotal`, `paymentsTotal`, `uniquePatientsTotal`, `averagePaymentValue`, `days: DayBlock[]`, `patients`, `treatmentShare`, `branchShare`, `cache {hit, stale, cachedAt, ttlSeconds}`.
  - `DayBlock` (lines 29–36): `{day, date, label, revenue, payments, patients}`.
  - Server cache: `CACHE_TTL_MS = 10 min`, `STALE_CACHE_TTL_MS = 60 min` (lines ~72–73). The cache key must include the requested range or different ranges will collide.
  - Pagination guard: `MAX_PAYMENT_PAGES = 20` (line 71). A 180-day range may exceed what 20 pages cover — see STOP conditions.
- Frontend (post-plan-007): `src/components/dashboard.tsx` orchestrator holds the fetch to `/api/dev/dentalink-monthly-dashboard` (originally line 363) and a 5-minute browser cache under key `drdienteMonthlyDashboardCache` (line 301). Range must become part of that cache key too.
- UI kit: `src/components/ui/select.tsx` exists (Radix select) — use it for the range picker.
- Auth convention: endpoint already calls `requireTrackingSecret(toHttpRequest(request))` — keep it.

## Commands you will need

| Purpose   | Command (run in `apps/tracking-core/`) | Expected on success |
|-----------|----------------------------------------|---------------------|
| Typecheck | `npm run check`                        | exit 0              |
| Tests     | `npm test`                             | all pass            |
| Build     | `npm run build`                        | exit 0              |

## Scope

**In scope**:
- `apps/tracking-core/api/dev/dentalink-monthly-dashboard.ts` — add `rangeDays` query param + month grouping in response
- `apps/tracking-core/src/types/dashboard.ts` — extend types
- `apps/tracking-core/src/components/dashboard.tsx` — range state + fetch param + cache key
- `apps/tracking-core/src/components/dashboard/attribution-panel.tsx` — range selector UI + month-separated rendering
- `apps/tracking-core/src/lib/date-ranges.ts` (new) + `src/lib/date-ranges.test.ts` (new)
- `plans/README.md`

**Out of scope**:
- Windsor endpoints (plan 011 handles spend ranges via its own `datePreset` param)
- `executive.tsx`, `projection.tsx`
- Comparatives vs previous period — that is plan 009
- Dentalink client internals (`src/modules/dentalink/`)

## Steps

### Step 1: Pure range/grouping helpers

Create `src/lib/date-ranges.ts` with two exported functions:

```ts
export type RangeDays = 7 | 30 | 180;

/** Returns {fromIso, toIso} for the trailing N days ending now (UTC, inclusive of today). */
export function trailingRange(days: RangeDays, now: Date): { fromIso: string; toIso: string };

export interface MonthBucket {
  monthKey: string;   // "2026-06"
  label: string;      // "Junio 2026"
  revenue: number;
  payments: number;
}

/** Groups DayBlock-like rows ({date, revenue, payments}) into month buckets, ordered oldest→newest. */
export function groupByMonth(
  days: Array<{ date: string; revenue: number; payments: number }>,
): MonthBucket[];
```

Implement with plain `Date`/`Intl.DateTimeFormat("es-MX", {month: "long"})`; no new dependencies.

**Verify**: `npm run check` → exit 0.

### Step 2: Unit tests for the helpers

Create `src/lib/date-ranges.test.ts` (model after `src/lib/normalize.test.ts`): trailingRange for 7/30/180 with a fixed `now`; groupByMonth with days spanning 3 months (verify bucket order, sums, labels); empty input → empty array.

**Verify**: `npm test` → all pass including the new file.

### Step 3: Extend the API endpoint

In `api/dev/dentalink-monthly-dashboard.ts`:
1. Read `rangeDays` from the query string. Accept only `"7" | "30" | "180"`; anything else (including absent) → keep today's exact current-month behavior. **Default behavior must be byte-identical to today.**
2. When `rangeDays` is present, compute from/to with `trailingRange` and use those bounds where the current-month bounds are used today.
3. Include the range in the server cache key (find where the cached blob is stored and add a `:range7`-style suffix; absent param → existing key unchanged).
4. Add to the response body: `range: { days: number | null, fromIso, toIso }` and `months: MonthBucket[]` (from `groupByMonth(days)`). For the no-param case, `range.days` is `null` and `months` has the single current month.

**Verify**: `npm run check` → exit 0.

### Step 4: Frontend range selector

1. In `dashboard.tsx`: add `rangeDays` state (`7 | 30 | 180 | null`, default `null` = current month), pass it to the fetch as `?rangeDays=`, and append it to `DASHBOARD_BROWSER_CACHE_KEY` so cached blobs don't collide.
2. In `attribution-panel.tsx`: render a `Select` (from `ui/select.tsx`) with options "Mes actual", "Últimos 7 días", "Últimos 30 días", "Últimos 180 días".
3. When `months.length > 1`, render a "Por mes" card: one row/bar per `MonthBucket` (label, revenue formatted with the existing helper in `formater.ts`, payments count). Recharts is already a dependency if a bar chart is preferred; a table is acceptable.

**Verify**: `npm run build` → exit 0; `npm run dev` → switching ranges refetches and the month separation card appears for 180 días.

## Test plan

- `src/lib/date-ranges.test.ts` as in Step 2 (≥6 tests).
- Existing suite stays green: `npm test`.

## Done criteria

- [ ] `npm run check`, `npm test`, `npm run build` all exit 0
- [ ] `GET /api/dev/dentalink-monthly-dashboard` with no params returns the same shape as before plus `range.days: null` and a single-month `months`
- [ ] `?rangeDays=7|30|180` changes `range.fromIso/toIso` accordingly
- [ ] UI selector switches ranges; "Por mes" view renders for multi-month ranges
- [ ] Browser + server caches are range-keyed (switching ranges twice quickly does not show wrong-range data)
- [ ] `plans/README.md` updated

## STOP conditions

- The endpoint's current-month from/to computation can't be located or doesn't match the described shape (drift).
- 180-day data exceeds `MAX_PAYMENT_PAGES = 20`: if the Dentalink pagination loop hits the page cap for `rangeDays=180`, STOP and report — raising the cap has rate-limit implications that need a human decision. Implement 7/30 and report 180 as blocked rather than silently truncating.
- Plan 007 is not merged (no `src/components/dashboard/` directory): STOP — this plan assumes the modular layout.

## Maintenance notes

- Plan 009 (comparatives) calls `trailingRange` twice (current + previous window) — keep the helper pure.
- Plan 011 (efforts panel) will reuse `RangeDays` to align Windsor's `datePreset` with the selected range (`last_7d` etc. — check Windsor presets at implementation time).
- Watch in review: timezone handling — paid-at timestamps are ISO with offsets; bucket by date string prefix (`YYYY-MM`), not by local `Date` parsing, to avoid off-by-one at month edges.
