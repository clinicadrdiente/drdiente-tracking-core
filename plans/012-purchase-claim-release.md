# Plan 012: A purchase event is never permanently lost when dispatch fails

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: from `apps/tracking-core/`, run
> `git diff --stat ffad029..HEAD -- src/routes/payments-sync.ts src/modules/state/state-store.ts src/modules/state/payment-sync.ts`
> If any of those files changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: plans/001-tests-ci.md (test runner must exist) — DONE
- **Category**: bug
- **Planned at**: commit `ffad029`, 2026-06-17

## Why this matters

The payment sync fires the "Purchase" conversion event to Stape (and optionally the
Elevator events webhook) — this is the core revenue signal the whole system exists to
produce. Today, when **both** dispatch targets fail transiently (network blip, Stape
5xx), the conversion is **lost forever**, not retried. The result is silent ROAS
undercounting: real high-ticket purchases never reach Meta/Google/TikTok.

Root cause: the code claims the per-treatment dedupe key **before** dispatching, but on
total dispatch failure it `continue`s without releasing that claim. The payment row stays
unmarked (so it is re-fetched next sync), but the dedupe key is already claimed, so the
next sync sees it as "already processed" and skips the dispatch permanently.

## Current state

Three files are involved. All paths are under `apps/tracking-core/`.

- `src/modules/state/payment-sync.ts` — payment-level dedupe keys. Two namespaces exist:
  payment rows are tracked as `payment_<paymentId>`; purchase firing is gated on a
  separate `treatment_<treatmentId>` (or `payment_<paymentId>`) key claimed in the route.

  ```ts
  // src/modules/state/payment-sync.ts:4-6
  function toPaymentKey(payment: PaymentEvent): string {
    return `payment_${payment.paymentId}`;
  }
  ```

- `src/routes/payments-sync.ts` — the sync loop. The bug is the ordering of claim (line 99)
  vs. dispatch (line 116) vs. the total-failure `continue` (line 129):

  ```ts
  // src/routes/payments-sync.ts:93-133 (current, abbreviated)
  const purchaseDedupeKey =
    payment.treatmentId > 0
      ? `treatment_${payment.treatmentId}`
      : `payment_${payment.paymentId}`;

  if (!payment.isVoided) {
    const claimed = await stateStore.claimPaymentProcessed(purchaseDedupeKey);
    if (!claimed) {
      skippedDuplicateBudget += 1;
      safeToMarkProcessed.push(payment);
      continue;
    }
  }

  const tier = payment.budgetTotal >= highTicketThreshold ? "alto_ticket" : "standard";
  const event = buildPurchaseEvent(lead, payment, tier);
  await elevatorClient.updateLeadStage(lead.elevatorId, "anticipo_pagado");

  const [stapeResult, elevatorResult] = await Promise.allSettled([
    stapeClient.dispatch(event),
    elevatorEvents ? elevatorEvents.dispatch(event) : Promise.resolve(),
  ]);
  const stapeOk = stapeResult.status === "fulfilled";
  const elevatorOk = elevatorResult.status === "fulfilled";
  if (!stapeOk) stapeEventsFailed += 1;
  if (!elevatorOk && elevatorEvents) elevatorEventsFailed += 1;

  if (!stapeOk && (!elevatorEvents || !elevatorOk)) {
    // Both failed — do not mark processed; retry on next sync
    continue;          // <-- BUG: claim from line 99 is never released
  }

  dispatched += 1;
  safeToMarkProcessed.push(payment);
  ```

- `src/modules/state/state-store.ts` — the `StateStore` interface and its three
  implementations (`InMemoryStateStore`, `FileStateStore`, `RedisStateStore`). The claim
  method exists; there is **no** release method:

  ```ts
  // src/modules/state/state-store.ts:16-17
  /** Atomically marks as processed. Returns true if this call claimed it (first time), false if already existed. */
  claimPaymentProcessed(paymentId: string): Promise<boolean>;
  ```

  Implementations of `claimPaymentProcessed` to mirror for the new release method:
  - InMemory (lines 67-73): array `includes` + `push`.
  - File (lines 153-161): `readState` → `includes` → `push` → `writeState`.
  - Redis (lines 349-352): `SADD` returns added count.

### Repo conventions to follow

- ESM with `.js` import suffixes on relative imports (see top of every file).
- The claim is intentionally **before** dispatch to keep concurrency safety (two parallel
  cron invocations must not both fire). The fix must preserve that — do **not** move the
  claim after dispatch. Instead, **release** the claim on total failure so the next sync
  re-claims and retries.
- Tests use Vitest with `describe/it/expect` (see `src/modules/state/state-store.test.ts`).

## Commands you will need

| Purpose   | Command (run from `apps/tracking-core/`) | Expected on success |
|-----------|------------------------------------------|---------------------|
| Install   | `npm ci`                                 | exit 0              |
| Typecheck | `npm run check`                          | exit 0, no errors   |
| Tests     | `npm test`                               | all pass            |
| Build     | `npm run build`                          | exit 0              |

## Scope

**In scope** (the only files you should modify):
- `src/modules/state/state-store.ts` (add `releasePaymentClaim` to interface + 3 impls)
- `src/routes/payments-sync.ts` (release claim on total dispatch failure)
- `src/modules/state/state-store.test.ts` (tests for the new method)
- `src/routes/payments-sync.test.ts` (create — regression test for the lost-event bug)

**Out of scope** (do NOT touch):
- `src/modules/state/payment-sync.ts` — the `payment_<id>` marking is correct; leave it.
- The voided/refund path — refunds are handled elsewhere; only the `!payment.isVoided`
  dispatch path has this bug.
