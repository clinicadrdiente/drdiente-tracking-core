# Plan 012: Contrato de salida + ingesta del agente para ambas cuentas

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. If a
> "STOP condition" occurs, stop and report. When done, update the status row in
> `plans/README.md`. Read `docs/agente-nube-arquitectura.md` §4 first.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MEDIUM (toca el contrato de lead y la config de Elevator)
- **Depends on**: —
- **Category**: feature
- **Planned at**: 2026-06-22

## Why this matters

El agente en la nube no puede reportar lo que no recibe. Hoy `POST /api/lead`
crea el lead en Elevator pero (a) no capta `location` ni `initial_message`, y (b)
Elevator está cableado a una sola cuenta (`ELEVATOR_LOCATION_ID`). Para que lleguen
los leads de **Dr Dientes Roma** y de **Dr Dientes (general)** con todos los
campos, hay que ampliar el contrato y soportar multi-cuenta.

## Current state

- `parseLeadInput()` (`src/http/validation.ts`) capta `firstName, lastName, phone, email, branch, attribution{fbclid,gclid,ttclid,utmSource,utmMedium,utmCampaign,campaignId,landingUrl,firstTouchSource}`.
- `CanonicalLead` (`src/types/domain.ts`) **no** tiene `location`, `initial_message` ni `account`.
- `ElevatorConfig` (`src/modules/elevator/config.ts`) toma un único `ELEVATOR_LOCATION_ID` / `ELEVATOR_API_KEY`; `ApiElevatorClient` lo usa para todo.
- Auth por `x-tracking-secret` (`src/http/auth.ts`, timing-safe). Idempotencia disponible vía `StateStore`.

## Commands you will need

| Purpose | Command (in `apps/tracking-core/`) | Expected |
|---------|-----------------------------------|----------|
| Typecheck | `npm run check` | exit 0 |
| Tests | `npm test` | all pass |
| Build | `npm run build` | exit 0 |

## Scope

**In scope**:
- `src/types/domain.ts` — añadir `account`, `location`, `initialMessage` a `LeadInput`/`CanonicalLead`.
- `src/http/validation.ts` — parsear los nuevos campos + `account` (`roma`|`general`).
- `src/modules/elevator/config.ts` + `client.ts` — soportar 2 cuentas (mapa `account → {locationId, apiKey}`), seleccionando por `input.account`.
- `api/agent/lead-intake.ts` (nuevo) — endpoint receptor del workflow de salida (contrato §4), idempotente por `event_id`, reusa `postLead`.
- Tests de validación y selección de cuenta.

**Out of scope**:
- Persistencia en Supabase/Sheets (plan 013).
- Envío a dueños (plan 014).
- Redistribución a plataformas de anuncio (la hace Elevator).

## Steps

### Step 1: Ampliar el dominio
Añadir a `LeadInput`/`CanonicalLead`: `account: "roma" | "general"`, `location?: string`, `initialMessage?: string`, `createdAt: string` (ISO). Mantener compatibilidad: campos opcionales, `account` con default `"general"`.
**Verify**: `npm run check` → exit 0.

### Step 2: Multi-cuenta en Elevator
Refactor `ElevatorConfig` a `{ accounts: Record<"roma"|"general", { locationId, apiKey, baseUrl }> }`, leyendo `ELEVATOR_ROMA_LOCATION_ID`, `ELEVATOR_GENERAL_LOCATION_ID`, etc. `ApiElevatorClient.createLead(input)` selecciona credenciales por `input.account`. Mantener fallback a la var legacy `ELEVATOR_LOCATION_ID` si solo hay una configurada.
**Verify**: `npm test` (añadir test de selección de cuenta) → all pass.

### Step 3: Endpoint del agente
Crear `api/agent/lead-intake.ts` (POST, `requireTrackingSecret`, `methodNotAllowed` si no): valida el payload §4, mapea a `LeadInput`, deduplica por `event_id` con `StateStore`, llama `trackingHttpHandlers.postLead`. Devuelve `{ok, elevatorId, deduped}`.
**Verify**: `npm run check` + `npm run build` → exit 0.

### Step 4: `.env.example` y docs
Documentar las nuevas env vars y actualizar `docs/contratos-datos.md` con los campos `account`/`location`/`initial_message`.

## Done criteria

- [ ] `npm run check`, `npm test`, `npm run build` exit 0
- [ ] `POST /api/agent/lead-intake` acepta el contrato §4 para `account: "roma"` y `"general"` y crea el lead en la cuenta correcta
- [ ] Reenvío del mismo `event_id` → `deduped: true`, sin doble alta
- [ ] `location` e `initial_message` se persisten en el lead
- [ ] `plans/README.md` actualizado

## STOP conditions

- No se tienen credenciales de la 2ª cuenta Elevator → implementar el código multi-cuenta pero dejar `general` apuntando a la cuenta actual y reportar el bloqueo.
- El workflow real de Elevator no puede enviar `initial_message` → confirmar con stakeholder de dónde sale el mensaje inicial antes de asumir el campo.

## Open decisions

- Nombre/identificador exacto de cada cuenta (`roma` / `general`) y sus `locationId`.
- ¿El `event_id` lo genera Elevator o lo deriva el agente de `elevator_id`+fecha?
