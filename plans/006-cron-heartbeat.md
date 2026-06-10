# Plan 006: Cron failures are visible — heartbeat endpoint and dashboard warning

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 95aa45e..HEAD -- apps/tracking-core/api/cron/payments-sync.ts apps/tracking-core/api/health.ts apps/tracking-core/src/modules/state/state-store.ts`
> If any in-scope file changed, compare "Current state" excerpts before proceeding.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW
- **Depends on**: plan 004 (claimPaymentProcessed interface) — must be done first if plan 004 is executed
- **Category**: direction / observability
- **Planned at**: commit `95aa45e`, 2026-06-10

## Why this matters

The cron runs daily at 05:00 UTC and is the only mechanism that syncs payments to Stape. If it silently fails (unhandled exception, Vercel timeout, Redis down), no revenue events are dispatched until someone notices that ROAS in Meta/Google hasn't changed in days. Today there is no way to know the cron ran — no log aggregator is wired, no dashboard indicator, no alert.

This plan adds a heartbeat: after every successful cron run, the timestamp is written to Redis. A new `/api/health/cron-heartbeat` endpoint reads it and returns `ok` or `stale` (with age). The existing dashboard reads this on page load and shows a yellow warning if the cron hasn't run in the last 30 hours.

No external alerting service is required — everything uses the Redis instance already in production.

## Current state

File: `apps/tracking-core/api/cron/payments-sync.ts`

Lines 36–39 (cron handler — result is sent but nothing is persisted as heartbeat):
```ts
const result = await trackingHttpHandlers.postPaymentsSync(
  toHttpRequest(request),
);
send(response, result);
```

File: `apps/tracking-core/api/health.ts`

Exists as a simple health check. Read it before editing — model the new endpoint similarly.

File: `apps/tracking-core/src/modules/state/state-store.ts`

`RedisStateStore` has a `command<T>()` private method that wraps Upstash REST calls. The new heartbeat key will be a simple Redis `SET key value EX ttl` call.

File: `apps/tracking-core/src/modules/state/state-store.ts` — `StateStore` interface (lines 10–15):
```ts
export interface StateStore {
  getPaymentSyncState(): Promise<PaymentSyncState>;
  savePaymentSyncState(state: PaymentSyncState): Promise<void>;
  hasProcessedPayment(paymentId: string): Promise<boolean>;
  markPaymentProcessed(paymentId: string): Promise<void>;
}
```

File: `apps/tracking-core/src/app/tracking-app.ts` — `TrackingApp` holds `stateStore`. The cron calls `trackingHttpHandlers.postPaymentsSync` which calls `this.app.handlePaymentsSync`. The heartbeat write should happen after a successful response from the handler.

## Commands you will need

| Purpose   | Command                                   | Expected on success |
|-----------|-------------------------------------------|---------------------|
| Typecheck | `npm run check` (in `apps/tracking-core`) | exit 0, no errors   |
| Test      | `npm test` (in `apps/tracking-core`)      | exit 0              |

## Scope

**In scope**:
- `apps/tracking-core/src/modules/state/state-store.ts` — add `writeHeartbeat` / `readHeartbeat` methods to interface + implementations
- `apps/tracking-core/api/cron/payments-sync.ts` — write heartbeat after successful sync
- `apps/tracking-core/api/health/cron-heartbeat.ts` (create new file)
- `apps/tracking-core/src/components/dashboard.tsx` — add stale-cron indicator (minimal, 1 UI element)

**Out of scope**:
- Slack/email/webhook alerting — add externally if desired
- `src/http/handlers.ts` — do NOT change
- `src/routes/payments-sync.ts` — do NOT change

## Git workflow

Branch: `advisor/006-cron-heartbeat`
Commit A: `Add heartbeat read/write to StateStore`
Commit B: `Write cron heartbeat after successful sync`
Commit C: `Add /api/health/cron-heartbeat endpoint`
Commit D: `Show cron staleness warning in dashboard`

## Steps

### Step 1: Add heartbeat methods to StateStore interface and implementations

In `apps/tracking-core/src/modules/state/state-store.ts`, add to the `StateStore` interface:

```ts
export interface StateStore {
  // existing methods...
  writeHeartbeat(key: string, isoTimestamp: string): Promise<void>;
  readHeartbeat(key: string): Promise<string | null>;
}
```

**`InMemoryStateStore`** — add a `Map` for heartbeats:
```ts
private heartbeats: Map<string, string> = new Map();

