import { describe, expect, it } from "vitest";
import { buildClientSnapshot } from "./client-snapshot.js";
import type { PagoDetalleRecord, AccionRecord } from "./financial-detail.js";

function pago(over: Partial<PagoDetalleRecord>): PagoDetalleRecord {
  return {
    paymentId: "p1",
    treatmentId: "t1",
    patientId: 1,
    category: "Ortodoncia",
    prestacion: "",
    reference: null,
    channel: "google",
    amount: 1000,
    date: "2026-03-15",
    branch: null,
    ...over,
  };
}

describe("buildClientSnapshot", () => {
  const pagos: PagoDetalleRecord[] = [
    pago({ paymentId: "p1", patientId: 1, channel: "google", amount: 10000, category: "Ortodoncia" }),
    pago({ paymentId: "p2", patientId: 2, channel: "google", amount: 5000, category: "Limpieza", date: "2026-03-20" }),
    pago({ paymentId: "p3", patientId: 3, channel: "referral_organic", amount: 8000, category: "Ortodoncia", date: "2026-03-10" }),
  ];
  const windsorDaily = [
    { date: "2026-03-01", source: "google_ads", spend: 5000, clicks: 100, impressions: 10000 },
  ];

  const snap = buildClientSnapshot({
    pagos,
    acciones: null,
    windsorDaily,
    cartera: null,
    pipeline: null,
    marginPct: 60,
    repurchase: 1.3,
    bounds: { min: "2026-03-01", max: "2026-03-31" },
    nowIso: "2026-06-18T00:00:00.000Z",
  });

  it("computes headline totals (facturado vs invertido, marketing split)", () => {
    expect(snap.totals.revenue).toBe(23000);
    expect(snap.totals.marketingRevenue).toBe(15000);
    expect(snap.totals.nonMarketingRevenue).toBe(8000);
    expect(snap.totals.spend).toBe(5000);
  });

  it("computes ROI/ROAS/AOV/CAC/LTV", () => {
    expect(snap.kpis.roas).toBe(3); // 15000 / 5000
    expect(snap.kpis.aov).toBe(7500); // 15000 / 2 paying marketing patients
    expect(snap.kpis.cac).toBe(2500); // 5000 / 2
    expect(snap.kpis.roiPct).toBeCloseTo(80, 5); // (15000*0.6 - 5000)/5000
    expect(snap.kpis.ltv).toBeCloseTo(5850, 5); // 7500 * 1.3 * 0.6
    expect(snap.kpis.payingPatients).toBe(2);
  });

  it("builds per-channel rows with spend×revenue metrics", () => {
    const google = snap.channels.find((c) => c.channel === "google");
    expect(google).toBeDefined();
    expect(google!.revenue).toBe(15000);
    expect(google!.spend).toBe(5000);
    expect(google!.roas).toBe(3);
    expect(google!.cac).toBe(2500);
    expect(google!.ctr).toBeCloseTo(0.01, 6); // 100 / 10000
    expect(google!.cpc).toBe(50); // 5000 / 100
    const organic = snap.channels.find((c) => c.channel === "referral_organic");
    expect(organic!.isMarketing).toBe(false);
    expect(organic!.spend).toBe(0);
  });

  it("includes a monthly breakdown and recommendations", () => {
    expect(snap.months).toHaveLength(1);
    expect(snap.months[0].ingreso).toBe(23000);
    expect(snap.recommendations.length).toBeGreaterThan(0);
    // ROAS 3x → scale opportunity; LTV/CAC 2.34 (<3) → media
    expect(snap.recommendations.some((r) => r.id.startsWith("roas-alto"))).toBe(true);
    expect(snap.recommendations.some((r) => r.id === "ltv-cac")).toBe(true);
  });

  it("carries treatment margin when acciones are provided", () => {
    const acciones: AccionRecord[] = [
      { category: "Ortodoncia", patientId: 1, price: 10000, paid: 10000, labCost: 1000, professionalCost: 2000, margin: 7000, date: "2026-03-15", branch: null },
    ];
    const withMargin = buildClientSnapshot({
      pagos,
      acciones,
      windsorDaily,
      cartera: null,
      pipeline: null,
      marginPct: 70,
      repurchase: 1.3,
      bounds: { min: "2026-03-01", max: "2026-03-31" },
      nowIso: "2026-06-18T00:00:00.000Z",
    });
    expect(withMargin.totals.margin).toBe(7000);
    const orto = withMargin.treatments.find((t) => t.category === "Ortodoncia");
    expect(orto?.marginPct).toBeCloseTo(70, 5); // (7000/10000)*100
  });

  it("emits no patient PII (only aggregate counts)", () => {
    const json = JSON.stringify(snap);
    expect(json).not.toMatch(/patientId/);
    expect(json).not.toMatch(/email|telefono|phone/i);
  });
});
