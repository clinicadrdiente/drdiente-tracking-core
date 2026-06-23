export interface HttpResult<TBody = unknown> {
  status: number;
  body: TBody;
}

export function ok<TBody>(body: TBody, status = 200): HttpResult<TBody> {
  return { status, body };
}

export function badRequest(
  error: string,
  details?: Record<string, unknown>,
): HttpResult {
  return { status: 400, body: { error, details } };
}

export function unauthorized(error = "unauthorized"): HttpResult {
  return { status: 401, body: { error } };
}

export function serverError(
  error: string,
  details?: Record<string, unknown>,
): HttpResult {
  return { status: 500, body: { error, details } };
}
