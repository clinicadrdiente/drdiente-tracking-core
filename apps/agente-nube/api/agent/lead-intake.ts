import { requireTrackingSecret } from "../../src/http/auth.js";
import { validateLeadHandoff } from "../../src/modules/intake/validate.js";
import { processLeadHandoff } from "../../src/modules/intake/process.js";
import {
  methodNotAllowed,
  parseBody,
  send,
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

  const authError = requireTrackingSecret({ headers: request.headers });
  if (authError) {
    send(response, authError);
    return;
  }

  const validation = validateLeadHandoff(parseBody(request.body));
  if (!validation.ok) {
    send(response, { status: 400, body: { ok: false, error: validation.error } });
    return;
  }

  try {
    const result = await processLeadHandoff(validation.input);
    send(response, { status: 200, body: { ok: true, ...result } });
  } catch (error) {
    send(response, {
      status: 500,
      body: {
        ok: false,
        error: "lead intake failed",
        details: { message: error instanceof Error ? error.message : "unknown error" },
      },
    });
  }
}
