import { describe, expect, it } from "vitest";
import { parseAppointmentInput, parseLeadInput } from "./validation.js";

describe("parseLeadInput", () => {
  it("maps a nested attribution shape", () => {
    const result = parseLeadInput({
      firstName: "Ana",
      lastName: "Lopez",
      phone: "+52 55 1234 5678",
      email: "ana@example.com",
      branch: "Polanco",
      attribution: {
        utmSource: "facebook",
        utmMedium: "cpc",
        utmCampaign: "spring",
        campaignId: "camp-1",
        landingUrl: "https://example.com/landing",
        fbclid: "fb-1",
      },
    });

    expect(result).not.toBeNull();
    expect(result?.firstName).toBe("Ana");
    expect(result?.lastName).toBe("Lopez");
    expect(result?.phone).toBe("+52 55 1234 5678");
    expect(result?.email).toBe("ana@example.com");
    expect(result?.branch).toBe("Polanco");
    expect(result?.attribution.utmSource).toBe("facebook");
    expect(result?.attribution.utmMedium).toBe("cpc");
    expect(result?.attribution.utmCampaign).toBe("spring");
    expect(result?.attribution.campaignId).toBe("camp-1");
    expect(result?.attribution.landingUrl).toBe("https://example.com/landing");
    expect(result?.attribution.fbclid).toBe("fb-1");
  });

  it("maps a flat webhook shape", () => {
    const result = parseLeadInput({
      first_name: "Beto",
      phone: "5559999999",
      utm_source: "google",
      first_touch_source: "organic",
      landing_page_url: "https://example.com/promo",
    });

    expect(result).not.toBeNull();
    expect(result?.firstName).toBe("Beto");
    expect(result?.phone).toBe("5559999999");
    expect(result?.attribution.utmSource).toBe("google");
    expect(result?.attribution.firstTouchSource).toBe("organic");
    expect(result?.attribution.landingUrl).toBe("https://example.com/promo");
  });

  it("falls back to first_touch_source when utm_source is absent", () => {
    const result = parseLeadInput({
      first_name: "Cata",
      phone: "5551112222",
      first_touch_source: "referral",
    });

    expect(result).not.toBeNull();
    expect(result?.attribution.utmSource).toBe("referral");
  });

  it("returns null when phone is missing", () => {
    const result = parseLeadInput({
      firstName: "Dani",
    });

    expect(result).toBeNull();
  });

  it("returns null when phone is not a string", () => {
    const result = parseLeadInput({
      firstName: "Dani",
      phone: 5551234567,
    });

    expect(result).toBeNull();
  });

  it("returns null when firstName/first_name is missing", () => {
    const result = parseLeadInput({
      phone: "5551234567",
    });

    expect(result).toBeNull();
  });
});

describe("parseAppointmentInput", () => {
  it("returns the event for a valid payload", () => {
    const result = parseAppointmentInput({
      appointmentId: 1,
      patientId: 2,
      scheduledAt: "2026-06-17T10:00:00.000Z",
      branch: "Centro",
    });

    expect(result).not.toBeNull();
    expect(result?.appointmentId).toBe(1);
    expect(result?.patientId).toBe(2);
    expect(result?.scheduledAt).toBe("2026-06-17T10:00:00.000Z");
    expect(result?.branch).toBe("Centro");
  });

  it("returns null when appointmentId is a string", () => {
    const result = parseAppointmentInput({
      appointmentId: "1",
      patientId: 2,
      scheduledAt: "2026-06-17T10:00:00.000Z",
    });

    expect(result).toBeNull();
  });

  it("returns null when scheduledAt is missing", () => {
    const result = parseAppointmentInput({
      appointmentId: 1,
      patientId: 2,
    });

    expect(result).toBeNull();
  });
});
