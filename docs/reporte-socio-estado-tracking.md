# Reporte de Estado - Ecosistema de Tracking DrDiente

## Resumen ejecutivo

Ya se construyo y desplego la primera base tecnica del ecosistema de tracking de DrDiente.

Actualmente tenemos:

- repositorio privado en GitHub
- proyecto conectado en Vercel
- backend `drdiente-tracking-core` desplegado
- dashboard interno operativo
- seguridad por `TRACKING_API_SECRET`
- pruebas internas de lead funcionando
- pruebas internas de sync de pagos funcionando
- deduplicacion basica funcionando
- arquitectura preparada para conectar Elevator, Dentalink y Stape

El sistema todavia esta en modo `stub`, lo que significa que simula las respuestas de Elevator, Dentalink y Stape. Esto es intencional en esta etapa: primero dejamos viva la infraestructura, despues conectamos credenciales reales.

## Repositorio y despliegue

Se creo un repositorio privado en GitHub:

```text
https://github.com/clinicadrdiente/drdiente-tracking-core
```

Tambien se creo/conecto el proyecto en Vercel:

```text
drdiente-tracking-core
```

La app vive dentro del repo en:

```text
apps/tracking-core
```

Configuracion usada en Vercel:

```text
Root Directory: apps/tracking-core
Build Command: npm run build
Install Command: npm install
Output Directory: public
```

El deployment esta funcionando en produccion y Vercel lo marca como `READY`.

## Dashboard interno

Se creo un dashboard visual interno para operar y probar el sistema desde navegador.

El dashboard permite:

- guardar el secret localmente en el navegador
- ver estado del sistema
- ver si Elevator esta en `stub` o `api`
- ver si Dentalink esta en `stub` o `api`
- ver si Stape esta en `stub`
- ver si el secret esta configurado
- ver ultimo sync de pagos
- ver pagos procesados
- probar lead demo
- probar sync de pagos

El dashboard ya fue probado y muestra:

```text
Sistema: Healthy
Elevator: stub
Dentalink: stub
Stape: stub
Secret configurado: si
```

## Seguridad actual

Se agrego una capa de seguridad propia usando:

```text
TRACKING_API_SECRET
```

Los endpoints operativos requieren este header:

```text
x-tracking-secret: <TRACKING_API_SECRET>
```

Esto evita que cualquier persona pueda mandar leads o disparar procesos internos sin autorizacion.

El unico endpoint que queda abierto es:

```text
GET /api/health
```

Ese endpoint sirve para verificar que el servicio esta vivo.

## Endpoints creados

Actualmente existen estos endpoints:

```text
GET /api/health
GET /api/status
POST /api/lead
POST /api/webhooks/dentalink/appointment
POST /api/cron/payments-sync
POST /api/dev/test-lead
POST /api/dev/test-payment-sync
```

### Para que sirve cada uno

`GET /api/health`

Sirve para verificar que el deployment esta vivo.

`GET /api/status`

Sirve para que el dashboard vea el estado interno del sistema.

`POST /api/lead`

Sera el endpoint que recibira leads reales desde la web de DrDiente.

`POST /api/webhooks/dentalink/appointment`

Sera el endpoint para recibir citas desde Dentalink si HealthAtom confirma que existe webhook.

`POST /api/cron/payments-sync`

Sera el endpoint para sincronizar pagos desde Dentalink si se usa cron/polling.

`POST /api/dev/test-lead`

Endpoint interno para probar el flujo de lead con datos demo.

`POST /api/dev/test-payment-sync`

Endpoint interno para probar el flujo de pagos con datos demo.

## Pruebas realizadas

### Prueba de lead demo

Se probo el flujo de lead demo desde el dashboard.

Resultado:

```json
{
  "elevatorId": "ELV_STUB_001",
  "firstName": "Paciente",
  "lastName": "Demo",
  "phoneRaw": "+52 55 1234 5678",
  "phoneNormalized": "525512345678",
  "emailRaw": "paciente@example.com",
  "emailNormalized": "paciente@example.com",
  "branch": "Polanco"
}
```

Esto confirma que:

- el dashboard se comunica con el backend
- el secret funciona
- el endpoint de lead funciona
- la normalizacion de telefono funciona
- la normalizacion de email funciona
- el cliente stub de Elevator responde correctamente

### Prueba de sync de pagos

Se probo el sync de pagos demo desde el dashboard.

Resultado observado:

```json
{
  "processed": 0,
  "skipped": 1
}
```

Esto confirma que:

- el sync de pagos se ejecuta
- la deduplicacion funciona
- el sistema detecta pagos ya procesados
- el flujo interno de pagos esta vivo

## Problemas resueltos durante la implementacion

### Problema 1: Vercel no encontraba `public`

Vercel fallo inicialmente con:

```text
No Output Directory named "public" found
```

Solucion:

- se creo `public/index.html`
- se agrego `vercel.json`
- se configuro `outputDirectory: public`

### Problema 2: Deployment bloqueado por autor incorrecto

Algunos deployments quedaron bloqueados porque los commits aparecian como hechos por:

```text
OHSU-APP
```

Solucion:

- se cerro sesion de GitHub CLI anterior
- se conecto la cuenta `clinicadrdiente`
- se cambio el autor local de Git a:

```text
clinicadrdiente
marketingclinicadrdiente@gmail.com
```

### Problema 3: Escritura en filesystem de Vercel

El sync de pagos fallo con:

