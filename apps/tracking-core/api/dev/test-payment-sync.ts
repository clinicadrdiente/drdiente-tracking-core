import { requireTrackingSecret, trackingHttpHandlers } from "../../src/index.js";
import {
  methodNotAllowed,
  send,
  toHttpRequest,
  type VercelRequest,
  type VercelResponse,
} from "../_lib/http.js";

export default async function handler(
  request: VercelRequest,
  response: VercelResponse,
): Promise<void> {
  if (request.method !== "POST") {
    methodNotAllowed(response);
    return;
  }

  const authError = requireTrackingSecret(toHttpRequest(request));
  if (authError) {
    send(response, authError);
    return;
  }

  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  request.query = {
    ...request.query,
    since,
    maxPayments: "10",
  };

  const result = await trackingHttpHandlers.postPaymentsSync(
    toHttpRequest(request),
  );

  send(response, result);
}
