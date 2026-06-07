# Reporte para socio - Ecosistema Tracking DrDiente

## Resumen ejecutivo

Ya se construyo y desplego la base operativa del ecosistema de tracking de DrDiente. El proyecto ya no esta solo en modo demo: actualmente puede leer datos reales de Dentalink, crear/buscar contactos en Elevator, preparar y enviar conversiones reales a Stape, guardar estado persistente en Redis/Upstash y visualizar la operacion desde un dashboard interno.

El objetivo de esta fase fue crear una plataforma propia para conectar marketing, CRM, Dentalink y server-side tracking sin depender de procesos manuales. La base ya esta funcionando en Vercel y conectada al repositorio privado de GitHub.

## Repositorio y despliegue

Repositorio privado:

```text
https://github.com/clinicadrdiente/drdiente-tracking-core
```

Proyecto Vercel:

```text
drdiente-tracking-core
```

URL de produccion:

```text
https://drdiente-tracking-core.vercel.app
```

App principal:

```text
apps/tracking-core
```

La app esta desplegada en Vercel y se actualiza con cada push a `main`.

## Que se construyo

Se construyo una app interna llamada `DrDiente Tracking Core`. Esta app funciona como centro operativo para:

- consultar pagos y pacientes reales desde Dentalink
- sumar revenue mensual
- agrupar pagos por dia y sucursal
- ver ultimos pacientes/pagos
- mandar pacientes recientes a Elevator
- evitar duplicados en Elevator por telefono/email
- preparar eventos de conversion para Stape
- enviar eventos reales a Stape
- guardar estado persistente en Redis/Upstash
- ejecutar un cron automatico diario
- consultar data de marketing desde Windsor AI

## Dashboard operativo

El dashboard fue redisenado para que sea mas visual y facil de entender. Actualmente incluye secciones para:

- revenue mensual
- pagos del mes
- pacientes unicos
- ticket promedio
- pagos por dia
- pagos por sucursal
- ultimos pacientes Dentalink
- estado de integraciones
- acciones operativas
- resultados de envio a Elevator
- resultados de conversiones a Stape
- datos de marketing desde Windsor

Tambien se limpiaron textos excesivos para que el dashboard sea mas directo y menos cargado.

## Dentalink

Dentalink ya esta conectado en modo API real.

Se logro:

- validar conexion con Dentalink
- leer endpoint de pagos
- leer endpoint de pacientes
- leer endpoint de sucursales
- leer tratamientos
- extraer pagos recientes
- extraer nombre de paciente
- extraer email
- extraer telefono movil cuando Dentalink lo entrega
- extraer sucursal asociada
- extraer metodo de pago
- extraer folio
- extraer monto
- calcular revenue
- dividir revenue por sucursal
- cargar ultimos pacientes del mes
- diagnosticar ventanas de 7, 30 y 90 dias

Problemas resueltos:

- Dentalink devolvia `404` en algunos endpoints base, pero los endpoints especificos funcionaban.
- Dentalink devolvia `400` por filtros mal formados; se ajusto la query.
- Dentalink devolvia `429` por exceso de requests; se implemento cache/persistencia para reducir llamadas.
- Se ajusto la extraccion de pacientes para traer emails y telefonos.

Estado actual:

```text
Dentalink: api
```

## Elevator CRM

Elevator ya esta conectado en modo API real.

Se logro:

- crear integracion privada en Elevator
- configurar token privado
- configurar location ID
- validar conexion con `/contacts/search`
- crear contacto demo
- resolver error de campos incorrectos (`first_name` / `last_name`)
- resolver error de duplicados
- buscar contactos existentes por telefono/email
- evitar duplicados cuando Elevator ya tiene el contacto
- enviar pacientes recientes a Elevator
- marcar leads como listos para Stape cuando hay match

Resultado observado:

```text
Pagos encontrados: 50
Ya existian en Elevator: 48
Sin match/contacto: 2
Fallidos: 0
```

Esto significa que varios pacientes ya estaban en Elevator y el sistema pudo reconocerlos.

Estado actual:

```text
Elevator: api
```

## Stape

Stape ya esta conectado en modo API real.

Se logro:

