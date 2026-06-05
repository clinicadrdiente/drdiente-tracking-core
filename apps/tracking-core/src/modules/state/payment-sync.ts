import type { PaymentEvent } from "../../types/domain.js";
import type { StateStore } from "./state-store.js";

function toPaymentKey(payment: PaymentEvent): string {
  return `payment_${payment.paymentId}`;
}

export async function filterUnprocessedPayments(
  stateStore: StateStore,
  payments: PaymentEvent[],
): Promise<PaymentEvent[]> {
  const unprocessed: PaymentEvent[] = [];

  for (const payment of payments) {
    const processed = await stateStore.hasProcessedPayment(toPaymentKey(payment));
    if (!processed) {
      unprocessed.push(payment);
    }
  }

  return unprocessed;
}

export async function markPaymentsProcessed(
  stateStore: StateStore,
  payments: PaymentEvent[],
): Promise<void> {
  for (const payment of payments) {
    await stateStore.markPaymentProcessed(toPaymentKey(payment));
  }
}
