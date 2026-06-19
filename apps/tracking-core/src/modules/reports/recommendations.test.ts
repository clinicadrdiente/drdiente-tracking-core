import { describe, expect, it } from "vitest";
import {
  buildRecommendations,
  type RecommendationsInput,
} from "./recommendations.js";

function baseInput(overrides: Partial<RecommendationsInput> = {}): RecommendationsInput {
  return {
    channels: [],
    kpis: { roas: null, ltv: 0, cac: null, ltvCac: null },
    cartera: null,
    pipeline: null,
    topTreatmentMargin: null,
    ...overrides,
  };
}

describe("buildRecommendations", () => {
  it("flags an unprofitable marketing channel as high severity", () => {
    const recs = buildRecommendations(
      baseInput({
        channels: [
          { label: "Meta (IG/FB)", isMarketing: true, spend: 10000, revenue: 4000, roas: 0.4, payingPatients: 2 },
        ],
      }),
    );
    expect(recs).toHaveLength(1);
    expect(recs[0].severity).toBe("alta");
    expect(recs[0].id).toContain("roas-bajo");
  });

  it("suggests scaling a high-ROAS channel", () => {
    const recs = buildRecommendations(
      baseInput({
        channels: [
          { label: "Google (Ads + búsqueda)", isMarketing: true, spend: 5000, revenue: 25000, roas: 5, payingPatients: 8 },
        ],
      }),
    );
    expect(recs.some((r) => r.id.startsWith("roas-alto") && r.severity === "oportunidad")).toBe(true);
  });

  it("ignores non-marketing channels and zero-spend channels", () => {
    const recs = buildRecommendations(
      baseInput({
        channels: [
          { label: "Recomendación", isMarketing: false, spend: 0, revenue: 50000, roas: null, payingPatients: 20 },
          { label: "TikTok", isMarketing: true, spend: 0, revenue: 0, roas: null, payingPatients: 0 },
        ],
      }),
    );
    expect(recs).toHaveLength(0);
  });

  it("flags an unhealthy LTV/CAC ratio", () => {
    const recs = buildRecommendations(
      baseInput({ kpis: { roas: 2, ltv: 3000, cac: 1500, ltvCac: 2 } }),
    );
    expect(recs.some((r) => r.id === "ltv-cac" && r.severity === "media")).toBe(true);
  });

  it("surfaces cartera sin cita as an opportunity", () => {
    const recs = buildRecommendations(baseInput({ cartera: { saldoSinCita: 120000 } }));
    expect(recs.some((r) => r.id === "cartera-sin-cita")).toBe(true);
  });

  it("flags a low pipeline start rate", () => {
    const recs = buildRecommendations(
      baseInput({ pipeline: { montoPresupuestado: 200000, tasaInicio: 30 } }),
    );
    expect(recs.some((r) => r.id === "pipeline-cierre" && r.severity === "media")).toBe(true);
  });

  it("does not flag a healthy pipeline start rate", () => {
    const recs = buildRecommendations(
      baseInput({ pipeline: { montoPresupuestado: 200000, tasaInicio: 80 } }),
    );
    expect(recs.some((r) => r.id === "pipeline-cierre")).toBe(false);
  });

  it("recommends pushing the best-margin treatment", () => {
    const recs = buildRecommendations(
      baseInput({ topTreatmentMargin: { category: "Ortodoncia", marginPct: 72 } }),
    );
    expect(recs.some((r) => r.id === "tratamiento-margen")).toBe(true);
  });

  it("sorts high severity before media before oportunidad", () => {
    const recs = buildRecommendations(
      baseInput({
        channels: [
          { label: "Meta (IG/FB)", isMarketing: true, spend: 10000, revenue: 4000, roas: 0.4, payingPatients: 2 },
        ],
        kpis: { roas: 1, ltv: 3000, cac: 2000, ltvCac: 1.5 },
        cartera: { saldoSinCita: 50000 },
      }),
    );
    const severities = recs.map((r) => r.severity);
    expect(severities).toEqual([...severities].sort((a, b) =>
      ({ alta: 0, media: 1, oportunidad: 2 })[a] - ({ alta: 0, media: 1, oportunidad: 2 })[b],
    ));
    expect(severities[0]).toBe("alta");
  });
});
