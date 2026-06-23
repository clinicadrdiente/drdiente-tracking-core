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

  const parsed = parseBody(request.body);
  // Registro temporal de diagnóstico: solo las LLAVES (no los valores/PII) para
  // confirmar cómo mapea Elevator/GHL los campos. Quitar tras validar el cableado.
  console.log(
    "[lead-intake] keys:",
    parsed ? Object.keys(parsed).join(",") : "null",
  );

  const validation = validateLeadHandoff(parsed);
  if (!validation.ok) {
    console.warn("[lead-intake] rejected:", validation.error);
    send(response, { status: 400, body: { ok: false, error: validation.error } });
    return;
  }
  console.log(
    "[lead-intake] accepted:",
    validation.input.account,
    validation.input.phone ? "phone" : "no-phone",
    validation.input.email ? "email" : "no-email",
  );

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
