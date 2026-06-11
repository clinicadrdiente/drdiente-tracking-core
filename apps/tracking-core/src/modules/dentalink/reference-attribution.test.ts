import { describe, expect, it } from "vitest";
import {
  buildMarketingAttribution,
  classifyReference,
} from "./reference-attribution.js";

describe("classifyReference", () => {
  it("classifies plain digital sources as marketing", () => {
    expect(classifyReference("GOOGLE").channel).toBe("marketing");
    expect(classifyReference("GOOGLE MAPS").channel).toBe("marketing");
    expect(classifyReference("GOOGLE INSTAGRAM").channel).toBe("marketing");
    expect(classifyReference("FACEBOOK").channel).toBe("marketing");
    expect(classifyReference("face").channel).toBe("marketing");
    expect(classifyReference("Tik Tok").channel).toBe("marketing");
    expect(classifyReference("TIKTOK").channel).toBe("marketing");
    expect(classifyReference("internet").channel).toBe("marketing");
    expect(classifyReference("Pagina web").channel).toBe("marketing");
    expect(classifyReference("DOCTORALIA").channel).toBe("marketing");
  });

  it("handles separators and noise from real clinic data", () => {
    expect(classifyReference("GOOGLE//16-07-1968").channel).toBe("marketing");
    expect(classifyReference("GOOGLE//").channel).toBe("marketing");
    expect(classifyReference("HUBSPOT/GOOGLE").channel).toBe("marketing");
    expect(classifyReference("GOOGLE, PASO").channel).toBe("marketing");
    expect(classifyReference("GOOGLE REVEWS Y PASANDO SU HIJA").channel).toBe(
      "marketing",
    );
  });

  it("gives marketing precedence over organic on mixed strings", () => {
    expect(classifyReference("GOOGLE/RECOMENDACIÓN").channel).toBe("marketing");
    expect(classifyReference("RECOMENDACION Y FACEBOOK").channel).toBe(
      "marketing",
    );
  });

  it("classifies word-of-mouth and walk-ins as organico", () => {
    expect(classifyReference("RECOMENDACIÓN").channel).toBe("organico");
    expect(classifyReference("recomendado por paciente").channel).toBe(
      "organico",
    );
    expect(classifyReference("AMIGA").channel).toBe("organico");
    expect(classifyReference("FAMILIAR").channel).toBe("organico");
    expect(classifyReference("PASO POR AQUI").channel).toBe("organico");
    expect(classifyReference("CONVENIO EMPRESA").channel).toBe("organico");
    expect(classifyReference("Dra. Martinez").channel).toBe("organico");
  });

  it("does not confuse FACHADA with FACE", () => {
    expect(classifyReference("FACHADA").channel).toBe("organico");
  });

  it("returns desconocido for empty or unrecognized values", () => {
    expect(classifyReference(null).channel).toBe("desconocido");
    expect(classifyReference("").channel).toBe("desconocido");
    expect(classifyReference("   ").channel).toBe("desconocido");
    expect(classifyReference("Referencia #12").channel).toBe("desconocido");
    expect(classifyReference("xyz123").channel).toBe("desconocido");
  });

  it("reports the matched keyword", () => {
    expect(classifyReference("GOOGLE/RECOMENDACIÓN").matchedKeyword).toBe(
      "GOOGLE",
    );
    expect(classifyReference("AMIGA").matchedKeyword).toBe("AMIGA");
    expect(classifyReference(null).matchedKeyword).toBeNull();
  });
});

describe("buildMarketingAttribution", () => {
  const payments = [
    { patientId: 1, patientReference: "GOOGLE", amount: 1000 },
    { patientId: 1, patientReference: "GOOGLE", amount: 500 },
    { patientId: 2, patientReference: "GOOGLE MAPS", amount: 2000 },
    { patientId: 3, patientReference: "RECOMENDACIÓN", amount: 3000 },
    { patientId: 4, patientReference: null, amount: 1500 },
    { patientId: 5, patientReference: "GOOGLE/RECOMENDACIÓN", amount: 2000 },
  ];

  it("aggregates revenue, payments and unique patients per channel", () => {
    const summary = buildMarketingAttribution(payments);
    expect(summary.marketing.revenue).toBe(5500);
    expect(summary.marketing.payments).toBe(4);
    expect(summary.marketing.patients).toBe(3);
    expect(summary.organico.revenue).toBe(3000);
    expect(summary.organico.patients).toBe(1);
    expect(summary.desconocido.revenue).toBe(1500);
    expect(summary.desconocido.patients).toBe(1);
  });

  it("computes revenue share per channel", () => {
    const summary = buildMarketingAttribution(payments);
    expect(summary.marketing.share).toBeCloseTo(55, 5);
    expect(summary.organico.share).toBeCloseTo(30, 5);
    expect(summary.desconocido.share).toBeCloseTo(15, 5);
  });

  it("lists top marketing references by revenue", () => {
    const summary = buildMarketingAttribution(payments);
    expect(summary.topMarketingReferences[0]).toEqual({
      reference: "GOOGLE MAPS",
      patients: 1,
      payments: 1,
      revenue: 2000,
    });
    const refs = summary.topMarketingReferences.map((r) => r.reference);
    expect(refs).toContain("GOOGLE");
    expect(refs).toContain("GOOGLE/RECOMENDACIÓN");
  });

  it("returns zeroed buckets for empty input", () => {
    const summary = buildMarketingAttribution([]);
    expect(summary.marketing).toEqual({
      patients: 0,
      payments: 0,
      revenue: 0,
      share: 0,
    });
    expect(summary.topMarketingReferences).toEqual([]);
  });
});
