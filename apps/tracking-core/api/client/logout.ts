import {
  methodNotAllowed,
  send,
  type VercelRequest,
  type VercelResponse,
} from "../_lib/http.js";
import { buildClearedSessionCookie } from "../../src/http/client-auth.js";

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

  (response as unknown as CookieResponse).setHeader(
    "Set-Cookie",
    buildClearedSessionCookie(),
  );
  send(response, { status: 200, body: { ok: true } });
}
