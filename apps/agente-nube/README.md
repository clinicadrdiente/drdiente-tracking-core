# Agente en la nube — Dr Diente

App **independiente** (no toca los dashboards de `apps/tracking-core`) que cierra el
ciclo **lead → reporte a dueños**:

1. Recibe el **workflow de salida** de Elevator (cuentas **Roma** y **general**) cuando
   un lead ya fue redistribuido a las plataformas de anuncio.
2. Persiste cada lead en **Supabase** (BD) y lo refleja en **Google Sheets** (espejo).
3. Recibe **agendamientos** (webhook) y el **formulario de recepción / plataforma SAC**.
4. Envía a los dueños por **WhatsApp (vía Elevator/GHL)**:
   - un **resumen diario** (leads + impresiones/clics de Windsor + agendamientos), y
   - un **reporte total de cierre** que suma lo reportado por recepción.

Spec y brechas: [`docs/agente-nube-arquitectura.md`](../../docs/agente-nube-arquitectura.md) ·
[`docs/agente-nube-brechas.md`](../../docs/agente-nube-brechas.md).

Diseño sin dependencias de runtime: Supabase vía REST (`fetch`), Sheets y WhatsApp vía
webhook saliente, Windsor vía `fetch`. Cada integración hace **no-op si no está
configurada** — la app compila y los crons degradan con notas en vez de fallar.

## Scripts

```bash
npm install
npm run check   # typecheck (tsc --noEmit)
npm test        # vitest
```

## Endpoints

| Método | Ruta | Auth | Uso |
|--------|------|------|-----|
| POST | `/api/agent/lead-intake` | `x-tracking-secret` | Workflow de salida de Elevator |
| POST | `/api/agent/appointment-intake` | `x-tracking-secret` | Webhook de agendamientos |
| POST/GET | `/api/reports/daily` | `x-tracking-secret` | Reporte de recepción (SAC) / listado |
| GET | `/api/cron/daily-owner-report` | `Bearer CRON_SECRET` | Resumen diario a dueños |
| GET | `/api/cron/eod-owner-report` | `Bearer CRON_SECRET` | Reporte total de cierre |
| GET | `/api/health` | — | Estado de integraciones |

### Ejemplo: lead-intake

```bash
curl -X POST https://<app>/api/agent/lead-intake \
  -H "x-tracking-secret: $TRACKING_API_SECRET" \
  -H "content-type: application/json" \
  -d '{
    "event_id": "lead_ELV_8842",
    "account": "roma",
    "elevator_id": "ELV_8842",
    "first_name": "Juan", "last_name": "Perez",
    "email": "juan@example.com", "phone": "+52 55 1234 5678",
    "source": "meta", "location": "Roma Norte, CDMX",
    "initial_message": "Hola, quiero info de implantes",
    "utm_source": "facebook", "utm_campaign": "implantes-roma",
    "distributed_to": ["meta", "google"]
  }'
```

## Configuración (`.env`)

Ver [`.env.example`](.env.example). Mínimo para operar: `TRACKING_API_SECRET`,
`CRON_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
`ELEVATOR_WHATSAPP_WEBHOOK_URL`, `OWNER_WHATSAPP_NUMBERS`, `WINDSOR_API_KEY`.

## Supabase

Aplica [`supabase/migrations/001_agente_nube.sql`](supabase/migrations/001_agente_nube.sql)
en el SQL Editor. Crea `leads`, `appointments`, `daily_reports`, `report_sends`.
Usa la **service role key** (server-side) en `SUPABASE_SERVICE_ROLE_KEY`.

## Google Sheets (espejo)

No usa OAuth: un **Web App de Apps Script** recibe la fila. En tu hoja:
`Extensiones → Apps Script`, pega esto, despliega como Web App (acceso "cualquiera"),
y pon la URL en `GOOGLE_SHEETS_WEBHOOK_URL` (+ un secreto en `GOOGLE_SHEETS_WEBHOOK_SECRET`):

```javascript
function doPost(e) {
  var data = JSON.parse(e.postData.contents);
  if (data.secret !== "EL_SECRETO") return ContentService.createTextOutput("forbidden");
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Leads");
  var r = data.row;
  sheet.appendRow([
    r.received_at, r.account, r.first_name, r.last_name, r.email, r.phone,
    r.source, r.location, r.initial_message, r.utm_source, r.utm_campaign,
    r.elevator_id, r.event_id
  ]);
  return ContentService.createTextOutput("ok");
}
```

## WhatsApp vía Elevator / GoHighLevel

`ELEVATOR_WHATSAPP_WEBHOOK_URL` apunta a un **Inbound Webhook** de un workflow de
Elevator/GHL. La app POStea `{ secret, to, message }`; el workflow envía el WhatsApp
al número `to`. Configura los números de los dueños en `OWNER_WHATSAPP_NUMBERS`
(E.164, separados por coma).

## Deploy (Vercel — proyecto separado)

Crea un **proyecto Vercel nuevo** apuntando a `apps/agente-nube` (Root Directory).
`vercel.json` ya define los dos crons (05:00 y 05:30 UTC = 23:00 / 23:30 CDMX/CR).
Carga las env vars del `.env.example` en el proyecto. No comparte despliegue con
`tracking-core`.

## Notas

- La idempotencia de leads/citas vive en Supabase (`event_id` único). Sin Supabase,
  el dedup es best-effort por instancia.
- El agente **no** crea el lead en Elevator: lo recibe ya creado (el workflow de
  Elevator corre antes). Solo persiste y reporta.
