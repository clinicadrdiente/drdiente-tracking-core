# Plan 009: Performance comparatives — current vs previous period, branch vs branch

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 56742e6..HEAD -- apps/tracking-core/api/dev/dentalink-monthly-dashboard.ts`
> Plans 007/008 are EXPECTED to have modified components and added `rangeDays` —
> not drift. Drift = the endpoint lacking the `rangeDays` param described below
> (means plan 008 didn't land; STOP).

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW (additive; reuses plan 008's plumbing)
- **Depends on**: plans/008-report-time-ranges.md
- **Category**: direction
- **Planned at**: commit `56742e6`, 2026-06-10

## Why this matters

Knowing "we billed $X in 30 days" is useless without "…and the previous 30 days was $Y". The stakeholder asked for performance comparatives: current period vs the immediately previous period of equal length, and branch-vs-branch. This turns the dashboard from a snapshot into a trend instrument — the difference between reporting and deciding.

## Current state

(After plans 007+008 land — verify with the drift check.)

- `api/dev/dentalink-monthly-dashboard.ts` accepts `?rangeDays=7|30|180` and returns `{range, months, revenueTotal, paymentsTotal, uniquePatientsTotal, averagePaymentValue, days, branchShare, ...}`.
- `BranchSummary` (original lines 38–46): `{branch, revenue, payments, uniquePatients, averagePaymentValue, share, topPatients}`.
- `src/lib/date-ranges.ts` exports `trailingRange(days, now)` (pure).
- `src/components/dashboard/attribution-panel.tsx` renders the range selector and revenue cards.
- A delta-display component already exists: `src/components/delta.tsx` (179 lines) — read it first and reuse it for up/down indicators instead of building a new one.
- The repo formats currency via helpers in `src/components/formater.ts`.

## Commands you will need

| Purpose   | Command (run in `apps/tracking-core/`) | Expected on success |
|-----------|----------------------------------------|---------------------|
| Typecheck | `npm run check`                        | exit 0              |
| Tests     | `npm test`                             | all pass            |
| Build     | `npm run build`                        | exit 0              |

## Scope

**In scope**:
- `apps/tracking-core/api/dev/dentalink-monthly-dashboard.ts` — optional `compare=previous` param
- `apps/tracking-core/src/lib/date-ranges.ts` — add `previousRange` helper (+ tests)
- `apps/tracking-core/src/types/dashboard.ts` — comparison types
- `apps/tracking-core/src/components/dashboard/attribution-panel.tsx` — comparative UI
- `plans/README.md`

**Out of scope**:
- Campaign-vs-campaign comparatives — requires the Windsor `campaign_id` join, which is blocked on the "filtrar Windsor a DrDiente" Fase-1 item. Explicitly deferred.
- `executive.tsx`, `projection.tsx`
- Any new endpoint — extend the existing one

## Steps

### Step 1: `previousRange` helper + tests

In `src/lib/date-ranges.ts` add:

```ts
/** The equal-length window immediately before {fromIso,toIso} (no overlap, no gap). */
export function previousRange(range: { fromIso: string; toIso: string }): { fromIso: string; toIso: string };
```

Add tests in `src/lib/date-ranges.test.ts`: previous of a 7-day window is the 7 days before it; chaining twice steps back 14 days; boundary touch but no overlap.

**Verify**: `npm test` → all pass.

### Step 2: `compare=previous` in the endpoint

In `api/dev/dentalink-monthly-dashboard.ts`: when the query has `compare=previous` AND `rangeDays` is valid, additionally compute the previous window's aggregates (reuse the same internal aggregation path with `previousRange` bounds) and attach:

```ts
comparison?: {
  fromIso: string;
  toIso: string;
  revenueTotal: number;
  paymentsTotal: number;
  uniquePatientsTotal: number;
  averagePaymentValue: number;
  branchShare: Array<{ branch: string; revenue: number; payments: number }>;
}
```

Without `compare`, the response is unchanged. Cache key must include the compare flag. **Do NOT include `topPatients`/`patients` for the comparison window** — aggregates only, to keep payload size sane.

**Verify**: `npm run check` → exit 0.

### Step 3: Comparative UI

In `attribution-panel.tsx`:
1. A "Comparar con periodo anterior" toggle (Button or checkbox), enabled only when a `rangeDays` is selected.
2. When comparison data is present, show next to each headline KPI (revenue, pagos, pacientes únicos, ticket promedio) the delta vs previous period using `delta.tsx` (e.g. `+12.4%` green / `-8.1%` red). Division-by-zero: previous = 0 → show "nuevo" instead of a percentage.
3. Branch comparison card: a table with one row per branch — revenue current, revenue previous, delta %. Branches present in only one window show "—" in the missing column.

**Verify**: `npm run build` → exit 0; in `npm run dev`, selecting 30 días + compare shows deltas on KPIs and the branch table.

## Test plan

- `date-ranges.test.ts` extended per Step 1 (≥3 new tests).
- If delta-percentage math lands in a pure helper (recommended: `percentDelta(current, previous): number | null` in `date-ranges.ts` or `formater.ts`), test it: positive, negative, previous=0 → null.
- `npm test` → all green.

## Done criteria

- [ ] `npm run check`, `npm test`, `npm run build` exit 0
- [ ] Endpoint without `compare` returns a byte-compatible shape (no `comparison` key or `undefined`)
- [ ] `?rangeDays=30&compare=previous` returns `comparison` with the correct previous window dates
- [ ] KPI deltas + branch comparison table render in the UI; previous=0 handled without NaN/Infinity
- [ ] `plans/README.md` updated

## STOP conditions

- Plan 008's `rangeDays` param is absent from the endpoint (008 not landed).
- Computing the previous window would require a second pass that exceeds the endpoint's `MAX_PAYMENT_PAGES` pagination cap — report instead of raising the cap.
- `delta.tsx` turns out to be coupled to a specific data shape that can't take a plain percentage — report; do not refactor `delta.tsx` (it's used elsewhere).

## Maintenance notes

- Campaign-level comparatives are the natural follow-up once Windsor is filtered to DrDiente; the `comparison` response block was kept generic to allow adding `campaignShare` later.
- Reviewer should scrutinize the two-window aggregation cost: it doubles Dentalink reads per request. The server cache makes this acceptable, but if Dentalink 429s appear in logs after launch, the comparison window should get its own longer-TTL cache entry.
