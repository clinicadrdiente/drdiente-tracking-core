import {
  methodNotAllowed,
  send,
  toHttpRequest,
  type VercelRequest,
  type VercelResponse,
} from "../_lib/http.js";
import { requireTrackingSecret } from "../../src/http/auth.js";
import { getStapeConfig } from "../../src/modules/stape/config.js";

export default async function handler(
  request: VercelRequest,
  response: VercelResponse,
): Promise<void> {
  if (request.method !== "GET") {
    methodNotAllowed(response);
    return;
  }

  const authError = requireTrackingSecret(toHttpRequest(request));
  if (authError) {
    send(response, authError);
    return;
  }

  const config = getStapeConfig();

  send(response, {
    status: 200,
    body: {
      ok: true,
      mode: config.mode,
      serverUrlConfigured: Boolean(config.serverUrl),
      requestPath: config.requestPath,
      containerId: config.containerId || null,
      containerIdentifier: config.containerIdentifier || null,
      apiKeyConfigured: Boolean(config.apiKey),
      apiKeyHeader: config.apiKey ? config.apiKeyHeader : null,
    },
  });
}
