import { trackingHttpHandlers } from "../../src/index.js";
import { getAppConfig } from "../../src/config/app-config.js";
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

  const config = getAppConfig();
  const since = new Date(
    Date.now() - config.paymentsSyncLookbackMinutes * 60_000,
  ).toISOString();
  request.query = {
    ...request.query,
    since,
  };

  const result = await trackingHttpHandlers.postPaymentsSync(
    toHttpRequest(request),
  );

  send(response, result);
}
