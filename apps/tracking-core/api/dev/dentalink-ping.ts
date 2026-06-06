import { createDentalinkClient } from "../../src/index.js";
import {
  methodNotAllowed,
  send,
  toHttpRequest,
  type VercelRequest,
  type VercelResponse,
} from "../_lib/http.js";
import { requireTrackingSecret, serverError } from "../../src/index.js";

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

  try {
    const dentalinkClient = createDentalinkClient();
    const payments = await dentalinkClient.listRecentPayments(
      new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    );

    send(response, {
      status: 200,
      body: {
        ok: true,
        mode: process.env.DENTALINK_MODE ?? "stub",
        recentPaymentCount: payments.length,
        samplePayment: payments[0] ?? null,
      },
    });
  } catch (error) {
    send(
      response,
      serverError("failed to ping dentalink", {
        message: error instanceof Error ? error.message : "unknown error",
      }),
    );
  }
}
