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

  it("serves the aggregate reunion summary without a browser secret", async () => {
    vi.stubEnv("TRACKING_API_SECRET", "");
    vi.stubEnv("WINDSOR_API_KEY", "");
    vi.stubEnv("GOOGLE_ADS_DEVELOPER_TOKEN", "");
    vi.stubEnv("DENTALINK_MODE", "stub");
    vi.stubEnv("SUPABASE_URL", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    const request: VercelRequest = { method: "GET", headers: {}, query: {} };
    const recorder = responseRecorder();

    await handler(request, recorder.response);

    expect(recorder.read().statusCode).toBe(200);
    expect(recorder.read().body).toEqual(expect.objectContaining({
      ok: true,
      range: expect.objectContaining({ days: 7 }),
      sources: expect.objectContaining({ dentalink: "stub" }),
    }));
  });
});
