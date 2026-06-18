import { requireTrackingSecret } from "../../src/index.js";
import {
  send,
  toHttpRequest,
  type VercelRequest,
  type VercelResponse,
} from "../_lib/http.js";

export default async function handler(
  request: VercelRequest,
  response: VercelResponse,
): Promise<void> {
  const authError = requireTrackingSecret(toHttpRequest(request));
  if (authError) {
    send(response, authError);
    return;
  }

  try {
    const { createTrackingHttpHandlers } = await import("../../src/http/handlers.js");
    const handlers = createTrackingHttpHandlers();
    response.status(200).json({
      ok: true,
      storeMode: handlers.stateStore.constructor.name,
    });
  } catch (err) {
    response.status(200).json({
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack?.split("\n").slice(0, 6) : undefined,
    });
  }
}
