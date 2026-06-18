# Plan 013: Every production-reachable endpoint requires the tracking secret

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. If a
> "STOP condition" occurs, stop and report. When done, update this plan's row
> in `plans/README.md`.
>
> **Drift check (run first)**: from `apps/tracking-core/`, run
> `git diff --stat ffad029..HEAD -- api/dev/ src/http/auth.ts`
> If any in-scope file changed, compare the "Current state" excerpts against the
> live code before proceeding; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `ffad029`, 2026-06-17

## Why this matters

All files under `api/` are deployed as public Vercel serverless functions. Four `api/dev/*`
endpoints currently have **no auth check**, so anyone on the internet who knows the path can
hit them:

- `api/dev/test-payment-sync.ts` — triggers the **real** payment sync (Dentalink fetches +
  Stape/Elevator dispatch). This is a backdoor around the cron, which is carefully protected
  by `CRON_SECRET`. An attacker can hammer it to exhaust the Dentalink rate limit and spam
  conversion events.
- `api/dev/test-lead.ts` — fires a real `postLead` (dispatches a demo conversion downstream).
- `api/dev/bootstrap-check.ts` — returns internal bootstrap/error detail (info disclosure).
- `api/dev/test-patient-treatments.ts` — returns **demo-only** data, but should still be
  gated for consistency (low risk).

The other 13 `api/dev/*` endpoints already gate on the tracking secret — this plan makes
these four match that established pattern.

## Current state

The canonical auth pattern, copied from a correct sibling endpoint:

```ts
// api/dev/dentalink-ping.ts:1-9,61-74 (the pattern to replicate)
import { methodNotAllowed, send, toHttpRequest,
  type VercelRequest, type VercelResponse } from "../_lib/http.js";
import { requireTrackingSecret, serverError } from "../../src/index.js";
// ...
export default async function handler(request, response): Promise<void> {
  if (request.method !== "GET") { methodNotAllowed(response); return; }

  const authError = requireTrackingSecret(toHttpRequest(request));
  if (authError) { send(response, authError); return; }
  // ... real work ...
}
```

`requireTrackingSecret` returns an `HttpResponse` (401) when the header is missing/wrong, or
`null` when valid:

```ts
// src/http/auth.ts:10-23
export function requireTrackingSecret(request: AnyHttpRequest): HttpResponse | null {
  const expectedSecret = process.env.TRACKING_API_SECRET;
  if (!expectedSecret) return unauthorized("tracking secret is not configured");
  const receivedSecret = getHeader(request, TRACKING_SECRET_HEADER);
  if (!timingSafeStringEqual(receivedSecret, expectedSecret)) return unauthorized();
  return null;
}
```

The four endpoints missing this check (verified — none import `requireTrackingSecret`):
- `api/dev/test-payment-sync.ts` (POST; current body has no auth — see lines 10-31)
- `api/dev/test-lead.ts` (POST; lines 10-40)
- `api/dev/bootstrap-check.ts` (no auth)
- `api/dev/test-patient-treatments.ts` (GET; lines 24-52)

Note `test-patient-treatments.ts` and `bootstrap-check.ts` import only from `../_lib/http.js`
today, so you must also add the `requireTrackingSecret` import from `../../src/index.js`.

## Commands you will need

| Purpose   | Command (from `apps/tracking-core/`) | Expected            |
|-----------|--------------------------------------|---------------------|
| Install   | `npm ci`                             | exit 0              |
| Typecheck | `npm run check`                      | exit 0, no errors   |
| Tests     | `npm test`                           | all pass            |
| Build     | `npm run build`                      | exit 0              |

## Scope

**In scope** (only these files):
- `api/dev/test-payment-sync.ts`
- `api/dev/test-lead.ts`
- `api/dev/bootstrap-check.ts`
- `api/dev/test-patient-treatments.ts`

**Out of scope** (do NOT touch):
- The 13 `api/dev/*` endpoints that already call `requireTrackingSecret`.
- `src/http/auth.ts` — the guard is correct; only call it.
- Do NOT change request/response bodies or the demo data — only add the auth gate.

## Git workflow

- Branch: `advisor/013-dev-endpoint-auth`
- One commit, conventional style: `fix(security): require tracking secret on remaining dev endpoints`.
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Add the guard to each endpoint

In each of the four files, immediately **after** the existing method check
(`if (request.method !== ...) { methodNotAllowed(response); return; }`) and **before** any
real work, insert:

```ts
const authError = requireTrackingSecret(toHttpRequest(request));
if (authError) {
  send(response, authError);
  return;
}
```

For `test-patient-treatments.ts` and `bootstrap-check.ts`, also add the import at the top:
```ts
import { requireTrackingSecret } from "../../src/index.js";
```
(In `test-payment-sync.ts` and `test-lead.ts`, `toHttpRequest`/`send` are already imported;
add `requireTrackingSecret` to the existing `../../src/index.js` import if one exists, else
add a new import line.)

Ensure `toHttpRequest` and `send` are imported in each file (they already are in all four —
confirm).

**Verify**: `npm run check` → exit 0.

### Step 2: Confirm coverage

**Verify**: from `apps/tracking-core/`, run:
```
for f in api/dev/*.ts; do grep -q requireTrackingSecret "$f" || echo "NO AUTH: $f"; done
```
→ prints nothing (every dev endpoint now gates on the secret).

## Test plan

These are thin Vercel handlers; full HTTP integration tests are covered by plan 016. For
this plan, the verification is static (Step 2 grep) plus `npm run check`/`npm run build`.
Do **not** add bespoke tests here unless plan 016 has already landed a request-fixture
helper you can reuse — if it has, add one "missing secret → 401" test per endpoint.

## Done criteria

ALL must hold (from `apps/tracking-core/`):

- [ ] `npm run check` exits 0
- [ ] `npm run build` exits 0
- [ ] `npm test` exits 0 (no regressions)
- [ ] `for f in api/dev/*.ts; do grep -q requireTrackingSecret "$f" || echo "NO AUTH: $f"; done` prints nothing
- [ ] `git status` shows only the four in-scope files modified
- [ ] `plans/README.md` status row for 013 updated

## STOP conditions

Stop and report if:
- An endpoint's structure differs from the "Current state" pattern (e.g. it doesn't take
  `(request, response)` Vercel args).
- `requireTrackingSecret` or `toHttpRequest` no longer exists or has a different signature.
- Adding the guard breaks an existing test (means something depended on the open behavior —
  report it; do not weaken the guard).

## Maintenance notes

- The reviewer should consider whether `api/dev/*` should be disabled entirely in production
  via a `ENABLE_DEV_ENDPOINTS` env flag (defense in depth beyond the shared secret). That is
  a deliberate follow-up, not part of this plan.
- These endpoints all share the single `TRACKING_API_SECRET`. A separate hardening track
  (dedicated admin secret) is noted in the audit but out of scope here.
