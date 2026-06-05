# Blueprint Inicial

## 1. Objetivo del sistema

Crear un motor de tracking y atribucion para DrDiente que una el viaje:

`clic publicitario -> lead -> cita -> anticipo pagado -> conversion enviada a plataformas`

El sistema debe soportar:

- persistencia de identificadores de atribucion (`fbclid`, `gclid`, `ttclid`, `utm_*`)
- enlace deterministico entre `Elevator` y `Dentalink`
- emision confiable de eventos hacia `Stape`
- tolerancia a duplicados
- observabilidad minima para evitar fallas silenciosas

## 2. Principio rector

La pieza critica del ecosistema es la llave deterministica:

- `Elevator` es la verdad comercial del lead
- `Dentalink` es la verdad clinica y financiera
- `Vercel` hace el match una sola vez
- `Dentalink` guarda `elevator_id` como `Campo Adicional`

Sin ese paso, la atribucion de citas y pagos queda sujeta a coincidencias fragiles por telefono o email.

## 3. MVP real

El MVP debe excluir todo lo que no sea necesario para validar atribucion economica.

### Incluye

- captura de lead con click IDs y UTM
- alta del lead en `Elevator`
- endpoint o polling para detectar cita en `Dentalink`
- normalizacion de telefono y email
- match con contacto en `Elevator`
- escritura de `elevator_id` en `Dentalink`
- deteccion de primer pago
- disparo de evento `Compra` a `Stape`
- logs, idempotencia y heartbeat minimo

### No incluye en fase 1

- agente LLM de reportes
- dashboards avanzados
- refunds complejos multi-caso
- optimizacion premium por multiples tiers
- automatizaciones no relacionadas con atribucion

## 4. Arquitectura recomendada

### Capa 1: Captura

Responsable de recibir:

- nombre
- telefono
- email
- sucursal
- `fbclid`
- `gclid`
- `ttclid`
- `utm_source`
- `utm_medium`
- `utm_campaign`
- `landing_url`

Salida:

- creacion o actualizacion de lead en `Elevator`

### Capa 2: Orquestacion

`Vercel` debe ser la unica pieza custom del core. Debe contener:

- `webhook receiver` para eventos desde `Dentalink` o `Elevator`
- `cron poller` para `pagos`
- `identity resolution service`
- `event dispatcher` hacia `Stape`
- almacen de estado (`KV` o `Postgres`) para cursores e idempotencia

### Capa 3: Sistemas externos

- `Elevator`: CRM comercial y emisor principal de conversiones
- `Dentalink`: eventos clinicos y financieros
- `Stape`: traduccion a Meta, Google y TikTok

## 5. Decisiones tecnicas iniciales

### Backend

- runtime sugerido: `Next.js` sobre `Vercel` o `Node.js/TypeScript`
- razon: cron nativo, buen manejo de webhooks y bajo overhead

### Persistencia

Para el MVP:

- `Vercel KV` o `Upstash Redis` para `last_check`, dedup e indicadores operativos

Si el volumen crece:

- `Postgres` para auditoria completa de eventos y reconciliacion

### Idempotencia

Cada evento debe tener `event_id` estable:

- `lead_{elevator_id}`
- `appointment_{appointment_id}`
- `payment_{payment_id}`
- `refund_{payment_id}_{timestamp}`

### Observabilidad

Minimo obligatorio:

- log por evento recibido
- log por match resuelto o fallido
- log por conversion enviada
- heartbeat del cron
- alerta si el cron no corre o si suben los `match_failed`

## 6. Riesgos principales

### Riesgo 1: Match ambiguo

Si varios leads comparten telefono o email, el sistema puede enlazar mal un paciente.

Mitigacion:

- normalizacion estricta
- score de confianza
- estado `manual_review` para casos ambiguos

### Riesgo 2: Eventos duplicados

Polling de pagos sin dedup puede inflar conversiones.

Mitigacion:

- registro de `payment_id` procesados
- `event_id` estable

### Riesgo 3: Inflacion de ROAS

Enviar valor de presupuesto total al primer anticipo mejora optimizacion, pero no representa caja real.

Mitigacion:

- separar `signal_value` de `cash_value`
- reconciliar en reporteria financiera posterior

### Riesgo 4: Falla silenciosa

Si el cron cae, el sistema parece sano pero deja de atribuir.

Mitigacion:

- heartbeat diario
- endpoint de salud
- alertas por falta de ejecucion

## 7. Secuencia correcta de construccion

1. Confirmar capacidades reales de API en `Dentalink`, `Elevator` y `Stape`.
2. Definir modelo canonico de entidades.
3. Implementar captura de lead.
4. Implementar servicio de match y persistencia de `elevator_id`.
5. Implementar deteccion de pagos.
6. Implementar dispatcher a `Stape`.
7. Agregar monitoreo.

## 8. Criterio de exito del primer sprint tecnico

El sprint 1 es exitoso si se puede demostrar de punta a punta:

1. un formulario crea lead en `Elevator`
2. una cita en `Dentalink` se asocia al lead correcto
3. `Dentalink` queda persistido con `elevator_id`
4. un pago dispara una `Compra` idempotente
5. queda evidencia en logs de todo el recorrido
