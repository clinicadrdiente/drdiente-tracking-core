import type { DentalinkClient } from "../modules/dentalink/client.js";
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
) {
  const payments = await dentalinkClient.listRecentPayments(sinceIso);
  const unprocessedPayments = await filterUnprocessedPayments(
    stateStore,
    payments,
  );

  for (const payment of unprocessedPayments) {
    const patient = await dentalinkClient.getPatient(payment.patientId);
    const leads = await elevatorClient.findLeadsByIdentity(
      patient.phone ?? "",
      patient.email,
    );

    const lead = leads[0];
    if (!lead) {
      continue;
    }

    const tier =
      payment.budgetTotal >= highTicketThreshold ? "alto_ticket" : "standard";
    const event = buildPurchaseEvent(lead, payment, tier);

    await elevatorClient.updateLeadStage(lead.elevatorId, "anticipo_pagado");
    await stapeClient.dispatch(event);
  }

  await markPaymentsProcessed(stateStore, unprocessedPayments);
  await stateStore.savePaymentSyncState({
    lastCheckIso: new Date().toISOString(),
    processedPaymentIds: (
      await stateStore.getPaymentSyncState()
    ).processedPaymentIds,
  });

  return {
    processed: unprocessedPayments.length,
    skipped: payments.length - unprocessedPayments.length,
  };
}
