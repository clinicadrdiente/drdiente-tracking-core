import { bootstrapApp } from "../../src/app/bootstrap.js";
import { requireTrackingSecret } from "../../src/http/auth.js";
import {
  methodNotAllowed,
  send,
  toHttpRequest,
  type VercelRequest,
  type VercelResponse,
} from "../_lib/http.js";
import type { ConversionEvent } from "../../src/types/domain.js";

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

  const { stapeClient } = bootstrapApp();

  if (stapeClient.getMode() !== "api") {
    send(response, {
      status: 200,
      body: {
        ok: true,
        mode: "stub",
        message: "Stape is running in stub mode.",
      },
    });
    return;
  }

  try {
    const event: ConversionEvent = {
      eventId: `stape_demo_${Date.now()}`,
      eventName: "Lead",
      eventTime: Math.floor(Date.now() / 1000),
      actionSource: "website",
      userData: {
        em: "demo@drdiente.mx",
        ph: "525512345678",
        fbc: null,
        gclid: null,
        ttclid: null,
      },
      customData: {
        source_system: "dashboard_test",
        branch: "Demo",
        value: 0,
        currency: "MXN",
      },
    };

    await stapeClient.dispatch(event);

    send(response, {
      status: 202,
      body: {
        ok: true,
        mode: "api",
        dispatched: true,
        eventId: event.eventId,
      },
    });
  } catch (error) {
    send(response, {
      status: 500,
      body: {
        ok: false,
        error: "failed to dispatch Stape demo event",
        details: {
          message: error instanceof Error ? error.message : "unknown error",
        },
      },
    });
  }
}
