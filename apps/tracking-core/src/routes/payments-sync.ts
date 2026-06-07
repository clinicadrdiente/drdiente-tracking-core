import type { DentalinkClient } from "../modules/dentalink/client.js";
import { DentalinkRequestError } from "../modules/dentalink/client.js";
import type { ElevatorClient } from "../modules/elevator/client.js";
import type { StapeClient } from "../modules/stape/client.js";
import { buildPurchaseEvent } from "../modules/payments/build-purchase-event.js";
import {
  filterUnprocessedPayments,
  markPaymentsProcessed,
} from "../modules/state/payment-sync.js";
import type { StateStore } from "../modules/state/state-store.js";
import type { DentalinkPatient, LeadInput, PaymentEvent } from "../types/domain.js";

export async function handlePaymentsSync(
  dentalinkClient: DentalinkClient,
  elevatorClient: ElevatorClient,
  stapeClient: StapeClient,
  stateStore: StateStore,
  sinceIso: string,
  highTicketThreshold: number,
  maxPayments?: number,
) {
  const payments = await dentalinkClient.listRecentPayments(sinceIso, maxPayments);
  const unprocessedPayments = await filterUnprocessedPayments(
    stateStore,
    payments,
  );
  let matchedLeads = 0;
  let unmatchedLeads = 0;
  let createdLeads = 0;
  let rateLimitedPatients = 0;
  let dispatched = 0;
  let skippedDuplicateBudget = 0;
  const safeToMarkProcessed = [];

  for (const payment of unprocessedPayments) {
    let patient;
    try {
      patient = await dentalinkClient.getPatient(payment.patientId);
    } catch (error) {
      if (error instanceof DentalinkRequestError && error.status === 429) {
        rateLimitedPatients += 1;
        continue;
      }

      throw error;
    }

    safeToMarkProcessed.push(payment);
    const leads = await elevatorClient.findLeadsByIdentity(
      patient.phone ?? "",
      patient.email,
    );

    let lead = leads[0];
    if (!lead) {
      const leadInput = buildLeadInputFromDentalink(patient, payment);
      if (!leadInput) {
        unmatchedLeads += 1;
        continue;
      }

      lead = await elevatorClient.createLead(leadInput);
      createdLeads += 1;
    }

    matchedLeads += 1;

    // Revenue is the FULL budget total, counted once per treatment/budget.
    // A budget paid in several installments produces several payment rows, all
    // carrying the same budgetTotal — emitting a "Compra" per payment would
    // multiply revenue and inflate ROAS. So we gate the purchase on a
    // treatment-scoped key and only fire it for the first payment of a budget.
    // Subsequent installments are skipped here (cash reconciliation lives in a
    // separate signal). Refunds always dispatch as corrections.
    const purchaseDedupeKey =
      payment.treatmentId > 0
        ? `treatment_${payment.treatmentId}`
        : `payment_${payment.paymentId}`;

    const alreadyCounted =
      !payment.isVoided &&
      (await stateStore.hasProcessedPayment(purchaseDedupeKey));

    if (alreadyCounted) {
      skippedDuplicateBudget += 1;
      continue;
    }

    const tier =
      payment.budgetTotal >= highTicketThreshold ? "alto_ticket" : "standard";
    const event = buildPurchaseEvent(lead, payment, tier);

    await elevatorClient.updateLeadStage(lead.elevatorId, "anticipo_pagado");
    await stapeClient.dispatch(event);
    if (!payment.isVoided) {
      await stateStore.markPaymentProcessed(purchaseDedupeKey);
    }
    dispatched += 1;
  }

  await markPaymentsProcessed(stateStore, safeToMarkProcessed);
  await stateStore.savePaymentSyncState({
    lastCheckIso: new Date().toISOString(),
    processedPaymentIds: (
      await stateStore.getPaymentSyncState()
    ).processedPaymentIds,
  });

  return {
    processed: unprocessedPayments.length,
    skipped: payments.length - unprocessedPayments.length,
    sinceIso,
    paymentsFound: payments.length,
    alreadyProcessed: payments.length - unprocessedPayments.length,
    newPayments: unprocessedPayments.length,
    maxPayments: maxPayments ?? null,
    matchedLeads,
    unmatchedLeads,
    createdLeads,
    rateLimitedPatients,
    dispatched,
    skippedDuplicateBudget,
  };
}

function buildLeadInputFromDentalink(
  patient: DentalinkPatient,
  payment: PaymentEvent,
): LeadInput | null {
  if (!patient.phone && !patient.email) {
    return null;
  }

  return {
    firstName: patient.firstName || payment.patientName || "Paciente",
    lastName: patient.lastName ?? null,
    phone: patient.phone ?? "",
    email: patient.email ?? null,
    branch: patient.branch ?? payment.branch ?? "Dentalink",
    attribution: {
      utmSource: "dentalink",
      utmMedium: "payment_sync",
      utmCampaign: payment.treatmentName ?? "dentalink_purchase",
      landingUrl: null,
    },
  };
}
