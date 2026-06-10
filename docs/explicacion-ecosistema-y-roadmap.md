# Ecosistema DrDiente — Qué estamos construyendo y por qué

> Documento de explicación en lenguaje sencillo. Actualizado: 2026-06-10.

## El proceso meta (la idea grande)

Cada peso que invertimos en publicidad debe poder responder una pregunta:
**"¿Este anuncio me trajo un paciente que pagó?"**

Hoy la mayoría de las clínicas invierte en anuncios "a ciegas": saben cuánto gastan, pero no saben qué anuncio produjo qué paciente ni cuánto dinero dejó ese paciente. Nosotros estamos construyendo el sistema que conecta esos dos extremos: el clic en el anuncio y el pago en el sillón dental.

## El flujo, pieza por pieza

### 1. Envío de data desde anuncios hasta la web

Cuando alguien ve un anuncio nuestro en Meta/Google/TikTok y hace clic, ese clic trae una "etiqueta invisible" (fbclid, gclid, UTMs). Nuestra web captura esa etiqueta junto con los datos del formulario (nombre, teléfono, email, sucursal). Así sabemos exactamente de qué anuncio y campaña vino cada persona.

### 2. Elevator recibiendo y redistribuyendo

Elevator es nuestro CRM: la "central de tráfico". Todo lead que entra se guarda ahí con su etiqueta de origen. Cuando esa persona después aparece en Dentalink como paciente (agenda cita, paga tratamiento), nuestro sistema la **cruza por teléfono/email** con su lead original. Eso es lo que une "el clic" con "el paciente real".

### 3. Envío de conversiones para buscar mejores pacientes

Cuando un paciente paga, le avisamos de vuelta a Meta/Google (vía Stape, nuestro servidor de eventos): *"esta persona que vino de tu anuncio X pagó $Y"*. Esto es lo más valioso del sistema: los algoritmos de Meta/Google **aprenden cómo se ve un paciente que paga** y empiezan a buscar más gente parecida. Dejamos de optimizar por "leads baratos" y empezamos a optimizar por "pacientes que pagan tratamientos completos".

### 4. Uso de los datos y envío a plataforma de reporte

Windsor AI junta el gasto publicitario de todas las plataformas. Nuestro sistema junta los ingresos reales de Dentalink. El dashboard (plataforma de reporte V1) cruza ambos: gasto por campaña vs. ingreso por campaña.

### 5. Beneficios de la plataforma de reporte V1

- ROAS real por campaña: cuánto invertimos vs. cuánto facturó esa campaña.
- Visibilidad por sucursal.
- Detectar campañas que traen leads pero no pacientes (dinero tirado).
- Decisiones de presupuesto basadas en facturación, no en "likes" ni leads.
- Una sola pantalla en lugar de 5 plataformas separadas.

### 6. Agente de Blogs

Mientras el tracking optimiza el tráfico **pagado**, el agente de blogs construye el tráfico **gratuito**: genera contenido SEO constante (artículos sobre tratamientos, dudas de pacientes) que posiciona a DrDiente en Google. Beneficios: pacientes que llegan sin costo por clic, autoridad de marca, y un activo que se acumula — cada artículo sigue trayendo gente meses después, a diferencia de un anuncio que muere al apagarlo.

## El flujo del paciente, ULTRA sencillo

1. **Nos ven**: anuncio en redes o artículo del blog en Google.
2. **Nos contactan**: llenan el formulario / agendan. Su origen queda etiquetado.
3. **Vienen y pagan**: aparecen en Dentalink como pacientes.
4. **Cerramos el círculo**: el sistema une su pago con su anuncio de origen, le avisa a Meta/Google "este tipo de persona paga", y el dashboard nos muestra qué campaña fue rentable.
5. **Resultado**: cada mes los anuncios encuentran mejores pacientes y nosotros sabemos dónde invertir.

