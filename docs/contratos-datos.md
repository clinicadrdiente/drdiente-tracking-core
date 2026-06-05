# Contratos de Datos

## 1. Entidades canonicas

### Lead

```json
{
  "lead_id": "lead_local_uuid",
  "elevator_id": "ELV_8842",
  "first_name": "Juan",
  "last_name": "Perez",
  "phone_raw": "+52 55 1234 5678",
  "phone_normalized": "525512345678",
  "email_raw": "juan@example.com",
  "email_normalized": "juan@example.com",
  "branch": "Polanco",
  "source": "meta",
  "utm_source": "facebook",
  "utm_medium": "paid_social",
  "utm_campaign": "implantes-polanco",
  "fbclid": "fbclid_value",
  "gclid": null,
  "ttclid": null,
  "landing_url": "https://example.com/landing",
  "created_at": "2026-06-04T18:00:00.000Z"
}
```

### Patient Link

```json
{
  "dentalink_patient_id": 482,
  "elevator_id": "ELV_8842",
  "match_method": "phone_email_exact",
  "match_score": 1.0,
  "linked_at": "2026-06-04T19:00:00.000Z",
  "linked_by": "system"
}
```

### Appointment

```json
{
  "appointment_id": 9912,
  "dentalink_patient_id": 482,
  "elevator_id": "ELV_8842",
  "branch": "Polanco",
  "status": "scheduled",
  "scheduled_at": "2026-06-05T15:30:00.000Z",
  "created_at": "2026-06-04T19:10:00.000Z"
}
```

### Payment

```json
{
  "payment_id": 9123,
  "dentalink_patient_id": 482,
  "treatment_id": 77,
  "elevator_id": "ELV_8842",
  "payment_amount": 30000,
  "budget_total": 150000,
  "currency": "MXN",
  "is_voided": false,
  "paid_at": "2026-06-06T16:00:00.000Z"
}
```

## 2. Eventos internos

### lead.captured

```json
{
  "event_id": "lead_ELV_8842",
  "event_name": "lead.captured",
  "occurred_at": "2026-06-04T18:00:00.000Z",
  "lead": {
    "elevator_id": "ELV_8842",
    "phone_normalized": "525512345678",
    "email_normalized": "juan@example.com"
  }
}
```

### appointment.linked

```json
{
  "event_id": "appointment_9912",
  "event_name": "appointment.linked",
  "occurred_at": "2026-06-04T19:10:00.000Z",
  "appointment_id": 9912,
  "dentalink_patient_id": 482,
  "elevator_id": "ELV_8842"
}
```

### payment.detected

```json
{
  "event_id": "payment_9123",
  "event_name": "payment.detected",
  "occurred_at": "2026-06-06T16:00:00.000Z",
  "payment_id": 9123,
  "treatment_id": 77,
  "dentalink_patient_id": 482,
  "elevator_id": "ELV_8842"
}
```

## 3. Payload canonico a Stape

```json
{
  "event_name": "Compra",
  "event_id": "payment_9123",
  "event_time": 1780761600,
  "action_source": "physical_store",
  "user_data": {
    "em": "<sha256_email>",
    "ph": "<sha256_phone>",
    "fbc": "fbclid_value",
    "gclid": null,
    "ttclid": null
  },
  "custom_data": {
    "currency": "MXN",
    "value": 150000,
    "cash_collected": 30000,
    "treatment_id": 77,
    "branch": "Polanco",
    "tier": "alto_ticket"
  }
}
```

## 4. Reglas de negocio iniciales

- `Agendamiento` solo se emite cuando existe `elevator_id` resuelto.
- `Compra` solo se emite una vez por `payment_id`.
- `Compra Alto Ticket` es una proyeccion del mismo pago con segmentacion por umbral.
- Si hay devolucion o anulacion, debe emitirse un evento compensatorio.
- Si no hay match confiable, el evento no se envia; queda en cola de revision.

## 5. Estados operativos sugeridos

### Match status

- `pending_match`
- `linked`
- `manual_review`
- `match_failed`

### Dispatch status

- `pending_dispatch`
- `dispatched`
- `retrying`
- `dead_letter`
