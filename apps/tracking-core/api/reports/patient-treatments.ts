import {
  methodNotAllowed,
  send,
  toHttpRequest,
  type VercelRequest,
  type VercelResponse,
} from "../_lib/http.js";
import { requireTrackingSecret } from "../../src/http/auth.js";
import { trackingHttpHandlers } from "../../src/index.js";

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

  const minTreatments = Math.max(1, Number(request.query?.min_treatments ?? 1));

  try {
    const patients = await trackingHttpHandlers.stateStore.listRecurringPatients(minTreatments);

    send(response, {
      status: 200,
      body: {
        ok: true,
        minTreatments,
        count: patients.length,
        patients,
      },
    });
  } catch (err) {
    send(response, {
      status: 500,
      body: {
        ok: false,
        error: "failed to list patient treatments",
        details: { message: err instanceof Error ? err.message : "unknown error" },
      },
    });
  }
}
