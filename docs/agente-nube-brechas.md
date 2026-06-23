# Agente en la Nube — Análisis de brechas

> Contrasta la [arquitectura objetivo](agente-nube-arquitectura.md) contra lo que
> `apps/tracking-core` ya tiene implementado (mapeo de 6 agentes sobre código + docs,
> 2026-06-22). `exists` = funciona hoy · `partial` = base presente, falta cerrar ·
> `missing` = no existe.

## Tabla de capacidades

| # | Capacidad objetivo | Estado | Evidencia / qué falta | Plan |
|---|--------------------|--------|------------------------|------|
| 1 | Ingesta de lead para **ambas cuentas** (Roma + general) | 🟡 partial | `POST /api/lead` capta `branch`, pero Elevator usa un único `ELEVATOR_LOCATION_ID` (`elevator/config.ts`); no hay multi-cuenta. | 012 |
| 2 | Campos: fecha, origen, nombre, correo, teléfono, **localización**, **mensaje inicial** | 🟡 partial | `LeadInput`/`CanonicalLead` tienen nombre/email/phone/branch/attribution. **Faltan**: `location` explícita, `initial_message`, `created_at` propio. | 012 |
| 3 | Workflow de salida tras redistribuir a plataformas de anuncio | 🟡 partial | La redistribución ocurre en el webhook de Elevator (`ELEVATOR_EVENTS_WEBHOOK_URL`); falta el **handoff de salida** hacia el agente. | 012 |
| 4 | **Agente en la nube** que recibe ese workflow | 🔴 missing | Excluido explícitamente de fase 1 (`blueprint-inicial.md`), ubicado en "Fase 3 Inteligencia". No hay endpoint receptor. | 012 |
| 5 | Almacenamiento en **Google Sheets** | 🔴 missing | `StateStore` = File/Redis/InMemory. Cero `googleapis`. | 013 |
| 6 | Almacenamiento en **Supabase** | 🔴 missing | Sin `@supabase/supabase-js` ni env vars. | 013 |
| 7 | Envío por **WhatsApp** a dueños | 🔴 missing | `promoWhatsappSent` es un **contador de entrada**, no envío. Sin cliente WhatsApp. | 014 |
| 8 | **Cron diario** que envía # de leads a dueños | 🔴 missing | El cron existente (`payments-sync`, 05:00 UTC) solo procesa pagos. | 014 |
| 9 | Overview Windsor: **impresiones + clics** | 🟢 exists | `windsor/client.ts getMarketingSummary` → `totals{spend,clicks,impressions,reach}` + `bySource[]`. Ya en dashboard (`comparativas.tsx`). | 014 (reuso) |
| 10 | **Agendamientos**: conteo para comparar campañas vs leads vs citas | 🟡 partial | Webhook `dentalink/appointment` actualiza stage a `agendo`, pero **no hay agregación** de citas por día/canal en reportes. | 014 |
| 11 | Workflow fin de día desde **SAC / recepcionistas** | 🟡 partial | `POST /api/reports/daily` (plan 010) ya recibe el `DailyBranchReport`. Falta conectar el origen SAC. | 015 |
| 12 | **Reporte total** combinando leads + webhooks de pacientes, **empujado** a dueños | 🟡 partial | `GET /api/reports/efforts` ya combina Windsor + reportes diarios, pero **se consulta, no se empuja**; sin canal a dueños. | 015 |

**Resumen**: 1 verde, 6 amarillas (base lista), 5 rojas. El núcleo de tracking ya
está; lo nuevo es la capa de **agente → persistencia → WhatsApp** y cerrar
multi-cuenta + agregación de citas.

## Activos reutilizables (no reconstruir)

- `windsor/client.ts` — impresiones, clics, spend, reach por plataforma (cap. 9).
- `reports/aggregate-efforts.ts` + `GET /api/reports/efforts` — ya une marketing + reportes diarios (cap. 12).
- `POST /api/reports/daily` + `DailyBranchReport` — formulario de recepción (cap. 11).
- `StateStore` (Redis/Upstash) — idempotencia, heartbeat, `setContactLeadSource`.
- `matching/match-patient-to-lead.ts`, `payments/build-purchase-event.ts` — atribución.
- Cron Vercel a 05:00 UTC (23:00 CR) — reutilizable para el reporte diario.

## Roadmap propuesto (waves)

| Plan | Título | Depende de | Decisión que desbloquea |
|------|--------|-----------|--------------------------|
| **012** | Contrato de salida + ingesta multi-cuenta (Roma + general) con `location` y `initial_message` | — | Credenciales 2ª cuenta Elevator |
| **013** | Persistencia dual: Supabase (BD) + Google Sheets (espejo) | 012 | Supabase: ¿suma o reemplaza? |
| **014** | Reporte diario a dueños por WhatsApp (leads + Windsor + agendamientos) | 012, 013 | Proveedor WhatsApp; números de dueños |
| **015** | Ingesta SAC + reporte total combinado de fin de día | 011, 014 | ¿SAC = formulario actual o externo? |

**Wave 1**: 012 → **Wave 2**: 013 → **Wave 3**: 014 → **Wave 4**: 015.
(012 también puede avanzar en paralelo a la decisión de WhatsApp; 014 es el primer
entregable con valor visible para dueños.)
