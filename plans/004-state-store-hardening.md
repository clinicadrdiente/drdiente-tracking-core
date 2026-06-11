# Plan 004: State store is safe against races and misconfiguration in Vercel

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 95aa45e..HEAD -- apps/tracking-core/src/modules/state/state-store.ts apps/tracking-core/src/modules/state/config.ts`
> If any in-scope file changed, compare "Current state" excerpts against live code before proceeding.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: plan 001 (for verification)
- **Category**: bug / security
- **Planned at**: commit `95aa45e`, 2026-06-10

## Why this matters

Two distinct problems:

**Problem A — Vercel misconfiguration guard**: In production on Vercel, `FileStateStore` writes to an ephemeral `/tmp` directory. The state is lost on every cold start, meaning dedup IDs are lost and the same payment can be dispatched to Stape multiple times (inflated ROAS). The code silently falls back to file mode if Redis env vars are missing (`state-store.ts:92-98`). There is no runtime warning. A developer who copies `.env.example` and forgets to set Redis will silently run in a broken state on Vercel.

**Problem B — Redis check-then-act race**: `hasProcessedPayment(key)` (SISMEMBER) and `markPaymentProcessed(key)` (SADD) are two separate Redis calls. If the dashboard triggers a manual sync while the cron is running, both can see `SISMEMBER → 0` (not processed), both pass the check, and both dispatch the purchase event to Stape. The fix is to use SADD's return value atomically: SADD returns `1` if the key was newly added (claim it) or `0` if it already existed. No separate check needed.

## Current state

File: `apps/tracking-core/src/modules/state/config.ts` (full file):
```ts
export type StateStoreMode = "memory" | "file" | "redis";

export function getStateStoreConfig(): StateStoreConfig {
  const redisRestUrl = process.env.UPSTASH_REDIS_REST_URL;
  const redisRestToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  const requestedMode = process.env.STATE_STORE_MODE;
  const mode =
    requestedMode === "redis" && redisRestUrl && redisRestToken
      ? "redis"
      : requestedMode === "memory"
        ? "memory"
        : "file";   // <-- silently falls back to file
  ...
}
```

File: `apps/tracking-core/src/modules/state/state-store.ts`, `RedisStateStore`:

```ts
// line 143-149: non-atomic check
async hasProcessedPayment(paymentId: string): Promise<boolean> {
  const result = await this.command<number>([
    "SISMEMBER",
    this.processedSetKey,
    paymentId,
  ]);
  return result === 1;
}

// line 152-154: separate write
async markPaymentProcessed(paymentId: string): Promise<void> {
  await this.command(["SADD", this.processedSetKey, paymentId]);
}
```

The `StateStore` interface (lines 10–15):
```ts
export interface StateStore {
  getPaymentSyncState(): Promise<PaymentSyncState>;
  savePaymentSyncState(state: PaymentSyncState): Promise<void>;
  hasProcessedPayment(paymentId: string): Promise<boolean>;
  markPaymentProcessed(paymentId: string): Promise<void>;
}
```

The caller in `src/routes/payments-sync.ts` (lines 80–87):
```ts
const alreadyCounted =
  !payment.isVoided &&
  (await stateStore.hasProcessedPayment(purchaseDedupeKey));

