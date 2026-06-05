import type { ErrorBody, HttpResponse } from "./types.js";

export function ok<TBody>(body: TBody, status = 200): HttpResponse<TBody> {
  return { status, body };
}

export function badRequest(
  error: string,
  details?: Record<string, unknown>,
): HttpResponse<ErrorBody> {
  return {
    status: 400,
    body: { error, details },
  };
}

export function serverError(
  error: string,
  details?: Record<string, unknown>,
): HttpResponse<ErrorBody> {
  return {
    status: 500,
    body: { error, details },
  };
}
