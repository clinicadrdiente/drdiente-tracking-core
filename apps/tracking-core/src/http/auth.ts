import { timingSafeEqual, createHash } from "node:crypto";
import { unauthorized } from "./response.js";
import type { HttpResponse } from "./types.js";

const TRACKING_SECRET_HEADER = "x-tracking-secret";
type AnyHttpRequest = {
  headers?: Record<string, string | undefined>;
};

export function requireTrackingSecret(request: AnyHttpRequest): HttpResponse | null {
  const expectedSecret = process.env.TRACKING_API_SECRET;

  if (!expectedSecret) {
    return unauthorized("tracking secret is not configured");
  }

  // Trim ambos lados: un espacio/newline accidental en la env var o el header
  // no debe causar "unauthorized". (Sigue siendo sensible a mayúsculas.)
  const receivedSecret = getHeader(request, TRACKING_SECRET_HEADER)?.trim();
  if (!timingSafeStringEqual(receivedSecret, expectedSecret.trim())) {
    return unauthorized();
  }

  return null;
}

/**
 * Autoriza el envío del cierre diario desde recepción. Acepta el secret de admin
 * (TRACKING_API_SECRET) O un token de bajo privilegio para recepción
 * (RECEPTION_SUBMIT_TOKEN) que solo sirve para POST de reportes diarios — así la
 * página pública de recepción nunca lleva el secret de admin.
 */
export function requireDailySubmitSecret(request: AnyHttpRequest): HttpResponse | null {
  const adminSecret = process.env.TRACKING_API_SECRET?.trim();
  const receptionToken = process.env.RECEPTION_SUBMIT_TOKEN?.trim();

  if (!adminSecret && !receptionToken) {
    return unauthorized("daily submit secret is not configured");
  }

  const received = getHeader(request, TRACKING_SECRET_HEADER)?.trim();
  const matchesAdmin = Boolean(adminSecret) && timingSafeStringEqual(received, adminSecret);
  const matchesReception = Boolean(receptionToken) && timingSafeStringEqual(received, receptionToken);
  if (!matchesAdmin && !matchesReception) {
    return unauthorized();
  }

  return null;
}

function timingSafeStringEqual(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return false;
  // Buffers must be same length for timingSafeEqual; hash both to normalize length.
  const hashA = createHash("sha256").update(a).digest();
  const hashB = createHash("sha256").update(b).digest();
  return timingSafeEqual(hashA, hashB);
}

function getHeader(
  request: AnyHttpRequest,
  headerName: string,
): string | undefined {
  const headers = request.headers ?? {};
  const normalizedName = headerName.toLowerCase();

  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === normalizedName) {
      return value;
    }
  }

  return undefined;
}
