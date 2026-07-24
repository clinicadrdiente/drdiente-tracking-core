# DrDiente Tracking Core — Agent Context

## What this is

Sistema de atribución y tracking que conecta el sitio web de Dr. Diente, Elevator CRM, Dentalink, Vercel Functions y Stape sGTM. El objetivo es asegurar que un lead capturado pueda rastrearse hasta una compra atribuida de forma determinística.

## Repo

- `git@github.com:clinicadrdiente/drdiente-tracking-core.git` — branch `main`

## Architecture

```
drdiente-tracking-core/
├── apps/
│   └── tracking-core/     → Core tracking application
├── docs/
│   ├── blueprint-inicial.md       → Arquitectura objetivo y MVP
│   ├── contratos-datos.md         → Entidades, eventos y payloads canónicos
│   └── plan-implementacion.md     → Roadmap por fases
├── plans/                  → Planning documents
└── .github/                → CI/CD
```

## Key integrations

| Sistema | Rol |
|---|---|
| **Sitio web Dr. Diente** | Captura de leads (formularios, landing) |
| **Elevator CRM** | CRM principal de la clínica |
| **Dentalink** | Sistema de gestión dental (agenda, historial) |
| **Stape sGTM** | Server-side GTM para tracking |
| **Vercel Functions** | Backend serverless |

## Pipeline de datos

```
Lead (web) → Elevator CRM → Dentalink (enriquecimiento)
                                  ↕
                         tracking-core (atribución)
                                  ↕
                         Dashboard de reporting
```

## Domain-specific knowledge

- El flujo automático debe: interceptar → enriquecer → reenviar payload mapeable
- Dentalink desconoce la atribución (dejar campo vacío que Dentalink no reconoce)
- El primer objetivo no es reportería ni agentes — es asegurar atribución determinística lead→compra
- Blueprint: `docs/blueprint-inicial.md`
- Contratos de datos: `docs/contratos-datos.md`

## Authority

- **Autónomo**: mejoras al tracking, webhooks, payload mapping, tests, documentación
- **Requiere aprobación**: cambios en producción que afecten flujo de leads, Dentalink API token (en .env.dentalink-web), cambios en Elevator CRM
