# Checklist Operativa para Reuniones

## Objetivo

Usar esta guia en llamadas o intercambios con:

- `HealthAtom / Dentalink`
- `Elevator`
- `equipo de medios / tracking`
- `equipo web / Vercel`

La meta no es conversar en abstracto. La meta es salir con respuestas verificables para cerrar la fase de descubrimiento tecnico.

## Regla de uso

Por cada respuesta, pedir al menos una evidencia concreta:

- captura
- documentacion
- request real
- response real
- acceso al panel

Si no hay evidencia, la respuesta queda como `no confirmada`.

## 1. Reunion con HealthAtom / Dentalink

### Objetivo de la reunion

Confirmar que Dentalink puede:

- identificar pacientes de forma estable
- notificar o exponer citas
- notificar o exponer pagos
- leer y escribir `Campos Adicionales`
- entregar el valor correcto del tratamiento

### Preguntas criticas

1. Cual es el identificador canonico y estable del paciente en Dentalink.
2. Ese identificador cambia si el paciente cambia de sucursal o si hay merges.
3. Existe API publica para leer pacientes y sus campos adicionales.
4. Existe API publica para escribir campos adicionales del paciente.
5. Cual es el endpoint exacto para escribir un campo adicional como `elevator_id`.
6. Que permisos requiere esa escritura.
7. Existe webhook nativo para `cita creada`.
8. Si existe, cual es el payload exacto, como se firma y como se reintenta.
9. Si no existe webhook, cual es el endpoint correcto para consultar citas incrementalmente.
10. Existe webhook nativo para `pago registrado` o `abono registrado`.
11. Si existe, cual es el payload exacto y como diferencia anulaciones o devoluciones.
12. Si no existe webhook, como se consulta `/pagos` de forma incremental.
13. Que campo expresa una anulacion, devolucion o ajuste parcial.
14. Como obtenemos el valor total del tratamiento o presupuesto asociado a un pago.
15. El valor del tratamiento viene neto, bruto o con impuestos.
16. Como se relacionan `pago`, `tratamiento`, `paciente` y `sucursal`.
17. Hay rate limits, timeouts o restricciones de volumen.
18. Tienen sandbox o todo se valida directamente sobre produccion.

### Evidencia minima a pedir

- ejemplo real de paciente
- ejemplo real de cita
- ejemplo real de pago
- ejemplo real de tratamiento
- ejemplo real de lectura de campo adicional
- ejemplo real de escritura de campo adicional
- confirmacion documental de webhook o ausencia de webhook

### Decisiones que deben salir de esta reunion

- `webhook vs cron` para citas
- `webhook vs cron` para pagos
- endpoint exacto para persistir `elevator_id`
- campo exacto del presupuesto total

## 2. Reunion con Elevator

### Objetivo de la reunion

Confirmar que Elevator puede:

- crear y actualizar leads con datos de atribucion
- buscar contactos con precision
- almacenar click IDs
- disparar o soportar eventos hacia `Stape`

### Preguntas criticas

1. Como se autentica la API de Elevator.
2. Cual es el endpoint exacto para crear lead o contacto.
3. Que campos son obligatorios para alta de lead.
4. Donde deben guardarse `fbclid`, `gclid`, `ttclid` y `utm_*`.
5. Permiten custom fields para esos identificadores.
6. Cual es el identificador que recomiendan persistir fuera de Elevator.
7. Se debe persistir `contact_id`, `lead_id`, `opportunity_id` u otro.
8. Como se busca un contacto por telefono.
9. Elevator normaliza telefonos o debemos enviar ya normalizado.
10. Como se busca por email.
11. Como manejan duplicados o merges de contactos.
12. Como se actualiza la etapa del lead.
13. Cuales son los ids reales de pipeline y stage para `lead`, `agendo`, `anticipo pagado`.
14. Que webhooks salientes soportan hoy.
15. Esos webhooks tienen firma, reintentos y orden garantizado.
16. Recomiendan que la conversion salga desde Elevator o desde Vercel.
17. Si sale desde Elevator, como agregamos `value`, `event_id` y atributos del tratamiento.
18. Si sale desde Vercel, como evitamos duplicados o desfases con el CRM.

