import { describe, expect, it } from "vitest";
import { buildRoasByChannel } from "./roas-by-channel.js";

describe("buildRoasByChannel", () => {
  it("calcula ROAS, CAC y participación por canal", () => {
    const report = buildRoasByChannel(
      [
        { patientId: 1, channel: "meta", revenue: 100_000 },
        { patientId: 2, channel: "meta", revenue: 0 },
        { patientId: 3, channel: "tiktok", revenue: 60_000 },
        { patientId: 4, channel: "referral_organic", revenue: 40_000 },
      ],
      [
        { channel: "meta", spend: 20_000, clicks: 500 },
        { channel: "tiktok", spend: 15_000 },
      ],
    );

    const meta = report.channels.find((c) => c.channel === "meta");
    expect(meta?.revenue).toBe(100_000);
    expect(meta?.patients).toBe(2);
    expect(meta?.payingPatients).toBe(1);
    expect(meta?.roas).toBeCloseTo(5, 5); // 100k / 20k
    expect(meta?.cac).toBeCloseTo(20_000, 5); // 20k / 1 que pagó
    expect(meta?.costPerPatient).toBeCloseTo(10_000, 5); // 20k / 2 captados

    const organic = report.channels.find(
      (c) => c.channel === "referral_organic",
    );
    expect(organic?.roas).toBeNull(); // sin inversión
    expect(organic?.cac).toBeNull();
  });

  it("ordena por inversión y luego por ingreso", () => {
    const report = buildRoasByChannel(
      [
        { patientId: 1, channel: "google", revenue: 10_000 },
        { patientId: 2, channel: "meta", revenue: 90_000 },
      ],
      [
        { channel: "google", spend: 50_000 },
        { channel: "meta", spend: 5_000 },
      ],
    );
    expect(report.channels[0].channel).toBe("google");
    expect(report.channels[1].channel).toBe("meta");
  });

  it("separa el ROAS pagado (sólo canales digitales con gasto)", () => {
    const report = buildRoasByChannel(
      [
        { patientId: 1, channel: "meta", revenue: 200_000 },
        { patientId: 2, channel: "referral_organic", revenue: 500_000 },
      ],
      [{ channel: "meta", spend: 20_000 }],
    );

    // Total mezcla orgánico; pagado sólo cuenta meta.
    expect(report.totals.revenue).toBe(700_000);
    expect(report.paid.spend).toBe(20_000);
    expect(report.paid.revenue).toBe(200_000);
    expect(report.paid.roas).toBeCloseTo(10, 5);
  });

  it("revenueShare suma ~100% entre canales con ingreso", () => {
    const report = buildRoasByChannel(
      [
        { patientId: 1, channel: "meta", revenue: 250_000 },
        { patientId: 2, channel: "google", revenue: 750_000 },
      ],
      [],
    );
    const totalShare = report.channels.reduce(
      (sum, c) => sum + c.revenueShare,
      0,
    );
    expect(totalShare).toBeCloseTo(100, 5);
    expect(report.totals.roas).toBeNull(); // sin inversión
  });

  it("sin datos devuelve totales en cero", () => {
    const report = buildRoasByChannel([], []);
    expect(report.channels).toHaveLength(0);
    expect(report.totals.revenue).toBe(0);
    expect(report.totals.roas).toBeNull();
    expect(report.paid.roas).toBeNull();
  });
});
