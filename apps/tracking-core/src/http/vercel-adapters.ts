import type { HttpRequest } from "./types.js";

export interface VercelLikeRequest {
  body?: unknown;
  query?: Record<string, string | string[] | undefined>;
  headers?: Record<string, string | undefined>;
}

export function fromVercelRequest(request: VercelLikeRequest): HttpRequest {
  return {
    body: request.body,
    headers: request.headers,
    query: normalizeQuery(request.query),
  };
}

function normalizeQuery(
  query?: Record<string, string | string[] | undefined>,
): Record<string, string | undefined> {
  if (!query) {
    return {};
  }

  const normalized: Record<string, string | undefined> = {};

  for (const [key, value] of Object.entries(query)) {
    normalized[key] = Array.isArray(value) ? value[0] : value;
  }

  return normalized;
}
