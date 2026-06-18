import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTrackingHttpHandlers } from "./handlers.js";
import type { HttpRequest } from "./types.js";

const KNOWN_SECRET = "handlers-test-secret";

describe("TrackingHttpHandlers", () => {
  let originalSecret: string | undefined;

  beforeEach(() => {
    originalSecret = process.env.TRACKING_API_SECRET;
    process.env.TRACKING_API_SECRET = KNOWN_SECRET;
  });

  afterEach(() => {
    if (originalSecret === undefined) {
      delete process.env.TRACKING_API_SECRET;
    } else {
      process.env.TRACKING_API_SECRET = originalSecret;
    }
  });

  it("getStatus returns 200 with the correct secret header", async () => {
    const handlers = createTrackingHttpHandlers();
    const request: HttpRequest = {
      headers: { "x-tracking-secret": KNOWN_SECRET },
    };

    const response = await handlers.getStatus(request);

    expect(response.status).toBe(200);
  });

  it("getStatus returns 401 with no/wrong secret", async () => {
    const handlers = createTrackingHttpHandlers();
    const missing: HttpRequest = { headers: {} };
    const wrong: HttpRequest = {
      headers: { "x-tracking-secret": "nope" },
    };

    expect((await handlers.getStatus(missing)).status).toBe(401);
    expect((await handlers.getStatus(wrong)).status).toBe(401);
  });

  it("postLead returns 400 with correct secret but invalid body", async () => {
    const handlers = createTrackingHttpHandlers();
    const request: HttpRequest = {
      headers: { "x-tracking-secret": KNOWN_SECRET },
      body: {},
    };

    const response = await handlers.postLead(request);

    expect(response.status).toBe(400);
  });

  it("postLead returns 201 with correct secret and a valid lead body", async () => {
    const handlers = createTrackingHttpHandlers();
    const request: HttpRequest = {
      headers: { "x-tracking-secret": KNOWN_SECRET },
      body: {
        firstName: "Ana",
        phone: "5551234567",
        branch: "Polanco",
      },
    };

    const response = await handlers.postLead(request);

    expect(response.status).toBe(201);
  });
});
