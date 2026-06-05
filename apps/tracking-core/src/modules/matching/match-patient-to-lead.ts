import type {
  CanonicalLead,
  DentalinkPatient,
  MatchResult,
} from "../../types/domain.js";
import { normalizeEmail, normalizePhone } from "../../lib/normalize.js";

export function matchPatientToLead(
  patient: DentalinkPatient,
  candidates: CanonicalLead[],
): MatchResult {
  const patientPhone = patient.phone ? normalizePhone(patient.phone) : null;
  const patientEmail = normalizeEmail(patient.email);

  const exactMatches = candidates.filter((lead) => {
    const phoneMatches = patientPhone
      ? lead.phoneNormalized === patientPhone
      : false;
    const emailMatches = patientEmail
      ? lead.emailNormalized === patientEmail
      : false;

    return phoneMatches || emailMatches;
  });

  if (exactMatches.length === 1) {
    return {
      status: "linked",
      elevatorId: exactMatches[0].elevatorId,
      confidence: 1,
      reason: "single exact phone/email match",
    };
  }

  if (exactMatches.length > 1) {
    return {
      status: "manual_review",
      confidence: 0.4,
      reason: "multiple exact matches found",
    };
  }

  return {
    status: "match_failed",
    confidence: 0,
    reason: "no exact match found",
  };
}
