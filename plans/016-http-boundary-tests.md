# Plan 016: The auth + validation boundary has automated test coverage

> **Executor instructions**: Follow step by step. Run every verification command
> and confirm the result before moving on. On any "STOP condition", stop and
> report. When done, update this plan's row in `plans/README.md`.
>
> **Drift check (run first)**: from `apps/tracking-core/`, run
> `git diff --stat ffad029..HEAD -- src/http/`
> If files changed, compare the "Current state" excerpts to live code; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW
- **Depends on**: plans/001-tests-ci.md (Vitest + CI exist) — DONE
- **Category**: tests
- **Planned at**: commit `ffad029`, 2026-06-17

## Why this matters

The HTTP boundary is security- and money-critical: `requireTrackingSecret` guards every
endpoint, and `parseLeadInput`/`parseAppointmentInput` decide what reaches the domain. Plan
001 added tests for payment *logic*, but the `src/http/` layer has **zero** tests today. A
regression here (e.g. a header-casing change, a validation fallback that silently passes bad
input) would ship undetected. These are pure/near-pure functions — cheap, high-value tests.

## Current state

- `src/http/auth.ts` — `requireTrackingSecret(request)` returns an `HttpResponse` (401) on
  missing/wrong secret or when `TRACKING_API_SECRET` is unset; returns `null` when valid.
  Header lookup is case-insensitive; comparison is sha256 + `timingSafeEqual`.
- `src/http/validation.ts` — `parseLeadInput(body)` accepts nested `{attribution:{...}}` or
  flat `utm_*`/`first_touch_source` webhook shape; returns `null` if `firstName`/`phone`
  aren't strings; uses `first_touch_source` as `utmSource` fallback (lines 36-50).
  `parseAppointmentInput(body)` requires numeric `appointmentId`/`patientId` and string
  `scheduledAt`, else `null`.
- `src/http/handlers.ts` — each handler calls `requireTrackingSecret` first (returns the auth
  error), then validates, then calls the app. `createTrackingHttpHandlers()` bootstraps in
  stub mode (no network) by default — usable in tests.
- Test conventions: Vitest `describe/it/expect`; see `src/lib/normalize.test.ts` (pure-unit
  style) and `src/modules/state/state-store.test.ts`.
- `vite.config.ts` `test.include` is `["src/**/*.test.ts"]` — new tests must live under `src/`.

## Commands you will need

| Purpose   | Command (from `apps/tracking-core/`) | Expected            |
|-----------|--------------------------------------|---------------------|
| Install   | `npm ci`                             | exit 0              |
| Typecheck | `npm run check`                      | exit 0, no errors   |
| Tests     | `npm test`                           | all pass            |
| Build     | `npm run build`                      | exit 0              |

## Scope

**In scope** (create only):
- `src/http/auth.test.ts`
- `src/http/validation.test.ts`
- `src/http/handlers.test.ts`

**Out of scope**:
- Modifying any non-test file. If a test reveals a real bug, STOP and report it — do not fix
  production code in this plan.
- Testing the full happy-path of handlers against real integrations (stub mode is fine; do
  not add network mocks here).

## Git workflow

- Branch: `advisor/016-http-boundary-tests`
- Conventional commit: `test: cover http auth and validation boundary`.
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: `src/http/auth.test.ts`

Test `requireTrackingSecret` by setting/clearing `process.env.TRACKING_API_SECRET` in
`beforeEach`/`afterEach`. Cases:
1. Secret unset → returns a 401 `HttpResponse` (truthy, `status === 401`).
2. Secret set, header missing → 401.
3. Secret set, header wrong value → 401.
4. Secret set, header correct (exact case `x-tracking-secret`) → returns `null`.
5. Secret set, header correct but **different casing** (`X-Tracking-Secret`) → returns `null`
   (case-insensitive lookup).

Build the request object as `{ headers: { "x-tracking-secret": "..." } }`.

**Verify**: `npm test src/http/auth.test.ts` → all pass.

### Step 2: `src/http/validation.test.ts`

`parseLeadInput`:
1. Nested attribution shape → returns a `LeadInput` with mapped fields.
2. Flat webhook shape (`utm_source`, `first_touch_source`, `first_name`, `landing_page_url`)
   → mapped correctly; `attribution.utmSource` equals the `utm_source`.
3. `utm_source` absent but `first_touch_source` present → `attribution.utmSource` falls back
   to `first_touch_source` (this is the documented fallback at lines 43-44).
4. Missing `phone` (or non-string) → returns `null`.
5. Missing `firstName`/`first_name` → returns `null`.

`parseAppointmentInput`:
6. Valid `{ appointmentId: 1, patientId: 2, scheduledAt: "..." }` → returns the event.
7. `appointmentId` as a string → returns `null`.
8. Missing `scheduledAt` → returns `null`.

**Verify**: `npm test src/http/validation.test.ts` → all pass.

### Step 3: `src/http/handlers.test.ts`

Use `createTrackingHttpHandlers()` (stub mode, no network). With
`process.env.TRACKING_API_SECRET` set to a known value:
1. `getStatus` with the correct secret header → `status` 200.
2. `getStatus` with no/wrong secret → `status` 401.
3. `postLead` with correct secret but invalid body (`{}`) → `status` 400 (`badRequest`).
4. `postLead` with correct secret and a valid lead body → `status` 201 (stub Elevator).

Construct `HttpRequest` objects directly: `{ headers, body, query }` matching the
`HttpRequest` type used by the handlers.

**Verify**: `npm test src/http/handlers.test.ts` → all pass.

## Test plan

- Three new test files as above (~20 cases total).
- Verification: `npm test` → all pass, including the new files; `npm run check` clean.

## Done criteria

ALL must hold (from `apps/tracking-core/`):

- [ ] `npm run check` exits 0
- [ ] `npm test` exits 0; the three new files run and pass
- [ ] `npm run build` exits 0
- [ ] `ls src/http/*.test.ts` lists auth, validation, handlers
- [ ] `git status` shows only the three new test files
- [ ] `plans/README.md` status row for 016 updated

## STOP conditions

Stop and report if:
- `createTrackingHttpHandlers()` attempts real network calls in stub mode (means stub wiring
  changed) — report; do not add live mocks here.
- A test cannot pass because the production code behaves incorrectly (e.g. validation accepts
  input it should reject) — that is a real bug; STOP and report it for a separate plan rather
  than weakening the test.

## Maintenance notes

- When plan 013 lands (auth on the four dev endpoints), consider extending `handlers.test.ts`
  patterns to a couple of those endpoints if a request fixture helper is in place.
- Reviewer: ensure tests restore `process.env.TRACKING_API_SECRET` in `afterEach` so they
  don't leak state across files.
