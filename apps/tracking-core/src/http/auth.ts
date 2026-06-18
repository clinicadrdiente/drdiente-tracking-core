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