async writeHeartbeat(key: string, isoTimestamp: string): Promise<void> {
  this.heartbeats.set(key, isoTimestamp);
}

async readHeartbeat(key: string): Promise<string | null> {
  return this.heartbeats.get(key) ?? null;
}
```

**`FileStateStore`** — store in the same JSON file under a `heartbeats` key:
```ts
async writeHeartbeat(key: string, isoTimestamp: string): Promise<void> {
  const state = await this.readState();
  (state as any).heartbeats = { ...((state as any).heartbeats ?? {}), [key]: isoTimestamp };
  await this.writeState(state as any);
}

async readHeartbeat(key: string): Promise<string | null> {
  const state = await this.readState() as any;
  return state.heartbeats?.[key] ?? null;
}
```

**`RedisStateStore`** — use Redis `SET` with a 48-hour TTL (safety net in case cron stops):
```ts
async writeHeartbeat(key: string, isoTimestamp: string): Promise<void> {
  const fullKey = `${this.stateKey}:heartbeat:${key}`;
  await this.command(["SET", fullKey, isoTimestamp, "EX", 172800]); // 48h TTL
}

async readHeartbeat(key: string): Promise<string | null> {
  const fullKey = `${this.stateKey}:heartbeat:${key}`;
  return await this.command<string | null>(["GET", fullKey]);
}
```

**Verify**: `npm run check` → exit 0. TypeScript will error if any class doesn't implement the two new methods.

### Step 2: Write heartbeat after successful cron run

In `apps/tracking-core/api/cron/payments-sync.ts`, after a successful response:

Read the file first to understand the current structure. Then after the `send(response, result)` call (or just before it), add:

```ts
// Write heartbeat so /api/health/cron-heartbeat can report freshness
try {
  await trackingHttpHandlers.app.stateStore.writeHeartbeat(
    "payments-sync-cron",
    new Date().toISOString(),
  );
} catch {
  // Heartbeat failure must not fail the cron response
}
```

Check whether `stateStore` is accessible via `trackingHttpHandlers.app.stateStore`. If not, add a getter to `TrackingApp`:
```ts
// In src/app/tracking-app.ts:
get stateStore(): StateStore {
  return this._stateStore; // use whatever the private field name is
}
```

Read `src/app/tracking-app.ts` to find the actual private field name before adding the getter.

**Verify**: `npm run check` → exit 0.

### Step 3: Create /api/health/cron-heartbeat endpoint

Create `apps/tracking-core/api/health/cron-heartbeat.ts`:

```ts
import { trackingHttpHandlers } from "../../src/index.js";
import {
  send,
  type VercelRequest,
  type VercelResponse,
} from "../_lib/http.js";

const HEARTBEAT_KEY = "payments-sync-cron";
const STALE_AFTER_HOURS = 30;

