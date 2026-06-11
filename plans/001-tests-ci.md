# Plan 001: Test runner and CI pipeline exist for critical payment logic

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 95aa45e..HEAD -- apps/tracking-core/package.json apps/tracking-core/src/modules/state/payment-sync.ts apps/tracking-core/src/modules/matching/match-patient-to-lead.ts apps/tracking-core/src/modules/payments/build-purchase-event.ts apps/tracking-core/src/lib/normalize.ts`
> If any in-scope file changed, compare "Current state" excerpts against live code before proceeding.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: tests / dx
- **Planned at**: commit `95aa45e`, 2026-06-10

## Why this matters

This repo moves money and has zero tests. The functions that determine whether a payment is dispatched to Stape (which charges ad attribution and ROAS numbers) are pure deterministic TypeScript — they are ideal unit test targets and require zero mocking. Plans 002–005 all touch this critical path; without a test baseline, any edit risks silent regression. This plan establishes the test runner and CI so every subsequent plan can add a verification gate.

## Current state

Relevant files:
- `apps/tracking-core/package.json` — scripts: `build`, `check` (tsc only), `dev`. No `test` script, no `vitest`, no `eslint`.
- `apps/tracking-core/src/lib/normalize.ts` — `normalizePhone(phone)`, `normalizeEmail(email)`: pure string functions.
- `apps/tracking-core/src/modules/matching/match-patient-to-lead.ts` — `matchPatientToLead(patient, leads)`: pure function, returns first match or null.
- `apps/tracking-core/src/modules/payments/build-purchase-event.ts` — `buildPurchaseEvent(lead, payment, tier)`: pure transformation.
- `apps/tracking-core/src/modules/state/payment-sync.ts` — `filterUnprocessedPayments(stateStore, payments)`, `markPaymentsProcessed(stateStore, payments)`: async, uses `StateStore` interface.
- No `.github/workflows/` directory exists.

Excerpt confirming no test runner (package.json scripts, lines 7–10):
```json
"scripts": {
  "build": "tsc --noEmit -p tsconfig.json && tsc --noEmit -p tsconfig.app.json && vite build",
  "check": "tsc --noEmit -p tsconfig.json && tsc --noEmit -p tsconfig.app.json",
  "dev": "vite"
}
```

## Commands you will need

| Purpose    | Command                                          | Expected on success              |
|------------|--------------------------------------------------|----------------------------------|
| Install    | `npm install` (in `apps/tracking-core`)          | exit 0                           |
| Typecheck  | `npm run check` (in `apps/tracking-core`)        | exit 0, no errors                |
| Test       | `npm test` (in `apps/tracking-core`)             | exit 0, all pass (after step 3)  |
| Test watch | `npm run test:ui` (in `apps/tracking-core`)      | opens Vitest UI                  |

All commands run from `apps/tracking-core/`.

## Scope

**In scope**:
- `apps/tracking-core/package.json` — add vitest + scripts
- `apps/tracking-core/vite.config.ts` — add vitest config block
- `apps/tracking-core/src/lib/normalize.test.ts` (create)
- `apps/tracking-core/src/modules/matching/match-patient-to-lead.test.ts` (create)
- `apps/tracking-core/src/modules/payments/build-purchase-event.test.ts` (create)
- `apps/tracking-core/src/modules/state/payment-sync.test.ts` (create)
- `.github/workflows/ci.yml` (create, at repo root)

**Out of scope**:
- Any `.ts` source file in `src/` other than creating new `.test.ts` files
- `api/` directory
- Dashboard components

## Git workflow

Branch: `advisor/001-tests-ci`
Commit style (match repo history, e.g.): `Add vitest + unit tests for payment core` — imperative, no ticket prefix observed.

## Steps

### Step 1: Install vitest

From `apps/tracking-core/`:

```bash
npm install --save-dev vitest @vitest/ui
```

**Verify**: `cat package.json | grep vitest` → shows `"vitest"` in devDependencies.

### Step 2: Add test scripts and vitest config

In `apps/tracking-core/package.json`, add to `"scripts"`:
```json
"test": "vitest run",
"test:watch": "vitest",
"test:ui": "vitest --ui"
```

In `apps/tracking-core/vite.config.ts`, add a `test` block inside `defineConfig({...})`:
```ts
test: {
  environment: "node",
  include: ["src/**/*.test.ts"],
},
```
The full file should now look like:
```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  publicDir: false,
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
```

**Verify**: `npm run check` → exit 0 (typecheck still passes).

### Step 3: Write tests for normalize.ts

Create `apps/tracking-core/src/lib/normalize.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { normalizeEmail, normalizePhone } from "./normalize.js";

describe("normalizePhone", () => {
  it("strips spaces and dashes", () => {
    expect(normalizePhone("+52 55 1234-5678")).toBe("+525512345678");
  });
  it("returns empty string for null/undefined", () => {
    expect(normalizePhone(null)).toBe("");
    expect(normalizePhone(undefined)).toBe("");
  });
  it("strips leading zeros if present", () => {
    // confirm current behavior — adjust if normalize.ts handles differently
    const result = normalizePhone("0155 1234 5678");
    expect(typeof result).toBe("string");
  });
});

