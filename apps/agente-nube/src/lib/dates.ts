const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

const MONTHS_ES = [
  "ene", "feb", "mar", "abr", "may", "jun",
  "jul", "ago", "sep", "oct", "nov", "dic",
];

export interface ClinicDayRange {
  /** Fecha local de la clínica, YYYY-MM-DD. */
  date: string;
  /** Etiqueta corta en español, ej. "23 jun". */
  label: string;
  /** Límite inferior UTC inclusivo (ISO). */
  fromIso: string;
  /** Límite superior UTC exclusivo (ISO). */
  toIso: string;
}

function pad(value: number): string {
  return value.toString().padStart(2, "0");
}

/**
 * Calcula el "día" de la clínica que contiene `nowMs`, usando el offset horario
 * (CDMX y Costa Rica = -6). `dayOffset` desplaza días enteros (0 = hoy local,
 * -1 = ayer local). Devuelve los límites del día expresados en UTC.
 */
export function clinicDayRange(
  nowMs: number,
  offsetHours: number,
  dayOffset = 0,
): ClinicDayRange {
  const local = new Date(nowMs + offsetHours * HOUR_MS + dayOffset * DAY_MS);
  const year = local.getUTCFullYear();
  const month = local.getUTCMonth(); // 0-based
  const day = local.getUTCDate();

  // Medianoche local expresada en UTC: UTC = local - offset.
  const startUtcMs = Date.UTC(year, month, day, 0, 0, 0) - offsetHours * HOUR_MS;
  const endUtcMs = startUtcMs + DAY_MS;

  return {
    date: `${year}-${pad(month + 1)}-${pad(day)}`,
    label: `${day} ${MONTHS_ES[month]}`,
    fromIso: new Date(startUtcMs).toISOString(),
    toIso: new Date(endUtcMs).toISOString(),
  };
}