if (alreadyCounted) {
  skippedDuplicateBudget += 1;
  continue;
}
// ... then later:
await stateStore.markPaymentProcessed(purchaseDedupeKey);
```

## Commands you will need

| Purpose   | Command                                   | Expected on success       |
|-----------|-------------------------------------------|---------------------------|
| Typecheck | `npm run check` (in `apps/tracking-core`) | exit 0, no errors         |
| Test      | `npm test` (in `apps/tracking-core`)      | exit 0 (requires plan 001)|

## Scope

**In scope**:
- `apps/tracking-core/src/modules/state/state-store.ts`
- `apps/tracking-core/src/modules/state/config.ts`
- `apps/tracking-core/src/routes/payments-sync.ts` — caller change for atomic SADD (minimal)
- `apps/tracking-core/.env.example` — add warning comment only

**Out of scope**:
- `src/http/handlers.ts` — do NOT change
- `api/` directory — do NOT change
- `InMemoryStateStore` — do NOT change its logic
- `FileStateStore` — do NOT change its logic (it's fine for local dev)

## Git workflow

Branch: `advisor/004-state-store-hardening`
Commit A: `Add Vercel/file-mode guard in state store config`
Commit B: `Make Redis dedup atomic with SADD claim pattern`

## Steps

### Step 1: Add Vercel guard in state store config

In `apps/tracking-core/src/modules/state/config.ts`, modify `getStateStoreConfig()` to throw if running on Vercel with file mode:

```ts
export function getStateStoreConfig(): StateStoreConfig {
  const redisRestUrl = process.env.UPSTASH_REDIS_REST_URL;
  const redisRestToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  const requestedMode = process.env.STATE_STORE_MODE;
  const mode =
    requestedMode === "redis" && redisRestUrl && redisRestToken
      ? "redis"
      : requestedMode === "memory"
        ? "memory"
        : "file";

  if (process.env.VERCEL === "1" && mode === "file") {
    throw new Error(
      "STATE_STORE_MODE=file is not safe on Vercel (ephemeral /tmp). " +
      "Set STATE_STORE_MODE=redis and configure UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN.",
    );
  }

  return {
    mode,
    filePath: process.env.STATE_STORE_FILE_PATH ?? ".runtime/payment-sync-state.json",
    redisRestUrl,
    redisRestToken,
    redisKeyPrefix: process.env.STATE_STORE_REDIS_KEY_PREFIX ?? "drdiente:tracking",
  };
}
```

**Verify**: `npm run check` (from `apps/tracking-core`) → exit 0.

### Step 2: Add `.env.example` warning comment

In `apps/tracking-core/.env.example`, find the line with `STATE_STORE_MODE=` and add a comment above it:

```
# PRODUCTION: use STATE_STORE_MODE=redis on Vercel. file mode loses state on cold start.
STATE_STORE_MODE=file
```

**Verify**: `grep -A1 "STATE_STORE_MODE" apps/tracking-core/.env.example` → shows the warning comment above the value.

### Step 3: Make Redis dedup atomic

The goal: replace the two-call `SISMEMBER` + `SADD` pattern with a single `SADD` that both checks and claims atomically. SADD returns the number of NEW elements added: `1` = newly added (this invocation claimed it), `0` = already existed (someone else already claimed it).

**Change the `StateStore` interface** in `state-store.ts` to add a new method:

```ts
export interface StateStore {
  getPaymentSyncState(): Promise<PaymentSyncState>;
  savePaymentSyncState(state: PaymentSyncState): Promise<void>;
  hasProcessedPayment(paymentId: string): Promise<boolean>;
  markPaymentProcessed(paymentId: string): Promise<void>;
  /** Atomically marks as processed. Returns true if this call claimed it (first time), false if already existed. */
  claimPaymentProcessed(paymentId: string): Promise<boolean>;
}
```

**Implement `claimPaymentProcessed` in each store**:

`InMemoryStateStore`:
```ts
async claimPaymentProcessed(paymentId: string): Promise<boolean> {
  if (this.paymentSyncState.processedPaymentIds.includes(paymentId)) {
    return false;
  }
  this.paymentSyncState.processedPaymentIds.push(paymentId);
  return true;
}
```

`FileStateStore`:
```ts
async claimPaymentProcessed(paymentId: string): Promise<boolean> {
  const state = await this.readState();
  if (state.processedPaymentIds.includes(paymentId)) {
    return false;
  }
  state.processedPaymentIds.push(paymentId);
  await this.writeState(state);
  return true;
}
```

`RedisStateStore`:
```ts
async claimPaymentProcessed(paymentId: string): Promise<boolean> {
  const added = await this.command<number>(["SADD", this.processedSetKey, paymentId]);
  return added === 1;
}
```

**Verify**: `npm run check` → exit 0 (TypeScript will error if any store doesn't implement the interface).

### Step 4: Update the caller in payments-sync.ts

In `apps/tracking-core/src/routes/payments-sync.ts`, replace the two-step check-then-act pattern:

**Before** (lines 80–96):
```ts
const alreadyCounted =
  !payment.isVoided &&
  (await stateStore.hasProcessedPayment(purchaseDedupeKey));

