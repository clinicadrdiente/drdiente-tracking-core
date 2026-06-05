# DrDiente Ecosistema de Tracking

Blueprint inicial para convertir la arquitectura de tracking y atribucion en un sistema implementable.

## Documentos

- `docs/blueprint-inicial.md`: arquitectura objetivo, MVP y decisiones tecnicas.
- `docs/contratos-datos.md`: entidades, eventos y payloads canonicos.
- `docs/plan-implementacion.md`: roadmap por fases y backlog del primer sprint.

## Objetivo

Construir una capa de atribucion que conecte:

- `Sitio web / landing`
- `Elevator CRM`
- `Dentalink`
- `Vercel Functions / Cron`
- `Stape sGTM`

El primer objetivo no es reporteria ni agentes. El primer objetivo es asegurar que un lead capturado pueda terminar convertido en un evento de `Compra` atribuido de forma deterministica.
