import { describe, expect, it } from "vitest";
import { clinicDayRange } from "./dates";

describe("clinicDayRange", () => {
  it("resuelve el día local de la clínica (offset -6) para un instante UTC", () => {
    // 2026-06-24 05:00 UTC = 2026-06-23 23:00 en CDMX/Costa Rica (-6).
    const now = Date.parse("2026-06-24T05:00:00.000Z");
    const range = clinicDayRange(now, -6);

    expect(range.date).toBe("2026-06-23");
    expect(range.label).toBe("23 jun");
    expect(range.fromIso).toBe("2026-06-23T06:00:00.000Z");
    expect(range.toIso).toBe("2026-06-24T06:00:00.000Z");
  });

  it("aplica dayOffset para días anteriores", () => {
    const now = Date.parse("2026-06-24T05:00:00.000Z");
    const yesterday = clinicDayRange(now, -6, -1);
    expect(yesterday.date).toBe("2026-06-22");
  });
});
