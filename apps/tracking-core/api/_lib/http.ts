import { fromVercelRequest, type HttpResponse } from "../../src/index.js";

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

export function toHttpRequest(request: VercelRequest) {
  return fromVercelRequest(request);
}

export function send(response: VercelResponse, result: HttpResponse): void {
  response.status(result.status).json(result.body);
}

export function methodNotAllowed(response: VercelResponse): void {
  response.status(405).json({ error: "method not allowed" });
}
