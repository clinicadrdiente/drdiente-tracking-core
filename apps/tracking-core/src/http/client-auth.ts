// Autenticación del dashboard del CLIENTE — independiente del TRACKING_API_SECRET
// interno. Login real usuario/contraseña contra variables de entorno, con sesión
// firmada (HMAC) en cookie httpOnly. Nunca comparte secreto con la herramienta
// de marketing: una fuga de un lado no compromete el otro.

import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { unauthorized } from "./response.js";
import type { HttpResponse } from "./types.js";

export const CLIENT_SESSION_COOKIE = "drdiente_client_session";
export const CLIENT_SESSION_TTL_SECONDS = 12 * 60 * 60; // 12 h

type AnyHttpRequest = { headers?: Record<string, string | undefined> };

function timingSafeStringEqual(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return false;
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

function base64url(input: string): string {
  return Buffer.from(input, "utf8").toString("base64url");
}

function base64urlDecode(input: string): string {
  return Buffer.from(input, "base64url").toString("utf8");
}

function hmac(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body).digest("base64url");
}

/**
 * Valida usuario/contraseña contra `CLIENT_USERNAME` + `CLIENT_PASSWORD_HASH`
 * (hash = sha256 hex de la contraseña). Comparación timing-safe.
 */
export function verifyClientCredentials(username: string, password: string): boolean {
  const expectedUser = process.env.CLIENT_USERNAME;
  const expectedHash = process.env.CLIENT_PASSWORD_HASH;
  if (!expectedUser || !expectedHash) return false;
  if (!timingSafeStringEqual(username, expectedUser)) return false;
  const providedHash = createHash("sha256").update(password).digest("hex");
  return timingSafeStringEqual(providedHash, expectedHash);
}

/** Firma un token de sesión: base64url(payload).hmac. */
export function signClientSession(nowMs: number = Date.now()): string {
  const secret = process.env.CLIENT_SESSION_SECRET;
  if (!secret) throw new Error("CLIENT_SESSION_SECRET is not configured");
  const payload = {
    sub: "client",
    exp: Math.floor(nowMs / 1000) + CLIENT_SESSION_TTL_SECONDS,
  };
  const body = base64url(JSON.stringify(payload));
  return `${body}.${hmac(body, secret)}`;
}

export function verifyClientSessionToken(token: string, nowMs: number = Date.now()): boolean {
  const secret = process.env.CLIENT_SESSION_SECRET;
  if (!secret) return false;
  const dot = token.indexOf(".");
  if (dot <= 0) return false;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (!timingSafeStringEqual(sig, hmac(body, secret))) return false;
  try {
    const payload = JSON.parse(base64urlDecode(body)) as { exp?: number };
    return typeof payload.exp === "number" && payload.exp * 1000 > nowMs;
  } catch {
    return false;
  }
}

function readSessionCookie(request: AnyHttpRequest): string | null {
  const headers = request.headers ?? {};
  const raw = headers.cookie ?? headers.Cookie;
  if (!raw) return null;
  for (const part of raw.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === CLIENT_SESSION_COOKIE) {
      return part.slice(eq + 1).trim();
    }
  }
  return null;
}

/** Guard para endpoints `api/client/*`. Devuelve 401 si no hay sesión válida. */
export function requireClientSession(
  request: AnyHttpRequest,
  nowMs: number = Date.now(),
): HttpResponse | null {
  const token = readSessionCookie(request);
  if (!token || !verifyClientSessionToken(token, nowMs)) {
    return unauthorized();
  }
  return null;
}

// Secure sólo cuando corremos en Vercel (https); en dev local (http) rompería
// la cookie. SameSite=Strict + HttpOnly siempre.
function cookieFlags(): string {
  const secure = process.env.VERCEL ? " Secure;" : "";
  return `HttpOnly;${secure} SameSite=Strict; Path=/`;
}

export function buildSessionCookie(token: string): string {
  return `${CLIENT_SESSION_COOKIE}=${token}; ${cookieFlags()}; Max-Age=${CLIENT_SESSION_TTL_SECONDS}`;
}

export function buildClearedSessionCookie(): string {
  return `${CLIENT_SESSION_COOKIE}=; ${cookieFlags()}; Max-Age=0`;
}
