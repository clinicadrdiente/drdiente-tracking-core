import { createHash, timingSafeEqual } from "node:crypto";
import { unauthorized, type HttpResult } from "./response";

export interface RequestLike {
  headers?: Record<string, string | undefined>;
}

const TRACKING_SECRET_HEADER = "x-tracking-secret";

/** Valida el secreto compartido (ingesta de leads / SAC). Null = autorizado. */
export function requireTrackingSecret(request: RequestLike): HttpResult | null {
  const expected = process.env.TRACKING_API_SECRET?.trim();
  if (!expected) return unauthorized("tracking secret is not configured");

  const received = getHeader(request, TRACKING_SECRET_HEADER)?.trim();
  if (!timingSafeStringEqual(received, expected)) return unauthorized();

  return null;
}

/** Valida el Bearer token de los crons de Vercel. */
export function isAuthorizedCron(request: RequestLike): boolean {
  const expected = process.env.CRON_SECRET?.trim();
  if (!expected) return false; // Fail closed: el cron debe estar protegido.

  const token = readBearerToken(request)?.trim();
  return timingSafeStringEqual(token, expected);
}

function timingSafeStringEqual(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return false;
  const hashA = createHash("sha256").update(a).digest();
  const hashB = createHash("sha256").update(b).digest();
  return timingSafeEqual(hashA, hashB);
}

function readBearerToken(request: RequestLike): string | undefined {
  const authorization = getHeader(request, "authorization");
  const match = authorization?.match(/^Bearer\s+(.+)$/i);
  return match?.[1];
}

function getHeader(request: RequestLike, name: string): string | undefined {
  const headers = request.headers ?? {};
  const normalized = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === normalized) return value;
  }
  return undefined;
}
