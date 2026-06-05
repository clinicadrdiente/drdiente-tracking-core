import { trackingHttpHandlers } from "../../../src/index.js";
import {
  methodNotAllowed,
  send,
  toHttpRequest,
  type VercelRequest,
  type VercelResponse,
} from "../../_lib/http.js";

export default async function handler(
  request: VercelRequest,
  response: VercelResponse,
): Promise<void> {
  if (request.method !== "POST") {
    methodNotAllowed(response);
    return;
  }

  const result = await trackingHttpHandlers.postDentalinkAppointment(
    toHttpRequest(request),
  );
  send(response, result);
}
