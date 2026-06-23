import { requireTrackingSecret } from "../../src/http/auth";
import { validateAppointment } from "../../src/modules/intake/validate";
import { SupabaseStore } from "../../src/modules/supabase/client";
import {
  methodNotAllowed,
  parseBody,
  send,
  type VercelRequest,
  type VercelResponse,
} from "../_lib/http";

export default async function handler(
  request: VercelRequest,
  response: VercelResponse,
): Promise<void> {
  if (request.method !== "POST") {
    methodNotAllowed(response);
    return;
  }

  const authError = requireTrackingSecret({ headers: request.headers });
  if (authError) {
    send(response, authError);
    return;
  }

  const validation = validateAppointment(parseBody(request.body));
  if (!validation.ok) {
    send(response, { status: 400, body: { ok: false, error: validation.error } });
    return;
  }

  const supabase = new SupabaseStore();
  if (!supabase.isConfigured()) {
    send(response, {
      status: 200,
      body: { ok: true, persisted: false, reason: "supabase not configured" },
    });
    return;
  }

  try {
    const result = await supabase.upsertAppointment(validation.input);
    send(response, {
      status: 200,
      body: {
        ok: true,
        persisted: true,
        deduped: !result.inserted,
        eventId: validation.input.eventId,
      },
    });
  } catch (error) {
    send(response, {
      status: 500,
      body: {
        ok: false,
        error: "appointment intake failed",
        details: { message: error instanceof Error ? error.message : "unknown error" },
      },
    });
  }
}
