import type { HttpResult } from "../../src/http/response.js";

export interface VercelRequest {
  body?: unknown;
  query?: Record<string, string | string[] | undefined>;
  headers?: Record<string, string | undefined>;
  method?: string;
}

export interface VercelResponse {
  status(code: number): VercelResponse;
  json(body: unknown): void;
}

export function send(response: VercelResponse, result: HttpResult): void {
  response.status(result.status).json(result.body);
}

export function methodNotAllowed(response: VercelResponse): void {
  response.status(405).json({ error: "method not allowed" });
}

export function readQueryString(
  value: string | string[] | undefined,
): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

/** Normaliza el body a objeto: Vercel puede entregarlo ya parseado o como string. */
export function parseBody(body: unknown): Record<string, unknown> | null {
  if (body && typeof body === "object" && !Array.isArray(body)) {
    return body as Record<string, unknown>;
  }
  if (typeof body === "string" && body.trim() !== "") {
    try {
      const parsed: unknown = JSON.parse(body);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return null;
    }
  }
  return null;
}