- configurar servidor Stape
- configurar container server-side GTM
- configurar container ID
- configurar container identifier
- configurar API key
- crear endpoint de prueba
- agregar boton `Probar Stape`
- enviar evento demo correctamente
- ejecutar flujo real Dentalink -> Elevator -> Stape
- enviar conversiones reales a Stape

Prueba real confirmada:

```text
Pagos revisados: 10
Nuevos pagos: 10
Match Elevator: 10
Enviados a Stape: 10
```

Esto confirma que Stape ya puede recibir conversiones desde nuestra plataforma.

Estado actual:

```text
Stape: api
```

## Redis / Upstash

Se conecto Upstash Redis para persistencia real.

Esto reemplaza la persistencia temporal en `/tmp` de Vercel y permite guardar estado aunque el serverless reinicie.

Se usa para:

- pagos ya procesados
- ultimo sync
- deduplicacion
- estado operativo
- evitar llamadas innecesarias a Dentalink

Variables usadas:

```text
STATE_STORE_MODE=redis
UPSTASH_REDIS_REST_URL
UPSTASH_REDIS_REST_TOKEN
STATE_STORE_REDIS_KEY_PREFIX=drdiente:tracking
```

Estado actual:

```text
Persistencia: Redis/Upstash
```

## Cron automatico

Se agrego un cron diario en Vercel.

Horario definido:

```text
11:00 p.m. Costa Rica
```

En Vercel se ejecuta como:

```text
0 5 * * *
```

El cron llama:

```text
/api/cron/payments-sync
```

Funcion:

- revisar pagos recientes
- detectar pagos nuevos
- buscar match con Elevator
- preparar/enviar conversiones a Stape
- guardar estado en Redis

## Windsor AI

Se integro Windsor AI para traer data de marketing.

Actualmente se consulta el conector:

```text
all
```

Rango:

```text
last_180d
```

Campos finales usados:

```text
date
datasource
account_name
source
campaign
clicks
spend
account_id
reach
video_trueview_views
currency
account_currency
campaign_id
campaign_name
impressions
```

Se ajusto el dashboard para mostrar:

- spend
- clicks
- impresiones
- reach
- video views
- campanas por fuente

Tambien se agrego una proteccion para que si Vercel todavia tiene campos antiguos configurados, el sistema elimine campos obsoletos y agregue los campos finales.

Pendiente aqui:

- filtrar Windsor exclusivamente a DrDiente si aparecen datos mezclados con otras cuentas, como Rimas.
- para eso se necesita definir el ID exacto de cuenta/campana/business manager que corresponda solo a DrDiente.

## Seguridad

El sistema usa un secret interno:

```text
TRACKING_API_SECRET
```

El dashboard guarda ese secret localmente en el navegador del operador. Los endpoints sensibles requieren autenticacion por header y no deberian quedar abiertos.

No se deben compartir tokens/API keys por WhatsApp, documentos publicos o screenshots. En el repositorio solo deben quedar nombres de variables, nunca valores reales.

## Variables principales configuradas

Sin exponer valores, estas son las variables relevantes:

```text
TRACKING_API_SECRET

DENTALINK_MODE=api
DENTALINK_BASE_URL
DENTALINK_AUTH_SCHEME
DENTALINK_ACCESS_TOKEN
DENTALINK_PAYMENT_DATE_FIELD
DENTALINK_PAYMENT_AMOUNT_FIELD

ELEVATOR_MODE=api
ELEVATOR_BASE_URL
ELEVATOR_API_VERSION
ELEVATOR_PRIVATE_TOKEN
ELEVATOR_LOCATION_ID

STAPE_MODE=api
STAPE_SERVER_URL
STAPE_REQUEST_PATH
STAPE_CONTAINER_ID
STAPE_CONTAINER_IDENTIFIER
STAPE_API_KEY
STAPE_API_KEY_HEADER

STATE_STORE_MODE=redis
UPSTASH_REDIS_REST_URL
UPSTASH_REDIS_REST_TOKEN
STATE_STORE_REDIS_KEY_PREFIX

WINDSOR_API_KEY
WINDSOR_DEFAULT_CONNECTOR
WINDSOR_DATE_PRESET
WINDSOR_DEFAULT_FIELDS
WINDSOR_INCLUDE_TEXT
WINDSOR_EXCLUDE_TEXT

CRON_SECRET
```

