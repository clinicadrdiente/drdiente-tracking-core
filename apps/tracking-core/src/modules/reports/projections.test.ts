import { describe, expect, it } from "vitest";
import { computeKpis, project } from "./projections.js";

describe("computeKpis", () => {
  it("calcula ROAS, ROI con margen, CAC, LTV, LTV/CAC y payback", () => {
    const k = computeKpis({
      marketingRevenue: 600_000,
      spend: 100_000,
      payingPatients: 50,
      avgTicket: 12_000,
      marginPct: 60,
      repurchase: 1.5,
    });
    expect(k.roas).toBeCloseTo(6, 5);
    // ROI margen = (600k*0.6 - 100k)/100k = 2.6 → 260%
    expect(k.roiPct).toBeCloseTo(260, 5);
    expect(k.cac).toBeCloseTo(2000, 5);
    // LTV = 12000 * 1.5 * 0.6 = 10800
    expect(k.ltv).toBeCloseTo(10_800, 5);
    expect(k.ltvCac).toBeCloseTo(5.4, 5);
    // payback = CAC / (ticket*margen) = 2000 / 7200
    expect(k.paybackPayments).toBeCloseTo(2000 / 7200, 5);
  });

  it("sin inversión deja ROAS/CAC/ROI en null", () => {
    const k = computeKpis({ marketingRevenue: 100, spend: 0, payingPatients: 0, avgTicket: 1000, marginPct: 50, repurchase: 1 });
    expect(k.roas).toBeNull();
    expect(k.cac).toBeNull();
    expect(k.roiPct).toBeNull();
  });
});

describe("project", () => {
  const base = {
    marketingRevenue: 600_000,
    spend: 100_000,
    payingPatients: 50,
    avgTicket: 12_000,
    marginPct: 60,
  };

  it("run-rate normaliza por días transcurridos", () => {
    const r = project({ ...base, mode: "runrate", periodDays: 30, elapsedDays: 15 });
    expect(r.projectedRevenue).toBeCloseTo(1_200_000, 5); // ×2
    expect(r.projectedSpend).toBeCloseTo(200_000, 5);
    expect(r.projectedPatients).toBeCloseTo(100, 5);
  });

  it("escalar gasto aplica rendimientos decrecientes", () => {
    const r = project({ ...base, mode: "scale", scalePct: 50, decayPer50: 0.15 });
    expect(r.projectedSpend).toBeCloseTo(150_000, 5);
    // eficiencia = 1 - 0.15*(50/50) = 0.85; revenue = 150k*6*0.85 = 765k
    expect(r.projectedRevenue).toBeCloseTo(765_000, 5);
    expect(r.low).toBeLessThan(r.projectedRevenue);
    expect(r.high).toBeGreaterThan(r.projectedRevenue);
  });

  it("meta de ingreso calcula presupuesto necesario", () => {
    const r = project({ ...base, mode: "goal", goalRevenue: 1_200_000 });
    expect(r.projectedRevenue).toBe(1_200_000);
    expect(r.projectedSpend).toBeCloseTo(200_000, 5); // 1.2M / 6
    expect(r.projectedPatients).toBeCloseTo(100, 5); // 1.2M / 12k
    expect(r.low).toBeLessThanOrEqual(r.high);
  });

  it("recortar gasto NO produce eficiencia >1 ni gasto negativo", () => {
    const r = project({ ...base, mode: "scale", scalePct: -200 });
    expect(r.projectedSpend).toBe(0); // clamp a -100% máximo
    expect(r.projectedRevenue).toBeGreaterThanOrEqual(0);
    expect(r.low).toBeLessThanOrEqual(r.high);
  });

  it("meta sin ROAS base no afirma '$0 de inversión'", () => {
    const r = project({ ...base, mode: "goal", spend: 0, marketingRevenue: 0, goalRevenue: 500_000 });
    expect(Number.isFinite(r.projectedSpend)).toBe(false); // indefinido, no 0
    expect(r.projectedRoas).toBeNull();
    expect(r.assumptions).toMatch(/ROAS base/i);
  });

  it("run-rate nunca proyecta menos que lo ya acumulado", () => {
    const r = project({ ...base, mode: "runrate", periodDays: 30, elapsedDays: 45 });
    expect(r.projectedRevenue).toBeGreaterThanOrEqual(base.marketingRevenue);
  });
});