- Any change to dispatch *policy* ("at least one success → mark processed"). Keep it.

## Git workflow

- Branch: `advisor/012-purchase-claim-release`
- Commit per logical unit; conventional-commit style (e.g.
  `fix: release purchase claim when dispatch fails so the event retries`).
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add `releasePaymentClaim` to the `StateStore` interface

In `src/modules/state/state-store.ts`, add to the `StateStore` interface, directly below
`claimPaymentProcessed` (line 17):

```ts
/** Removes a claimed key so it can be re-claimed (used to roll back a failed dispatch). No-op if absent. */
releasePaymentClaim(paymentId: string): Promise<void>;
```

**Verify**: `npm run check` → fails with errors saying the three classes don't implement
`releasePaymentClaim` (expected — you implement them next).

### Step 2: Implement `releasePaymentClaim` in all three stores

- **InMemoryStateStore** (after `claimPaymentProcessed`, ~line 73):
  ```ts
  async releasePaymentClaim(paymentId: string): Promise<void> {
    this.paymentSyncState.processedPaymentIds =
      this.paymentSyncState.processedPaymentIds.filter((id) => id !== paymentId);
  }
  ```
- **FileStateStore** (after its `claimPaymentProcessed`, ~line 161):
  ```ts
  async releasePaymentClaim(paymentId: string): Promise<void> {
    const state = await this.readState();
    const next = state.processedPaymentIds.filter((id) => id !== paymentId);
    if (next.length !== state.processedPaymentIds.length) {
      state.processedPaymentIds = next;
      await this.writeState(state);
    }
  }
  ```
- **RedisStateStore** (after its `claimPaymentProcessed`, ~line 352): use `SREM`:
  ```ts
  async releasePaymentClaim(paymentId: string): Promise<void> {
    await this.command(["SREM", this.processedSetKey, paymentId]);
  }
  ```

**Verify**: `npm run check` → exit 0, no errors.

### Step 3: Release the claim on total dispatch failure in the sync loop

In `src/routes/payments-sync.ts`, the block that handles "both failed" (currently lines
127-130). Before the `continue`, release the claim that was made at line 99 — but only if
it was actually claimed (i.e. `!payment.isVoided`):

```ts
if (!stapeOk && (!elevatorEvents || !elevatorOk)) {
  // Both dispatch targets failed — roll back the purchase claim so the next
  // sync re-claims and retries. Without this the event is lost permanently.
  if (!payment.isVoided) {
    await stateStore.releasePaymentClaim(purchaseDedupeKey);
  }
  continue;
}
```

**Verify**: `npm run check` → exit 0.

### Step 4: Write the regression test

Create `src/routes/payments-sync.test.ts`. Use `InMemoryStateStore` and minimal fake
clients (Dentalink returns one non-voided payment + a patient; Elevator returns one lead;
Stape `dispatch` is controllable to throw). Model structure on
`src/modules/state/state-store.test.ts`.

Cover at minimum:
1. **Happy path**: Stape succeeds → after the run, `claimPaymentProcessed(treatment_<id>)`
   returns `false` (still claimed) and the payment id is marked processed.
2. **Lost-event regression**: a first run where **both** dispatch targets throw → after it,
   `hasProcessedPayment(payment_<id>)` is `false` (payment retryable) AND
   `claimPaymentProcessed(treatment_<id>)` returns `true` (claim was released, re-claimable).
   Then a **second** run where Stape succeeds → the event dispatches (assert your fake
   Stape received exactly one event) and is marked processed.

**Verify**: `npm test` → all pass, including the two new cases. Confirm the regression test
**fails** if you temporarily revert Step 3 (sanity check that it guards the bug).

## Test plan

- New file `src/routes/payments-sync.test.ts` with the two cases above, plus one asserting
  the voided path does NOT call `releasePaymentClaim` (no claim was made).
- Add to `src/modules/state/state-store.test.ts`: `claimPaymentProcessed` → `releasePaymentClaim`
  → `claimPaymentProcessed` returns `true` again, for `InMemoryStateStore` and `FileStateStore`
  (use a temp file path via `node:os` `tmpdir()` for the file store).
- Verification: `npm test` → all pass, including the new tests.

## Done criteria

ALL must hold (run from `apps/tracking-core/`):

- [ ] `npm run check` exits 0
- [ ] `npm test` exits 0; new tests in `payments-sync.test.ts` and `state-store.test.ts` pass
- [ ] `npm run build` exits 0
- [ ] `grep -n "releasePaymentClaim" src/modules/state/state-store.ts` shows interface + 3 impls (4 matches)
- [ ] `git status` shows only the four in-scope files modified/created
- [ ] `plans/README.md` status row for 012 updated

## STOP conditions

Stop and report back (do not improvise) if:
- The code at `src/routes/payments-sync.ts:93-133` does not match the "Current state"
  excerpt (the sync loop was refactored since this plan was written).
- `claimPaymentProcessed` no longer exists or has a different signature.
- Adding the release call appears to require touching `payment-sync.ts` or the dispatch
  policy — it should not.
- A verification command fails twice after a reasonable fix attempt.

## Maintenance notes

- If a delete/release-by-prefix or TTL-based dedupe is introduced later (see plan 015),
  `releasePaymentClaim` must stay consistent with whatever storage the claim uses.
- Reviewer should confirm the release is gated on `!payment.isVoided` (mirrors the claim)
  and that concurrency safety is preserved (claim still happens before dispatch).
- Follow-up deliberately deferred: true two-phase/transactional dispatch is out of scope;
  this plan only closes the lost-event hole.
