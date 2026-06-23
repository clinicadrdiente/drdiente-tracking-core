# Agente en la Nube — Arquitectura objetivo

> Captura de la visión descrita por el stakeholder (2026-06-22) para el
> "agente de conocimiento en la nube" que cierra el ciclo lead → reporte a
> dueños. Este documento es el **contrato de intención**; el análisis de qué
> ya existe vs. qué falta está en [`agente-nube-brechas.md`](agente-nube-brechas.md),
> y la ejecución en `plans/012`–`plans/015`.

## 1. Objetivo

Que los **dueños de la clínica** reciban, sin pedirlo, una visión diaria real de:

- cuántos **leads** llegaron (con nombre, correo, teléfono, origen, localización, mensaje inicial),
- cuánto nos **mostraron** las campañas (impresiones) y cuántos **clics** generaron (Windsor),
- cuántos **agendamientos** hubo,

para poder leer la cadena **campañas → leads → agendamientos** de un vistazo, y un
**reporte total de fin de día** que además incorpora lo que reportan las
recepcionistas (plataforma SAC).

## 2. Flujo objetivo

```
                 ┌─────────────────────────┐     ┌─────────────────────────┐
   Lead nuevo →  │ Elevator — Dr Dientes   │     │ Elevator — Dr Dientes   │
                 │ ROMA (workflow)         │     │ (cuenta general)        │
                 └────────────┬────────────┘     └────────────┬────────────┘
                              │  redistribuye a plataformas de anuncio
                              │  (Meta / Google / TikTok)
                              ▼              ▼ (workflow de SALIDA al final)
                       ┌───────────────────────────────────────────┐
                       │      AGENTE EN LA NUBE (tracking-core)     │
                       │  recibe: fecha, origen, nombre, correo,    │
                       │  teléfono, localización, mensaje inicial,  │
                       │  cuenta (Roma / general)                   │
                       └───────┬─────────────┬─────────────┬────────┘
                               ▼             ▼             ▼
                        ┌───────────┐  ┌───────────┐  ┌──────────┐
                        │ Supabase  │  │  Google   │  │ WhatsApp │
                        │ (BD leads)│  │  Sheets   │  │ (dueños) │
                        └───────────┘  └───────────┘  └──────────┘

   ── Cron diario ──────────────────────────────────────────────────────────
   Agente arma y ENVÍA a dueños por WhatsApp:
     · # de leads del día
     · Overview Windsor: impresiones + clics (por plataforma)
     · # de agendamientos
     · comparación campañas vs leads vs agendamientos

   ── Fin de día ───────────────────────────────────────────────────────────
   Plataforma SAC (formulario de recepcionistas) → webhook al agente
   El agente envía el REPORTE TOTAL a dueños combinando:
     · datos de los workflows de leads (Elevator)
     · datos de los webhooks de pacientes (SAC / recepción)
```

## 3. Componentes del agente

| Componente | Responsabilidad | Estado |
|------------|-----------------|--------|
| **Ingesta de salida** | Endpoint que recibe el workflow de salida de Elevator (ambas cuentas) al final, tras redistribuir a plataformas de anuncio | nuevo |
| **Persistencia analítica** | Escribe cada lead en Supabase (BD) y refleja en Google Sheets | nuevo |
| **Conector WhatsApp** | Envía mensajes a los dueños | nuevo |
| **Reporte diario (cron)** | Arma y empuja el resumen de leads + overview Windsor + agendamientos | nuevo (Windsor ya disponible) |
| **Ingesta SAC** | Recibe el formulario de recepcionistas de fin de día | parcial (`POST /api/reports/daily` ya existe) |
| **Reporte total (cron fin de día)** | Combina leads + datos SAC y lo envía a dueños | parcial (`GET /api/reports/efforts` ya combina, falta empujar) |

**Decisión tomada (2026-06-23):** se construye como **app nueva e independiente**
en [`apps/agente-nube`](../apps/agente-nube/README.md), sin tocar los dashboards de
`tracking-core`. WhatsApp vía **Elevator/GHL**, Supabase como **capa analítica
adicional** (no reemplaza nada), y mensajes con **plantilla fija**. Ya implementada
y con pruebas verdes; falta solo el cableado operativo (credenciales + webhooks).

## 4. Contrato — Workflow de salida (Elevator → Agente)

`POST /api/agent/lead-intake` · auth `x-tracking-secret` · idempotente por `event_id`.