```text
ENOENT: no such file or directory, mkdir '/var/task/.runtime'
```

Causa:

Vercel no permite escribir dentro de `/var/task`, porque es la carpeta del deployment serverless.

Solucion:

Cuando el sistema corre en Vercel, el estado temporal se escribe en:

```text
/tmp
```

Esto sirve para pruebas, pero no es persistencia definitiva.

## Estado tecnico actual

El sistema esta funcionando en modo prueba.

Estado actual:

```text
GitHub conectado
Vercel conectado
Backend desplegado
Dashboard funcionando
Auth interna funcionando
Lead demo funcionando
Payment sync demo funcionando
Deduplicacion funcionando
Elevator en modo stub
Dentalink en modo stub
Stape en modo stub
```

## Que significa modo `stub`

Modo `stub` significa que el sistema no esta llamando APIs reales todavia.

Por ejemplo:

- Elevator no crea leads reales todavia
- Dentalink no lee pacientes/pagos reales todavia
- Stape no manda conversiones reales todavia

En esta etapa el objetivo era validar la infraestructura, el flujo interno y la seguridad antes de conectar sistemas reales.

## Lo que falta para completar el ecosistema

### 1. Conectar la web real de DrDiente

Hay que conectar el formulario real de la web al endpoint:

```text
POST /api/lead
```

El formulario debe mandar:

- nombre
- apellido
- telefono
- email
- sucursal
- fbclid
- gclid
- ttclid
- utm_source
- utm_medium
- utm_campaign
- landing_url

### 2. Conectar Elevator real

Necesitamos acceso/documentacion para:

- crear leads
- buscar contactos por telefono/email
- actualizar etapas
- guardar click IDs y UTMs
- confirmar que ID de Elevator debemos persistir

### 3. Conectar Dentalink real

Necesitamos acceso/documentacion para:

- leer pacientes
- leer citas
- leer pagos
- leer tratamientos/presupuestos
- leer sucursales
- escribir campos adicionales
- guardar `elevator_id` dentro del paciente

### 4. Confirmar si Dentalink tiene webhooks

Hay que confirmar con HealthAtom/Dentalink si existen webhooks para:

- cita creada
- pago registrado
- pago anulado/devolucion

Si no existen webhooks, se usara cron/polling.

### 5. Conectar Stape

Cuando el jefe lo active/configure, hay que conectar Stape para enviar eventos a:

- Meta
- Google
- TikTok

Eventos esperados:

- Lead
- Agendamiento
- Compra
- Compra Alto Ticket
- Refund/Ajuste

### 6. Migrar estado temporal a persistencia real

Hoy el estado de pagos usa `/tmp` en Vercel.

Eso sirve para pruebas, pero para produccion real se necesita:

- Vercel KV
- Redis
- Postgres

Esto sera importante para guardar:

- pagos procesados
- `lastCheckIso`
- historial de eventos
- errores
- auditoria

## Informacion que necesitamos del socio

Para avanzar necesitamos:

### De Elevator

- acceso a la cuenta/API
- documentacion de endpoints
- API key o token
- como crear leads
- como buscar contactos
- como actualizar etapas
- donde guardar `fbclid`, `gclid`, `ttclid` y UTMs
- cual es el ID correcto que debemos guardar en Dentalink

### De Dentalink / HealthAtom

- API token o credenciales
- documentacion de endpoints disponibles
- endpoint para pacientes
- endpoint para citas
- endpoint para pagos
- endpoint para tratamientos
- endpoint para campos adicionales
- confirmar si se puede escribir `elevator_id`
- confirmar si hay webhooks o solo polling

### De Stape

- acceso al contenedor/server-side GTM
- endpoint de ingestion
- formato esperado de eventos
- configuracion para Meta CAPI
- configuracion para Google Offline/Enhanced Conversions
- configuracion para TikTok Events API

### Del equipo de medios

- definir umbral de alto ticket
- confirmar si alto ticket es global o por tratamiento
- confirmar que valor se manda como conversion
- confirmar si se optimiza por presupuesto total, anticipo pagado o ambos
- confirmar nombres finales de eventos

### De la web

- acceso al repo de `drdiente-website`
- ubicacion del formulario real
- campos actuales del formulario
- como se selecciona sucursal
- como se capturan UTMs y click IDs
- a que WhatsApp redirige cada sucursal

## Recomendacion de siguientes pasos

### Paso 1

Cerrar el contrato exacto del payload que mandara la web a:

```text
POST /api/lead
```

### Paso 2

Conectar la web real al tracking core.

### Paso 3

Conectar Elevator real para que los leads ya no sean demo.

### Paso 4

Conectar Dentalink real para leer citas, pacientes y pagos.

### Paso 5

Persistir `elevator_id` dentro de Dentalink para que la atribucion sea deterministica.

### Paso 6

Conectar Stape y empezar a mandar conversiones reales a plataformas.

### Paso 7

Migrar estado a KV/Postgres y agregar monitoreo mas robusto.

## Conclusion

La base tecnica ya esta creada y funcionando. Todavia no estamos en produccion real de tracking porque faltan credenciales y conexion con sistemas reales, pero ya tenemos el esqueleto operativo completo.

El sistema ya puede desplegarse, protegerse con secret, mostrar estado en dashboard, recibir leads demo, simular pagos y deduplicar eventos. El siguiente desbloqueo depende principalmente de conseguir accesos/API de Elevator, Dentalink y Stape, ademas de conectar la web real al endpoint de leads.
