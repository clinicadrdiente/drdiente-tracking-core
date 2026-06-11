# Plan 005: Cron endpoint requires CRON_SECRET and secrets use timing-safe comparison

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 95aa45e..HEAD -- apps/tracking-core/src/http/auth.ts apps/tracking-core/api/cron/payments-sync.ts`
> If any in-scope file changed, compare "Current state" excerpts before proceeding.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `95aa45e`, 2026-06-10

## Why this matters

Two security issues:

**Issue A — Cron spoofable without CRON_SECRET**: `api/cron/payments-sync.ts:44-48` falls back to a user-agent string check (`includes("vercel-cron")`) when `CRON_SECRET` is not set. Any HTTP client that sends `User-Agent: vercel-cron/1.0` can trigger a full payment sync run. An unauthenticated actor can trigger the cron, which reads from Dentalink (rate-limit burn) and dispatches to Stape/Elevator. Fix: fail hard if `CRON_SECRET` is not configured, instead of falling back.

**Issue B — Timing-unsafe secret comparison**: `src/http/auth.ts:17` compares the API secret with `!==`, which is not constant-time. Same for the `CRON_SECRET` comparison at `api/cron/payments-sync.ts:45`. In theory a timing attack can recover the secret character by character. In practice, Vercel's network latency dwarfs microsecond differences, but this is a trivially cheap fix.

Both issues are low real-world risk in this deployment, but cheap to fix.

## Current state

File: `apps/tracking-core/src/http/auth.ts` (lines 9–22):
```ts
export function requireTrackingSecret(request: AnyHttpRequest): HttpResponse | null {
  const expectedSecret = process.env.TRACKING_API_SECRET;

  if (!expectedSecret) {
    return unauthorized("tracking secret is not configured");
  }

  const receivedSecret = getHeader(request, TRACKING_SECRET_HEADER);
  if (receivedSecret !== expectedSecret) {    // <-- not timing-safe
    return unauthorized();
  }

  return null;
}
```

File: `apps/tracking-core/api/cron/payments-sync.ts` (lines 42–55):
```ts
function isAuthorizedCronRequest(request: VercelRequest): boolean {
  const expectedSecret = process.env.CRON_SECRET;
  if (expectedSecret) {
    return readBearerToken(request) === expectedSecret;  // <-- not timing-safe
  }

  return readHeader(request, "user-agent")?.includes("vercel-cron") ?? false;  // <-- spoofable fallback
}
```

## Commands you will need

| Purpose   | Command                                   | Expected on success |
|-----------|-------------------------------------------|---------------------|
| Typecheck | `npm run check` (in `apps/tracking-core`) | exit 0, no errors   |

## Scope

**In scope**:
- `apps/tracking-core/src/http/auth.ts`
- `apps/tracking-core/api/cron/payments-sync.ts`

**Out of scope**:
- All other `api/` files
- `src/http/handlers.ts`
- `src/modules/` directory

## Git workflow

Branch: `advisor/005-auth-hardening`
Commit: `Require CRON_SECRET and use timing-safe secret comparison`

## Steps

### Step 1: Add timing-safe comparison helper

In `apps/tracking-core/src/http/auth.ts`, add an import and a helper:

```ts
import { timingSafeEqual, createHash } from "node:crypto";
```

Add helper function at the bottom of the file:
```ts
function timingSafeStringEqual(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return false;
  // Buffers must be same length for timingSafeEqual; hash both to normalize length.
  const hashA = createHash("sha256").update(a).digest();
  const hashB = createHash("sha256").update(b).digest();
  return timingSafeEqual(hashA, hashB);
}
```

Note: hashing is required because `timingSafeEqual` requires equal-length buffers. Hashing to SHA-256 normalizes both values to 32 bytes regardless of length. This is a standard pattern for secret comparison.

**Verify**: `npm run check` → exit 0 (TypeScript accepts `node:crypto` imports — it's available in Node 22 / Vercel).

### Step 2: Use timing-safe comparison in requireTrackingSecret

In `src/http/auth.ts`, replace:
```ts
if (receivedSecret !== expectedSecret) {
  return unauthorized();
}
```
With:
```ts
if (!timingSafeStringEqual(receivedSecret, expectedSecret)) {
  return unauthorized();
}
```

**Verify**: `npm run check` → exit 0.

### Step 3: Require CRON_SECRET and use timing-safe comparison in cron handler

In `apps/tracking-core/api/cron/payments-sync.ts`, replace the `isAuthorizedCronRequest` function:

**Before**:
```ts
function isAuthorizedCronRequest(request: VercelRequest): boolean {
  const expectedSecret = process.env.CRON_SECRET;
  if (expectedSecret) {
    return readBearerToken(request) === expectedSecret;
  }

  return readHeader(request, "user-agent")?.includes("vercel-cron") ?? false;
}
```

**After**:
```ts
import { timingSafeEqual, createHash } from "node:crypto";

