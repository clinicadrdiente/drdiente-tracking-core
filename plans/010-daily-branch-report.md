# Plan 010: Daily branch report — lead-contact status form with persistent storage

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 56742e6..HEAD -- apps/tracking-core/src/modules/state/ apps/tracking-core/api/`
> Plans 007–009 changed components and the monthly-dashboard endpoint — not drift.
> Drift = `state-store.ts` no longer matching the interface excerpt below.

## Status

- **Priority**: P1 (also feeds plan 011's manual effort metrics)
- **Effort**: L
- **Risk**: MED (new persistence + new public-ish endpoint; both follow established patterns)
- **Depends on**: plans/007-dashboard-modularization.md
- **Category**: direction
- **Planned at**: commit `56742e6`, 2026-06-10

## Why this matters

Branches currently report lead-contact activity (calls made, WhatsApp sent, Google Maps visits) nowhere — that data dies in chat groups. The stakeholder wants each branch to submit a daily report with the contact status of each lead. This (a) measures speed-to-contact per branch — an uncontacted lead within 24h is wasted ad spend — and (b) becomes the data source for the manual half of the "listas de esfuerzos" panel (plan 011).

## Current state

- Persistence pattern: `apps/tracking-core/src/modules/state/state-store.ts` defines `StateStore` with three implementations (InMemory, File, Redis/Upstash REST). The interface today:

```ts
export interface StateStore {
  getPaymentSyncState(): Promise<PaymentSyncState>;
  savePaymentSyncState(state: PaymentSyncState): Promise<void>;
  hasProcessedPayment(paymentId: string): Promise<boolean>;
  markPaymentProcessed(paymentId: string): Promise<void>;
  claimPaymentProcessed(paymentId: string): Promise<boolean>;
  writeHeartbeat(key: string, isoTimestamp: string): Promise<void>;
  readHeartbeat(key: string): Promise<string | null>;
}
```

- The Redis implementation issues REST commands via a private `command<T>(command: Array<string | number>)` helper (POST to Upstash, `Authorization: Bearer`). Heartbeat (added recently) is the exemplar for extending all three implementations at once — see `writeHeartbeat`/`readHeartbeat` in the same file and its tests in `src/modules/state/state-store.test.ts`.
- API endpoint conventions: see `apps/tracking-core/api/health/cron-heartbeat.ts` (reads via `trackingHttpHandlers.stateStore`) and `api/dev/windsor-marketing-summary.ts` (auth via `requireTrackingSecret(toHttpRequest(request))`, responses via `send(response, {status, body})`). `trackingHttpHandlers` is exported from `src/index.ts` and exposes `stateStore`.
- Frontend (post-007): modules live in `src/components/dashboard/`; `ModuleFrame` accent `"reports"` exists; sidebar nav items are declared in `src/components/app-sidebar.tsx` (anchor-style `href="#/..."` items, see lines 94–103).
- Vitest is configured; in-memory store tests exemplar: `src/modules/state/state-store.test.ts`.

## Commands you will need

| Purpose   | Command (run in `apps/tracking-core/`) | Expected on success |
|-----------|----------------------------------------|---------------------|
| Typecheck | `npm run check`                        | exit 0              |
| Tests     | `npm test`                             | all pass            |
| Build     | `npm run build`                        | exit 0              |

## Scope

**In scope**:
- `apps/tracking-core/src/types/domain.ts` — `DailyBranchReport` types
- `apps/tracking-core/src/modules/state/state-store.ts` — two new interface methods + 3 implementations
- `apps/tracking-core/src/modules/state/state-store.test.ts` — tests
- `apps/tracking-core/api/reports/daily.ts` (new) — POST/GET endpoint
- `apps/tracking-core/src/components/dashboard/daily-report.tsx` (new) — form + recent-reports list
- `apps/tracking-core/src/components/app-sidebar.tsx` — one nav item
- `apps/tracking-core/src/components/dashboard.tsx` — route wiring
- `plans/README.md`

**Out of scope**:
- Per-lead linkage to Elevator IDs (v2; this version reports daily counts + free-text notes)
- Notifications/reminders to branches
- Editing/deleting submitted reports (append-only in v1)
- Auth scheme changes — reuse the tracking secret

## Steps

### Step 1: Domain types

In `src/types/domain.ts` add:

```ts
export type LeadContactChannel =
  | "llamada"
  | "whatsapp"
  | "google_maps"
  | "email"
  | "visita_directa"
  | "otro";

