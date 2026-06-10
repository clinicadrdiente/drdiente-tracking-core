# Plan 003: A Stape or Elevator failure only skips that payment, not the whole batch

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 95aa45e..HEAD -- apps/tracking-core/src/routes/payments-sync.ts`
> If the file changed, compare "Current state" excerpts against live code before proceeding.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none (plan 001 recommended first for verification)
- **Category**: bug
- **Planned at**: commit `95aa45e`, 2026-06-10

## Why this matters

There are two bugs in the payment dispatch loop in `src/routes/payments-sync.ts`:

**Bug A (silent permanent loss)**: `safeToMarkProcessed.push(payment)` runs at line 48 — before the Stape dispatch at line 94. If `stapeClient.dispatch()` or `elevatorClient.updateLeadStage()` throws, the function throws out of the loop, and `markPaymentsProcessed(stateStore, safeToMarkProcessed)` at line 101 still marks this payment's ID as processed. On the next cron run, `filterUnprocessedPayments` sees the payment as processed and skips it. The Stape event was never sent. Revenue is permanently lost with no error visible in the summary.

**Bug B (batch abort)**: When lines 93–94 throw, all subsequent payments in the batch (N+1 through 50) are also skipped for this run — they haven't been processed yet, so they'll be retried next run. This is less severe but wastes a cron window.

The fix: move `safeToMarkProcessed.push(payment)` to after the successful dispatch (line 99), so a failed dispatch never causes the payment to be marked as processed.

## Current state

File: `apps/tracking-core/src/routes/payments-sync.ts`

Lines 35–99 (the payment loop):
```ts
for (const payment of unprocessedPayments) {
  let patient;
  try {
    patient = await dentalinkClient.getPatient(payment.patientId);
  } catch (error) {
    if (error instanceof DentalinkRequestError && error.status === 429) {
      rateLimitedPatients += 1;
      continue;
    }
    throw error;
  }

  safeToMarkProcessed.push(payment);       // <-- line 48: TOO EARLY

  const leads = await elevatorClient.findLeadsByIdentity(
    patient.phone ?? "",
    patient.email,
  );

  let lead = leads[0];
  if (!lead) {
    const leadInput = buildLeadInputFromDentalink(patient, payment);
    if (!leadInput) {
      unmatchedLeads += 1;
      continue;
    }
    lead = await elevatorClient.createLead(leadInput);
    createdLeads += 1;
  }

  matchedLeads += 1;

  const purchaseDedupeKey =
    payment.treatmentId > 0
      ? `treatment_${payment.treatmentId}`
      : `payment_${payment.paymentId}`;

  const alreadyCounted =
    !payment.isVoided &&
    (await stateStore.hasProcessedPayment(purchaseDedupeKey));

  if (alreadyCounted) {
    skippedDuplicateBudget += 1;
    continue;
  }

  const tier =
    payment.budgetTotal >= highTicketThreshold ? "alto_ticket" : "standard";
  const event = buildPurchaseEvent(lead, payment, tier);

  await elevatorClient.updateLeadStage(lead.elevatorId, "anticipo_pagado");  // line 93
  await stapeClient.dispatch(event);                                           // line 94
  if (!payment.isVoided) {
    await stateStore.markPaymentProcessed(purchaseDedupeKey);
  }
  dispatched += 1;
}

