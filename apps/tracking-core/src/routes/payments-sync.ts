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
  let rateLimitedPatients = 0;
  let dispatched = 0;
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

    const lead = leads[0];
    if (!lead) {
      unmatchedLeads += 1;
      continue;
    }

    matchedLeads += 1;
    const tier =
      payment.budgetTotal >= highTicketThreshold ? "alto_ticket" : "standard";
    const event = buildPurchaseEvent(lead, payment, tier);

    await elevatorClient.updateLeadStage(lead.elevatorId, "anticipo_pagado");
    await stapeClient.dispatch(event);
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
    rateLimitedPatients,
    dispatched,
  };
}
