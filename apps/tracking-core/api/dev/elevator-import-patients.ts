import { bootstrapApp } from "../../src/app/bootstrap.js";
import { requireTrackingSecret } from "../../src/http/auth.js";
import {
  methodNotAllowed,
  send,
  toHttpRequest,
  type VercelRequest,
  type VercelResponse,
} from "../_lib/http.js";
import type { LeadInput } from "../../src/types/domain.js";

type PatientPaymentPayload = {
  paymentId?: number;
  patientId?: number;
  patientName?: string | null;
  patientEmail?: string | null;
  patientPhone?: string | null;
  treatmentName?: string | null;
  branch?: string | null;
};

export default async function handler(
  request: VercelRequest,
  response: VercelResponse,
): Promise<void> {
  if (request.method !== "POST") {
    methodNotAllowed(response);
    return;
  }

  const authError = requireTrackingSecret(toHttpRequest(request));
  if (authError) {
    send(response, authError);
    return;
  }

  const patients = readPatients(request.body).slice(0, 50);
  if (patients.length === 0) {
    response.status(400).json({ error: "patients payload is required" });
    return;
  }

  const { elevatorClient } = bootstrapApp();
  let createdLeads = 0;
  let existingLeads = 0;
  let skippedMissingContact = 0;
  let failed = 0;

  for (const patient of patients) {
    const leadInput = buildLeadInput(patient);
    if (!leadInput) {
      skippedMissingContact += 1;
      continue;
    }

    try {
      const existing = await elevatorClient.findLeadsByIdentity(
        leadInput.phone,
        leadInput.email,
      );
      const lead =
        existing[0] ?? (await elevatorClient.createLead(leadInput));

      if (existing[0]) {
        existingLeads += 1;
      } else {
        createdLeads += 1;
      }

      await elevatorClient.updateLeadStage(lead.elevatorId, "anticipo_pagado");
    } catch {
      failed += 1;
    }
  }

  const matchedLeads = createdLeads + existingLeads;
  response.status(failed > 0 ? 207 : 202).json({
    processed: patients.length,
    skipped: skippedMissingContact,
    sinceIso: null,
    paymentsFound: patients.length,
    alreadyProcessed: existingLeads,
    newPayments: patients.length,
    maxPayments: 50,
    matchedLeads,
    unmatchedLeads: skippedMissingContact,
    createdLeads,
    existingLeads,
    failed,
    rateLimitedPatients: 0,
    dispatched: matchedLeads,
  });
}

function readPatients(body: unknown): PatientPaymentPayload[] {
  if (
    typeof body === "object" &&
    body !== null &&
    Array.isArray((body as { patients?: unknown }).patients)
  ) {
    return (body as { patients: PatientPaymentPayload[] }).patients;
  }

  return [];
}

function buildLeadInput(patient: PatientPaymentPayload): LeadInput | null {
  const phone = patient.patientPhone?.trim() ?? "";
  const email = patient.patientEmail?.trim() || null;

  if (!phone && !email) {
    return null;
  }

  const { firstName, lastName } = splitPatientName(patient.patientName);

  return {
    firstName,
    lastName,
    phone,
    email,
    branch: patient.branch ?? "Dentalink",
    attribution: {
      utmSource: "dentalink",
      utmMedium: "dashboard_import",
      utmCampaign: patient.treatmentName ?? "dentalink_patient_import",
      landingUrl: null,
    },
  };
}

function splitPatientName(name?: string | null) {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);

  if (parts.length === 0) {
    return { firstName: "Paciente", lastName: null };
  }

  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(" ") || null,
  };
}
