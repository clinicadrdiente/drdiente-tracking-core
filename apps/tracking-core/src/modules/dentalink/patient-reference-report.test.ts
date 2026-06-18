import { describe, expect, it } from "vitest";
import {
  parsePatientReferenceReport,
  resolveReportColumns,
} from "./patient-reference-report.js";

// Encabezados reales del reporte "Pacientes nuevos" de Dentalink.
const HEADERS = [
  "Fecha de afiliación",
  "Mes de afiliación",
  "Año de afiliación",
  "# Paciente",
  "Nombre Paciente",
  "Apellidos Paciente",
  "Teléfono",
  "Celular",
  "E-Mail",
  "Referencia Paciente",
  "Observaciones",
];

const makeRow = (overrides: Record<string, unknown> = {}) => ({
  "Fecha de afiliación": "2026-03-01",
  "# Paciente": 2351,
  "Nombre Paciente": "REGINA SOFIA",
  "Apellidos Paciente": "MARTIN DEL CAMPO",
  Celular: "525561115685",
  "E-Mail": "regina@example.com",
  "Referencia Paciente": "GOOGLE",
  ...overrides,
});

describe("resolveReportColumns", () => {
  it("distingue '# Paciente' de 'Nombre Paciente' y 'Apellidos Paciente'", () => {
    const { columns } = resolveReportColumns(HEADERS);
    expect(columns?.patientId).toBe("# Paciente");
    expect(columns?.firstName).toBe("Nombre Paciente");
    expect(columns?.lastName).toBe("Apellidos Paciente");
    expect(columns?.reference).toBe("Referencia Paciente");
    expect(columns?.affiliationDate).toBe("Fecha de afiliación");
    expect(columns?.phone).toBe("Celular");
    expect(columns?.email).toBe("E-Mail");
  });

  it("falla limpio cuando no hay columna de id de paciente", () => {
    const { columns, unresolved } = resolveReportColumns([
      "Nombre Paciente",
      "Referencia Paciente",
    ]);
    expect(columns).toBeNull();
    expect(unresolved).toContain("# Paciente");
  });
});

describe("parsePatientReferenceReport", () => {
  it("construye el lookup id → referencia → canal", () => {
    const report = parsePatientReferenceReport([
      makeRow({ "# Paciente": 1, "Referencia Paciente": "GOOGLE" }),
      makeRow({ "# Paciente": 2, "Referencia Paciente": "Recomendación" }),
      makeRow({ "# Paciente": 3, "Referencia Paciente": "TIK TOK" }),
    ]);

    expect(report.records).toHaveLength(3);
    expect(report.byPatientId.get(1)?.channel).toBe("google");
    expect(report.byPatientId.get(2)?.channel).toBe("referral_organic");
    expect(report.byPatientId.get(3)?.channel).toBe("tiktok");
    expect(report.coverage).toBe(1);
  });

  it("limpia el '# Paciente' aunque venga como texto con símbolos", () => {
    const report = parsePatientReferenceReport([
      makeRow({ "# Paciente": "#2716", "Referencia Paciente": "INSTAGRAM" }),
    ]);
    const record = report.byPatientId.get(2716);
    expect(record?.patientId).toBe(2716);
    expect(record?.channel).toBe("meta");
    expect(record?.fullName).toBe("REGINA SOFIA MARTIN DEL CAMPO");
  });

  it("calcula cobertura con referencias vacías", () => {
    const report = parsePatientReferenceReport([
      makeRow({ "# Paciente": 1, "Referencia Paciente": "GOOGLE" }),
      makeRow({ "# Paciente": 2, "Referencia Paciente": "" }),
      makeRow({ "# Paciente": 3, "Referencia Paciente": null }),
    ]);
    expect(report.records).toHaveLength(3);
    expect(report.withReference).toBe(1);
    expect(report.coverage).toBeCloseTo(1 / 3, 5);
    expect(report.byPatientId.get(2)?.channel).toBe("unknown");
  });

  it("descarta filas sin id de paciente válido", () => {
    const report = parsePatientReferenceReport([
      makeRow({ "# Paciente": 0 }),
      makeRow({ "# Paciente": "" }),
      makeRow({ "# Paciente": 5 }),
    ]);
    expect(report.records).toHaveLength(1);
    expect(report.byPatientId.has(5)).toBe(true);
  });

  it("una fila duplicada vacía no pisa la Referencia ya capturada", () => {
    const report = parsePatientReferenceReport([
      makeRow({ "# Paciente": 7, "Referencia Paciente": "TIKTOK" }),
      makeRow({ "# Paciente": 7, "Referencia Paciente": "" }),
    ]);
    expect(report.byPatientId.get(7)?.reference).toBe("TIKTOK");
    expect(report.byPatientId.get(7)?.channel).toBe("tiktok");
  });
});
