# Plan 002: Rate-limited payments are never permanently lost

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 95aa45e..HEAD -- apps/tracking-core/api/cron/payments-sync.ts apps/tracking-core/src/config/app-config.ts`
> If any in-scope file changed, compare "Current state" excerpts against live code before proceeding.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none (plan 001 recommended first but not required)
- **Category**: bug
- **Planned at**: commit `95aa45e`, 2026-06-10

## Why this matters

The production cron runs daily at 05:00 UTC and looks back exactly 30 hours (`Date.now() - 30 * 60 * 60 * 1000`). When Dentalink returns HTTP 429 (rate limit) for a patient lookup, that payment is skipped and NOT marked as processed — correctly. But on the next day's run, the 30-hour window will have advanced, and payments from ≥25 hours ago will fall outside the new window, never to be retried. Revenue is silently lost.

The app config already has `paymentsSyncLookbackMinutes` (default 7 days = 10,080 minutes), and the dedup logic is correct: already-processed payment IDs are stored in Redis and filtered before dispatch. Using the config value instead of the hardcoded 30h means the cron window always covers multiple days, so a rate-limited payment from yesterday is guaranteed to be retried tomorrow.

## Current state

File: `apps/tracking-core/api/cron/payments-sync.ts`

Line 31 (hardcoded 30-hour lookback):
```ts
since: new Date(Date.now() - 30 * 60 * 60 * 1000).toISOString(),
```

File: `apps/tracking-core/src/config/app-config.ts`

Lines 17–26 (configurable lookback exists):
```ts
export function getAppConfig(): AppConfig {
  return {
    highTicketThreshold: getNumberEnv("HIGH_TICKET_THRESHOLD", 50000),
    paymentsSyncLookbackMinutes: getNumberEnv(
      "PAYMENTS_SYNC_LOOKBACK_MINUTES",
      10_080,
    ),
    defaultCurrency: process.env.DEFAULT_CURRENCY ?? "MXN",
  };
}
```

File: `apps/tracking-core/src/app/tracking-app.ts` — `TrackingApp` holds the bootstrapped `appConfig`. The cron handler imports `trackingHttpHandlers` from `src/index.ts`, which in turn creates a `TrackingApp` instance with the config.

The cron handler currently injects `since` directly into the request query (line 29–33 of `api/cron/payments-sync.ts`):
```ts
request.query = {
  ...request.query,
  since: new Date(Date.now() - 30 * 60 * 60 * 1000).toISOString(),
  maxPayments: "50",
};
```

The handler at `src/http/handlers.ts` reads `since` from query params and passes it to `handlePaymentsSync`. The `paymentsSyncLookbackMinutes` config is available on `this.app.appConfig` inside the handler — verify the exact property path by reading `src/app/tracking-app.ts`.

## Commands you will need

| Purpose   | Command                                   | Expected on success       |
|-----------|-------------------------------------------|---------------------------|
| Typecheck | `npm run check` (in `apps/tracking-core`) | exit 0, no errors         |
| Test      | `npm test` (in `apps/tracking-core`)      | exit 0 (requires plan 001)|

## Scope

**In scope**:
- `apps/tracking-core/api/cron/payments-sync.ts` — replace hardcoded 30h with config value

**Out of scope**:
- `src/config/app-config.ts` — do NOT change
- `src/http/handlers.ts` — do NOT change
- `src/routes/payments-sync.ts` — do NOT change
- `vercel.json` — do NOT change

## Git workflow

Branch: `advisor/002-payment-window-recovery`
Commit: `Fix cron lookback window to use configurable value`

## Steps

### Step 1: Read the bootstrap to find the appConfig path

Read `apps/tracking-core/src/app/tracking-app.ts` and `apps/tracking-core/src/index.ts` to understand how `trackingHttpHandlers` is created and how `appConfig` is exposed. Specifically find the property that exposes `paymentsSyncLookbackMinutes`.

**Verify**: You can identify the exact expression to read `paymentsSyncLookbackMinutes` from `trackingHttpHandlers` (e.g., `trackingHttpHandlers.app.appConfig.paymentsSyncLookbackMinutes` or similar). If the property is not publicly accessible, note the path so you can add a getter — but prefer the minimal change.

### Step 2: Replace hardcoded lookback in cron handler

In `apps/tracking-core/api/cron/payments-sync.ts`, replace line 31:

**Before**:
```ts
since: new Date(Date.now() - 30 * 60 * 60 * 1000).toISOString(),
```

**After** (adjust the property path to match what you found in step 1):
```ts
since: new Date(
  Date.now() - trackingHttpHandlers.app.appConfig.paymentsSyncLookbackMinutes * 60 * 1000
).toISOString(),
```

If `appConfig` or `paymentsSyncLookbackMinutes` is not accessible from `trackingHttpHandlers`, add a read-only getter to `TrackingApp` that exposes it. Example:
```ts
// In src/app/tracking-app.ts, add:
get paymentsSyncLookbackMinutes(): number {
  return this.appConfig.paymentsSyncLookbackMinutes;
}
```
Then use `trackingHttpHandlers.app.paymentsSyncLookbackMinutes` in the cron file.

Do NOT restructure the entire config access pattern — one getter is the minimal correct change.

**Verify**: `grep "30 \* 60 \* 60" apps/tracking-core/api/cron/payments-sync.ts` → no output (hardcoded value is gone).

### Step 3: Typecheck

**Verify**: `npm run check` (from `apps/tracking-core`) → exit 0, no errors.

### Step 4: Manual spot-check

Read the changed cron file and confirm:
- The `since` value is computed from `paymentsSyncLookbackMinutes * 60 * 1000` (minutes to milliseconds)
- The default of 10,080 minutes = 7 days (10080 × 60 × 1000 ms = 604,800,000 ms = 7 days). Verify: `node -e "console.log(10080 * 60 * 1000 / (1000*60*60*24))"` → `7`
- `maxPayments: "50"` is unchanged

**Verify**: output of the node command above is `7`.

## Test plan

After plan 001 is done, add one test to `src/config/app-config.test.ts` (create if it doesn't exist):
- `getAppConfig()` with `PAYMENTS_SYNC_LOOKBACK_MINUTES=60` env var set → `paymentsSyncLookbackMinutes` is `60`
- `getAppConfig()` with no env var → `paymentsSyncLookbackMinutes` is `10080`

No test for the cron handler itself (it's an integration point — the behavior is implicit in the config value being used).

## Done criteria

- [ ] `grep "30 \* 60 \* 60" apps/tracking-core/api/cron/payments-sync.ts` returns no matches
- [ ] `npm run check` exits 0
- [ ] The cron `since` computation uses `paymentsSyncLookbackMinutes` from app config (verified by reading the file)
- [ ] No files outside the in-scope list are modified
- [ ] `plans/README.md` status row updated to DONE

## STOP conditions

- `appConfig.paymentsSyncLookbackMinutes` is not accessible without a significant refactor (more than adding one getter) — stop and report the access path needed.
- The typecheck fails in a file not in scope — stop and report.

## Maintenance notes

- `PAYMENTS_SYNC_LOOKBACK_MINUTES` can be set in Vercel env to override the 7-day default. For example, `PAYMENTS_SYNC_LOOKBACK_MINUTES=2880` (2 days) if Dentalink's API is slow with large windows.
- If `maxPayments` is increased beyond 50, revisit the Dentalink rate-limit tolerance — more payments per run means more `getPatient` calls.
- The real fix for rate-limited payments at scale is a retry queue (dead-letter store in Redis); this plan unblocks recovery with the minimal change.
