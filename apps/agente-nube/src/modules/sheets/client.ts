import { getAgentConfig, type SheetsConfig } from "../../config.js";
import type { CanonicalLead } from "../../types/domain.js";

/**
 * Espejo en Google Sheets vía un Web App de Apps Script (appendRow).
 * Evita OAuth/JWT: la app POSTea una fila a un endpoint con secreto compartido.
 * Ver README §Google Sheets para el script. No-op si no está configurado.
 */
export class SheetsMirror {
  constructor(private readonly config: SheetsConfig = getAgentConfig().sheets) {}

  isConfigured(): boolean {
    return Boolean(this.config.webhookUrl);
  }

  async appendLead(lead: CanonicalLead): Promise<void> {
    if (!this.config.webhookUrl) return;

    const row = {
      received_at: lead.receivedAt,
      occurred_at: lead.occurredAt,
      account: lead.account,
      first_name: lead.firstName,
      last_name: lead.lastName ?? "",
      email: lead.emailNormalized ?? "",
      phone: lead.phoneNormalized,
      source: lead.source ?? "",
      location: lead.location ?? "",
      initial_message: lead.initialMessage ?? "",
      utm_source: lead.utmSource ?? "",
      utm_campaign: lead.utmCampaign ?? "",
      elevator_id: lead.elevatorId ?? "",
      event_id: lead.eventId,
    };

    const response = await fetch(this.config.webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret: this.config.secret ?? "", type: "lead", row }),
    });

    if (!response.ok) {
      throw new Error(`sheets webhook ${response.status}`);
    }
  }
}

export function createSheetsMirror(): SheetsMirror {
  return new SheetsMirror();
}
