# Plan de Implementacion

## Fase 0: Descubrimiento tecnico

Objetivo: validar lo que realmente permiten las APIs y no programar contra supuestos.

### Checklist

- confirmar autenticacion y limites de `Dentalink`
- confirmar endpoints de lectura y escritura de `Campos Adicionales`
- confirmar si `Dentalink` ofrece webhook de citas y pagos
- confirmar modelo de contacto y webhooks en `Elevator`
- confirmar contrato de entrada hacia `Stape`
- definir umbral inicial de `alto_ticket`

### Entregables

- matriz de capacidades por sistema
- lista final de endpoints
- decision `webhook vs cron` para citas y pagos

## Fase 1: MVP de atribucion

Objetivo: lograr punta a punta `lead -> cita -> compra`.

### Backlog

1. Crear servicio de captura de lead
2. Crear adaptador `Elevator`
3. Crear adaptador `Dentalink`
4. Crear modulo de normalizacion de identidad
5. Crear modulo de match
6. Crear persistencia de `elevator_id` en `Dentalink`
7. Crear cron de pagos con cursor `last_check`
8. Crear dispatcher a `Stape`
9. Crear tabla o KV de idempotencia
10. Agregar logs y heartbeat

### Criterios de aceptacion

- un lead queda creado con click IDs persistidos
- una cita se vincula al lead correcto
- `elevator_id` queda escrito en `Dentalink`
- un pago genera un unico evento `Compra`
- el sistema resiste reintentos sin duplicar conversiones

## Fase 2: Robustez operativa

Objetivo: endurecer el sistema antes de escalar inversion publicitaria.

### Backlog

- cola de `manual_review`
- reintentos con backoff
- dashboard operativo minimo
- alertas por fallo de cron
- alertas por volumen anormal de `match_failed`
- soporte de refunds / anulaciones

## Fase 3: Inteligencia y reporteria

Objetivo: separar optimizacion publicitaria de analitica de negocio.

### Backlog

- reconciliacion `signal_value` vs `cash_value`
- reporte diario por sucursal
- comparativos dia contra dia
- agente LLM para resumen ejecutivo

## Sprint 1 recomendado

Duracion sugerida: 5 a 7 dias habiles

### Scope cerrado

- definir contratos canonicos
- implementar adaptador `Elevator`
- implementar adaptador `Dentalink`
- resolver y persistir `elevator_id`
- detectar pago y disparar `Compra`

### Fuera de scope

- reporteria LLM
- refunds
- dashboards de negocio
- multitier complejo

## Estructura de proyecto sugerida

```text
apps/
  tracking-core/
    src/
      routes/
      modules/
        elevator/
        dentalink/
        stape/
        matching/
        payments/
        observability/
      lib/
      types/
    tests/
docs/
  blueprint-inicial.md
  contratos-datos.md
  plan-implementacion.md
```

## Preguntas que bloquean codigo

1. Como se autentica exactamente cada API.
2. Cual es el identificador mas estable de paciente en `Dentalink`.
3. Donde se escribe el `Campo Adicional` y con que permisos.
4. Si `Elevator` permite buscar contacto por telefono normalizado.
5. Si `Stape` recibira eventos desde `Elevator`, desde `Vercel` o en modelo mixto.