### Evidencia minima a pedir

- ejemplo real de alta de lead
- ejemplo real de contacto con custom fields
- ejemplo real de busqueda por telefono o email
- ejemplo real de actualizacion de etapa
- listado real de webhooks disponibles

### Decisiones que deben salir de esta reunion

- id exacto a persistir en Dentalink
- lugar exacto donde guardar click IDs
- mecanismo de disparo hacia `Stape`

## 3. Reunion con equipo de medios / tracking

### Objetivo de la reunion

Definir que conversiones importan para optimizacion y con que semantica de valor.

### Preguntas criticas

1. Que plataformas se optimizan hoy: Meta, Google, TikTok o solo algunas.
2. Que eventos quieren recibir como minimo: `Lead`, `Agendamiento`, `Compra`, `Refund`.
3. Cual de esos eventos sera objetivo principal de optimizacion.
4. Quieren una conversion separada para `Compra Alto Ticket`.
5. Cual es el umbral inicial de `alto_ticket`.
6. El umbral cambia por tratamiento o sera global.
7. En `Compra`, quieren optimizar por `budget_total`, por `cash_collected` o por ambos en modelos separados.
8. Entienden que usar `budget_total` en el primer anticipo mejora señal pero infla ROAS financiero.
9. Como quieren manejar refunds o anulaciones en Google y Meta.
10. Cual es la ventana de atribucion relevante entre lead y pago.
11. Que conversion actions ya existen y cuales hay que crear.
12. Tienen `order_id` o `event_id` como requisito de reconciliacion.

### Evidencia minima a pedir

- lista de conversion actions actuales
- captura de eventos configurados por plataforma
- confirmacion escrita de semantica de valor
- confirmacion escrita del umbral de alto ticket

### Decisiones que deben salir de esta reunion

- taxonomia final de eventos
- definicion final de `value`
- definicion final de `alto_ticket`

## 4. Reunion con equipo web / Vercel

### Objetivo de la reunion

Definir el punto de captura real y la infraestructura del backend de tracking.

### Preguntas criticas

1. Donde vive hoy el formulario o los formularios.
2. En que stack corre el sitio actual.
3. Tenemos acceso al repositorio y al despliegue.
4. Como capturaremos `fbclid`, `gclid`, `ttclid` y `utm_*`.
5. Esos valores se guardaran en cookies, local storage o hidden inputs.
6. Cuanto tiempo deben persistir en frontend.
7. Como se define la sucursal: seleccion manual, landing dedicada o logica automatica.
8. El submit del formulario pegara directo a Elevator o pasara por backend propio.
9. El backend de tracking vivira en el mismo proyecto Vercel o separado.
10. Que runtime usaremos: `Next.js`, `Node.js`, `TypeScript`.
11. Donde guardaremos `last_check`, idempotencia y logs operativos.
12. Cada cuanto debe correr el cron de pagos.
13. Como se alertara si el cron deja de correr.

### Evidencia minima a pedir

- acceso al repo
- acceso al proyecto Vercel
- ejemplo del formulario actual
- confirmacion del stack

### Decisiones que deben salir de esta reunion

- arquitectura base del repo
- estrategia frontend para click IDs
- estrategia backend para cron e idempotencia

## 5. Checklist de cierre

Antes de declarar terminada la fase de descubrimiento, estas preguntas deben quedar en `si`:

- sabemos como crear y buscar leads en Elevator
- sabemos donde guardar click IDs en Elevator
- sabemos que id de Elevator persistiremos en Dentalink
- sabemos como leer y escribir campos adicionales en Dentalink
- sabemos como detectar citas
- sabemos como detectar pagos
- sabemos de donde sale el valor total del tratamiento
- sabemos como llegaran los eventos a Stape
- sabemos cual sera el `event_id` canonico por tipo de evento
- sabemos donde vivira la idempotencia
- sabemos cual es el umbral de alto ticket
- sabemos cual sera la semantica exacta de `value`

## 6. Resultado esperado

Si esta checklist se responde bien, ya se puede pasar a:

- cerrar arquitectura `v1.1`
- crear repo tecnico
- arrancar sprint 1 de integracion
