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
    eventName: payment.isVoided ? "Refund" : "Purchase",
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
      // Join key against Windsor spend (stable id preferred over campaign name).
      campaign_id: lead.attribution.campaignId ?? null,
      utm_source: lead.attribution.utmSource ?? lead.attribution.firstTouchSource ?? null,
      utm_medium: lead.attribution.utmMedium ?? null,
      utm_campaign: lead.attribution.utmCampaign ?? null,
      dentalink_payment_id: payment.paymentId,
      dentalink_patient_id: payment.patientId,
      paid_at: payment.paidAt,
      payment_method: payment.paymentMethod ?? null,
      payment_folio: payment.folio ?? null,
      payment_reference: payment.reference ?? null,
      treatment_id: payment.treatmentId,
      treatment_name: payment.treatmentName ?? null,
      branch: payment.branch ?? lead.branch,
      tier,
      source_system: "dentalink",
    },
  };
}
