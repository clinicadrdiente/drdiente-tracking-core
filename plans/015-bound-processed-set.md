# Plan 015: The processed-payment dedupe store stays bounded and cheap

> **Executor instructions**: Follow step by step. Run every verification command
> and confirm the result before moving on. On any "STOP condition", stop and
> report. When done, update this plan's row in `plans/README.md`.
>
> **Drift check (run first)**: from `apps/tracking-core/`, run
> `git diff --stat ffad029..HEAD -- src/routes/payments-sync.ts src/modules/state/state-store.ts`
> If either changed, compare the "Current state" excerpts to the live code; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: plans/012-purchase-claim-release.md (changes the same Redis dedupe methods;
  do 012, then 014, then this)
- **Category**: perf
- **Planned at**: commit `ffad029`, 2026-06-17

## Why this matters

The `RedisStateStore` keeps every processed dedupe key forever in a single Redis set, and the
sync **re-reads the entire set and re-writes it every run**. Two costs grow without bound:

1. **Redundant full re-save**: after each sync, `payments-sync.ts` reads the whole set with
   `getPaymentSyncState()` (a Redis `SMEMBERS`) and writes it all back with
   `savePaymentSyncState()` (a Redis `SADD` of every id). The per-key claim already persists
   each id, so this whole-set round-trip is pure waste and grows linearly forever.
2. **Unbounded set**: keys are never expired. Since the sync only looks back
   `PAYMENTS_SYNC_LOOKBACK_MINUTES` (default `10080` = 7 days), any key older than the lookback
   window will never be checked again, yet it lives in Redis indefinitely.

This plan removes the redundant re-save and gives processed keys a TTL so the store
self-prunes. The in-memory/file stores keep their array (memory resets each invocation; file
is dev-only) — only Redis (the production store) changes shape.

## Current state

- `src/routes/payments-sync.ts:136-142` — the redundant re-save:
  ```ts
  await markPaymentsProcessed(stateStore, safeToMarkProcessed);
  await stateStore.savePaymentSyncState({
    lastCheckIso: new Date().toISOString(),
    processedPaymentIds: (
      await stateStore.getPaymentSyncState()
    ).processedPaymentIds,   // <-- reads the whole set just to write it back
  });
  ```

- `src/modules/state/state-store.ts` — the Redis dedupe methods use one set
  (`this.processedSetKey`):
  ```ts
  // 336-352 (current)
  async hasProcessedPayment(paymentId: string): Promise<boolean> {
    const result = await this.command<number>(["SISMEMBER", this.processedSetKey, paymentId]);
    return result === 1;
  }
  async markPaymentProcessed(paymentId: string): Promise<void> {
    await this.command(["SADD", this.processedSetKey, paymentId]);
  }
  async claimPaymentProcessed(paymentId: string): Promise<boolean> {
    const added = await this.command<number>(["SADD", this.processedSetKey, paymentId]);
    return added === 1;
  }
  // releasePaymentClaim (added by plan 012): SREM this.processedSetKey paymentId
  ```
  `savePaymentSyncState` (323-334) writes `lastCheckIso` AND `SADD`s every id again:
  ```ts
  async savePaymentSyncState(state: PaymentSyncState): Promise<void> {
    const payload = JSON.stringify({ lastCheckIso: state.lastCheckIso });
    await this.command(["SET", this.stateKey, payload]);
    if (state.processedPaymentIds.length > 0) {
      await this.command(["SADD", this.processedSetKey, ...state.processedPaymentIds]);
    }
  }
  ```
  `getPaymentSyncState` (308-321) reads `SMEMBERS this.processedSetKey` — used by
  `TrackingApp.getStatus()` to report `processedPaymentCount` and by `syncPayments` for
  `lastCheckIso`.

- Reference for TTL usage already in the file (contact-source keys use per-key TTL):
  ```ts
  // 379-382
  async setContactLeadSource(contact, source) {
    const key = `${this.stateKey}:contact-source:${contact}`;
    await this.command(["SET", key, source, "EX", 7776000]); // 90 days
  }
  ```

### Conventions

- Reuse the existing `this.command([...])` Upstash REST helper; do not add a new client.
- TTL value: derive from the lookback window with a safety margin. Use a constant:
  `2 × PAYMENTS_SYNC_LOOKBACK_MINUTES × 60` seconds, with a floor of 7 days. Read the lookback
  from `getAppConfig().paymentsSyncLookbackMinutes` (`src/config/app-config.ts`).

## Commands you will need

| Purpose   | Command (from `apps/tracking-core/`) | Expected            |
|-----------|--------------------------------------|---------------------|
| Install   | `npm ci`                             | exit 0              |
| Typecheck | `npm run check`                      | exit 0, no errors   |
| Tests     | `npm test`                           | all pass            |
| Build     | `npm run build`                      | exit 0              |

## Scope

**In scope**:
- `src/routes/payments-sync.ts` (remove the redundant whole-set re-save)
- `src/modules/state/state-store.ts` (Redis dedupe → per-key TTL strings)
- `src/modules/state/state-store.test.ts` (add coverage for the new Redis behavior using a
  fake `fetchImpl`)

**Out of scope**:
- `InMemoryStateStore` / `FileStateStore` dedupe storage — leave as arrays.
- `getPaymentSyncState`'s `lastCheckIso` handling and the daily-reports / patient-treatments
  / contact-source code — do not touch.
- The `processedPaymentCount` field in `getStatus()` — see Step 3 for how to keep it working.

## Git workflow

- Branch: `advisor/015-bound-processed-set`
- Conventional commit(s): `perf: stop re-saving the whole processed set each sync` and
  `perf: expire processed dedupe keys via TTL`.
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1 (safe, do first): Remove the redundant whole-set re-save

