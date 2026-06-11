import type { ConversionEvent } from "../../types/domain.js";

export interface ElevatorEventsDispatcher {
  dispatch(event: ConversionEvent): Promise<void>;
  getMode(): "stub" | "api";
}

export class StubElevatorEventsDispatcher implements ElevatorEventsDispatcher {
  getMode(): "stub" {
    return "stub";
  }

  async dispatch(_event: ConversionEvent): Promise<void> {
    return;
  }
}

export class ApiElevatorEventsDispatcher implements ElevatorEventsDispatcher {
  constructor(
    private readonly webhookUrl: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  getMode(): "api" {
    return "api";
  }

  async dispatch(event: ConversionEvent): Promise<void> {
    const response = await this.fetchImpl(this.webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildElevatorEventPayload(event)),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `Elevator events webhook failed with status ${response.status}: ${body.slice(0, 300)}`,
      );
    }
  }
}

export function createElevatorEventsDispatcher(): ElevatorEventsDispatcher {
  const webhookUrl = process.env.ELEVATOR_EVENTS_WEBHOOK_URL;

  if (!webhookUrl) {
    return new StubElevatorEventsDispatcher();
  }

  return new ApiElevatorEventsDispatcher(webhookUrl);
}

export function buildElevatorEventPayload(event: ConversionEvent): Record<string, unknown> {
  const cd = event.customData;

  return {
    event_name: event.eventName,
    event_id: event.eventId,
    event_time_unix: event.eventTime,
    event_time_iso: new Date(event.eventTime * 1000).toISOString(),
    // Contact identity for GHL workflow matching
    email: event.userData.em ?? null,
    phone: event.userData.ph ?? null,
    // Click IDs for Meta/Google dedup and attribution
    fbc: event.userData.fbc ?? null,
    fbclid: event.userData.fbc ?? null,
    gclid: event.userData.gclid ?? null,
    ttclid: event.userData.ttclid ?? null,
    // Revenue
    value: cd.value ?? null,
    currency: cd.currency ?? null,
    cash_collected: cd.cash_collected ?? null,
    // Campaign attribution
    campaign_id: cd.campaign_id ?? null,
    utm_source: cd.utm_source ?? null,
    utm_medium: cd.utm_medium ?? null,
    utm_campaign: cd.utm_campaign ?? null,
    // Clinic context
    treatment_name: cd.treatment_name ?? null,
    branch: cd.branch ?? null,
    tier: cd.tier ?? null,
    // Dentalink identifiers
    dentalink_payment_id: cd.dentalink_payment_id ?? null,
    dentalink_patient_id: cd.dentalink_patient_id ?? null,
    source_system: "drdiente-tracking-core",
  };
}
