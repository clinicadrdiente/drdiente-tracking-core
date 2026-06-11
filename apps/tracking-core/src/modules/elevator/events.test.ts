import { describe, it, expect } from "vitest";
import { buildElevatorEventPayload } from "./events.js";
import type { ConversionEvent } from "../../types/domain.js";

function makeEvent(overrides: Partial<ConversionEvent> = {}): ConversionEvent {
  return {
    eventId: "payment_99",
    eventName: "Purchase",
    eventTime: 1749600000,
    actionSource: "physical_store",
    userData: {
      em: "test@example.com",
      ph: "+525500000000",
      fbc: "fb.1.123.456",
      gclid: "gclid_abc",
      ttclid: null,
    },
    customData: {
      value: 12000,
      currency: "MXN",
      cash_collected: 4000,
      campaign_id: "cam_123",
      utm_source: "facebook",
      utm_medium: "cpc",
      utm_campaign: "DS | Whatsapp",
      treatment_name: "Diseño de Sonrisa",
      branch: "Roma",
      tier: "alto_ticket",
      dentalink_payment_id: 99,
      dentalink_patient_id: 42,
    },
    ...overrides,
  };
}

describe("buildElevatorEventPayload", () => {
  it("includes event identity fields", () => {
    const payload = buildElevatorEventPayload(makeEvent());
    expect(payload.event_name).toBe("Purchase");
    expect(payload.event_id).toBe("payment_99");
    expect(payload.event_time_unix).toBe(1749600000);
    expect(typeof payload.event_time_iso).toBe("string");
  });

  it("flattens contact identity for GHL matching", () => {
    const payload = buildElevatorEventPayload(makeEvent());
    expect(payload.email).toBe("test@example.com");
    expect(payload.phone).toBe("+525500000000");
  });

  it("includes click IDs for attribution", () => {
    const payload = buildElevatorEventPayload(makeEvent());
    expect(payload.fbc).toBe("fb.1.123.456");
    expect(payload.gclid).toBe("gclid_abc");
    expect(payload.ttclid).toBeNull();
  });

  it("includes revenue fields", () => {
    const payload = buildElevatorEventPayload(makeEvent());
    expect(payload.value).toBe(12000);
    expect(payload.currency).toBe("MXN");
    expect(payload.cash_collected).toBe(4000);
  });

  it("includes utm attribution", () => {
    const payload = buildElevatorEventPayload(makeEvent());
    expect(payload.utm_source).toBe("facebook");
    expect(payload.utm_medium).toBe("cpc");
    expect(payload.utm_campaign).toBe("DS | Whatsapp");
  });

  it("includes clinic context", () => {
    const payload = buildElevatorEventPayload(makeEvent());
    expect(payload.treatment_name).toBe("Diseño de Sonrisa");
    expect(payload.branch).toBe("Roma");
    expect(payload.tier).toBe("alto_ticket");
    expect(payload.source_system).toBe("drdiente-tracking-core");
  });

  it("handles Refund events", () => {
    const payload = buildElevatorEventPayload(makeEvent({ eventName: "Refund" }));
    expect(payload.event_name).toBe("Refund");
  });

  it("nulls out missing optional fields", () => {
    const event = makeEvent();
    event.userData.gclid = null;
    event.customData.campaign_id = null;
    const payload = buildElevatorEventPayload(event);
    expect(payload.gclid).toBeNull();
    expect(payload.campaign_id).toBeNull();
  });
});
