export class HttpRequestError extends Error {
  constructor(
    readonly status: number,
    readonly bodyText: string,
  ) {
    super(`HTTP request failed with status ${status}`);
    this.name = "HttpRequestError";
  }
}

export interface JsonRequestOptions {
  url: URL | string;
  method: string;
  headers: Record<string, string>;
  body?: unknown; // serialized as JSON when present and method !== "GET"
  fetchImpl?: typeof fetch;
  // When false, the success response body is not read or parsed and the
  // resolved value is undefined. Defaults to true (parse and return JSON).
  parseResponse?: boolean;
}

export async function jsonRequest<T = unknown>(opts: JsonRequestOptions): Promise<T> {
  const f = opts.fetchImpl ?? fetch;
  const response = await f(opts.url, {
    method: opts.method,
    headers: opts.headers,
    body:
      opts.body !== undefined && opts.method !== "GET"
        ? JSON.stringify(opts.body)
        : undefined,
  });
  if (!response.ok) {
    let text = "";
    try {
      text = await response.text();
    } catch {
      /* ignore */
    }
    throw new HttpRequestError(response.status, text);
  }
  if (opts.parseResponse === false) {
    return undefined as T;
  }
  return (await response.json()) as T;
}
