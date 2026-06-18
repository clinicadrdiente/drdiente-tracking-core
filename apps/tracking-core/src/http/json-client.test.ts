import { describe, expect, it } from "vitest";
import { HttpRequestError, jsonRequest } from "./json-client.js";

interface RecordedCall {
  url: URL | string;
  init: RequestInit | undefined;
}

function makeFetch(
  response: Response,
  recorded: RecordedCall[],
): typeof fetch {
  return (async (url: URL | string, init?: RequestInit) => {
    recorded.push({ url, init });
    return response;
  }) as unknown as typeof fetch;
}

function okJsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

describe("jsonRequest", () => {
  it("returns parsed JSON on a successful response", async () => {
    const recorded: RecordedCall[] = [];
    const fetchImpl = makeFetch(okJsonResponse({ id: 42, name: "demo" }), recorded);

    const result = await jsonRequest<{ id: number; name: string }>({
      url: "https://example.test/resource",
      method: "GET",
      headers: { Accept: "application/json" },
      fetchImpl,
    });

    expect(result).toEqual({ id: 42, name: "demo" });
    expect(recorded).toHaveLength(1);
  });

  it("throws HttpRequestError with the status and body text on a non-ok response", async () => {
    const recorded: RecordedCall[] = [];
    const fetchImpl = makeFetch(
      new Response("upstream exploded", { status: 503 }),
      recorded,
    );

    await expect(
      jsonRequest({
        url: "https://example.test/resource",
        method: "GET",
        headers: {},
        fetchImpl,
      }),
    ).rejects.toMatchObject({
      name: "HttpRequestError",
      status: 503,
      bodyText: "upstream exploded",
    });

    const error = await jsonRequest({
      url: "https://example.test/resource",
      method: "GET",
      headers: {},
      fetchImpl: makeFetch(
        new Response("upstream exploded", { status: 503 }),
        [],
      ),
    }).catch((err: unknown) => err);
    expect(error).toBeInstanceOf(HttpRequestError);
  });

  it("sends no body for GET requests even when a body is provided", async () => {
    const recorded: RecordedCall[] = [];
    const fetchImpl = makeFetch(okJsonResponse({}), recorded);

    await jsonRequest({
      url: "https://example.test/resource",
      method: "GET",
      headers: {},
      body: { ignored: true },
      fetchImpl,
    });

    expect(recorded[0]?.init?.body).toBeUndefined();
  });

  it("serializes the body as JSON for POST requests", async () => {
    const recorded: RecordedCall[] = [];
    const fetchImpl = makeFetch(okJsonResponse({}), recorded);

    await jsonRequest({
      url: "https://example.test/resource",
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: { hello: "world" },
      fetchImpl,
    });

    expect(recorded[0]?.init?.method).toBe("POST");
    expect(recorded[0]?.init?.body).toBe(JSON.stringify({ hello: "world" }));
  });

  it("does not read or parse the response body when parseResponse is false", async () => {
    const recorded: RecordedCall[] = [];
    const fetchImpl = makeFetch(
      new Response("not json at all", { status: 200 }),
      recorded,
    );

    const result = await jsonRequest({
      url: "https://example.test/resource",
      method: "POST",
      headers: {},
      body: { ping: true },
      fetchImpl,
      parseResponse: false,
    });

    expect(result).toBeUndefined();
  });
});
