import {
  methodNotAllowed,
  send,
  type VercelRequest,
  type VercelResponse,
} from "../_lib/http.js";
import { serverError, trackingHttpHandlers } from "../../src/index.js";

// Vista del cliente: SOLO el snapshot agregado publicado por marketing (sin PII,
// sin internos). Acceso abierto por URL — lo usa únicamente el dueño. El
// snapshot se escribe vía api/client/publish, que SÍ exige TRACKING_API_SECRET.
export default async function handler(
  request: VercelRequest,
  response: VercelResponse,
): Promise<void> {
  if (request.method !== "GET") {
    methodNotAllowed(response);
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
