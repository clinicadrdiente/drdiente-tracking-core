# Plan 014: Dentalink appointment webhook is idempotent under retries

> **Executor instructions**: Follow step by step. Run every verification command
> and confirm the expected result before moving on. On any "STOP condition",
> stop and report. When done, update this plan's row in `plans/README.md`.
>
> **Drift check (run first)**: from `apps/tracking-core/`, run
> `git diff --stat ffad029..HEAD -- src/routes/dentalink-appointment.ts src/app/tracking-app.ts src/modules/state/state-store.ts`
> If any in-scope file changed, compare the "Current state" excerpts to the live
> code before proceeding; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW
- **Depends on**: plans/012-purchase-claim-release.md (lands the `releasePaymentClaim`
  StateStore change first to avoid conflicting edits in `state-store.ts`)
- **Category**: bug
- **Planned at**: commit `ffad029`, 2026-06-17

## Why this matters

`api/webhooks/dentalink/appointment.ts` processes appointment events. Webhook providers
retry on timeout/non-2xx, so the same `appointmentId` can arrive multiple times. The handler
has no idempotency guard, so each retry re-runs the match, re-writes the patient's Elevator
id, and re-sends the "agendo" stage update. The downstream operations are mostly idempotent,
but duplicate processing produces confusing audit trails and redundant Elevator writes, and
blocks a future "Agendamiento" conversion event from being fired exactly once.

## Current state

- `src/routes/dentalink-appointment.ts` — the route function. No idempotency, no `stateStore`
  parameter today:

  ```ts
  // src/routes/dentalink-appointment.ts:6-25 (current)
  export async function handleDentalinkAppointment(
    dentalinkClient: DentalinkClient,
    elevatorClient: ElevatorClient,
    event: AppointmentEvent,
  ) {
    const patient = await dentalinkClient.getPatient(event.patientId);
    const candidates = await elevatorClient.findLeadsByIdentity(patient.phone ?? "", patient.email);
    const match = matchPatientToLead(patient, candidates);
    if (match.status === "linked" && match.elevatorId) {
      await dentalinkClient.setPatientElevatorId(patient.patientId, match.elevatorId);
      await elevatorClient.updateLeadStage(match.elevatorId, "agendo");
    }
    return match;
  }
  ```

- `AppointmentEvent` has a stable numeric id (`src/types/domain.ts:62-67`):
  ```ts
  export interface AppointmentEvent {
    appointmentId: number;
    patientId: number;
    scheduledAt: string;
    branch?: string | null;
  }
  ```

- The only caller is `TrackingApp.processAppointment`, which already holds the state store
  (`src/app/tracking-app.ts:52-63`, `this.services.stateStore`).

- The `StateStore` already exposes a generic atomic claim used by the payment sync. It stores
  arbitrary string keys in one "processed" set (the payment path already mixes `payment_*`
  and `treatment_*` prefixes), so reusing it with an `appointment_*` prefix is consistent
  with the existing convention:
  ```ts
  // src/modules/state/state-store.ts:16-17
  /** Atomically marks as processed. Returns true if this call claimed it (first time), false if already existed. */
  claimPaymentProcessed(paymentId: string): Promise<boolean>;
  ```

### Repo conventions to follow

- ESM `.js` import suffixes.
- Keep the function's return type compatible (it returns the `MatchResult`-like object today;
  add a discriminator for the duplicate case without breaking existing callers — see Step 2).
- Vitest for tests.

## Commands you will need

| Purpose   | Command (from `apps/tracking-core/`) | Expected            |
|-----------|--------------------------------------|---------------------|
| Install   | `npm ci`                             | exit 0              |
| Typecheck | `npm run check`                      | exit 0, no errors   |
| Tests     | `npm test`                           | all pass            |
| Build     | `npm run build`                      | exit 0              |

## Scope

**In scope**:
- `src/routes/dentalink-appointment.ts` (add `stateStore` param + idempotency claim)
- `src/app/tracking-app.ts` (pass `this.services.stateStore` to the route)
- `src/routes/dentalink-appointment.test.ts` (create)

**Out of scope**:
- `api/webhooks/dentalink/appointment.ts` — the thin Vercel handler stays as-is.
- Adding a dedicated `claimAppointment` method to `StateStore` — reuse
  `claimPaymentProcessed` with an `appointment_` prefix; do not expand the interface.
- Firing a new "Agendamiento" conversion event — that is a separate feature (out of scope).

## Git workflow

