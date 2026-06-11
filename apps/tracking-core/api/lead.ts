import { trackingHttpHandlers } from "../src/index.js";
import {
  methodNotAllowed,
  send,
  toHttpRequest,
  type VercelRequest,
  type VercelResponse,
} from "./_lib/http.js";

export default async function handler(
  request: VercelRequest,
  response: VercelResponse,
): Promise<void> {
  if (request.method !== "POST") {
    methodNotAllowed(response);
    return;
  }

  const result = await trackingHttpHandlers.postLead(toHttpRequest(request));
  send(response, result);

  // Best-effort: store contact → digital source for primera interacción attribution
  if (result.status === 201) {
    try {
      const body = request.body as Record<string, unknown>;
      const flat = body;
      const nested = (typeof body.attribution === "object" && body.attribution !== null)
        ? body.attribution as Record<string, unknown>
        : {} as Record<string, unknown>;
      const source =
        (typeof nested.utmSource === "string" ? nested.utmSource : null) ??
        (typeof flat.utm_source === "string" ? flat.utm_source : null) ??
        (typeof nested.firstTouchSource === "string" ? nested.firstTouchSource : null) ??
        (typeof flat.first_touch_source === "string" ? flat.first_touch_source : null);
      if (source) {
        const phone = typeof body.phone === "string" ? body.phone.trim() : null;
        const email = typeof body.email === "string" ? body.email.trim() : null;
        const contacts = [phone, email].filter((c): c is string => Boolean(c));
        await Promise.all(
          contacts.map((c) =>
            trackingHttpHandlers.stateStore.setContactLeadSource(c, source).catch(() => undefined),
          ),
        );
      }
    } catch {
      // Non-critical — never fail lead capture
    }
  }
}
