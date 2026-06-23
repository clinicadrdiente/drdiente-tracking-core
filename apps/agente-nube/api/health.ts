import { getAgentConfig } from "../src/config.js";
import { methodNotAllowed, type VercelRequest, type VercelResponse } from "./_lib/http.js";

export default async function handler(
  request: VercelRequest,
  response: VercelResponse,
): Promise<void> {
  if (request.method !== "GET") {
    methodNotAllowed(response);
    return;
  }

  const config = getAgentConfig();
  response.status(200).json({
    ok: true,
    service: "agente-nube",
    integrations: {
      supabase: Boolean(config.supabase.url && config.supabase.serviceKey),
      sheets: Boolean(config.sheets.webhookUrl),
      whatsapp: Boolean(config.whatsapp.webhookUrl && config.whatsapp.owners.length > 0),
      windsor: Boolean(config.windsor.apiKey),
      ownersConfigured: config.whatsapp.owners.length,
    },
  });
}
