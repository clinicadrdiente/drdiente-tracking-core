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
  patientReference?: string | null;
  treatmentName?: string | null;
  branch?: string | null;
};

type ImportResult = {
  paymentId: number | null;
  patientId: number | null;
  patientName: string;
  contact: string;
  reference: string;
  branch: string;
  status: "created" | "existing" | "skipped_missing_contact" | "failed";
  elevatorId: string | null;
  readyForStape: boolean;
  reason: string;
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
  const results: ImportResult[] = [];

  for (const patient of patients) {
    const leadInput = buildLeadInput(patient);
    if (!leadInput) {
      skippedMissingContact += 1;
      results.push(buildImportResult(patient, {
        elevatorId: null,
        readyForStape: false,
        reason: "Sin telefono/email para buscar o crear contacto",
        status: "skipped_missing_contact",
      }));
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
        results.push(buildImportResult(patient, {
          elevatorId: lead.elevatorId,
          readyForStape: true,
          reason: "Contacto ya existia en Elevator",
          status: "existing",
        }));
      } else {
        createdLeads += 1;
        results.push(buildImportResult(patient, {
          elevatorId: lead.elevatorId,
          readyForStape: true,
          reason: "Contacto creado en Elevator",
          status: "created",
        }));
      }

      await elevatorClient.updateLeadStage(lead.elevatorId, "anticipo_pagado");
    } catch (error) {
      failed += 1;
      results.push(buildImportResult(patient, {
        elevatorId: null,
        readyForStape: false,
        reason: error instanceof Error ? error.message : "Error desconocido",
        status: "failed",
      }));
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
    results,
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
      utmCampaign:
        patient.patientReference ??
        patient.treatmentName ??
        "dentalink_patient_import",
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

function buildImportResult(
  patient: PatientPaymentPayload,
  result: Pick<
    ImportResult,
    "elevatorId" | "readyForStape" | "reason" | "status"
  >,
): ImportResult {
  return {
    paymentId: typeof patient.paymentId === "number" ? patient.paymentId : null,
    patientId: typeof patient.patientId === "number" ? patient.patientId : null,
    patientName: patient.patientName?.trim() || "Paciente sin nombre",
    contact: patient.patientEmail || patient.patientPhone || "Sin contacto",
    reference: patient.patientReference?.trim() || "Sin referencia",
    branch: patient.branch?.trim() || "Sin sucursal",
    ...result,
  };
}
