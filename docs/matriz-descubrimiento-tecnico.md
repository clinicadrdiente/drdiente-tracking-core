# Matriz de Descubrimiento Tecnico

## Objetivo

Cerrar las incertidumbres tecnicas antes de escribir integraciones productivas para `Dentalink`, `Elevator` y `Stape`.

## Como usar esta matriz

- Cada fila debe terminar en uno de estos estados: `confirmado`, `parcial`, `bloqueado`.
- La evidencia ideal es una de estas:
  - captura de pantalla
  - enlace a documentacion
  - ejemplo real de request/response
  - acceso a panel o API
- Si una fila sigue abierta, no se debe asumir comportamiento en codigo.

## Matriz

| Sistema | Area | Pregunta / decision | Lo que necesitamos confirmar | Evidencia esperada | Impacto si no se confirma | Prioridad | Estado |
|---|---|---|---|---|---|---|---|
| Dentalink | Auth | Como autentica la API | esquema auth, headers, expiracion de token, ambiente sandbox o prod | request real exitosa | bloquea toda integracion | critica | pendiente |
| Dentalink | Pacientes | Cual es el identificador estable del paciente | `id_paciente`, unicidad, persistencia entre sucursales | payload real de paciente | bloquea match confiable | critica | pendiente |
| Dentalink | Campos adicionales | Como leer campos adicionales | endpoint exacto, formato, nombres internos, limites | ejemplo response | bloquea lectura de `elevator_id` | critica | pendiente |
| Dentalink | Campos adicionales | Como escribir campos adicionales | endpoint exacto de escritura, metodo HTTP, permisos, validaciones | ejemplo request/response | bloquea persistencia de llave deterministica | critica | pendiente |
| Dentalink | Citas | Existe webhook de cita creada | si hay push nativo, payload, reintentos, firma, latencia | doc o prueba real | define si usamos webhook o polling | critica | pendiente |
| Dentalink | Citas | Si no hay webhook, como consultar citas | endpoint, filtros por fecha, paginacion, zona horaria | request/response real | bloquea flujo de agendamiento | alta | pendiente |
| Dentalink | Pagos | Existe webhook de pago o abono | evento disponible, payload, retries, orden de entrega | doc o prueba real | define si pagos van por push o cron | critica | pendiente |
| Dentalink | Pagos | Como consultar pagos incrementalmente | filtro por fecha o updated_at, paginacion, anulados | ejemplo real de `/pagos` | bloquea cron confiable | critica | pendiente |
| Dentalink | Pagos | Como se expresa anulacion o devolucion | `anulado`, tipo de movimiento, ajuste parcial vs total | casos reales | bloquea refunds e integridad de ROAS | alta | pendiente |
| Dentalink | Tratamientos | Como obtener valor total del presupuesto | endpoint, campo monetario correcto, moneda, impuestos | response real de tratamiento | bloquea `Compra` con valor correcto | critica | pendiente |
| Dentalink | Sucursales | Como se modelan las sucursales | ids, nombres canonicos, relacion con paciente/cita/pago | payload real | afecta segmentacion y reporting | media | pendiente |
| Dentalink | Limites | Rate limits y ventanas de consulta | limites por minuto, timeout, errores frecuentes | doc o prueba | afecta cron y reintentos | media | pendiente |
| Elevator | Auth | Como autentica la API | token, API key, permisos, expiracion | request real | bloquea integracion CRM | critica | pendiente |
| Elevator | Contactos | Como crear un lead con atribucion | endpoint, campos obligatorios, custom fields | request/response real | bloquea captura de lead | critica | pendiente |
| Elevator | Contactos | Como guardar `fbclid/gclid/ttclid/utm_*` | si van en custom fields, estructura y naming | payload real | bloquea persistencia de atribucion | critica | pendiente |
| Elevator | Contactos | Como buscar contacto existente | lookup por telefono, email, external_id, normalizacion | ejemplo real | bloquea match y dedup | critica | pendiente |
| Elevator | Contactos | Como actualizar etapa del lead | endpoint, pipeline/stage ids, reglas de negocio | request real | bloquea paso a `agendo` y `anticipo pagado` | alta | pendiente |
| Elevator | Webhooks | Que webhooks salientes soporta | eventos disponibles, payload, firma, reintentos | doc o ejemplo real | define arquitectura de disparo | critica | pendiente |
| Elevator | Webhooks | Quien emite conversion hacia Stape | si sale desde Elevator, desde Vercel o mixto | decision tecnica confirmada | evita duplicidad y complejidad innecesaria | critica | pendiente |
| Elevator | IDs | Que identificador debemos persistir en Dentalink | contacto id, lead id, opportunity id, external id | evidencia del identificador canonico | bloquea llave deterministica | critica | pendiente |
| Elevator | Dedup | Como maneja leads duplicados | merge, update, duplicate detection, side effects | prueba real | afecta integridad de journey | alta | pendiente |
| Stape | Ingreso de eventos | Como recibira los eventos | endpoint HTTP, GTM server container, auth, secret | contrato real | bloquea salida del sistema | critica | pendiente |
| Stape | Payload | Contrato exacto por evento | campos requeridos por `Lead`, `Agendamiento`, `Compra`, `Refund` | ejemplos reales | bloquea dispatcher | critica | pendiente |
| Stape | Dedup | Estrategia de deduplicacion | `event_id`, `order_id`, tolerancia a replays | doc o configuracion real | riesgo de conversiones duplicadas | critica | pendiente |
| Stape | Meta | Requerimientos de Meta CAPI | `action_source`, hashes, fbc/fbp, user_data | ejemplo de evento valido | afecta match quality | alta | pendiente |
| Stape | Google | Requerimientos de Google Offline / EC | click id, conversion action, order id, adjustments | configuracion real | afecta carga de compras y refunds | alta | pendiente |
| Stape | TikTok | Requerimientos de TikTok Events API | event name, ttclid, hashes, dedup | ejemplo real | afecta cobertura de plataforma | media | pendiente |
| Sitio web | Captura | Donde viven hoy los formularios | dominio, stack, forma de despliegue | acceso al codigo o formulario | define punto de entrada | critica | pendiente |
| Sitio web | Captura | Como persistimos click IDs en frontend | query params, cookies, hidden fields, expiracion | decision tecnica | afecta completitud de atribucion | critica | pendiente |
| Sitio web | Branching | Como se selecciona sucursal | campo manual, logica por landing, WhatsApp por sucursal | evidencia de formulario | afecta routing comercial | media | pendiente |
| Vercel | Runtime | Que stack usaremos | `Next.js API routes`, `Vercel Functions`, `TypeScript` | decision confirmada | define repo y despliegue | critica | pendiente |
| Vercel | Estado | Donde guardar cursor e idempotencia | `KV`, `Redis`, `Postgres` | decision confirmada | bloquea cron seguro | critica | pendiente |
| Vercel | Cron | Frecuencia del poller | cada cuantos minutos, ventanas, costo | decision confirmada | afecta frescura y costo | alta | pendiente |
| Observabilidad | Logs | Donde viviran logs y alertas | Vercel logs, servicio externo, email, Slack | decision confirmada | riesgo de falla silenciosa | critica | pendiente |
| Negocio | Alto ticket | Umbral de alto ticket | valor inicial por tratamiento o servicio | decision de negocio | bloquea segmentacion premium | alta | pendiente |
| Negocio | Value semantics | Que valor enviaremos como conversion | `budget_total`, `cash_collected`, ambos | decision conjunta negocio/medios | afecta optimizacion y ROAS | critica | pendiente |

