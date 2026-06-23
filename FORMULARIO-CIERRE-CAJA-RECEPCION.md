# Formulario de Cierre Diario — Recepción Clínica Dr. Diente

**Objetivo:** capturar todos los días, al cerrar caja, la data del embudo completo (campañas → leads → contactos → agendamientos → asistencia → interés clínico → ingresos) en un formato consistente que permita detectar patrones y tomar decisiones estratégicas.

**Principio de diseño:** rápido de llenar (≤10 min), con **opciones cerradas** (no texto libre donde se pueda evitar) para que la data sea analizable. Se llena en **2 bloques**: (A) Resumen del día y (B) Registro fila por fila de cada lead/paciente.

---

## BLOQUE A — Resumen del Día (1 vez al cierre)

| Campo | Tipo | Opciones / Nota |
|---|---|---|
| Fecha | Fecha | Automática |
| Recepcionista que cierra | Lista | Nombres del equipo |
| Total leads nuevos del día | Número | Contactos nuevos que llegaron hoy |
| Total agendados (citas creadas hoy) | Número | |
| Total citas que **asistieron** hoy | Número | Show |
| Total **no-show / cancelaciones** | Número | |
| Total pacientes **convertidos** (aceptaron tratamiento/pagaron) | Número | |
| Ingreso total del día ($) | Número | Cuadra con caja |
| Gasto publicitario del día (si lo conoce) | Número | Opcional — lo idealmente lo aporta marketing |
| Observación general del día | Texto corto | Solo si pasó algo relevante |

---

## BLOQUE B — Registro por Lead/Paciente (1 fila por persona contactada hoy)

Esta es la tabla clave para detectar patrones. Cada lead que escribió/llamó/llegó hoy = 1 fila.

| # | Campo | Tipo | Opciones sugeridas |
|---|---|---|---|
| 1 | Nombre del lead | Texto | |
| 2 | Teléfono / WhatsApp | Texto | ID único para no duplicar |
| 3 | **Canal de origen** | Lista | Meta/Instagram Ads · Facebook orgánico · Google · WhatsApp directo · Referido · Walk-in · TikTok · Otro |
| 4 | **Campaña específica** | Lista | Nombre exacto de la campaña activa (ej. "Blanqueamiento Junio", "Implantes 50%") |
| 5 | **Tratamiento de interés** | Lista | Limpieza · Blanqueamiento · Ortodoncia · Implantes · Endodoncia · Estética · Urgencia · Prótesis · Otro |
| 6 | **¿Qué preguntó / objeción principal?** | Lista | Precio · Disponibilidad/horarios · Ubicación · Financiamiento/cuotas · Duración tratamiento · Garantía · Dolor/miedo · Solo info · Otro |
| 7 | **Estado** | Lista | Solo consultó · Agendó · Asistió · Convirtió (pagó) · No contestó · Perdido |
| 8 | Si **agendó** → fecha de la cita | Fecha | |
| 9 | Si **perdido** → motivo | Lista | Precio · No respondió · Eligió otra clínica · Solo curioseaba · Sin horario disponible · Otro |
| 10 | Valor cotizado / pagado ($) | Número | Opcional pero muy útil |
| 11 | Nota libre (opcional) | Texto corto | Solo lo que no entra en las opciones |

---

## Por qué estos campos (lógica estratégica)

- **Canal + Campaña (3, 4):** permiten calcular **costo por lead y costo por paciente** por campaña → saber qué publicidad realmente trae pacientes y no solo clics.
- **Tratamiento de interés (5):** revela la **demanda real** por servicio → orientar promociones y agenda de especialistas.
- **Qué preguntó / objeción (6):** es el campo de oro. Si "precio" o "financiamiento" domina → ajustar oferta o guion de cierre. Detecta el **cuello de botella de conversión**.
- **Estado (7):** arma el embudo completo (consultó → agendó → asistió → convirtió) y deja medir **tasa de conversión por etapa**.
- **Motivo de pérdida (9):** dice exactamente **dónde se fuga el dinero**.

---

## Métricas que este formulario habilita (para los dueños)

1. **Tasa de conversión global:** leads → pacientes que pagaron.
2. **Tasa de no-show** (problema clásico que cuesta dinero).
3. **Costo por lead y por paciente, por campaña** (ROI publicitario real).
4. **Ranking de tratamientos** más demandados vs. más rentables.
5. **Top objeciones** → qué frena las ventas.
6. **Canal más efectivo** (no el que más leads trae, el que más convierte).

---

## Recomendación de implementación

- **Mejor opción:** Google Forms (Bloque B una respuesta por lead) + Google Sheets como base de datos → gratis, en celular, y la data queda lista para gráficos/dashboard.
- Usar **listas desplegables** siempre que se pueda: garantiza consistencia para análisis futuro (texto libre arruina los patrones).
- El **teléfono como ID único** evita contar dos veces al mismo lead en días distintos y permite seguir su recorrido.
- Revisión semanal de 15 min con los dueños sobre las 6 métricas de arriba.

> Siguiente paso sugerido: puedo generarte este formulario ya montado como **Google Form importable + plantilla de Sheet con fórmulas y dashboard automático**, o como CSV listo para subir. Dime cuál prefieres.