```json
{
  "event_id": "lead_ELV_8842",
  "event_name": "lead.handoff",
  "occurred_at": "2026-06-22T18:00:00.000Z",
  "account": "roma",                  // "roma" | "general" (cuenta Elevator de origen)
  "lead": {
    "elevator_id": "ELV_8842",
    "first_name": "Juan",
    "last_name": "Perez",
    "email": "juan@example.com",
    "phone": "+52 55 1234 5678",
    "source": "meta",                 // origen
    "location": "Roma Norte, CDMX",   // localización del paciente
    "initial_message": "Hola, quiero info de implantes",  // mensaje inicial captado por el workflow
    "utm_source": "facebook",
    "utm_medium": "paid_social",
    "utm_campaign": "implantes-roma",
    "fbclid": "...", "gclid": null, "ttclid": null,
    "landing_url": "https://drdiente.com/roma"
  },
  "distributed_to": ["meta", "google"]  // plataformas de anuncio a las que ya se redistribuyó
}
```

Campos **nuevos** respecto al `Lead` canónico actual (`docs/contratos-datos.md`):
`account`, `location`, `initial_message`, `distributed_to`.

## 5. Contrato — SAC / formulario de recepcionistas (fin de día)

Reusa el `DailyBranchReport` ya implementado (`POST /api/reports/daily`, plan 010):
`branch`, `date`, `contacts[]`, `leadsReceived`, `leadsContacted`,
`followUpsSent`, `promoWhatsappSent`, `emailsSent`, `postsPublished`, `callsReceived`, `notes`.
La "plataforma SAC" es el origen del POST; si es un sistema externo, se conecta a este endpoint.

## 6. Persistencia

**Supabase** (BD analítica de la verdad de leads):

```sql
create table leads (
  id              uuid primary key default gen_random_uuid(),
  event_id        text unique not null,        -- idempotencia
  occurred_at     timestamptz not null,
  account         text not null,               -- roma | general
  elevator_id     text,
  first_name      text, last_name text,
  email           text, phone text,
  source          text,                        -- origen
  location        text,                        -- localización
  initial_message text,                        -- mensaje inicial
  utm_source text, utm_medium text, utm_campaign text,
  fbclid text, gclid text, ttclid text,
  distributed_to  text[],
  created_at      timestamptz default now()
);
```

**Google Sheets**: una fila por lead con las mismas columnas (espejo legible para dueños).
El `StateStore` (Redis/Upstash) actual se mantiene para idempotencia/heartbeat; Supabase es
la capa **analítica/histórica**, no reemplaza el dedup operativo. Ver "Decisiones abiertas".

## 7. Reporte diario a dueños (WhatsApp)

Cron diario (reusa el horario 05:00 UTC = 23:00 Costa Rica ya configurado). Contenido:

```
📊 Dr Diente — Resumen del día (22 jun)
Leads: 14   (Roma 6 · General 8)
Agendamientos: 5
Campañas (Windsor):
  Meta   · 12.4k impresiones · 320 clics · $1,250
  Google ·  8.1k impresiones · 210 clics · $   980
Embudo: 20.5k impresiones → 530 clics → 14 leads → 5 agendamientos
```

Fuentes: Supabase (leads), Windsor `getMarketingSummary` (impresiones/clics/spend),
Dentalink/Elevator (agendamientos).

## 8. Reporte total de fin de día

Segundo envío (tras recibir SAC) que añade al diario los datos de recepción:
contactados, seguimientos, llamadas, WhatsApp promocionales, posts — combinando
**workflows de leads + webhooks de pacientes**, como un solo mensaje a dueños.

## 9. Decisiones (resueltas) y pendientes operativos

**Resueltas (2026-06-23):**

1. **Hosting**: app nueva `apps/agente-nube` (no toca dashboards). Mensaje con **plantilla fija** (no LLM en v1).
2. **Supabase**: se **suma** como BD analítica; no reemplaza nada.
3. **WhatsApp**: vía **Elevator/GHL** (webhook entrante de un workflow GHL).
4. **Plataforma SAC**: postea al endpoint `POST /api/reports/daily` (mismo contrato del formulario de recepción).
5. **Cuentas Elevator**: el lead llega ya creado; cada cuenta (Roma/general) etiqueta su handoff con `account`. El agente **no** re-crea en Elevator.

**Pendientes operativos (lado dueño/infra, no de código):**

- Aplicar la migración Supabase y cargar `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`.
- Crear el workflow GHL con webhook entrante → `ELEVATOR_WHATSAPP_WEBHOOK_URL`; cargar `OWNER_WHATSAPP_NUMBERS`.
- Desplegar el Web App de Apps Script → `GOOGLE_SHEETS_WEBHOOK_URL`.
- Cargar `WINDSOR_API_KEY` (+ filtros DrDiente) y `TRACKING_API_SECRET` / `CRON_SECRET`.
- Apuntar los dos workflows de salida de Elevator (Roma y general) a `POST /api/agent/lead-intake`.
- Proyecto Vercel nuevo con Root Directory `apps/agente-nube`.
