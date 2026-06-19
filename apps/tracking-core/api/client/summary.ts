import {
  methodNotAllowed,
  send,
  toHttpRequest,
  type VercelRequest,
  type VercelResponse,
} from "../_lib/http.js";
import { serverError, trackingHttpHandlers } from "../../src/index.js";
import { requireClientSession } from "../../src/http/client-auth.js";

// Vista del cliente: SOLO el snapshot agregado publicado por marketing. Nunca
// toca endpoints internos ni datos crudos. Protegido por sesión de cliente
// (jamás por TRACKING_API_SECRET).
export default async function handler(
  request: VercelRequest,
  response: VercelResponse,
): Promise<void> {
  if (request.method !== "GET") {
    methodNotAllowed(response);
    return;
  }

  const authError = requireClientSession(toHttpRequest(request));
  if (authError) {
    send(response, authError);
    return;
  }

  try {
    const snapshot = await trackingHttpHandlers.stateStore.getClientSnapshot();
    send(response, { status: 200, body: { ok: true, snapshot } });
  } catch (error) {
    send(
      response,
      serverError("failed to load client summary", {
        message: error instanceof Error ? error.message : "unknown error",
      }),
    );
  }
}