function isAuthorizedCronRequest(request: VercelRequest): boolean {
  const expectedSecret = process.env.CRON_SECRET;
  if (!expectedSecret) {
    // Fail closed: cron must be explicitly protected. Set CRON_SECRET in Vercel env.
    return false;
  }

  const token = readBearerToken(request);
  return timingSafeStringEqual(token ?? "", expectedSecret);
}

function timingSafeStringEqual(a: string, b: string): boolean {
  const hashA = createHash("sha256").update(a).digest();
  const hashB = createHash("sha256").update(b).digest();
  return timingSafeEqual(hashA, hashB);
}
```

Note: Do NOT import `timingSafeStringEqual` from `src/http/auth.ts` — the `api/` layer should not import from the `src/http/` layer at runtime (they're separate entry points). Keep the helper duplicated.

**Verify**: `grep "vercel-cron" apps/tracking-core/api/cron/payments-sync.ts` → no output (fallback removed).

### Step 4: Add CRON_SECRET to .env.example

In `apps/tracking-core/.env.example`, add (if not already present):
```
# Required on Vercel: protects the cron endpoint from unauthenticated triggers.
CRON_SECRET=your-long-random-secret-here
```

**Verify**: `grep "CRON_SECRET" apps/tracking-core/.env.example` → shows the entry.

### Step 5: Typecheck

**Verify**: `npm run check` (from `apps/tracking-core`) → exit 0.

## Done criteria

- [ ] `grep "timingSafeEqual" apps/tracking-core/src/http/auth.ts` → shows it's used
- [ ] `grep "timingSafeEqual" apps/tracking-core/api/cron/payments-sync.ts` → shows it's used
- [ ] `grep "vercel-cron" apps/tracking-core/api/cron/payments-sync.ts` → no output
- [ ] `grep "!== expectedSecret\|=== expectedSecret" apps/tracking-core/src/http/auth.ts apps/tracking-core/api/cron/payments-sync.ts` → no output
- [ ] `npm run check` exits 0
- [ ] No files outside the in-scope list are modified
- [ ] `plans/README.md` status row updated to DONE

## STOP conditions

- `node:crypto` is not available in the TypeScript environment (tsconfig `lib` settings) — stop and report, don't add a polyfill.
- Vercel Cron actually sends an `Authorization: Bearer <CRON_SECRET>` header natively (check Vercel docs for your runtime version) — if that's the case, the existing bearer token read is already correct; just remove the fallback and add the guard.

## Maintenance notes

- After deploying this change, set `CRON_SECRET` in Vercel project env vars (Settings → Environment Variables). Generate a secure random value: `openssl rand -hex 32`.
- The cron will return 401 until `CRON_SECRET` is set on Vercel. Set it before deploying.
- The `timingSafeStringEqual` helper is duplicated in two files intentionally — avoid cross-layer imports between `api/` and `src/http/`. If a shared `api/_lib/` crypto module is added later, consolidate there.
