# Plan 013: Persistencia dual — Supabase (BD) + Google Sheets (espejo)

> **Executor instructions**: step by step, verify each step, honor STOP
> conditions, update `plans/README.md` when done. Read
> `docs/agente-nube-arquitectura.md` §6 first.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MEDIUM (nuevas dependencias y credenciales externas)
- **Depends on**: plans/012-lead-intake-multicuenta.md
- **Category**: feature
- **Planned at**: 2026-06-22

## Why this matters

Los dueños quieren ver la base de leads y los reportes necesitan una verdad
histórica consultable. Hoy todo vive en Elevator + `StateStore` (Redis/File),
que no es una BD analítica ni una hoja legible. Supabase da la BD; Google Sheets
da el espejo que un dueño abre sin login técnico.

## Current state

- `StateStore` (`src/modules/state/state-store.ts`): File / Redis(Upstash REST) / InMemory. Métodos: `saveDailyReport`, `listDailyReports`, `claimPaymentProcessed`, `recordPatientTreatment`, `writeHeartbeat`, `setContactLeadSource`.
- Sin `@supabase/supabase-js`, sin `googleapis` en `package.json`.
- Plan 012 deja el lead canónico con `account/location/initialMessage`.

## Scope

**In scope**:
- `src/modules/persistence/supabase-leads.ts` (nuevo) — `upsertLead(canonicalLead)` idempotente por `event_id` (`on conflict do nothing`); cliente perezoso, no-op si no configurado.
- `src/modules/persistence/sheets-leads.ts` (nuevo) — `appendLeadRow(canonicalLead)` vía Google Sheets API (service account); no-op si no configurado.
- Esquema SQL en `docs/agente-nube-arquitectura.md` §6 → migración `supabase/migrations/001_leads.sql` (nuevo).
- Enganchar ambos en `api/agent/lead-intake.ts` (best-effort, no bloquean el alta en Elevator).
- Tests con cliente mock.

**Out of scope**:
- Reemplazar `StateStore` (sigue siendo la fuente de idempotencia operativa).
- Migrar reportes diarios a Supabase (futuro).

## Steps

### Step 1: Esquema y migración
Crear `supabase/migrations/001_leads.sql` con la tabla `leads` (§6). Aplicar en el proyecto Supabase. **Verify**: `select` vacío responde sin error.

### Step 2: Cliente Supabase
`upsertLead()` con `@supabase/supabase-js`, usando `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`. Patrón perezoso como los demás clientes (`isConfigured()`). **Verify**: `npm run check` → exit 0; test de upsert idempotente con mock.

### Step 3: Cliente Sheets
`appendLeadRow()` con service account (`GOOGLE_SHEETS_SPREADSHEET_ID`, `GOOGLE_SERVICE_ACCOUNT_JSON`). Una fila por lead, columnas = §6. **Verify**: test con mock; `npm run build` → exit 0.

### Step 4: Enganche best-effort
En `lead-intake.ts`, tras `postLead`, llamar `upsertLead` y `appendLeadRow` envueltos en try/catch independientes (un fallo de Sheets no rompe Supabase ni el 200). Loguear fallos vía observability. **Verify**: `npm test` → all pass.

## Done criteria

- [ ] `npm run check`, `npm test`, `npm run build` exit 0
- [ ] Un lead entrante aparece como fila en Supabase y en Google Sheets
- [ ] Reenvío del mismo `event_id` no duplica fila en Supabase
- [ ] Sin credenciales, los clientes hacen no-op sin romper el endpoint
- [ ] `plans/README.md` actualizado

## STOP conditions

- Decisión pendiente "Supabase ¿suma o reemplaza?" sin resolver → implementar como **capa adicional** (default del plan) y no tocar `StateStore`.
- Service account de Google sin permiso de escritura en el Sheet → reportar y dejar Sheets como no-op.

## Open decisions

- ¿Una sola tabla `leads` o también `appointments`/`daily_reports` en Supabase desde ya?
- ¿Un Sheet por cuenta (Roma/general) o uno solo con columna `account`?