export interface DailyBranchReport {
  reportId: string;          // `${branch}_${date}` — natural key, one report per branch per day
  branch: string;
  date: string;              // "YYYY-MM-DD"
  submittedAt: string;       // ISO
  contacts: Array<{ channel: LeadContactChannel; count: number }>;
  leadsReceived: number;
  leadsContacted: number;
  followUpsSent: number;
  promoWhatsappSent: number;
  emailsSent: number;
  postsPublished: number;
  notes?: string | null;
}
```

**Verify**: `npm run check` → exit 0.

### Step 2: Extend StateStore (all three implementations)

Add to the interface:

```ts
/** Upsert by reportId (same branch+date overwrites). */
saveDailyReport(report: DailyBranchReport): Promise<void>;
/** Reports with date in [fromDate, toDate] (inclusive, "YYYY-MM-DD"), newest first. */
listDailyReports(fromDate: string, toDate: string): Promise<DailyBranchReport[]>;
```

- **InMemory**: a `Map<string, DailyBranchReport>` keyed by reportId.
- **File**: store under a `dailyReports` object key in the existing JSON blob (mirror how heartbeats were added — see `writeHeartbeat` in the File implementation).
- **Redis**: `HSET <prefix>:daily-reports <reportId> <json>` to save; `HGETALL` then filter by date range in code to list. Reuse the private `command<T>()` helper. (Volume is tiny — a few rows/day — HGETALL is fine for v1.)

**Verify**: `npm run check` → exit 0.

### Step 3: Store tests

In `src/modules/state/state-store.test.ts` add a `describe("daily reports")` block (InMemory store): save+list round-trip; upsert same reportId overwrites; date-range filter excludes out-of-range; newest-first ordering.

**Verify**: `npm test` → all pass.

### Step 4: API endpoint

Create `api/reports/daily.ts`:
- `POST` — body is a `DailyBranchReport` minus `reportId`/`submittedAt` (server derives both). Validate: `branch` non-empty string, `date` matches `/^\d{4}-\d{2}-\d{2}$/`, all counters are integers ≥ 0, `contacts[].channel` in the allowed union. Invalid → 400 with `{error}`. Auth: `requireTrackingSecret` first, like `api/dev/windsor-marketing-summary.ts`.
- `GET` — query `from`/`to` (default: last 30 days), returns `{ok: true, reports: [...]}`.
- Other methods → `methodNotAllowed(response)`.

**Verify**: `npm run check` → exit 0.

### Step 5: Form UI + route

Create `src/components/dashboard/daily-report.tsx` wrapped in `<ModuleFrame accent="reports" title="Reporte diario de sucursal">`:
- Form: branch (text or select), date (default today), numeric inputs for each counter, per-channel contact counts, notes textarea. Use `ui/input.tsx`, `ui/select.tsx`, `ui/button.tsx`.
- Submit → POST with the `x-tracking-secret` header (same header pattern as the existing fetches in `dashboard.tsx`); success → green confirmation + refresh list; failure → show the server's `error` message.
- Below the form: "Últimos reportes" — GET last 30 days, grouped by date, showing branch, leadsReceived/leadsContacted, and a contact-rate percentage.

Wire it: add nav item "Reporte diario" with `href="#/reporte-diario"` in `app-sidebar.tsx` (copy an existing item's structure, lines 94–103) and render the module for that route in `dashboard.tsx`'s route switch.

**Verify**: `npm run build` → exit 0; in `npm run dev`, submit a report and see it listed.

## Test plan

- Store tests per Step 3 (≥4 tests).
- Validation logic: extract the POST-body validator into a pure function (e.g. `validateDailyReportInput` exported from the endpoint file or a small `src/modules/reports/validate.ts`) and unit-test it: valid input passes; bad date, negative counter, unknown channel each rejected.
- `npm test` → all green.

## Done criteria

- [ ] `npm run check`, `npm test`, `npm run build` exit 0
- [ ] All three StateStore implementations compile with the two new methods
- [ ] POST rejects invalid payloads with 400; valid POST then GET round-trips the report
- [ ] Same branch+date POSTed twice yields ONE report (upsert), not two
- [ ] Form accessible from the sidebar; submits and lists without console errors
- [ ] `plans/README.md` updated

## STOP conditions

- `StateStore` interface doesn't match the excerpt (drift).
- `trackingHttpHandlers.stateStore` is not exported/reachable from `api/` files (check `api/health/cron-heartbeat.ts` for the working pattern; if that file's pattern doesn't work for a new file, report).
- Plan 007's module layout (`src/components/dashboard/`, `ModuleFrame`) is absent.
- You find yourself adding an npm dependency — none is needed; report instead.

## Maintenance notes

- Plan 011 consumes `listDailyReports` to aggregate manual effort metrics — keep field names stable.
- v2 candidates (deferred): per-lead status rows linked to Elevator IDs, edit/delete with audit trail, per-branch auth tokens instead of the shared tracking secret, reminder notifications for branches that haven't reported by N pm.
- Review focus: the upsert key (`branch_date`) normalizes branch however the form sends it — reviewer should confirm branch names are trimmed/consistent or reports will fragment ("Centro" vs "centro ").