if (alreadyCounted) {
  skippedDuplicateBudget += 1;
  continue;
}

// ... build event ...

await elevatorClient.updateLeadStage(lead.elevatorId, "anticipo_pagado");
await stapeClient.dispatch(event);
if (!payment.isVoided) {
  await stateStore.markPaymentProcessed(purchaseDedupeKey);
}
dispatched += 1;
```

**After**:
```ts
if (!payment.isVoided) {
  const claimed = await stateStore.claimPaymentProcessed(purchaseDedupeKey);
  if (!claimed) {
    skippedDuplicateBudget += 1;
    continue;
  }
}

// ... build event ...

await elevatorClient.updateLeadStage(lead.elevatorId, "anticipo_pagado");
await stapeClient.dispatch(event);
dispatched += 1;
```

Note: for voided payments (`payment.isVoided === true`), the original code skipped the dedup check and always dispatched. Preserve that behavior — voided payments always dispatch as corrections.

Also remove the now-unused `hasProcessedPayment` and `markPaymentProcessed` calls for `purchaseDedupeKey` from this section (those methods still exist on the interface and are used by `filterUnprocessedPayments` which operates on `payment_{id}` keys — do NOT remove them from the interface).

**Verify**: `npm run check` → exit 0.

### Step 5: Full test run

**Verify**: `npm test` → exit 0, all existing tests still pass.

## Test plan

After plan 001 is done, extend `src/modules/state/payment-sync.test.ts`:

Test: "claimPaymentProcessed is atomic — second claim returns false"
```ts
it("claimPaymentProcessed returns true on first call, false on second", async () => {
  const store = new InMemoryStateStore();
  const first = await store.claimPaymentProcessed("treatment_42");
  const second = await store.claimPaymentProcessed("treatment_42");
  expect(first).toBe(true);
  expect(second).toBe(false);
});
```

This test documents the invariant. The Redis version's atomicity is guaranteed by the SADD semantics.

## Done criteria

- [ ] `grep "hasProcessedPayment\|markPaymentProcessed" apps/tracking-core/src/routes/payments-sync.ts` — the `purchaseDedupeKey` section uses neither (only `claimPaymentProcessed`)
- [ ] `grep "VERCEL" apps/tracking-core/src/modules/state/config.ts` → shows the guard
- [ ] `npm run check` exits 0
- [ ] `npm test` exits 0
- [ ] All three store classes (`InMemoryStateStore`, `FileStateStore`, `RedisStateStore`) implement `claimPaymentProcessed`
- [ ] No files outside the in-scope list are modified
- [ ] `plans/README.md` status row updated to DONE

## STOP conditions

- The `StateStore` interface is implemented in a file not listed in scope — stop and report.
- `claimPaymentProcessed` in `FileStateStore` requires file locking to be safe (concurrent processes) — note this in the PR but don't add locking here; that's a separate concern. The improvement over the old two-call pattern is marginal for file mode; the real win is Redis.
- Any typecheck error in a file not in scope.

## Maintenance notes

- `hasProcessedPayment` and `markPaymentProcessed` remain on the interface — they're used by `filterUnprocessedPayments` / `markPaymentsProcessed` for `payment_{id}` keys. Don't remove them.
- If `FileStateStore` concurrent access ever becomes a real concern (unlikely in production — production uses Redis), add a lock file or migrate to SQLite.
- The Vercel guard throws on bootstrap, which is the right behavior: fail loudly at startup rather than silently losing data at runtime.