describe("normalizeEmail", () => {
  it("lowercases email", () => {
    expect(normalizeEmail("User@Example.COM")).toBe("user@example.com");
  });
  it("trims whitespace", () => {
    expect(normalizeEmail("  user@example.com  ")).toBe("user@example.com");
  });
  it("returns empty string for null/undefined", () => {
    expect(normalizeEmail(null)).toBe("");
    expect(normalizeEmail(undefined)).toBe("");
  });
});
```

Read `src/lib/normalize.ts` first and adjust the test cases to match the actual current behavior — do NOT guess. The tests must pass against the existing implementation, not a hypothetical one.

**Verify**: `npm test -- normalize` → all tests pass.

### Step 4: Write tests for match-patient-to-lead.ts

Read `src/modules/matching/match-patient-to-lead.ts` in full before writing tests. Then create `src/modules/matching/match-patient-to-lead.test.ts` covering:
- Patient with matching phone → returns that lead
- Patient with matching email (phone differs) → returns that lead
- No match → returns null
- Multiple candidates → returns first match (or whatever the function actually does — read the code)
- Patient with no phone and no email → returns null

**Verify**: `npm test -- match-patient` → all tests pass.

### Step 5: Write tests for build-purchase-event.ts

Read `src/modules/payments/build-purchase-event.ts` and `src/types/domain.ts` first. Create `src/modules/payments/build-purchase-event.test.ts` covering:
- Returns a `PaymentEvent` with correct `eventName`, `value`, `currency`
- `tier: "alto_ticket"` vs `tier: "standard"` produces different label or same shape (check what the function does)
- Voided payment produces correct shape

**Verify**: `npm test -- build-purchase` → all tests pass.

### Step 6: Write tests for payment-sync.ts (state)

Create `src/modules/state/payment-sync.test.ts` using `InMemoryStateStore` (no mocking needed — it's in `src/modules/state/state-store.ts`):
```ts
import { describe, expect, it } from "vitest";
import { InMemoryStateStore } from "./state-store.js";
import { filterUnprocessedPayments, markPaymentsProcessed } from "./payment-sync.js";

// minimal PaymentEvent fixture — adjust field types to match src/types/domain.ts
const makePayment = (id: number) => ({
  paymentId: id,
  // add other required fields from PaymentEvent with dummy values
} as any);

describe("filterUnprocessedPayments", () => {
  it("returns all payments when none are processed", async () => {
    const store = new InMemoryStateStore();
    const payments = [makePayment(1), makePayment(2)];
    const result = await filterUnprocessedPayments(store, payments);
    expect(result).toHaveLength(2);
  });

  it("filters out already-processed payments", async () => {
    const store = new InMemoryStateStore();
    await store.markPaymentProcessed("payment_1");
    const payments = [makePayment(1), makePayment(2)];
    const result = await filterUnprocessedPayments(store, payments);
    expect(result).toHaveLength(1);
    expect((result[0] as any).paymentId).toBe(2);
  });
});

describe("markPaymentsProcessed", () => {
  it("marks all payments so subsequent filter returns empty", async () => {
    const store = new InMemoryStateStore();
    const payments = [makePayment(1), makePayment(2)];
    await markPaymentsProcessed(store, payments);
    const result = await filterUnprocessedPayments(store, payments);
    expect(result).toHaveLength(0);
  });

  it("is idempotent", async () => {
    const store = new InMemoryStateStore();
    const payments = [makePayment(1)];
    await markPaymentsProcessed(store, payments);
    await markPaymentsProcessed(store, payments); // second call must not throw
    const result = await filterUnprocessedPayments(store, payments);
    expect(result).toHaveLength(0);
  });
});
```

Read `src/types/domain.ts` to get the actual `PaymentEvent` required fields and fill the fixture correctly (replace `as any` with real fields).

**Verify**: `npm test -- payment-sync` → all tests pass.

### Step 7: Run full suite

**Verify**: `npm test` → exit 0, ≥12 tests pass across all 4 test files.

### Step 8: Run typecheck

**Verify**: `npm run check` → exit 0, no new errors.

### Step 9: Create GitHub Actions CI

Create `.github/workflows/ci.yml` at the **repo root** (not inside apps/tracking-core):

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  check:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: apps/tracking-core
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "22"
          cache: "npm"
          cache-dependency-path: apps/tracking-core/package-lock.json
      - run: npm ci
      - run: npm run check
      - run: npm test
```

**Verify**: `cat .github/workflows/ci.yml` → file exists and contains the `npm test` step.

## Test plan

Tests written inline in steps 3–6. Pattern: table-driven `describe/it` blocks using `InMemoryStateStore` for state tests and inline fixture objects for pure-function tests. No external mocking libraries needed.

## Done criteria

- [ ] `npm run check` (in `apps/tracking-core`) exits 0
- [ ] `npm test` (in `apps/tracking-core`) exits 0; ≥12 tests pass
- [ ] `ls src/**/*.test.ts` lists 4 files: normalize, match-patient-to-lead, build-purchase-event, payment-sync
- [ ] `.github/workflows/ci.yml` exists at repo root
- [ ] No source files in `src/` were modified (only `.test.ts` files created)
- [ ] `plans/README.md` status row updated to DONE

## STOP conditions

- The actual signature of `normalizePhone`/`normalizeEmail` doesn't accept `null` or `undefined` — adjust test inputs to what the function actually accepts, don't change the source.
- `vite.config.ts` `test` block causes typecheck to fail (vitest types not found) — install `@vitest/globals` or add `"vitest/globals"` to `tsconfig.json` compilerOptions `types`, then re-run check.
- Any test file causes a TypeScript error — fix the test, not the source.
- A step's verify fails twice after a reasonable fix — stop and report.

## Maintenance notes

- When new pure functions are added to `src/modules/` or `src/lib/`, add tests alongside.
- CI runs on push to main and PRs — branch protection should require the `check` job to pass.
- The `as any` fixture in payment-sync.test.ts should be replaced with a proper typed fixture once the `PaymentEvent` type stabilizes.