## Flujo actual

El flujo operativo actual es:

```text
Dentalink -> Tracking Core -> Elevator -> Stape
```

Explicado simple:

1. Dentalink tiene pagos y pacientes reales.
2. Tracking Core lee esos pagos/pacientes.
3. Tracking Core busca si el paciente existe en Elevator.
4. Si existe o se puede crear, queda listo como lead/contacto.
5. Cuando hay pago con match, Tracking Core envia conversion a Stape.
6. Stape recibe el evento para que server-side GTM lo mande a plataformas como Meta, Google o TikTok segun la configuracion del contenedor.

## Lo que ya se comprobo

Se comprobo:

- Vercel despliega correctamente.
- GitHub esta conectado.
- Dashboard carga en produccion.
- Dentalink responde con datos reales.
- Se pueden ver pagos reales.
- Se pueden ver pacientes reales.
- Se puede sumar revenue.
- Se puede agrupar por sucursal.
- Elevator responde por API.
- Elevator detecta duplicados.
- Stape recibe evento demo.
- Stape recibio conversiones reales.
- Redis/Upstash queda configurado como persistencia.
- Windsor responde con data de marketing.

## Limitaciones actuales

Hay varias cosas importantes que todavia no estan cerradas al 100%:

- La referencia de Dentalink no aparece todavia por API aunque existe en interfaz.
- Hay que confirmar el ID/campo real de referencia en Dentalink o pedir permiso/campo adicional correcto.
- Windsor puede traer data mezclada si no filtramos por cuenta exacta de DrDiente.
- Stape recibe eventos, pero falta validar dentro del contenedor GTM que cada tag final dispare como queremos hacia Meta/Google/TikTok.
- Falta conectar el formulario real de la web de DrDiente al endpoint de leads.
- Falta definir nombres finales de eventos y parametros finales para plataformas.
- Falta monitoreo/alertas mas robustas para fallos diarios.

## Pendiente recomendado para cerrar fase 1

### 1. Validar tags en Stape / server-side GTM

Confirmar dentro de Stape/GTM que los eventos que enviamos disparan correctamente:

- Meta CAPI
- Google Ads / Enhanced Conversions / Offline conversions
- TikTok Events API

### 2. Filtrar Windsor a DrDiente

Definir exactamente que cuenta o business manager representa DrDiente para que el dashboard no mezcle data de Rimas u otras marcas.

### 3. Conectar la web real

El formulario de DrDiente debe enviar leads al Tracking Core con:

- nombre
- apellido
- telefono
- email
- sucursal
- landing URL
- UTMs
- click IDs (`fbclid`, `gclid`, `ttclid`)

### 4. Resolver referencia Dentalink

Necesitamos identificar el campo real de referencia en API. En la interfaz aparece, pero en la API no se detecto con los permisos/campos actuales.

### 5. Cerrar contrato de eventos

Definir nombres y parametros finales:

- Lead
- Appointment
- Payment
- HighTicketPayment
- Refund

### 6. Agregar monitoreo

Agregar logs y alertas para:

- error Dentalink
- rate limit 429
- error Elevator
- error Stape
- cron fallido
- conversiones no enviadas

## Estado final actual

```text
GitHub: conectado
Vercel: conectado
Dashboard: operativo
Dentalink: api real
Elevator: api real
Stape: api real
Redis/Upstash: activo
Cron diario: configurado
Windsor AI: conectado
Fase 1: muy avanzada, pendiente validacion final de tags, filtros Windsor y web real
```

## Conclusion

La plataforma ya existe y ya conecta los sistemas principales. No es solo un documento o una idea: hay repositorio, deploy, dashboard, integraciones reales y flujo de conversiones funcionando.

Lo que falta para terminar fase 1 no es construir desde cero, sino cerrar validaciones finales: filtrar Windsor correctamente, confirmar campos faltantes de Dentalink, validar tags de Stape y conectar la web real para que los leads nuevos entren automaticamente al ecosistema.
