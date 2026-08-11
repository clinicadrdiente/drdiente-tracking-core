import { afterEach, describe, expect, it, vi } from "vitest";
import handler from "../../../api/dev/google-ads-summary.js";
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

describe("GET /api/dev/google-ads-summary", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("returns configured false when server-side credentials are absent", async () => {
    vi.stubEnv("TRACKING_API_SECRET", "test-secret");
    vi.stubEnv("GOOGLE_ADS_DEVELOPER_TOKEN", "");
    vi.stubEnv("GOOGLE_ADS_SERVICE_ACCOUNT_JSON", "");
    vi.stubEnv("GOOGLE_ADS_LOGIN_CUSTOMER_ID", "");
    vi.stubEnv("GOOGLE_ADS_POLANCO_CUSTOMER_ID", "");
    vi.stubEnv("GOOGLE_ADS_ROMA_CUSTOMER_ID", "");
    const request: VercelRequest = {
      method: "GET",
      headers: { "x-tracking-secret": "test-secret" },
      query: {},
    };
    const recorder = responseRecorder();

    await handler(request, recorder.response);

    expect(recorder.read()).toEqual({
      statusCode: 200,
      body: {
        ok: true,
        configured: false,
        message: "Google Ads server-side credentials are not configured.",
      },
    });
  });

  it("returns 400 for an invalid date before contacting Google", async () => {
    vi.stubEnv("TRACKING_API_SECRET", "test-secret");
    vi.stubEnv("GOOGLE_ADS_DEVELOPER_TOKEN", "developer-token");
    vi.stubEnv(
      "GOOGLE_ADS_SERVICE_ACCOUNT_JSON",
      JSON.stringify({ client_email: "test@example.com", private_key: "not-used" }),
    );
    vi.stubEnv("GOOGLE_ADS_LOGIN_CUSTOMER_ID", "1234567890");
    vi.stubEnv("GOOGLE_ADS_POLANCO_CUSTOMER_ID", "1111111111");
    vi.stubEnv("GOOGLE_ADS_ROMA_CUSTOMER_ID", "2222222222");
    const request: VercelRequest = {
      method: "GET",
      headers: { "x-tracking-secret": "test-secret" },
      query: { from: "2026-99-99", to: "2026-08-10" },
    };
    const recorder = responseRecorder();

    await handler(request, recorder.response);

    expect(recorder.read()).toEqual({
      statusCode: 400,
      body: {
        ok: false,
        configured: true,
        error: "failed to read Google Ads summary",
        details: { message: "from must be a valid YYYY-MM-DD date" },
      },
    });
  });
});
