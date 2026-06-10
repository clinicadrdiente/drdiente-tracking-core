# Plan 011: Efforts panel — every input the clinic invests, in one list

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 56742e6..HEAD -- apps/tracking-core/src/modules/windsor/ apps/tracking-core/api/dev/windsor-marketing-summary.ts`
> Plans 007–010 changed components, the dashboard endpoint, and the state store —
> not drift. Drift = the Windsor summary shape below no longer matching.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW (read-only aggregation over existing sources)
- **Depends on**: plans/008-report-time-ranges.md, plans/010-daily-branch-report.md
- **Category**: direction
- **Planned at**: commit `56742e6`, 2026-06-10

## Why this matters

The dashboard shows *results* (revenue, pacientes) but not *inputs*. The stakeholder wants a "lista de esfuerzos": money invested per platform, posts published, leads collected, calls received, emails sent, promotional WhatsApp sent, follow-ups sent, impressions and reach per platform. Seeing inputs next to outputs is what makes under-performance diagnosable ("revenue flat but we also halved posts and follow-ups").

## Current state

- **Automatic source — Windsor**: `api/dev/windsor-marketing-summary.ts` (GET, tracking-secret auth, optional `?datePreset=` string passed to `client.getMarketingSummary`). Response includes (verified in `src/modules/windsor/client.ts`):

```ts
export interface WindsorMarketingSummary {
  connector: string;
  datePreset: string;
  filters: { includeText: string[]; excludeText: string[] };
  rawRowCount: number;
  filteredRowCount: number;
  rows: WindsorMarketingRow[];
  totals: { spend: number; clicks: number; impressions: number; reach: number; videoTrueviewViews: number };
  bySource: WindsorSourceSummary[];   // per-platform breakdown
}
```

  This covers per-platform: **spend, impressions, reach** (plus clicks). `bySource` is the per-platform array — inspect its exact fields in `src/modules/windsor/client.ts` before rendering.
- **Manual source — daily branch reports** (plan 010): `StateStore.listDailyReports(fromDate, toDate)` returns `DailyBranchReport[]` with `postsPublished`, `emailsSent`, `promoWhatsappSent`, `followUpsSent`, `leadsReceived`, `leadsContacted`, and per-channel `contacts` (incl. `llamada` = calls received). Endpoint: `GET /api/reports/daily?from=&to=`.
- **Leads in Elevator**: `src/modules/elevator/client.ts` exposes `findLeadsByIdentity` and `createLead` — **no list/count endpoint was found at planning time**. v1 therefore uses `leadsReceived` summed from daily reports as the leads metric, labeled "Leads (reporte sucursales)". See STOP conditions before attempting an Elevator count.
- Frontend (post-007/008): modules in `src/components/dashboard/`, `ModuleFrame` accent `"marketing"`, range selector state (`rangeDays: 7|30|180|null`) lives in `dashboard.tsx`.
- `src/lib/date-ranges.ts` (plan 008) exports `trailingRange`.

## Commands you will need

| Purpose   | Command (run in `apps/tracking-core/`) | Expected on success |
|-----------|----------------------------------------|---------------------|
| Typecheck | `npm run check`                        | exit 0              |
| Tests     | `npm test`                             | all pass            |
| Build     | `npm run build`                        | exit 0              |

## Scope

**In scope**:
- `apps/tracking-core/api/reports/efforts.ts` (new) — aggregation endpoint
- `apps/tracking-core/src/modules/reports/aggregate-efforts.ts` (new) + test — pure aggregation
- `apps/tracking-core/src/components/dashboard/efforts-panel.tsx` (new)
- `apps/tracking-core/src/components/dashboard.tsx` — render the panel
- `plans/README.md`

**Out of scope**:
- New external integrations (Instagram API for posts, call-tracking systems) — manual capture via plan 010 is v1 by design
- Modifying the Windsor client or its filters (the DrDiente-vs-Rimas filtering is a separate Fase-1 task)
- Writing anything to the state store (read-only feature)

## Steps

### Step 1: Pure aggregation function + tests

Create `src/modules/reports/aggregate-efforts.ts`:

```ts
import type { DailyBranchReport } from "../../types/domain.js";

export interface EffortsSummary {
  range: { fromIso: string; toIso: string };
  platforms: Array<{       // from Windsor bySource
    source: string;
    spend: number;
    impressions: number;
    reach: number;
    clicks: number;
  }>;
  totals: { spend: number; impressions: number; reach: number; clicks: number };
  manual: {                 // summed from daily reports
    postsPublished: number;
    leadsReceived: number;
    leadsContacted: number;
    callsReceived: number;        // sum of contacts where channel === "llamada"
    emailsSent: number;
    promoWhatsappSent: number;
    followUpsSent: number;
    reportingBranches: number;    // distinct branches that reported in range
    daysWithReports: number;      // distinct dates with ≥1 report
  };
}

