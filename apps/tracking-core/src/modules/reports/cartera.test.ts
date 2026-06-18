import { describe, expect, it } from "vitest";
import {
  buildCartera,
  buildPipeline,
  parsePresupuestos,
  parseSaldos,
} from "./cartera.js";

describe("parseSaldos + buildCartera", () => {
  const rows = [
    { "# Paciente": 1, "# Tratamiento": 10, "Total Tratamiento": 50000, "Total Realizado": 0, "Total Abonado": 0, "Saldo Global": 50000, "Próxima Cita": "No agendada" },
    { "# Paciente": 1, "# Tratamiento": 11, "Total Tratamiento": 20000, "Total Realizado": 20000, "Total Abonado": 20000, "Saldo Global": 0, "Próxima Cita": "No agendada" },
    { "# Paciente": 2, "# Tratamiento": 12, "Total Tratamiento": 30000, "Total Realizado": 10000, "Total Abonado": 5000, "Saldo Global": 25000, "Próxima Cita": "2026-06-25 10:00" },
  ];

  it("suma presupuesto, abonado y saldo pendiente", () => {
    const c = buildCartera(parseSaldos(rows));
    expect(c.totalPresupuestado).toBe(100000);
    expect(c.totalAbonado).toBe(25000);
    expect(c.saldoPendiente).toBe(75000);
    expect(c.cobradoPct).toBe(25);
    expect(c.planes).toBe(3);
    expect(c.planesConSaldo).toBe(2);
    expect(c.pacientesConSaldo).toBe(2);
  });

  it("separa saldo con cita agendada vs sin cita", () => {
    const c = buildCartera(parseSaldos(rows));
    expect(c.saldoConCitaAgendada).toBe(25000); // el plan con fecha de cita
    expect(c.saldoSinCita).toBe(50000);
  });
});

describe("parsePresupuestos + buildPipeline", () => {
  const rows = [
    { "Nombre Sucursal": "DrDiente", "# Tratamiento": 1, "# Paciente": 1, "Referencia Paciente": "GOOGLE", "Fecha de captura del tratamiento": "2026-06-01", "Total Presupuesto": "10,000.00", "Total Pagos": "4,000.00", "Tratamiento Iniciado": "Iniciado" },
    { "Nombre Sucursal": "DrDiente", "# Tratamiento": 2, "# Paciente": 2, "Referencia Paciente": "INSTAGRAM", "Fecha de captura del tratamiento": "2026-06-10", "Total Presupuesto": "20,000.00", "Total Pagos": "0.00", "Tratamiento Iniciado": "No iniciado" },
    { "Nombre Sucursal": "DrDiente", "# Tratamiento": 3, "# Paciente": 3, "Referencia Paciente": "RECOMENDACION", "Fecha de captura del tratamiento": "2026-05-15", "Total Presupuesto": "5,000.00", "Total Pagos": "5,000.00", "Tratamiento Iniciado": "Iniciado" },
  ];

  it("agrega monto presupuestado, tasa de inicio y de cobro", () => {
    const p = buildPipeline(parsePresupuestos(rows));
    expect(p.count).toBe(3);
    expect(p.montoPresupuestado).toBe(35000);
    expect(p.montoPagado).toBe(9000);
    expect(p.iniciados).toBe(2);
    expect(p.tasaInicio).toBeCloseTo((2 / 3) * 100, 5);
    expect(p.tasaCobro).toBeCloseTo((9000 / 35000) * 100, 5);
  });

  it("filtra por fecha de captura y agrupa por canal", () => {
    const p = buildPipeline(parsePresupuestos(rows), { from: "2026-06-01", to: "2026-06-30" });
    expect(p.count).toBe(2); // excluye el de mayo
    const google = p.byChannel.find((c) => c.channel === "google");
    expect(google?.montoPresupuestado).toBe(10000);
    expect(google?.isMarketing).toBe(true);
  });

  it("distingue 'Iniciado' de 'No iniciado'", () => {
    const recs = parsePresupuestos(rows);
    expect(recs[0].iniciado).toBe(true);
    expect(recs[1].iniciado).toBe(false);
  });
});