## Decisiones tecnicas que deben salir de esta fase

Al cerrar la matriz debemos poder responder sin ambiguedad:

1. Si `citas` van por webhook, cron o mixto.
2. Si `pagos` van por webhook, cron o mixto.
3. Cual es la llave exacta que une `Elevator` con `Dentalink`.
4. Quien dispara cada evento a `Stape`.
5. Donde vive la idempotencia.
6. Que valor se enviara a plataformas y que valor se reservara para reporteria financiera.

## Entregable esperado al completar la matriz

- arquitectura final `v1.1`
- lista cerrada de endpoints
- lista de secretos requeridos
- backlog tecnico del sprint 1 listo para implementacion

## Secretos y accesos que probablemente necesitaremos

- API token de `Dentalink`
- credenciales o API key de `Elevator`
- URL o secret de ingestion para `Stape`
- acceso al proyecto `Vercel`
- acceso al formulario o repositorio del sitio
- ids de conversion action o configuraciones equivalentes en Meta, Google y TikTok

## Orden recomendado para levantar informacion

1. `Dentalink`
2. `Elevator`
3. `Stape`
4. `Sitio web`
5. decisiones de `Vercel`

La razon es simple: `Dentalink` y `Elevator` definen si el core de la atribucion es viable tal como esta dibujado.
