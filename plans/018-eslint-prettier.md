# Plan 018: Lint and format gates exist and run in CI

> **Executor instructions**: Follow step by step. Run every verification command
> and confirm the result before moving on. On any "STOP condition", stop and
> report. When done, update this plan's row in `plans/README.md`.
>
> **Drift check (run first)**: from `apps/tracking-core/`, run
> `git diff --stat ffad029..HEAD -- package.json` and check whether an ESLint or
> Prettier config now exists (`ls -a apps/tracking-core | grep -iE "eslint|prettier"`).
> If lint/format tooling was added since this plan was written, treat it as a
> STOP condition and reconcile instead.

## Status

- **Priority**: P3
- **Effort**: S–M
- **Risk**: LOW–MED (formatting churn on first run)
- **Depends on**: none
- **Category**: dx
- **Planned at**: commit `ffad029`, 2026-06-17

## Why this matters

CI runs typecheck + tests + build but there is **no linter and no formatter**. Style and a
class of bugs (unused vars, floating promises, `no-explicit-any` drift) are caught only by
human review. Adding ESLint + Prettier with a CI gate makes quality mechanical and keeps the
codebase consistent as more agent-generated code lands.

## Current state

- No `.eslintrc*`, no `eslint.config.*`, no `.prettierrc*`, no `.editorconfig` (verified absent).
- `package.json` scripts today: `build`, `check`, `dev`, `test`, `test:watch`, `test:ui`.
  Stack: TypeScript 5.8 (ESM), React 19, Vite 7, Vitest 4.
- CI: `.github/workflows/ci.yml` runs (working dir `apps/tracking-core`, Node 22):
  `npm ci` → `npm run check` → `npm test` → `npm run build`.

## Commands you will need

| Purpose      | Command (from `apps/tracking-core/`) | Expected          |
|--------------|--------------------------------------|-------------------|
| Install      | `npm ci`                             | exit 0            |
| Add deps     | `npm install -D <pkgs>`              | exit 0            |
| Typecheck    | `npm run check`                      | exit 0            |
| Lint         | `npm run lint`                       | exit 0 (after fixes) |
| Format check | `npm run format:check`               | exit 0            |
| Tests        | `npm test`                           | all pass          |
| Build        | `npm run build`                      | exit 0            |

## Scope

**In scope**:
- `apps/tracking-core/package.json` (devDeps + `lint`, `format`, `format:check` scripts)
- `apps/tracking-core/eslint.config.js` (create — flat config)
- `apps/tracking-core/.prettierrc.json` (create)
- `apps/tracking-core/.prettierignore` (create)
- `.editorconfig` (create at **repo root** `~/Documents/drdiente-tracking-core/.editorconfig`)
- `.github/workflows/ci.yml` (add lint + format:check steps)
- Whatever source files Prettier reformats in the baseline commit (Step 4)

**Out of scope**:
- Changing any program logic. The only allowed source edits are (a) Prettier formatting and
  (b) minimal fixes for genuine ESLint errors (e.g. an unused import). If ESLint surfaces many
  errors implying real issues, STOP and report rather than mass-disabling rules.
- The Python content agent in the other repo — this plan is `apps/tracking-core` only.

## Git workflow

- Branch: `advisor/018-eslint-prettier`
- Commit sequence (keep formatting churn isolated for reviewability):
  1. `chore: add eslint + prettier config and scripts`
  2. `style: apply prettier formatting baseline` (the large reformat — formatting only)
  3. `ci: run lint and format check`
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Install dev dependencies

```
npm install -D eslint @eslint/js typescript-eslint eslint-plugin-react-hooks \
  prettier eslint-config-prettier
```

**Verify**: `npm ci` still resolves (`exit 0`); the packages appear in `devDependencies`.

### Step 2: Add configs

`eslint.config.js` (flat config; TS + React-hooks; disable rules that conflict with Prettier;
ignore build output and the standalone dashboard):
```js
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import prettier from "eslint-config-prettier";

export default tseslint.config(
  { ignores: ["dist/**", "public/**", "node_modules/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { plugins: { "react-hooks": reactHooks }, rules: { ...reactHooks.configs.recommended.rules } },
  prettier,
);
```

`.prettierrc.json`:
```json
{ "semi": true, "singleQuote": false, "trailingComma": "all", "printWidth": 80 }
```
(Match the prevailing style in the codebase — double quotes, semicolons, trailing commas are
already used; verify against a few files before locking these in.)

`.prettierignore`:
```
dist
node_modules
public
package-lock.json
```

`.editorconfig` at the repo root:
```
root = true
[*]
charset = utf-8
indent_style = space
indent_size = 2
end_of_line = lf
insert_final_newline = true
trim_trailing_whitespace = true
```

### Step 3: Add scripts to `package.json`

```json
"lint": "eslint .",
"format": "prettier --write .",
"format:check": "prettier --check ."
```

**Verify**: `npm run lint` runs (it may report errors — handled next); `npm run format:check`
runs (will report files needing formatting — handled in Step 4).

### Step 4: Apply formatting baseline, then resolve lint errors

1. Run `npm run format` (reformats the tree). Commit as the isolated `style:` commit.
2. Run `npm run lint`. For each error:
   - If it's a trivial true positive (unused import/var) → fix minimally.
   - If a rule is too strict for this codebase's intentional patterns (e.g.
     `@typescript-eslint/no-explicit-any` on the deliberate JSON-boundary casts) → relax that
     specific rule to `"warn"` in `eslint.config.js` with a comment, rather than editing many
     files. Do **not** blanket-disable.
   - If errors indicate real bugs → STOP and report (separate plan).

**Verify**: `npm run lint` → exit 0; `npm run format:check` → exit 0; `npm run check` → exit 0;
`npm test` → all pass; `npm run build` → exit 0.

### Step 5: Wire CI

In `.github/workflows/ci.yml`, add two steps after `npm ci` and before/around the type check:
```yaml
      - name: Lint
        run: npm run lint

      - name: Format check
        run: npm run format:check
```
Keep the existing `working-directory: apps/tracking-core` default.

**Verify**: re-read the file; the steps run within the `apps/tracking-core` working dir.

## Test plan

- No new unit tests (tooling change). The gate is the lint/format/check/test/build chain all
  exiting 0.

## Done criteria

ALL must hold (from `apps/tracking-core/` unless noted):

- [ ] `npm run lint` exits 0
- [ ] `npm run format:check` exits 0
- [ ] `npm run check` exits 0
- [ ] `npm test` exits 0
- [ ] `npm run build` exits 0
- [ ] `eslint.config.js`, `.prettierrc.json`, `.prettierignore` exist; `.editorconfig` exists at repo root
- [ ] `ci.yml` contains `npm run lint` and `npm run format:check`
- [ ] `plans/README.md` status row for 018 updated

## STOP conditions

Stop and report if:
- ESLint reports errors that look like real bugs (not style) — report for a dedicated plan.
- The formatting baseline would conflict with an in-flight branch the operator cares about
  (ask before committing a tree-wide reformat).
- Adding deps breaks `npm ci` resolution on Node 22.

## Maintenance notes

- The `style:` reformat commit will collide with other open branches; land it when the branch
  queue is quiet, or coordinate a rebase.
- Consider adding `husky` + `lint-staged` for pre-commit gating as a follow-up (was noted in
  the audit, deliberately deferred here to keep this plan small).
- Reviewer: confirm the `style:` commit contains only formatting (no logic diffs) so it can be
  trusted at a glance.
