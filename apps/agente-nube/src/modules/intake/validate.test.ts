import { describe, expect, it } from "vitest";
import { validateAppointment, validateLeadHandoff } from "./validate";

describe("validateLeadHandoff", () => {
  it("rechaza body sin account válido", () => {
    const result = validateLeadHandoff({ firstName: "Juan", phone: "555" });
    expect(result.ok).toBe(false);
  });

  it("rechaza sin firstName o phone", () => {
    expect(validateLeadHandoff({ account: "roma", phone: "555" }).ok).toBe(false);
    expect(validateLeadHandoff({ account: "roma", firstName: "Juan" }).ok).toBe(false);
  });

  it("acepta payload mínimo y deriva eventId", () => {
    const result = validateLeadHandoff({
      account: "ROMA",
      firstName: "Juan",
      phone: "+52 55 1234 5678",
      occurredAt: "2026-06-23T18:00:00.000Z",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.input.account).toBe("roma");
    expect(result.input.eventId).toContain("lead_roma_");
    expect(result.input.occurredAt).toBe("2026-06-23T18:00:00.000Z");
  });

  it("mapea campos en snake_case y respeta eventId explícito", () => {
    const result = validateLeadHandoff({
      event_id: "lead_ELV_1",
      account: "general",
      first_name: "Ana",
      last_name: "López",
      phone: "555",
      initial_message: "Quiero informes",
      utm_source: "facebook",
      location: "Roma Norte",
      distributed_to: ["meta", "google"],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.input.eventId).toBe("lead_ELV_1");
    expect(result.input.initialMessage).toBe("Quiero informes");
    expect(result.input.utmSource).toBe("facebook");
    expect(result.input.location).toBe("Roma Norte");
    expect(result.input.distributedTo).toEqual(["meta", "google"]);
  });
});

describe("validateAppointment", () => {
  it("requiere appointmentId", () => {
    expect(validateAppointment({ account: "roma" }).ok).toBe(false);
  });

  it("acepta cita válida", () => {
    const result = validateAppointment({ account: "roma", appointmentId: "9912" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.input.eventId).toBe("appt_roma_9912");
  });
});
