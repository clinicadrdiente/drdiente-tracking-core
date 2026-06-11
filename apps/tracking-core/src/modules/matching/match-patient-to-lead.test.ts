import { describe, expect, it } from "vitest";
import { matchPatientToLead } from "./match-patient-to-lead.js";
import type { CanonicalLead, DentalinkPatient } from "../../types/domain.js";

const makeLead = (overrides: Partial<CanonicalLead> = {}): CanonicalLead => ({
  elevatorId: "lead-1",
  firstName: "Ana",
  phoneRaw: "+52 55 1234 5678",
  phoneNormalized: "525512345678",
  emailRaw: "ana@example.com",
  emailNormalized: "ana@example.com",
  branch: "cdmx",
  attribution: {},
  ...overrides,
});

const makePatient = (overrides: Partial<DentalinkPatient> = {}): DentalinkPatient => ({
  patientId: 1,
  firstName: "Ana",
  phone: "+52 55 1234 5678",
  email: "ana@example.com",
  ...overrides,
});

describe("matchPatientToLead", () => {
  it("returns linked when patient phone matches lead phoneNormalized", () => {
    const lead = makeLead({ phoneNormalized: "525512345678" });
    const result = matchPatientToLead(makePatient({ phone: "+52 55 1234 5678", email: "other@other.com" }), [lead]);
    expect(result.status).toBe("linked");
    expect(result.elevatorId).toBe("lead-1");
    expect(result.confidence).toBe(1);
  });

  it("returns linked when patient email matches lead emailNormalized", () => {
    const lead = makeLead({ phoneNormalized: "99999999", emailNormalized: "ana@example.com" });
    const result = matchPatientToLead(makePatient({ phone: "11111111", email: "ana@example.com" }), [lead]);
    expect(result.status).toBe("linked");
    expect(result.elevatorId).toBe("lead-1");
  });

  it("returns match_failed when no match found", () => {
    const lead = makeLead({ phoneNormalized: "99999999", emailNormalized: "other@other.com" });
    const result = matchPatientToLead(makePatient({ phone: "11111111", email: "nobody@nobody.com" }), [lead]);
    expect(result.status).toBe("match_failed");
    expect(result.confidence).toBe(0);
  });

  it("returns manual_review when multiple leads match", () => {
    const lead1 = makeLead({ elevatorId: "lead-1", phoneNormalized: "525512345678" });
    const lead2 = makeLead({ elevatorId: "lead-2", phoneNormalized: "525512345678" });
    const result = matchPatientToLead(makePatient({ phone: "+52 55 1234 5678" }), [lead1, lead2]);
    expect(result.status).toBe("manual_review");
  });

  it("returns match_failed when patient has no phone and no email", () => {
    const lead = makeLead();
    const result = matchPatientToLead(makePatient({ phone: null, email: null }), [lead]);
    expect(result.status).toBe("match_failed");
  });

  it("returns match_failed for empty candidates list", () => {
    const result = matchPatientToLead(makePatient(), []);
    expect(result.status).toBe("match_failed");
  });
});
