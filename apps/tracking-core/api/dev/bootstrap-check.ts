import type { VercelRequest, VercelResponse } from "../_lib/http.js";

export default async function handler(
  _request: VercelRequest,
  response: VercelResponse,
): Promise<void> {
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