export default async function handler(
  _request: VercelRequest,
  response: VercelResponse,
): Promise<void> {
  const lastRan = await trackingHttpHandlers.app.stateStore.readHeartbeat(HEARTBEAT_KEY);

  if (!lastRan) {
    send(response, {
      status: "unknown",
      message: "No heartbeat recorded yet. Cron has not run or heartbeat was not written.",
      lastRan: null,
      staleAfterHours: STALE_AFTER_HOURS,
    });
    return;
  }

  const lastRanDate = new Date(lastRan);
  const ageHours = (Date.now() - lastRanDate.getTime()) / (1000 * 60 * 60);
  const isStale = ageHours > STALE_AFTER_HOURS;

  send(response, {
    status: isStale ? "stale" : "ok",
    lastRan,
    ageHours: Math.round(ageHours * 10) / 10,
    staleAfterHours: STALE_AFTER_HOURS,
  });
}
```

Note: this endpoint is public (no auth) — it exposes no PII, only a timestamp.

**Verify**: `npm run check` → exit 0.

### Step 4: Add staleness indicator to dashboard

Read `apps/tracking-core/src/components/dashboard.tsx` to find where the system status section is rendered (search for "health", "status", or the integrations status block). Add a small indicator that fetches `/api/health/cron-heartbeat` and shows a warning if `status === "stale"` or `status === "unknown"`.

Keep the change minimal — add one `useEffect` that fetches the heartbeat on mount and one status chip/badge in the "Estado operativo" or integrations section. The dashboard already has many similar patterns to copy.

Pattern to follow: look at an existing `useEffect + fetch("/api/...")` block in `dashboard.tsx` and replicate the shape exactly. Do not create a new component file for this.

**Verify**: `npm run check` → exit 0.

### Step 5: Full typecheck and test

**Verify**: `npm run check` → exit 0.
**Verify**: `npm test` → exit 0, all tests pass.

## Test plan

After plan 001, add to `src/modules/state/payment-sync.test.ts` (or a new `state-store.test.ts`):

Test: "InMemoryStateStore heartbeat write/read round-trips"
```ts
it("writeHeartbeat and readHeartbeat round-trip", async () => {
  const store = new InMemoryStateStore();
  await store.writeHeartbeat("my-cron", "2026-06-10T05:00:00.000Z");
  const result = await store.readHeartbeat("my-cron");
  expect(result).toBe("2026-06-10T05:00:00.000Z");
});

it("readHeartbeat returns null for unknown key", async () => {
  const store = new InMemoryStateStore();
  const result = await store.readHeartbeat("does-not-exist");
  expect(result).toBeNull();
});
```

## Done criteria

- [ ] `curl -s http://localhost:3000/api/health/cron-heartbeat` (or Vercel preview URL) returns JSON with a `status` field
- [ ] `npm run check` exits 0
- [ ] `npm test` exits 0
- [ ] `grep -n "writeHeartbeat\|readHeartbeat" apps/tracking-core/src/modules/state/state-store.ts` → shows implementation in all 3 classes
- [ ] `grep -n "writeHeartbeat" apps/tracking-core/api/cron/payments-sync.ts` → shows the heartbeat write
- [ ] `apps/tracking-core/api/health/cron-heartbeat.ts` exists
- [ ] No files outside the in-scope list are modified
- [ ] `plans/README.md` status row updated to DONE

## STOP conditions

- `stateStore` is not accessible from `trackingHttpHandlers` without a significant refactor (more than 1 getter) — stop and report.
- The `FileStateStore` JSON shape doesn't support arbitrary extra keys cleanly — stop and consider using a separate heartbeat key in the file JSON, or skip file-mode implementation and return `null` from `readHeartbeat` for file mode.
- The dashboard `useEffect` pattern requires context not visible from reading the file (e.g., a custom data-fetching hook) — match the existing pattern, don't invent a new one.

## Maintenance notes

- The 48h Redis TTL is a safety net: if the cron is intentionally disabled for >2 days, the heartbeat disappears and the endpoint returns "unknown". That's the correct alert behavior.
- If a log aggregator (Axiom, Sentry, Datadog) is added later, also emit a log event from the cron on success/failure — the heartbeat is a pull-based check, not push-based alerting.
- Future: add `PAYMENTS_SYNC_CRON_ALERT_WEBHOOK_URL` env var and POST to it when the heartbeat is stale. Not in scope here.
