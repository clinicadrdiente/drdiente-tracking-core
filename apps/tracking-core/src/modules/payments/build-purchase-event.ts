import type { CanonicalLead, ConversionEvent, PaymentEvent } from "../../types/domain.js";

function toUnixTime(isoDate: string): number {
  return Math.floor(new Date(isoDate).getTime() / 1000);
}

export function buildPurchaseEvent(
  lead: CanonicalLead,
  payment: PaymentEvent,
  tier: string,
): ConversionEvent {
  return {
    eventId: `payment_${payment.paymentId}`,
    eventName: payment.isVoided ? "Refund" : "Compra",
    eventTime: toUnixTime(payment.paidAt),
    actionSource: "physical_store",
    userData: {
      em: lead.emailNormalized ?? null,
      ph: lead.phoneNormalized,
      fbc: lead.attribution.fbclid ?? null,
      gclid: lead.attribution.gclid ?? null,
      ttclid: lead.attribution.ttclid ?? null,
    },
    customData: {
      currency: payment.currency,
      value: payment.budgetTotal,
      cash_collected: payment.paymentAmount,
      treatment_id: payment.treatmentId,
      treatment_name: payment.treatmentName ?? null,
      branch: lead.branch,
      tier,
    },
  };
}
