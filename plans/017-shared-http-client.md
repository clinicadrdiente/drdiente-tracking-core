# Plan 017: Integration clients share one HTTP request helper and env loader

> **Executor instructions**: Follow step by step. Run every verification command
> and confirm the result before moving on. On any "STOP condition", stop and
> report. When done, update this plan's row in `plans/README.md`.
>
> **Drift check (run first)**: from `apps/tracking-core/`, run
> `git diff --stat ffad029..HEAD -- src/modules/dentalink/ src/modules/elevator/ src/modules/stape/ src/modules/windsor/`
> If files changed, compare the "Current state" excerpts to live code; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: L
- **Risk**: MED
- **Depends on**: plans/001-tests-ci.md (tests are the safety net) — DONE
- **Category**: tech-debt
- **Planned at**: commit `ffad029`, 2026-06-17

## Why this matters

The four integration clients (Dentalink, Elevator, Stape, Windsor) each hand-roll the same
HTTP plumbing: build URL, `fetch` with auth headers, check `response.ok`, throw on failure,
parse JSON. Adding cross-cutting behavior (timeouts, retries, request-id/correlation logging)
today means editing four files in lockstep, and the error handling has already drifted
(Dentalink truncates nothing, Elevator slices error bodies to 300 chars, Stape inlines its
own). All four config modules also duplicate an identical `getEnv` helper. Consolidating
lowers the cost of the next integration and of any future reliability work.

This is a **behavior-preserving refactor**. The observable HTTP requests (method, URL,
headers, body) and the thrown error types must be byte-for-byte identical afterward.

## Current state

- `src/modules/dentalink/client.ts:159-182` — `ApiDentalinkClient.request(method, path, body)`:
  builds `new URL(path.replace(/^\/+/, ""), baseUrl)`, sends `Authorization: "<scheme> <token>"`
  + `Content-Type: application/json`, throws `DentalinkRequestError(status, msg)` on `!ok`,
  returns `response.json()`. Callers depend on the error type + status (e.g.
  `payments-sync.ts:44` checks `error instanceof DentalinkRequestError && error.status === 429`).
- `src/modules/elevator/client.ts:146-173` — `ApiElevatorClient.request(method, path, body, query)`:
  `new URL(path, baseUrl)` + `searchParams`, headers `Authorization: "Bearer <key>"`,
  `Content-Type`, `Version: <apiVersion>`; on `!ok` reads text and throws
  `ElevatorApiError(status, bodyText)` (which parses the body for the duplicate-contact id —
  see `readDuplicateContactId`). Returns `response.json()`.
- `src/modules/stape/client.ts:26-40` — `ApiStapeClient.dispatch` inlines its own `fetch`,
  custom headers (`config.apiKeyHeader`), throws a plain `Error` with sliced body on `!ok`.
- All four `config.ts` (`dentalink` lines 39-41 shown; `elevator`, `stape`, `windsor` identical
  shape) define:
  ```ts
  function getEnv(name: string, fallback = ""): string {
    return process.env[name] ?? fallback;
  }
  ```
- Both API clients already accept an injectable `fetchImpl` (constructor 2nd arg) — keep that;
  the shared helper must accept an injected fetch too, for tests.

### Conventions

- ESM `.js` import suffixes. Keep stub clients untouched.
- Do NOT change the per-client error classes or their fields — callers and
  `readDuplicateContactId` depend on them. The shared helper raises a generic error that each
  client maps to its own type.

## Commands you will need

| Purpose   | Command (from `apps/tracking-core/`) | Expected            |
|-----------|--------------------------------------|---------------------|
| Install   | `npm ci`                             | exit 0              |
| Typecheck | `npm run check`                      | exit 0, no errors   |
| Tests     | `npm test`                           | all pass            |
| Build     | `npm run build`                      | exit 0              |

## Scope

**In scope**:
- `src/config/env.ts` (create — shared `getEnv`)
- `src/modules/dentalink/config.ts`, `src/modules/elevator/config.ts`,
  `src/modules/stape/config.ts`, `src/modules/windsor/config.ts` (import shared `getEnv`)
- `src/http/json-client.ts` (create — shared request helper)
- `src/modules/dentalink/client.ts`, `src/modules/elevator/client.ts`,
  `src/modules/stape/client.ts` (use the helper in their `request`/`dispatch`)
- `src/http/json-client.test.ts` (create)

**Out of scope**:
- `src/modules/windsor/client.ts` request internals — only its `config.ts` adopts shared
  `getEnv` in this plan (Windsor client refactor can be a follow-up; keep blast radius bounded).
- Changing request URLs, headers, bodies, or error-type identities.
- Adding retries/timeouts now — this plan only creates the seam. Note the follow-up.

## Git workflow

- Branch: `advisor/017-shared-http-client`
- Commit per logical unit: (1) shared `getEnv`, (2) shared `json-client` + tests, (3) each
  client adopting it. Conventional style.
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Shared `getEnv`