await markPaymentsProcessed(stateStore, safeToMarkProcessed);   // line 101
```

The bug: if line 93 or 94 throws, the function throws at that point. But `payment` was already added to `safeToMarkProcessed` at line 48. Line 101 then marks `payment_{paymentId}` as processed. Next cron run: the payment is filtered out and the Stape event is never sent.

## Commands you will need

| Purpose   | Command                                   | Expected on success       |
|-----------|-------------------------------------------|---------------------------|
| Typecheck | `npm run check` (in `apps/tracking-core`) | exit 0, no errors         |
| Test      | `npm test` (in `apps/tracking-core`)      | exit 0 (requires plan 001)|

## Scope

**In scope**:
- `apps/tracking-core/src/routes/payments-sync.ts`

**Out of scope**:
- `src/modules/stape/client.ts` — do NOT add retry logic here
- `src/modules/elevator/client.ts` — do NOT change
- `src/modules/state/payment-sync.ts` — do NOT change
- `api/` directory — do NOT change

## Git workflow

Branch: `advisor/003-batch-abort-isolation`
Commit: `Fix payment marked processed before Stape dispatch succeeds`

## Steps

### Step 1: Move safeToMarkProcessed.push to after successful dispatch

In `apps/tracking-core/src/routes/payments-sync.ts`:

1. **Remove** `safeToMarkProcessed.push(payment);` from line 48 (after the `getPatient` try/catch).

2. **Add** `safeToMarkProcessed.push(payment);` immediately after `dispatched += 1;` (currently line 98), so it only runs when the full dispatch succeeded.

The end of the loop should look like:
```ts
  await elevatorClient.updateLeadStage(lead.elevatorId, "anticipo_pagado");
  await stapeClient.dispatch(event);
  if (!payment.isVoided) {
    await stateStore.markPaymentProcessed(purchaseDedupeKey);
  }
  dispatched += 1;
  safeToMarkProcessed.push(payment);   // <-- moved here
}
```

Also handle the case where the payment is `alreadyCounted` or `unmatchedLeads` — those `continue` statements exit before the dispatch. Currently the payment was being added to `safeToMarkProcessed` and then continued, meaning payments that were skipped for dedup or unmatched were also marked as processed. That behavior is intentional for the `alreadyCounted` case (it's been counted via `purchaseDedupeKey` before). For `unmatchedLeads`, the payment should NOT be marked processed — the lead might appear later. Verify the intent:

- `alreadyCounted: true` → payment already dispatched in a prior run → correct to mark `payment_{id}` as processed so it doesn't re-enter the loop.
- `unmatchedLeads` (no lead, no phone+email) → patient can't be identified → correct to mark `payment_{id}` as processed to avoid retrying indefinitely for truly unidentifiable patients.

So these `continue`d cases should still add to `safeToMarkProcessed`. Add `safeToMarkProcessed.push(payment)` before each `continue` that should mark the payment as handled:

```ts
  // After: unmatchedLeads += 1;
  safeToMarkProcessed.push(payment);
  continue;
```

```ts
  // After: skippedDuplicateBudget += 1;
  safeToMarkProcessed.push(payment);
  continue;
```

The 429 `continue` must NOT push to `safeToMarkProcessed` (it already doesn't — leave that alone).

**Verify**: `grep -n "safeToMarkProcessed.push" apps/tracking-core/src/routes/payments-sync.ts` → should show 3 occurrences: one after `unmatchedLeads += 1`, one after `skippedDuplicateBudget += 1`, one after `dispatched += 1`. Zero occurrences after `getPatient` try/catch.

### Step 2: Typecheck

**Verify**: `npm run check` (from `apps/tracking-core`) → exit 0.

### Step 3: Read the final file

Read `src/routes/payments-sync.ts` from top to bottom and confirm the logic is correct:
- A payment that gets 429 → NOT in safeToMarkProcessed ✓ (retried next window)
- A payment that is unmatched → in safeToMarkProcessed ✓ (don't retry unidentifiable)
- A payment that is already counted → in safeToMarkProcessed ✓ (avoid re-checking purchaseDedupeKey)
- A payment where Stape dispatch throws → NOT in safeToMarkProcessed ✓ (retried next run)
- A payment dispatched successfully → in safeToMarkProcessed ✓

## Test plan

After plan 001 is done, extend `src/routes/payments-sync.test.ts` (or create it):

Test: "Stape dispatch failure does not mark payment as processed"
- Set up: `InMemoryStateStore`, stub `StapeClient` that throws on first call
- Call `handlePaymentsSync` with 2 payments
- Assert: first payment is NOT in `stateStore.processedPaymentIds`; the function catches and continues so second payment IS attempted (or alternatively throws — check current behavior and document it)

This test will fail before this fix and pass after.

## Done criteria

- [ ] `grep -n "safeToMarkProcessed.push" src/routes/payments-sync.ts` shows exactly 3 occurrences: after `unmatchedLeads`, after `skippedDuplicateBudget`, after `dispatched`
- [ ] No occurrence of `safeToMarkProcessed.push` between lines of the `getPatient` try/catch block and the `findLeadsByIdentity` call
- [ ] `npm run check` exits 0
- [ ] No files outside the in-scope list are modified
- [ ] `plans/README.md` status row updated to DONE

## STOP conditions

- The code at `safeToMarkProcessed.push(payment)` does not match line 48 (codebase has drifted) — stop and report.
- Existing behavior for `unmatchedLeads` or `alreadyCounted` is different from the description above — stop and report the actual semantics before making the change.
- `npm run check` fails in a file not in scope.

## Maintenance notes

- If retry logic is added for Stape failures (e.g., dead-letter queue), `dispatched += 1` should only increment after confirmed dispatch.
- The `updateLeadStage` call (line 93) throws before `stapeClient.dispatch` — if Elevator is down, the payment is left unprocessed (retried next run). After this plan, that's safe. Before this plan, Elevator failures were safe because dispatch hadn't been reached yet.
- Future: consider wrapping lines 93–98 in a try/catch that catches, logs, and continues to next payment instead of aborting the whole batch.
