# Plan 014: Reporte diario a dueños por WhatsApp

> **Executor instructions**: step by step, verify each step, honor STOP
> conditions, update `plans/README.md` when done. Read
> `docs/agente-nube-arquitectura.md` §7 first.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MEDIUM (envío saliente real a dueños — no spamear durante pruebas)
- **Depends on**: plans/012-lead-intake-multicuenta.md, plans/013-persistencia-supabase-sheets.md
- **Category**: feature
- **Planned at**: 2026-06-22

## Why this matters

Es el primer entregable que un dueño *ve*: un mensaje diario con leads,
impresiones/clics de campañas y agendamientos. Convierte datos que hoy solo
están en el dashboard en un push proactivo.

## Current state

- **Windsor ya da impresiones/clics** (cap. 9 verde): `windsor/client.ts getMarketingSummary()` → `totals{spend,clicks,impressions,reach}` + `bySource[]`. Reutilizar, no reconstruir.
- **Leads del día**: tras plan 013, consultables en Supabase (`occurred_at` por día, `account`).
- **Agendamientos**: webhook `dentalink/appointment` actualiza stage a `agendo`, pero **no hay conteo agregado** — este plan añade la agregación.
- **Cron**: ya existe Vercel cron 05:00 UTC (23:00 Costa Rica) para `payments-sync`; añadir un segundo cron o un endpoint dedicado.
- **WhatsApp**: no existe cliente (cap. 7 rojo).

## Scope

**In scope**:
- `src/modules/whatsapp/client.ts` (nuevo) — `sendMessage(to, text)`; perezoso/no-op si no configurado.
- `src/modules/reports/daily-summary.ts` (nuevo) + test — función pura que arma el texto §7 desde {leads Supabase, Windsor summary, conteo de agendamientos}.
- `src/modules/dentalink/` o Supabase — `countAppointments(from,to)` por día/cuenta.
- `api/cron/daily-owner-report.ts` (nuevo) — `CRON_SECRET` Bearer; arma y envía a los números de dueños.
- `vercel.json` — entrada de cron diaria (tras el cierre del día CR).
- `.env.example` — `WHATSAPP_*`, `OWNER_WHATSAPP_NUMBERS`.

**Out of scope**:
- Reporte combinado con SAC (plan 015).
- Redacción con LLM (si se decide, es una variante de `daily-summary.ts`).

## Steps

### Step 1: Conteo de agendamientos
Agregar `countAppointments(from, to)` (por `account`/`branch`) leyendo de la fuente confirmada (Dentalink citas o registro propio en Supabase). **Verify**: test con datos fixture; `npm run check` → exit 0.

### Step 2: Resumen diario (puro)
`buildDailySummary({leads, windsor, appointments, dateIso})` → string §7 (totales, por cuenta, embudo impresiones→clics→leads→agendamientos). **Verify**: `npm test` → cubre 0 leads, Windsor caído, multi-cuenta.

### Step 3: Cliente WhatsApp
`sendMessage()` contra el proveedor elegido (ver Open decisions). `isConfigured()` → no-op si faltan credenciales. **Verify**: test con HTTP mock; `npm run build` → exit 0.

### Step 4: Endpoint cron + agendar
`api/cron/daily-owner-report.ts`: auth `CRON_SECRET`, calcula rango del día CR, junta fuentes, llama `buildDailySummary`, envía a `OWNER_WHATSAPP_NUMBERS`. Windsor/WhatsApp caídos degradan con log, no 500. Añadir cron en `vercel.json`. **Verify**: invocación manual con secret → envía a un número de prueba.

## Done criteria

- [ ] `npm run check`, `npm test`, `npm run build` exit 0
- [ ] El cron arma un mensaje con leads del día (por cuenta), impresiones+clics por plataforma y # de agendamientos
- [ ] Windsor o WhatsApp caídos → degradación con log, no fallo del cron
- [ ] Envío de prueba llega a un número configurado
- [ ] `plans/README.md` actualizado

## STOP conditions

- Proveedor de WhatsApp no decidido → implementar `client.ts` detrás de una interfaz y dejarlo no-op; reportar bloqueo.
- No hay forma confiable de contar agendamientos del día → reportar y enviar el resumen sin esa línea (no inventar el número).
- No hay números de dueños → enviar solo a un número de prueba y marcar STOP.

## Open decisions

- **Proveedor WhatsApp**: Meta Cloud API · Twilio · WhatsApp de Elevator/GHL.
- ¿Mensaje plantilla (recomendado v1) o redactado por LLM?
- Hora exacta de envío y si el corte es por clínica/cuenta o global.
