import { getAgentConfig, type WhatsappConfig } from "../../config.js";

export interface WhatsappDelivery {
  delivered: number;
  failed: number;
  skipped: boolean; // true si no hay webhook o no hay destinatarios
}

/**
 * Envío de WhatsApp a los dueños vía Elevator / GoHighLevel.
 * POSTea { secret, to, message } a un webhook entrante de un workflow de
 * Elevator/GHL que reenvía el WhatsApp. No-op si falta webhook o destinatarios.
 */
export class ElevatorWhatsapp {
  constructor(private readonly config: WhatsappConfig = getAgentConfig().whatsapp) {}

  isConfigured(): boolean {
    return Boolean(this.config.webhookUrl && this.config.owners.length > 0);
  }

  async sendToOwners(message: string): Promise<WhatsappDelivery> {
    if (!this.config.webhookUrl || this.config.owners.length === 0) {
      return { delivered: 0, failed: 0, skipped: true };
    }

    let delivered = 0;
    let failed = 0;
    for (const to of this.config.owners) {
      try {
        const response = await fetch(this.config.webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ secret: this.config.secret ?? "", to, message }),
        });
        if (response.ok) delivered += 1;
        else failed += 1;
      } catch {
        failed += 1;
      }
    }
    return { delivered, failed, skipped: false };
  }
}

export function createElevatorWhatsapp(): ElevatorWhatsapp {
  return new ElevatorWhatsapp();
}
