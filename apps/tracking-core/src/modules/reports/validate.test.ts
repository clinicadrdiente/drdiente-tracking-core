import { describe, it, expect } from "vitest";
import { validateDailyReportInput } from "./validate.js";

const VALID_BODY = {
  branch: "centro",
  date: "2026-06-10",
  contacts: [{ channel: "llamada", count: 3 }],
  leadsReceived: 5,
  leadsContacted: 4,
  followUpsSent: 2,
  promoWhatsappSent: 1,
  emailsSent: 0,
  postsPublished: 0,
  notes: null,
};

describe("validateDailyReportInput", () => {
  it("accepts a valid input", () => {
    const result = validateDailyReportInput(VALID_BODY);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.input.branch).toBe("centro");
      expect(result.input.date).toBe("2026-06-10");
    }
  });

  it("rejects bad date format", () => {
    const result = validateDailyReportInput({ ...VALID_BODY, date: "10/06/2026" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/date/);
    }
  });

  it("rejects negative counter", () => {
    const result = validateDailyReportInput({ ...VALID_BODY, leadsReceived: -1 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/leadsReceived/);
    }
  });

  it("rejects unknown channel", () => {
    const result = validateDailyReportInput({
      ...VALID_BODY,
      contacts: [{ channel: "fax", count: 1 }],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/channel/);
    }
  });

  it("rejects empty branch", () => {
    const result = validateDailyReportInput({ ...VALID_BODY, branch: "  " });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/branch/);
    }
  });

  it("trims branch whitespace", () => {
    const result = validateDailyReportInput({ ...VALID_BODY, branch: "  Centro  " });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.input.branch).toBe("Centro");
    }
  });
});
