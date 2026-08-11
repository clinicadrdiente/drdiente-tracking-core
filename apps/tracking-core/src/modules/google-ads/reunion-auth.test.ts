import { afterEach, describe, expect, it, vi } from "vitest";
import handler from "../../../api/dev/reunion-status-live.js";
import type { VercelRequest, VercelResponse } from "../../../api/_lib/http.js";

function responseRecorder() {
  let statusCode = 0;
  let body: unknown;
  const response: VercelResponse = {
    status(code) {
      statusCode = code;
      return response;
    },
    json(value) {
      body = value;
    },
  };
  return { response, read: () => ({ statusCode, body }) };
}

describe("GET /api/dev/reunion-status-live", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("rejects requests without the tracking secret before hydrating data", async () => {
    vi.stubEnv("TRACKING_API_SECRET", "test-secret");
    const request: VercelRequest = { method: "GET", headers: {}, query: {} };
    const recorder = responseRecorder();

    await handler(request, recorder.response);

    expect(recorder.read()).toEqual({
      statusCode: 401,
      body: { error: "unauthorized" },
    });
  });
});