export function aggregateEfforts(
  windsor: { bySource: unknown[]; totals: {...} } | null,  // null when Windsor unconfigured
  dailyReports: DailyBranchReport[],
  range: { fromIso: string; toIso: string },
): EffortsSummary;
```

Type the windsor parameter against the real `WindsorSourceSummary` from `src/modules/windsor/client.ts` (import the type — do not redeclare). Null windsor → empty `platforms`, zero totals.

Test in `src/modules/reports/aggregate-efforts.test.ts`: sums across multiple reports/branches; `callsReceived` counts only `llamada`-channel contacts; distinct branch/day counts; null windsor handled; empty everything → all zeros.

**Verify**: `npm test` → all pass.

### Step 2: Aggregation endpoint

Create `api/reports/efforts.ts` (GET, `requireTrackingSecret`, `methodNotAllowed` otherwise):
1. Read `?rangeDays=7|30|180` (default 30). Compute range with `trailingRange`.
2. Fetch Windsor: `createWindsorClient()`; if `isConfigured()`, call `getMarketingSummary(<preset>)` mapping rangeDays→preset (inspect `client.getMarketingSummary` / Windsor docs for accepted presets — `last_7d`-style; if 180 has no preset, use the closest larger one and include the actual preset used in the response). Wrap in try/catch: Windsor failure must NOT fail the endpoint — return `platforms: []` plus `windsorError: string`.
3. Fetch daily reports via `trackingHttpHandlers.stateStore.listDailyReports(from, to)` (date-only strings derived from the range).
4. Return `{ok: true, ...aggregateEfforts(...), windsorError?}`.

**Verify**: `npm run check` → exit 0.

### Step 3: Efforts panel UI

Create `src/components/dashboard/efforts-panel.tsx` in `<ModuleFrame accent="marketing" title="Esfuerzos">`:
- Reuses the dashboard's `rangeDays` selection (prop from `dashboard.tsx`; null → treat as 30).
- **Inversión por plataforma**: table from `platforms` — source, spend (currency via `formater.ts`), impressions, reach, clicks — plus a totals row.
- **Esfuerzos operativos**: stat tiles for the 7 manual metrics, with a caption "Fuente: reportes diarios de sucursal (N sucursales, M días reportados)" using `reportingBranches`/`daysWithReports`.
- If `windsorError` or zero `daysWithReports`, show an explanatory empty state ("Sin datos de Windsor" / "Ninguna sucursal ha reportado en este periodo") — never blank zeros that look like real measurements.

Render it from `dashboard.tsx` (same route as the attribution panel or its own `#/esfuerzos` route — match whichever pattern plan 007 established for secondary panels).

**Verify**: `npm run build` → exit 0; panel renders in `npm run dev` with the empty states when no data exists.

## Test plan

- `aggregate-efforts.test.ts` per Step 1 (≥5 tests) — model structure after `src/modules/state/state-store.test.ts`.
- `npm test` → all green.

## Done criteria

- [ ] `npm run check`, `npm test`, `npm run build` exit 0
- [ ] `GET /api/reports/efforts?rangeDays=30` returns platforms + manual aggregates; Windsor being down degrades gracefully (`windsorError`, not 500)
- [ ] Panel shows per-platform spend/impressions/reach and the 7 manual metrics with source caption
- [ ] Empty states render instead of misleading zeros
- [ ] `plans/README.md` updated

## STOP conditions

- Plan 010's `listDailyReports` doesn't exist on the StateStore (010 not landed).
- `WindsorSourceSummary` lacks per-source impressions/reach fields — report the actual fields found instead of inventing a mapping.
- Windsor accepts no preset covering ~180 days — implement 7/30, report 180 blocked.
- Counting leads directly from Elevator seems possible (you find a list endpoint in `elevator/client.ts`): do NOT add it ad hoc — note it in the report as a follow-up; v1 ships with the daily-report figure.

## Maintenance notes

- When the Windsor DrDiente-vs-Rimas filter lands (Fase 1 pending), this panel's spend numbers change meaning — re-verify after that fix.
- When the real web form goes live, "leads recibidos" should switch source from branch self-reporting to Elevator/Tracking-Core counts; the `EffortsSummary.manual` vs a future `automatic` block was kept separate to make that swap visible, not silent.
- Posts/emails/WhatsApp counters are self-reported — reviewer should confirm the UI captions make the data provenance obvious to stakeholders.
