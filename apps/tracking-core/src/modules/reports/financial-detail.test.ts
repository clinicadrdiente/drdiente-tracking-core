import { describe, expect, it } from "vitest";
import {
  buildFinancialSummary,
  buildTreatmentMargin,
  parseAccionesRealizadas,
  parsePagosDetalle,
} from "./financial-detail.js";

const pagoRow = (overrides: Record<string, unknown> = {}) => ({
  "Nombre Sucursal": "Drdiente S.A de C.V",
  "# Tratamiento": 9387,
  "# Pago": 5533,
  "Fecha de recepción del pago": "2026-03-01",
  "# Paciente": 2350,
  "Referencia Paciente": "GOOGLE",
  "Nombre categoría": "ENDODONCIA",
  "Nombre Prestación": "TRATAMIENTO DE CONDUCTO",
  "Pagado Prestación": 9890,
  "Total Pago": 9890,
  ...overrides,
});

describe("parsePagosDetalle", () => {
  it("resuelve columnas y clasifica el canal por la Referencia", () => {
    const records = parsePagosDetalle([
      pagoRow(),
      pagoRow({ "# Paciente": 2351, "Referencia Paciente": "CHAT GPT", "Pagado Prestación": 2550 }),
    ]);
    expect(records).toHaveLength(2);
    expect(records[0].channel).toBe("google");
    expect(records[0].amount).toBe(9890);
    expect(records[0].date).toBe("2026-03-01");
    expect(records[1].channel).toBe("ai_search");
  });

  it("limpia montos US '2,000.00' y fechas con hora", () => {
    const [r] = parsePagosDetalle([
      pagoRow({ "Pagado Prestación": "2,000.00", "Fecha de recepción del pago": "2026-05-10 10:37:44" }),
    ]);
    expect(r.amount).toBe(2000);
    expect(r.date).toBe("2026-05-10");
  });

  it("parsea montos en formato es-MX y negativos contables", () => {
    const rows = parsePagosDetalle([
      pagoRow({ "# Paciente": 1, "Pagado Prestación": "2.000,00" }),
      pagoRow({ "# Paciente": 2, "Pagado Prestación": "1.234,56" }),
      pagoRow({ "# Paciente": 3, "Pagado Prestación": "2,5" }),
      pagoRow({ "# Paciente": 4, "Pagado Prestación": "(500.00)" }),
      pagoRow({ "# Paciente": 5, "Pagado Prestación": "1,234" }),
    ]);
    expect(rows[0].amount).toBe(2000);
    expect(rows[1].amount).toBeCloseTo(1234.56, 2);
    expect(rows[2].amount).toBe(2.5);
    expect(rows[3].amount).toBe(-500); // contable () → negativo
    expect(rows[4].amount).toBe(1234); // 3 dígitos tras la coma → miles
  });

  it("convierte fechas seriales de Excel y objetos Date", () => {
    const [r1, r2] = parsePagosDetalle([
      pagoRow({ "# Paciente": 1, "Fecha de recepción del pago": 46082 }),
      pagoRow({ "# Paciente": 2, "Fecha de recepción del pago": new Date("2026-04-15T12:00:00Z") }),
    ]);
    expect(r1.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(r2.date).toBe("2026-04-15");
  });
});

describe("buildFinancialSummary", () => {
  const payments = parsePagosDetalle([
    pagoRow({ "# Paciente": 1, "Referencia Paciente": "GOOGLE", "Nombre categoría": "ESTETICA DENTAL", "Pagado Prestación": 100000, "Fecha de recepción del pago": "2026-03-15" }),
    pagoRow({ "# Paciente": 2, "Referencia Paciente": "TIKTOK", "Nombre categoría": "ORTODONCIA", "Pagado Prestación": 60000, "Fecha de recepción del pago": "2026-04-10" }),
    pagoRow({ "# Paciente": 3, "Referencia Paciente": "RECOMENDACION", "Nombre categoría": "ESTETICA DENTAL", "Pagado Prestación": 40000, "Fecha de recepción del pago": "2026-04-20" }),
    pagoRow({ "# Paciente": 4, "Referencia Paciente": "PASANDO POR CLINICA", "Nombre categoría": "LIMPIEZA", "Pagado Prestación": 5000, "Fecha de recepción del pago": "2026-05-01" }),
  ]);

  it("agrega revenue por canal y separa marketing de no-marketing", () => {
    const s = buildFinancialSummary(payments);
    expect(s.totals.revenue).toBe(205000);
    expect(s.marketing.revenue).toBe(160000); // google + tiktok
    expect(s.marketing.patients).toBe(2);
    expect(s.nonMarketing.revenue).toBe(45000); // recomendacion + walk_in
    const google = s.byChannel.find((c) => c.channel === "google");
    expect(google?.revenue).toBe(100000);
    expect(google?.isMarketing).toBe(true);
    const walk = s.byChannel.find((c) => c.channel === "walk_in");
    expect(walk?.isMarketing).toBe(false);
  });

  it("rankea tratamientos por revenue y arma el cruce canal × tratamiento", () => {
    const s = buildFinancialSummary(payments);
    expect(s.byTreatment[0].category).toBe("ESTETICA DENTAL");
    expect(s.byTreatment[0].revenue).toBe(140000);
    const googleCross = s.treatmentByChannel.find((c) => c.channel === "google");
    expect(googleCross?.top[0].category).toBe("ESTETICA DENTAL");
  });

  it("filtra por rango de fechas", () => {
    const s = buildFinancialSummary(payments, { from: "2026-04-01", to: "2026-04-30" });
    expect(s.totals.revenue).toBe(100000); // solo abril: tiktok 60k + recom 40k
    expect(s.totals.payingPatients).toBe(2);
  });

  it("normaliza límites de rango con hora/T y no rompe el borde inferior", () => {
    const s = buildFinancialSummary(payments, { from: "2026-04-01T00:00:00", to: "2026-04-30 23:59:59" });
    expect(s.totals.revenue).toBe(100000);
  });

  it("filas sin fecha cuentan en 'todo' pero NO en un rango acotado", () => {
    const withNull = parsePagosDetalle([
      pagoRow({ "# Paciente": 9, "Referencia Paciente": "GOOGLE", "Pagado Prestación": 7000, "Fecha de recepción del pago": null }),
    ]);
    expect(buildFinancialSummary(withNull).totals.revenue).toBe(7000);
    expect(buildFinancialSummary(withNull, { from: "2026-03-01", to: "2026-06-30" }).totals.revenue).toBe(0);
  });
});

describe("buildTreatmentMargin", () => {
  const accionRow = (o: Record<string, unknown> = {}) => ({
    "Nombre Categoria": "ESTETICA DENTAL",
    "# Paciente": 1,
    "Precio Prestación": 10000,
    "Pagado Paciente Prestación (Abonado)": 5000,
    "Costo para la clínica (laboratorios)": 0,
    "Total a pagar profesional": 3000,
    "Fecha de realización": "2026-03-10",
    ...o,
  });

  it("calcula margen = precio − lab − honorario y el %", () => {
    const actions = parseAccionesRealizadas([
      accionRow(),
      accionRow({ "# Paciente": 2, "Total a pagar profesional": 3000 }),
    ]);
    const rows = buildTreatmentMargin(actions);
    expect(rows[0].category).toBe("ESTETICA DENTAL");
    expect(rows[0].revenue).toBe(20000);
    expect(rows[0].directCost).toBe(6000);
    expect(rows[0].margin).toBe(14000);
    expect(rows[0].marginPct).toBe(70);
    expect(rows[0].patients).toBe(2);
  });
});