- Branch: `advisor/014-appointment-webhook-idempotency`
- Conventional commit: `fix: make dentalink appointment webhook idempotent on retries`.
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Add `stateStore` parameter and idempotency guard

Edit `src/routes/dentalink-appointment.ts`:

```ts
import type { StateStore } from "../modules/state/state-store.js";
// ...
export async function handleDentalinkAppointment(
  dentalinkClient: DentalinkClient,
  elevatorClient: ElevatorClient,
  stateStore: StateStore,
  event: AppointmentEvent,
) {
  const idempotencyKey = `appointment_${event.appointmentId}`;
  const claimed = await stateStore.claimPaymentProcessed(idempotencyKey);
  if (!claimed) {
    return { status: "duplicate" as const, reason: "appointment already processed" };
  }

  const patient = await dentalinkClient.getPatient(event.patientId);
  const candidates = await elevatorClient.findLeadsByIdentity(patient.phone ?? "", patient.email);
  const match = matchPatientToLead(patient, candidates);
  if (match.status === "linked" && match.elevatorId) {
    await dentalinkClient.setPatientElevatorId(patient.patientId, match.elevatorId);
    await elevatorClient.updateLeadStage(match.elevatorId, "agendo");
  }
  return match;
}
```

**Important — release on failure**: if any step after the claim throws, the claim must be
released so a legitimate retry can succeed (mirrors plan 012's reasoning). Wrap the
post-claim body in try/catch:

```ts
  const claimed = await stateStore.claimPaymentProcessed(idempotencyKey);
  if (!claimed) {
    return { status: "duplicate" as const, reason: "appointment already processed" };
  }
  try {
    // ... patient/match/dispatch work ...
    return match;
  } catch (error) {
    await stateStore.releasePaymentClaim(idempotencyKey);
    throw error;
  }
```

(`releasePaymentClaim` is added by plan 012 — confirm it exists before starting; if it does
not, STOP and run plan 012 first.)

**Verify**: `npm run check` → fails: caller in `tracking-app.ts` now passes the wrong number
of args (expected — fixed in Step 2).

### Step 2: Update the caller

In `src/app/tracking-app.ts:58-62`, pass the state store:

```ts
return handleDentalinkAppointment(
  this.services.dentalinkClient,
  this.services.elevatorClient,
  this.services.stateStore,
  event,
);
```

**Verify**: `npm run check` → exit 0.

### Step 3: Tests

Create `src/routes/dentalink-appointment.test.ts`, modeled on
`src/modules/state/state-store.test.ts`. Use `InMemoryStateStore` and fake Dentalink/Elevator
clients (spy on `setPatientElevatorId` / `updateLeadStage` call counts).

Cover:
1. First call with a `linked` match → does the Elevator writes once.
2. Second call with the **same** `appointmentId` → returns `{ status: "duplicate" }` and the
   fake clients are **not** called again (assert call counts unchanged).
3. A call where the work throws (fake `getPatient` rejects) → the claim is released
   (`claimPaymentProcessed("appointment_<id>")` returns `true` afterward, i.e. re-claimable).

**Verify**: `npm test` → all pass including the three new cases.

## Test plan

- New `src/routes/dentalink-appointment.test.ts` with the three cases above.
- Verification: `npm test` → all pass.

## Done criteria

ALL must hold (from `apps/tracking-core/`):

- [ ] `npm run check` exits 0
- [ ] `npm test` exits 0; new appointment tests pass
- [ ] `npm run build` exits 0
- [ ] `grep -n "appointment_" src/routes/dentalink-appointment.ts` shows the idempotency key
- [ ] `git status` shows only the three in-scope files
- [ ] `plans/README.md` status row for 014 updated

## STOP conditions

Stop and report if:
- `releasePaymentClaim` does not exist on `StateStore` (plan 012 not yet executed).
- `handleDentalinkAppointment` has more callers than the one in `tracking-app.ts`
  (`grep -rn "handleDentalinkAppointment" src` to check) — update all, or STOP if unclear.
- The route's current code doesn't match the "Current state" excerpt.

## Maintenance notes

- If a dedicated "Agendamiento" conversion event is added later, fire it inside the claimed
  block so it is sent exactly once per appointment.
- The `appointment_*` keys share the processed set with `payment_*`/`treatment_*`. Plan 015
  (bounding/TTL) must apply the same expiry policy to appointment keys.
- Reviewer: confirm the claim is released on the throw path (otherwise a transient Dentalink
  outage permanently blocks that appointment).
