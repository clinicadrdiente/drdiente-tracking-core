import { describe, expect, it } from "vitest";
import { validateDailyReport } from "./validate-daily.js";

describe("validateDailyReport", () => {
  it("requiere branch y date con formato YYYY-MM-DD", () => {
    expect(validateDailyReport({ date: "2026-06-23" }).ok).toBe(false);
    expect(validateDailyReport({ branch: "Roma", date: "23/06/2026" }).ok).toBe(false);
  });

  it("acepta reporte válido y clampa conteos negativos", () => {
    const result = validateDailyReport({
      branch: "Roma",
      date: "2026-06-23",
      account: "roma",
      leadsReceived: 6,
      leadsContacted: -3,
      contacts: [
        { channel: "llamada", count: 4 },
        { channel: "ruido", count: 9 },
      ],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.input.leadsReceived).toBe(6);
    expect(result.input.leadsContacted).toBe(0);
    expect(result.input.contacts).toEqual([{ channel: "llamada", count: 4 }]);
  });
});