In `src/routes/payments-sync.ts`, replace the `savePaymentSyncState` block (lines 137-142)
with one that only persists the cursor:

```ts
await markPaymentsProcessed(stateStore, safeToMarkProcessed);
await stateStore.savePaymentSyncState({
  lastCheckIso: new Date().toISOString(),
  processedPaymentIds: [],   // ids are already persisted per-key by claim/mark
});
```

Then make `RedisStateStore.savePaymentSyncState` ignore an empty `processedPaymentIds` (it
already guards `length > 0`, so passing `[]` is a no-op SADD — confirm by reading lines
327-333). Keep the `lastCheckIso` SET.

**Verify**: `npm run check` → exit 0; `npm test` → all pass. This step alone is a safe,
shippable win. If Step 2 proves risky, you may stop here and report (note it in the README row).

### Step 2: Give Redis processed keys a TTL

Switch the Redis dedupe from one set to per-key TTL strings. Add a TTL helper and a key
builder to `RedisStateStore`, and rewrite the four dedupe methods:

```ts
private processedKey(id: string): string {
  return `${this.processedSetKey}:k:${id}`;
}
private processedTtlSeconds(): number {
  const lookbackSec = getAppConfig().paymentsSyncLookbackMinutes * 60;
  return Math.max(7 * 24 * 60 * 60, lookbackSec * 2);
}

async hasProcessedPayment(paymentId: string): Promise<boolean> {
  const r = await this.command<number>(["EXISTS", this.processedKey(paymentId)]);
  return r === 1;
}
async markPaymentProcessed(paymentId: string): Promise<void> {
  await this.command(["SET", this.processedKey(paymentId), "1", "EX", this.processedTtlSeconds()]);
}
async claimPaymentProcessed(paymentId: string): Promise<boolean> {
  // SET NX returns "OK" when it set the key, null when it already existed.
  const r = await this.command<string | null>(
    ["SET", this.processedKey(paymentId), "1", "NX", "EX", this.processedTtlSeconds()],
  );
  return r === "OK";
}
async releasePaymentClaim(paymentId: string): Promise<void> {
  await this.command(["DEL", this.processedKey(paymentId)]);
}
```

Add the import: `import { getAppConfig } from "../../config/app-config.js";` (verify the
relative path resolves from `src/modules/state/`).

**`getPaymentSyncState` / `processedPaymentCount`**: with per-key storage there is no cheap
"count all" via `SMEMBERS`. Change `getPaymentSyncState` to return `processedPaymentIds: []`
(the cursor is what matters) and update `getStatus()` in `src/app/tracking-app.ts` ONLY IF
`npm run check` flags a type/logic break — prefer reporting `processedPaymentCount: 0` with a
code comment "count not tracked under TTL storage" over scanning keys. Do **not** introduce a
Redis `KEYS`/`SCAN` over the keyspace (expensive, blocks Redis).

**Verify**: `npm run check` → exit 0.

### Step 3: Tests for the Redis behavior

`RedisStateStore`'s constructor accepts an injectable `fetchImpl` (4th arg). In
`src/modules/state/state-store.test.ts`, add a `describe("RedisStateStore dedupe")` block with
a fake `fetchImpl` that records the command arrays it receives and returns scripted Upstash
`{ result }` payloads. Assert:
1. `claimPaymentProcessed` issues a `SET ... NX EX` and returns `true` when the fake returns
   `{ result: "OK" }`, `false` when it returns `{ result: null }`.
2. `releasePaymentClaim` issues a `DEL`.
3. After Step 1's change, a sync-style `savePaymentSyncState({ lastCheckIso, processedPaymentIds: [] })`
   issues exactly one `SET` for the cursor and **no** `SADD`.

**Verify**: `npm test` → all pass.

## Test plan

- New Redis-dedupe tests as above (fake `fetchImpl`, assert emitted commands).
- Keep existing InMemory/File tests green (their storage is unchanged).
- Verification: `npm test` → all pass.

## Done criteria

ALL must hold (from `apps/tracking-core/`):

- [ ] `npm run check` exits 0
- [ ] `npm test` exits 0; new Redis-dedupe tests pass
- [ ] `npm run build` exits 0
- [ ] `grep -n "SMEMBERS" src/modules/state/state-store.ts` shows it is no longer used for the
      processed-payment dedupe (only — daily-report/patient-treatment SMEMBERS may remain)
- [ ] `grep -n "processedPaymentIds: (" src/routes/payments-sync.ts` returns nothing (redundant re-read removed)
- [ ] `git status` shows only the in-scope files
- [ ] `plans/README.md` status row for 015 updated

## STOP conditions

Stop and report if:
- Plan 012's `releasePaymentClaim` is not present (do 012 first).
- `getPaymentSyncState`'s `processedPaymentIds` is consumed somewhere that genuinely needs the
  full list (`grep -rn "processedPaymentIds" src`) beyond `lastCheckIso` and the status count.
  If so, STOP — switching to TTL keys would break that consumer.
- The Upstash `SET ... NX` return contract in this codebase differs from `"OK"`/`null`
  (check how `command` unwraps `body.result`).
- Any verification fails twice after a reasonable fix. Step 1 alone is an acceptable
  partial-ship; record that in the README.

## Maintenance notes

- TTL must always exceed the lookback window, or a still-relevant payment could expire and be
  re-dispatched. The `Math.max(7d, lookback×2)` floor guards this; if the lookback is ever
  raised above ~3.5 days, the TTL scales with it.
- Appointment idempotency keys (plan 014) use the same `claimPaymentProcessed` path, so they
  inherit this TTL — that is fine (a re-sent appointment after >7 days is effectively new).
- Reviewer: confirm no `KEYS`/`SCAN` was introduced and `getStatus()` still returns without
  error.
