# tracking-core

Base tecnica inicial del motor de tracking de DrDiente.

## Alcance de esta base

- contratos del dominio
- normalizacion de identidad
- estrategia de matching
- adaptadores stub para `Elevator`, `Dentalink` y `Stape`
- rutas stub para `lead`, `appointment webhook`, `payments sync`

## Siguiente paso

Reemplazar los stubs por integraciones reales una vez cerrada la matriz de descubrimiento tecnico.

## Elevator

El modulo `Elevator` ya soporta dos modos:

- `stub`: comportamiento local para desarrollo inicial
- `api`: cliente HTTP configurable por variables de entorno

La configuracion base esta en `.env.example`.

## Dentalink

El modulo `Dentalink` tambien soporta dos modos:

- `stub`: respuestas locales para desarrollo inicial
- `api`: cliente HTTP configurable por variables de entorno

Los nombres de paths y fields en `.env.example` son placeholders hasta cerrar la matriz tecnica con HealthAtom.

## Bootstrap

La app ya tiene una capa de arranque simple:

- `src/config/app-config.ts`: config global del sistema
- `src/app/bootstrap.ts`: instancia clientes y logger
- `src/app/tracking-app.ts`: fachada para los flujos `lead`, `appointment` y `payments`

Esto deja el proyecto listo para conectar handlers HTTP reales o cron jobs sobre una sola interfaz.

## HTTP y cron

Ya existe una capa de entrada minima para exponer el core:

- `api/health.ts`: health check del despliegue
- `api/status.ts`: estado operativo para dashboard
- `api/lead.ts`: captura de leads
- `api/dev/test-lead.ts`: prueba interna de lead demo
- `api/dev/test-payment-sync.ts`: prueba interna de sync de pagos
- `api/dev/dentalink-ping.ts`: prueba protegida de conexion Dentalink
- `api/webhooks/dentalink/appointment.ts`: webhook de citas
- `api/cron/payments-sync.ts`: sync manual/cron de pagos
- `src/http/handlers.ts`: handlers de `lead`, `appointment` y `payments sync`
- `src/http/validation.ts`: validacion basica de payloads
- `src/http/vercel-adapters.ts`: adaptador para requests estilo Vercel
- `src/entrypoints/http.ts`: punto unico de exportacion

Con esto ya se puede montar despues una API real sin reescribir el dominio.

El cron diario esta configurado en `vercel.json`:

```text
0 5 * * *
```

Esto corre a las `05:00 UTC`, equivalente a `11:00 p.m.` hora Costa Rica.
El endpoint del cron revisa las ultimas 30 horas y procesa hasta 50 pagos por corrida para reducir riesgo de rate limit en Dentalink.

Los endpoints operativos requieren:

```text
x-tracking-secret: <TRACKING_API_SECRET>
```

El cron debe protegerse con esta variable en Vercel:

```text
CRON_SECRET=<valor-secreto-largo>
```

Si `CRON_SECRET` existe, `/api/cron/payments-sync` exige `Authorization: Bearer <CRON_SECRET>`.
Si no existe, el endpoint permite solamente llamadas del `User-Agent` oficial de Vercel Cron.

`/api/health` queda abierto para verificar el despliegue.

## Dashboard

`public/index.html` contiene un dashboard operativo interno. El dashboard guarda el
`TRACKING_API_SECRET` solo en `localStorage` del navegador y lo manda como header
en cada llamada protegida.

## Estado operativo

El proyecto ya incluye una capa minima de estado para `payments sync`:

- cursor `lastCheckIso`
- deduplicacion por `payment_id`
- store persistente en archivo con interfaz reemplazable

La persistencia por defecto vive en `STATE_STORE_FILE_PATH` y es suficiente para desarrollo y primeras pruebas.
El siguiente reemplazo natural es mover ese estado a `KV` o `Postgres`.
