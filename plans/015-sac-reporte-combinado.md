# Plan 015: Ingesta SAC + reporte total combinado de fin de día

> **Executor instructions**: step by step, verify each step, honor STOP
> conditions, update `plans/README.md` when done. Read
> `docs/agente-nube-arquitectura.md` §5 y §8 first.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW-MEDIUM (reusa endpoints existentes; el envío saliente ya existe tras 014)
- **Depends on**: plans/011-efforts-panel.md, plans/014-reporte-diario-whatsapp.md
- **Category**: feature
- **Planned at**: 2026-06-22

## Why this matters

El reporte diario (plan 014) cubre lo digital. El **reporte total** que pidieron
los dueños combina además lo que reportan las recepcionistas (plataforma SAC):
contactados, seguimientos, llamadas, WhatsApp promocionales, posts. Un solo
mensaje de cierre que une **workflows de leads + webhooks de pacientes**.

## Current state

- **Formulario de recepción ya existe** (cap. 11): `POST /api/reports/daily` recibe `DailyBranchReport` (`branch, date, contacts[], leadsReceived, leadsContacted, followUpsSent, promoWhatsappSent, emailsSent, postsPublished, callsReceived, notes`), validado por `validateDailyReportInput`, persistido en `StateStore`.
- **Combinación ya existe** (cap. 12): `GET /api/reports/efforts` une Windsor + `listDailyReports` → `EffortsSummary{platforms[], totals, manual{}}`. Pero **se consulta, no se empuja**.
- Plan 014 deja listo el cliente WhatsApp y el patrón de cron.

## Scope

**In scope**:
- `src/modules/reports/total-summary.ts` (nuevo) + test — función pura que arma el texto §8 desde `buildDailySummary` (plan 014) + `aggregateEfforts`/`DailyBranchReport`.
- `api/cron/eod-owner-report.ts` (nuevo) — cron de fin de día (tras cierre de recepción): arma y envía el reporte total a dueños vía el cliente WhatsApp de 014.
- (Si SAC es externo) documentar el contrato de `POST /api/reports/daily` para que la plataforma SAC lo consuma; opcional `account` en el reporte.
- `vercel.json` — cron de cierre.

**Out of scope**:
- Cambiar el esquema del `DailyBranchReport` (ya cubre lo necesario).
- Construir un frontend para SAC (es un sistema externo / formulario existente).

## Steps

### Step 1: Resumen total (puro)
`buildTotalSummary({dailySummary, efforts, reports})` → string §8: parte digital (014) + sección recepción (contactados, seguimientos, llamadas, WhatsApp promocionales, posts) sumada desde `DailyBranchReport`. **Verify**: `npm test` → cubre sin reportes de recepción (degrada a solo-digital), multi-sucursal.

### Step 2: Endpoint cron de cierre
`api/cron/eod-owner-report.ts`: auth `CRON_SECRET`, junta resumen digital + `listDailyReports` del día, llama `buildTotalSummary`, envía a `OWNER_WHATSAPP_NUMBERS`. Idempotente por fecha (no enviar dos veces). **Verify**: `npm run check` + `npm run build` → exit 0; envío de prueba.

### Step 3: Contrato SAC
Confirmar si "SAC" es el formulario actual o un sistema externo. Si externo: documentar el payload de `POST /api/reports/daily` y el header `x-tracking-secret` para que SAC lo postee. **Verify**: un POST de ejemplo de SAC persiste y aparece en el reporte total.

## Done criteria

- [ ] `npm run check`, `npm test`, `npm run build` exit 0
- [ ] El cron de cierre envía un mensaje que combina datos de leads (digital) + datos de recepción (SAC)
- [ ] Sin reportes de recepción en el día → degrada al resumen digital, con nota
- [ ] No se envía dos veces el mismo día
- [ ] `plans/README.md` actualizado

## STOP conditions

- Plataforma SAC no identificada → usar el `POST /api/reports/daily` existente como fuente y reportar la dependencia.
- Solapamiento con el reporte diario (014): si stakeholder quiere **un solo** envío diario en vez de dos, fusionar en el cron de cierre y desactivar el de 014 — confirmar antes.

## Open decisions

- ¿Dos envíos (diario temprano + total de cierre) o uno solo de cierre?
- ¿La plataforma SAC es el formulario diario actual o un sistema externo que debe integrarse?
- ¿El corte de recepción es por sucursal y se envía por sucursal o consolidado?