## Lo que hicimos esta semana (y por qué importa)

Endurecimos el motor con 6 mejoras: pruebas automáticas + CI, ventana de recuperación de pagos de 7 días, aislamiento de fallos por pago, dedup atómico de revenue (no inflar ROAS), autenticación fail-closed del cron, y heartbeat de salud visible en dashboard.

**Mediano plazo**: datos confiables = decisiones de inversión correctas desde el primer peso.
**Largo plazo**: un activo de datos propio (qué campañas, tratamientos y sucursales son rentables) que nadie nos puede quitar y que mejora con cada paciente.

## Qué le falta al dashboard / sistema para estar al 100%

### Para cerrar Fase 1 (lo urgente)
1. **Validar tags en Stape**: confirmar que Meta CAPI, Google y TikTok reciben y aceptan nuestros eventos.
2. **Filtrar Windsor solo a DrDiente**: hoy puede mezclar data de otras cuentas (ej. Rimas).
3. **Conectar la web real**: que el formulario de producción envíe leads automáticamente al sistema.
4. **Campo de referencia en Dentalink**: identificar el campo correcto vía API.
5. **Cerrar contrato de eventos**: nombres y parámetros finales (Lead, Appointment, Payment, HighTicket, Refund).

### Fase 2 — Robustez (antes de escalar inversión)
- Cola de revisión manual para matches ambiguos.
- Reintentos automáticos con backoff.
- Alertas activas (cron caído, exceso de match_failed) — el heartbeat ya existe, faltan notificaciones push/email.
- Soporte completo de refunds/anulaciones.

### Fase 2.5 — Experiencia y captura de datos operativos (nuevas)

**Reporteria con líneas de tiempo:**
- Selectores de rango en todos los reportes: **7 días, 30 días, 180 días**.
- Vista con **separación por meses** (barras/tablas mes a mes).

**Comparativas de desempeño:**
- Periodo actual vs. periodo anterior (ej. últimos 30 días vs. 30 días previos).
- Comparativos entre sucursales y entre campañas.

**Listas de esfuerzos (panel de "qué estamos metiendo al sistema"):**
- Dinero invertido por plataforma (Meta, Google, TikTok — vía Windsor).
- Cantidad de posts publicados.
- Leads recolectados en Elevator.
- Llamadas recibidas (reportes internos de data).
- Emails enviados.
- Mensajes de WhatsApp promocionales enviados.
- Mensajes de seguimiento enviados.
- Impresiones por plataforma.
- Alcance por plataforma.

> Nota técnica: dinero/impresiones/alcance salen de Windsor automáticamente; leads salen de Elevator; posts, llamadas, emails y WhatsApp requieren **captura manual o integración nueva** — primero versión manual (formulario), luego automatizar.

**Diferenciación visual por módulos:**
- Contrastes de color más marcados entre cada módulo del dashboard (atribución, esfuerzos, salud del sistema, reportes) para que se entienda dónde termina uno y empieza otro.
- Requiere primero partir el componente `dashboard.tsx` (2,688 líneas) en módulos reales — la separación visual y la separación de código van juntas.

**Formulario de reporte diario por sucursal:**
- Cada sucursal envía diariamente el estatus de contacto de cada lead: Llamada, Visita de Google Maps, WhatsApp, etc.
- Esto alimenta las "listas de esfuerzos" y permite medir velocidad de contacto por sucursal (lead que no se contacta en 24h = dinero perdido).

### Fase 3 — Inteligencia
- Reconciliación señal-publicitaria vs. caja real.
- Reporte diario por sucursal + comparativos día contra día.
- Agente LLM que genere el resumen ejecutivo automático.

### Deuda técnica del dashboard
- `dashboard.tsx` tiene 2,688 líneas en un solo componente — hay que partirlo antes de agregarle más features.
- Endpoints de prueba (`api/dev/*`) sin protección — cerrar antes de compartir URL pública.
