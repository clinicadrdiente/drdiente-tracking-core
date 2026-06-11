import { describe, expect, it } from "vitest";
import { buildPurchaseEvent } from "./build-purchase-event.js";
import type { CanonicalLead, PaymentEvent } from "../../types/domain.js";

const makeLead = (overrides: Partial<CanonicalLead> = {}): CanonicalLead => ({
  elevatorId: "lead-1",
  firstName: "Ana",
  phoneRaw: "+52 55 1234 5678",
  phoneNormalized: "525512345678",
  emailRaw: "ana@example.com",
  emailNormalized: "ana@example.com",
  branch: "cdmx",
  attribution: {
    fbclid: "fb_123",
    gclid: null,
    ttclid: null,
    utmSource: "facebook",
    utmMedium: "cpc",
    utmCampaign: "campaign_1",
    campaignId: "camp-001",
  },
  ...overrides,
});

const makePayment = (overrides: Partial<PaymentEvent> = {}): PaymentEvent => ({
  paymentId: 42,
  patientId: 7,
  treatmentId: 3,
  treatmentName: "Ortodoncia",
  paymentAmount: 1500,
  budgetTotal: 5000,
  currency: "MXN",
  isVoided: false,
  paidAt: "2026-06-10T10:00:00Z",
  ...overrides,
});

describe("buildPurchaseEvent", () => {
  it("returns a ConversionEvent with correct eventId", () => {
    const event = buildPurchaseEvent(makeLead(), makePayment(), "standard");
    expect(event.eventId).toBe("payment_42");
  });

  it("sets eventName to Compra for a normal payment", () => {
    const event = buildPurchaseEvent(makeLead(), makePayment({ isVoided: false }), "standard");
    expect(event.eventName).toBe("Compra");
  });

  it("sets eventName to Refund for a voided payment", () => {
    const event = buildPurchaseEvent(makeLead(), makePayment({ isVoided: true }), "standard");
    expect(event.eventName).toBe("Refund");
  });

  it("sets currency and value from payment", () => {
    const event = buildPurchaseEvent(makeLead(), makePayment({ currency: "MXN", budgetTotal: 5000 }), "standard");
    expect(event.customData.currency).toBe("MXN");
    expect(event.customData.value).toBe(5000);
  });

  it("passes tier through to customData", () => {
    const eventStandard = buildPurchaseEvent(makeLead(), makePayment(), "standard");
    expect(eventStandard.customData.tier).toBe("standard");

    const eventAlto = buildPurchaseEvent(makeLead(), makePayment(), "alto_ticket");
    expect(eventAlto.customData.tier).toBe("alto_ticket");
  });

  it("sets actionSource to physical_store", () => {
    const event = buildPurchaseEvent(makeLead(), makePayment(), "standard");
    expect(event.actionSource).toBe("physical_store");
  });

  it("populates userData from lead", () => {
    const lead = makeLead({ emailNormalized: "ana@example.com", phoneNormalized: "525512345678" });
    const event = buildPurchaseEvent(lead, makePayment(), "standard");
    expect(event.userData.em).toBe("ana@example.com");
    expect(event.userData.ph).toBe("525512345678");
  });

  it("sets eventTime as unix timestamp from paidAt", () => {
    const event = buildPurchaseEvent(makeLead(), makePayment({ paidAt: "2026-06-10T10:00:00Z" }), "standard");
    expect(event.eventTime).toBe(Math.floor(new Date("2026-06-10T10:00:00Z").getTime() / 1000));
  });
});
