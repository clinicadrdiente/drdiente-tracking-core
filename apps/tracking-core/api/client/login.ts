import {
  methodNotAllowed,
  send,
  type VercelRequest,
  type VercelResponse,
} from "../_lib/http.js";
import { badRequest, serverError, unauthorized } from "../../src/index.js";
import {
  buildSessionCookie,
  signClientSession,
  verifyClientCredentials,
} from "../../src/http/client-auth.js";

// Vercel/Node response expone setHeader en runtime; el tipo mínimo de _lib no.
interface CookieResponse {
  setHeader(name: string, value: string): void;
}

export default async function handler(
  request: VercelRequest,
  response: VercelResponse,
): Promise<void> {
  if (request.method !== "POST") {
    methodNotAllowed(response);
    return;
  }

  try {
    const body = (request.body ?? {}) as Record<string, unknown>;
    const username = typeof body.username === "string" ? body.username : "";
    const password = typeof body.password === "string" ? body.password : "";

    if (!username || !password) {
      send(response, badRequest("Usuario y contraseña son requeridos."));
      return;
    }

    if (!verifyClientCredentials(username, password)) {
      send(response, unauthorized("Usuario o contraseña incorrectos."));
      return;
    }

    let token: string;
    try {
      token = signClientSession();
    } catch {
      send(response, serverError("La sesión del cliente no está configurada."));
      return;
    }

    (response as unknown as CookieResponse).setHeader(
      "Set-Cookie",
      buildSessionCookie(token),
    );
    send(response, { status: 200, body: { ok: true } });
  } catch (error) {
    send(
      response,
      serverError("login failed", {
        message: error instanceof Error ? error.message : "unknown error",
      }),
    );
  }
}
