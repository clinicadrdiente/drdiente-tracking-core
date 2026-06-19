import {
  methodNotAllowed,
  send,
  toHttpRequest,
  type VercelRequest,
  type VercelResponse,
} from "../_lib/http.js";
import {
  badRequest,
  requireTrackingSecret,
  serverError,
  trackingHttpHandlers,
} from "../../src/index.js";
import {
  buildClientSnapshot,
  type ClientSnapshotInput,
} from "../../src/modules/reports/client-snapshot.js";

// Publica el snapshot del cliente. Lo llama el "Resumen de dueños" INTERNO con
// TRACKING_API_SECRET (equipo de marketing). El servidor reconstruye el snapshot
// con los módulos puros → garantiza que solo se persisten agregados sin PII.
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

  try {
    const body = (request.body ?? {}) as Partial<ClientSnapshotInput>;
    if (!Array.isArray(body.pagos) || body.pagos.length === 0) {
      send(
        response,
        badRequest("Envía `pagos` (registros de pagos por acción ya parseados)."),
      );
      return;
    }

    const snapshot = buildClientSnapshot({
      pagos: body.pagos,
      acciones: body.acciones ?? null,
      windsorDaily: body.windsorDaily ?? null,
      cartera: body.cartera ?? null,
      pipeline: body.pipeline ?? null,
      marginPct: typeof body.marginPct === "number" ? body.marginPct : 60,
      repurchase: typeof body.repurchase === "number" ? body.repurchase : 1.3,
      bounds: body.bounds ?? null,
      nowIso: new Date().toISOString(),
    });

    await trackingHttpHandlers.stateStore.saveClientSnapshot(snapshot);
    send(response, {
      status: 200,
      body: {
        ok: true,
        generatedAt: snapshot.generatedAt,
        channels: snapshot.channels.length,
        recommendations: snapshot.recommendations.length,
      },
    });
  } catch (error) {
    send(
      response,
      serverError("failed to publish client snapshot", {
        message: error instanceof Error ? error.message : "unknown error",
      }),
    );
  }
}