Create `src/config/env.ts`:
```ts
export function getEnv(name: string, fallback = ""): string {
  return process.env[name] ?? fallback;
}
```
In each of the four `config.ts`, delete the local `getEnv` and
`import { getEnv } from "../../config/env.js";` (adjust depth — from `src/modules/<x>/` it is
`../../config/env.js`).

**Verify**: `npm run check` → exit 0; `npm test` → all pass (configs behave identically).

### Step 2: Shared JSON request helper

Create `src/http/json-client.ts`:
```ts
export class HttpRequestError extends Error {
  constructor(readonly status: number, readonly bodyText: string) {
    super(`HTTP request failed with status ${status}`);
    this.name = "HttpRequestError";
  }
}

export interface JsonRequestOptions {
  url: URL | string;
  method: string;
  headers: Record<string, string>;
  body?: unknown;            // serialized as JSON when present and method !== "GET"
  fetchImpl?: typeof fetch;
}

export async function jsonRequest<T = unknown>(opts: JsonRequestOptions): Promise<T> {
  const f = opts.fetchImpl ?? fetch;
  const response = await f(opts.url, {
    method: opts.method,
    headers: opts.headers,
    body: opts.body !== undefined && opts.method !== "GET"
      ? JSON.stringify(opts.body)
      : undefined,
  });
  if (!response.ok) {
    let text = "";
    try { text = await response.text(); } catch { /* ignore */ }
    throw new HttpRequestError(response.status, text);
  }
  return (await response.json()) as T;
}
```

Add `src/http/json-client.test.ts`: inject a fake `fetchImpl` and assert (a) success returns
parsed JSON, (b) a non-ok response throws `HttpRequestError` with the right `status`/`bodyText`,
(c) GET requests send no body, (d) POST serializes the body.

**Verify**: `npm test src/http/json-client.test.ts` → all pass.

### Step 3: Adopt the helper in each client — preserving behavior exactly

- **Dentalink** (`request`, lines 159-182): build the same URL/headers, call
  `jsonRequest({ url, method, headers, body, fetchImpl: this.fetchImpl })` inside try/catch;
  on `HttpRequestError`, re-throw `new DentalinkRequestError(err.status, \`Dentalink API request failed with status ${err.status} for ${url.pathname}\`)`.
  Keep the exact message format.
- **Elevator** (`request`, lines 146-173): same approach; on `HttpRequestError`, re-throw
  `new ElevatorApiError(err.status, err.bodyText)` so `readDuplicateContactId` still works.
- **Stape** (`dispatch`, lines 26-40): use `jsonRequest` for the POST. Stape currently throws
  a plain `Error` with a sliced body; preserve that by catching `HttpRequestError` and
  throwing `new Error(\`Stape request failed with status ${err.status}: ${err.bodyText.slice(0, 300)}\`)`.
  Note Stape does not read a JSON response body today (it only checks ok); use a variant that
  ignores the response body, OR call `jsonRequest` and ignore the return. If Stape's endpoint
  may return non-JSON on success, do NOT force a `.json()` parse — in that case keep Stape's
  fetch inline and only adopt shared `getEnv`; record this deviation in the README row.

**Verify after each client**: `npm run check` → exit 0; `npm test` → all pass.

### Step 4: Full verification

**Verify**: `npm run check` && `npm test` && `npm run build` → all exit 0.

## Test plan

- New `src/http/json-client.test.ts` (helper unit tests).
- The existing suite (`elevator/events.test.ts`, state, reports, etc.) is the regression net
  for the client refactor — they must stay green.
- Verification: `npm test` → all pass.

## Done criteria

ALL must hold (from `apps/tracking-core/`):

- [ ] `npm run check` exits 0
- [ ] `npm test` exits 0; new json-client tests pass; existing tests unchanged & green
- [ ] `npm run build` exits 0
- [ ] `grep -rn "function getEnv" src/modules/*/config.ts` returns nothing (all use shared)
- [ ] `grep -n "instanceof DentalinkRequestError" src/routes/payments-sync.ts` still present
      and `DentalinkRequestError` still thrown by the Dentalink client
- [ ] `git status` shows only in-scope files
- [ ] `plans/README.md` status row for 017 updated

## STOP conditions

Stop and report if:
- Any existing test fails after a client adoption and the cause is a behavior change you
  cannot make identical (different header, URL, or error type). Revert that client and report.
- Stape's success response is not JSON and cannot be handled without changing behavior (see
  Step 3 deviation note).
- The `fetchImpl` injection point differs from the "Current state" (constructor 2nd arg).

## Maintenance notes

- This plan only creates the shared seam. The intended follow-up — adding timeout + bounded
  retry + correlation-id logging in `jsonRequest` once — is now a single-file change; call it
  out as a future plan.
- `windsor/client.ts` request internals were intentionally left out to bound risk; a follow-up
  can route it through `jsonRequest` the same way.
- Reviewer: diff the actual outbound requests (headers especially: Dentalink `Token` scheme vs
  Elevator `Bearer`+`Version`) to confirm they are unchanged.
