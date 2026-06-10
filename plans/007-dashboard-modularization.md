# Plan 007: Split dashboard.tsx into route modules with marked visual differentiation

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 56742e6..HEAD -- apps/tracking-core/src/components/ apps/tracking-core/src/ui/`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1 (blocks plans 008, 009, 010, 011)
- **Effort**: L
- **Risk**: MED (large mechanical refactor; mitigated by zero-logic-change rule)
- **Depends on**: none
- **Category**: tech-debt
- **Planned at**: commit `56742e6`, 2026-06-10

## Why this matters

`src/components/dashboard.tsx` is 2,725 lines: one component holding ~20 useState hooks, 11 fetch calls, hash-based routing, and every section of the product (atribución, Elevator, Windsor, status, acciones). Every new feature (plans 008–011 add range selectors, comparatives, a daily form, and an efforts panel) would make it worse. This plan splits it into one file per route/module, each wrapped in a visually distinct "module frame" with marked color contrast so users understand where one module ends and the next begins — a direct stakeholder request.

**This is a mechanical extraction. Behavior must not change.** No new features, no renamed states, no redesigned layouts — only moving code into files and adding the module frame wrapper.

## Current state

- `apps/tracking-core/src/components/dashboard.tsx` (2,725 lines) — the god component. Key landmarks:
  - Lines ~3–300: imports + local interfaces (`MonthlyDashboard`, `SystemStatus`, `BranchSummary`, `DayBlock`, `PaymentBlock`, `PaymentsSyncResult`, `ElevatorImportResult`, `ReferenceDiagnostic`, …)
  - Line 301: `const DASHBOARD_BROWSER_CACHE_KEY = "drdienteMonthlyDashboardCache";`
  - Line 304: `export function Dashboard() {` — all state lives here
  - Fetch calls at lines 363 (`/api/dev/dentalink-monthly-dashboard`), 393 (`/api/status`), 428 (elevator-import), 471 (reference-diagnostic), 507/514 (stape), 549 (test-payment-sync), 588/595 (windsor), 633 (windsor-accounts), 684 (cron-heartbeat)
  - Hash routing: sections render conditionally on a `route` value (see line 1025: `title={route === "status" ? ... }`); sidebar links use `href="#/dashboard"` style anchors (`app-sidebar.tsx:42`)
  - Section boundaries by CardTitle: "Pacientes del mes" (901), "Elevator CRM" (980), "Configuracion" (1011), "Estado" (1149), "Acciones" (1308), "Revenue" (1509), "Ultimos pacientes Dentalink" (1568), "Tratamientos y revenue" (1593), "Revenue por sucursal" (1637), "Bloques del mes" (1703), "Diagnostico de referencias" (1748), "Windsor AI marketing data" (1887), "Flujo de conversiones" (2151), "Enviar pacientes recientes a Elevator" (2303), "Quick actions" (2520)
- Already-extracted exemplars to imitate: `src/components/executive.tsx` (1,162 lines, self-contained page), `src/components/projection.tsx`, `src/components/stats.tsx`, `src/components/revenue-chart.tsx`
- Entry point: `src/ui/main.tsx` renders `<AppShell><Dashboard /></AppShell>`
- Theming: CSS variables; light/dark toggle exists (`theme-toggle.tsx`). Brand doc: `apps/tracking-core/BRANDING.md`
- UI kit available in `src/components/ui/`: card, badge, button, select, separator, etc.
- Tests/CI exist: vitest, `npm test`, `npm run check` (both must stay green)

## Commands you will need

| Purpose   | Command (run in `apps/tracking-core/`) | Expected on success |
|-----------|----------------------------------------|---------------------|
| Install   | `npm install`                          | exit 0              |
| Typecheck | `npm run check`                        | exit 0, no errors   |
| Tests     | `npm test`                             | all pass (34+)      |
| Build     | `npm run build`                        | exit 0              |
| Dev       | `npm run dev`                          | Vite serves UI      |

## Scope

**In scope** (the only files you should modify/create):
- `apps/tracking-core/src/components/dashboard.tsx` (shrink to a router/orchestrator)
- `apps/tracking-core/src/components/dashboard/` (new directory — extracted modules)
- `apps/tracking-core/src/components/dashboard/module-frame.tsx` (new — visual frame)
- `apps/tracking-core/src/types/dashboard.ts` (new — shared interfaces moved out)
- `apps/tracking-core/src/ui/styles.css` (only to add module accent CSS variables)
- `plans/README.md` (status row)

**Out of scope** (do NOT touch):
- Any file in `api/` — backend unchanged
- `executive.tsx`, `projection.tsx`, `stats.tsx` — already extracted, leave as-is
- `app-sidebar.tsx` nav structure (you may read it; do not add routes — plans 010/011 do that)
- Any behavior change: no renamed API fields, no new fetches, no removed features

## Git workflow

- Branch: work directly on the current branch (executor is dispatched in an isolated worktree)
- Commit per step; message style: short imperative, e.g. `Extract attribution module from dashboard.tsx`

## Steps

### Step 1: Move shared interfaces to `src/types/dashboard.ts`

Create `src/types/dashboard.ts` exporting every interface currently declared inside `dashboard.tsx` (lines ~40–300): `MonthlyDashboard`, `SystemStatus`, `BranchSummary`, `DayBlock`, `PaymentBlock`, `PaymentsSyncResult`, `ElevatorImportResult`, `ReferenceDiagnostic`, and any others found there. In `dashboard.tsx`, delete the local declarations and import from the new file.

**Verify**: `npm run check` → exit 0.

### Step 2: Create the module frame with accent colors

Create `src/components/dashboard/module-frame.tsx`:

```tsx
import type { ReactNode } from "react";

export type ModuleAccent =
  | "attribution"   // revenue/atribución
  | "operations"    // Elevator / acciones
  | "marketing"     // Windsor / esfuerzos
  | "health"        // estado del sistema
  | "reports";      // formularios/reportes

export function ModuleFrame({
  accent,
  title,
  description,
  children,
}: {
  accent: ModuleAccent;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section
      data-module={accent}
      className="rounded-xl border-2 p-4 md:p-6 space-y-4"
      style={{
        borderColor: `var(--module-${accent})`,
        background: `color-mix(in oklab, var(--module-${accent}) 6%, var(--background))`,
      }}
    >
      <header className="flex items-center gap-2">
        <span
          className="h-3 w-3 rounded-full"
          style={{ background: `var(--module-${accent})` }}
        />
        <h2 className="font-semibold text-lg tracking-tight">{title}</h2>
        {description ? (
          <p className="text-muted-foreground text-sm">{description}</p>
        ) : null}
      </header>
      {children}
    </section>
  );
}
```

In `src/ui/styles.css`, add five CSS variables in both the `:root` (light) and `.dark` blocks, choosing values consistent with the existing palette in `BRANDING.md` — distinctly contrasting hues, e.g.:

```css
--module-attribution: oklch(0.65 0.18 250); /* blue */
--module-operations: oklch(0.65 0.15 150);  /* green */
--module-marketing: oklch(0.7 0.16 60);     /* amber */
--module-health: oklch(0.62 0.2 25);        /* red-orange */
--module-reports: oklch(0.6 0.17 300);      /* purple */
```

**Verify**: `npm run check` → exit 0.

### Step 3: Extract one module at a time

Create these files under `src/components/dashboard/`, moving the corresponding JSX + the state/handlers used **only** by that section out of `dashboard.tsx`. State used by more than one module stays in `Dashboard` and is passed as props. Extraction order (smallest first to build confidence):

1. `system-health.tsx` — "Estado" card (line ~1149), cron-heartbeat fetch (line 684), "Estado del sistema" route content (~1025). Accent: `health`.
2. `actions.tsx` — "Acciones" (~1308), "Quick actions" (~2520), "Ultima accion ejecutada" (~1445). Accent: `operations`.
3. `windsor-panel.tsx` — "Windsor AI marketing data" (~1887) + windsor fetches (588–633). Accent: `marketing`.
4. `elevator-panel.tsx` — "Elevator CRM" (~980), "Enviar pacientes recientes a Elevator" (~2303), elevator-import fetch (428). Accent: `operations`.
5. `attribution-panel.tsx` — "Revenue" (~1509), "Pacientes del mes" (~901), "Tratamientos y revenue" (~1593), "Revenue por sucursal" (~1637), "Bloques del mes" (~1703), "Ultimos pacientes Dentalink" (~1568), "Flujo de conversiones" (~2151). Accent: `attribution`.
6. `diagnostics-panel.tsx` — "Diagnostico de referencias Dentalink" (~1748), stape/payment-sync test cards, "Configuracion" (~1011). Accent: `health`.

Wrap each extracted module's top-level JSX in `<ModuleFrame accent="..." title="...">`. Keep all class names, copy, and logic otherwise identical.

**Verify after EACH extraction**: `npm run check` → exit 0, then `npm run build` → exit 0. Commit each extraction separately.

### Step 4: Shrink `dashboard.tsx` to orchestrator

After all extractions, `dashboard.tsx` should contain only: the shared state (secret, data, systemStatus, route), the shared fetch helpers for `/api/dev/dentalink-monthly-dashboard` and `/api/status`, the browser-cache logic (`DASHBOARD_BROWSER_CACHE_KEY`), the hash-route switch, and composition of the module components.

**Verify**: `wc -l src/components/dashboard.tsx` → **under 600 lines**. `npm run build` → exit 0.

### Step 5: Visual smoke test

Run `npm run dev`, open the app, and confirm: every section that existed before still renders, each module shows its colored frame + dot, light and dark themes both look correct (toggle), and the secret-based data flow still works (paste secret → data loads).

**Verify**: manual checklist above; no console errors in browser devtools.

## Test plan

This is a pure refactor — the existing suite must stay green. No new unit tests required, but:
- `npm test` → all existing tests pass.
- If any extracted module ends up with a pure helper function (e.g. formatting), it may be moved to `src/components/formater.ts` only if already there; do not invent new helpers.

## Done criteria

- [ ] `npm run check` exits 0
- [ ] `npm test` exits 0
- [ ] `npm run build` exits 0
- [ ] `wc -l apps/tracking-core/src/components/dashboard.tsx` < 600
- [ ] `ls apps/tracking-core/src/components/dashboard/` shows `module-frame.tsx` + ≥6 module files
- [ ] Every module visually framed with a distinct accent color in light AND dark theme
- [ ] No diff in any `api/` file (`git diff --stat -- apps/tracking-core/api/` empty)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `dashboard.tsx` line landmarks don't match the "Current state" section (drift).
- An extraction forces changing the shape of data passed to `executive.tsx` or `projection.tsx` (out of scope).
- After two attempts an extraction still fails typecheck — report which state dependencies are tangled instead of restructuring logic.
- You find yourself modifying fetch URLs, request bodies, or response handling — that is a behavior change; stop.

## Maintenance notes

- Plans 008–011 build on this structure: 008/009 modify `attribution-panel.tsx`, 010 adds a new `daily-report` module, 011 adds an `efforts-panel`. Reviewers should check that module boundaries match those plans' expectations.
- The `ModuleAccent` union is the contract for module colors; new modules must add a variable to `styles.css` in BOTH theme blocks.
- Deferred deliberately: converting hash routing to a router library, and splitting `executive.tsx` (1,162 lines) — separate effort.
