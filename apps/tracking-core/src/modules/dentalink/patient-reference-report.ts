// Ingesta del reporte "Pacientes nuevos" de Dentalink.
//
// El campo "Referencia" (origen del paciente) NO está disponible en la API REST
// de Dentalink — sólo en este reporte exportable. Este módulo convierte las filas
// del reporte (ya parseadas a objetos por el llamador, p. ej. desde XLSX/CSV) en
// un lookup `id de paciente → referencia → canal` que el dashboard cruza contra
// los pagos para construir la atribución y el ROAS por canal.
//
// El parser es puro: no lee archivos ni depende de librerías de Excel. El
// llamador entrega `Array<Record<string, unknown>>` con las claves = encabezados
// del reporte. Las columnas se resuelven por nombre de encabezado de forma
// tolerante (acentos, mayúsculas y variaciones menores), porque Dentalink puede
// cambiar ligeramente los títulos entre exportaciones.

import {
  referenceToChannel,
  type MarketingChannel,
} from "../reports/marketing-channels.js";

export interface PatientReferenceRecord {
  patientId: number;
  reference: string | null;
  channel: MarketingChannel;
  affiliationDate: string | null;
  fullName: string | null;
  phone: string | null;
  email: string | null;
}

export interface PatientReferenceReport {
  records: PatientReferenceRecord[];
  /** Lookup por id de paciente; útil para enriquecer pagos. */
  byPatientId: Map<number, PatientReferenceRecord>;
  totalRows: number;
  withReference: number;
  /** Cobertura del campo Referencia en [0, 1]. */
  coverage: number;
  /** Encabezados que no se pudieron mapear (diagnóstico). */
  unresolvedColumns: string[];
}

export interface ColumnMap {
  patientId: string;
  reference?: string;
  affiliationDate?: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  email?: string;
}

type ReportRow = Record<string, unknown>;

function normalizeHeader(header: string): string {
  return header
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

/**
 * Resuelve las columnas lógicas a partir de los encabezados reales del reporte.
 * Devuelve null para `patientId` si no se encuentra la columna obligatoria.
 */
export function resolveReportColumns(headers: string[]): {
  columns: ColumnMap | null;
  unresolved: string[];
} {
  const byNormalized = new Map<string, string>();
  for (const header of headers) {
    byNormalized.set(normalizeHeader(header), header);
  }

  const find = (
    predicate: (normalized: string) => boolean,
  ): string | undefined => {
    for (const [normalized, original] of byNormalized) {
      if (predicate(normalized)) {
        return original;
      }
    }
    return undefined;
  };

  // "# Paciente" normaliza a exactamente "PACIENTE" (el # se descarta);
  // "Nombre Paciente"/"Apellidos Paciente" tienen tokens extra, así que el
  // identificador es el encabezado que queda como "PACIENTE" solo, o el que
  // mencione número/ficha de paciente.
  const patientId =
    find((n) => n === "PACIENTE") ??
    find((n) => n === "N PACIENTE" || n === "NO PACIENTE") ??
    find(
      (n) =>
        (n.includes("NUMERO") || n.includes("FICHA") || n.includes("ID")) &&
        n.includes("PACIENTE"),
    );

  const reference = find((n) => n.includes("REFERENCIA"));
  const affiliationDate = find(
    (n) => n.includes("FECHA") && n.includes("AFILIACION"),
  );
  const firstName = find((n) => n.includes("NOMBRE") && n.includes("PACIENTE"));
  const lastName = find((n) => n.includes("APELLIDO"));
  const phone =
    find((n) => n.includes("CELULAR")) ??
    find((n) => n.includes("MOVIL")) ??
    find((n) => n.includes("TELEFONO"));
  const email = find((n) => n.includes("MAIL") || n.includes("CORREO"));

  const unresolved: string[] = [];
  if (!reference) unresolved.push("Referencia Paciente");
  if (!affiliationDate) unresolved.push("Fecha de afiliación");

  if (!patientId) {
    return { columns: null, unresolved: ["# Paciente", ...unresolved] };
  }

  return {
    columns: {
      patientId,
      reference,
      affiliationDate,
      firstName,
      lastName,
      phone,
      email,
    },
    unresolved,
  };
}

function readString(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed === "" ? null : trimmed;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return null;
}

function readPatientId(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value);
  }
  if (typeof value === "string") {
    const digits = value.replace(/[^0-9]/g, "");
    if (digits !== "") {
      return Number.parseInt(digits, 10);
    }
  }
  return 0;
}

function joinName(
  first: string | null,
  last: string | null,
): string | null {
  return [first, last].filter(Boolean).join(" ") || null;
}

/**
 * Parsea las filas del reporte de pacientes nuevos. `columns` es opcional: si no
 * se provee, se resuelve a partir de los encabezados de la primera fila.
 *
 * Filas sin id de paciente válido se descartan. Si el mismo paciente aparece más
 * de una vez gana la última fila con Referencia no vacía (o la última, si todas
 * vacías), de modo que una corrección posterior de recepción prevalece.
 */
export function parsePatientReferenceReport(
  rows: ReportRow[],
  columns?: ColumnMap,
): PatientReferenceReport {
  const headers = rows.length > 0 ? Object.keys(rows[0] as object) : [];
  const resolved = columns
    ? { columns, unresolved: [] as string[] }
    : resolveReportColumns(headers);

  if (!resolved.columns) {
    return {
      records: [],
      byPatientId: new Map(),
      totalRows: rows.length,
      withReference: 0,
      coverage: 0,
      unresolvedColumns: resolved.unresolved,
    };
  }

  const cols = resolved.columns;
  const byPatientId = new Map<number, PatientReferenceRecord>();

  for (const row of rows) {
    const patientId = readPatientId(row[cols.patientId]);
    if (patientId <= 0) {
      continue;
    }

    const reference = cols.reference ? readString(row[cols.reference]) : null;
    const record: PatientReferenceRecord = {
      patientId,
      reference,
      channel: referenceToChannel(reference),
      affiliationDate: cols.affiliationDate
        ? readString(row[cols.affiliationDate])
        : null,
      fullName: joinName(
        cols.firstName ? readString(row[cols.firstName]) : null,
        cols.lastName ? readString(row[cols.lastName]) : null,
      ),
      phone: cols.phone ? readString(row[cols.phone]) : null,
      email: cols.email ? readString(row[cols.email]) : null,
    };

    const existing = byPatientId.get(patientId);
    // No pisar una Referencia ya capturada con una fila duplicada vacía.
    if (existing && !record.reference && existing.reference) {
      continue;
    }
    byPatientId.set(patientId, record);
  }

  const records = [...byPatientId.values()];
  const withReference = records.filter((record) => record.reference).length;

  return {
    records,
    byPatientId,
    totalRows: rows.length,
    withReference,
    coverage: records.length > 0 ? withReference / records.length : 0,
    unresolvedColumns: resolved.unresolved,
  };
}
