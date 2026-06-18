import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { requireTrackingSecret } from "./auth.js";

const KNOWN_SECRET = "super-secret-value";

describe("requireTrackingSecret", () => {
  let originalSecret: string | undefined;

  beforeEach(() => {
    originalSecret = process.env.TRACKING_API_SECRET;
  });

  afterEach(() => {
    if (originalSecret === undefined) {
      delete process.env.TRACKING_API_SECRET;
    } else {
      process.env.TRACKING_API_SECRET = originalSecret;
    }
  });

  it("returns a 401 when the secret is not configured", () => {
    delete process.env.TRACKING_API_SECRET;

    const result = requireTrackingSecret({
      headers: { "x-tracking-secret": KNOWN_SECRET },
    });

    expect(result).not.toBeNull();
    expect(result?.status).toBe(401);
  });

  it("returns a 401 when the secret is set but the header is missing", () => {
    process.env.TRACKING_API_SECRET = KNOWN_SECRET;

    const result = requireTrackingSecret({ headers: {} });

    expect(result).not.toBeNull();
    expect(result?.status).toBe(401);
  });

  it("returns a 401 when the secret is set but the header value is wrong", () => {
    process.env.TRACKING_API_SECRET = KNOWN_SECRET;

    const result = requireTrackingSecret({
      headers: { "x-tracking-secret": "wrong-value" },
    });

    expect(result).not.toBeNull();
    expect(result?.status).toBe(401);
  });

  it("returns null when the secret matches the exact-case header", () => {
    process.env.TRACKING_API_SECRET = KNOWN_SECRET;

    const result = requireTrackingSecret({
      headers: { "x-tracking-secret": KNOWN_SECRET },
    });

    expect(result).toBeNull();
  });

  it("returns null when the secret matches a differently-cased header (case-insensitive lookup)", () => {
    process.env.TRACKING_API_SECRET = KNOWN_SECRET;

    const result = requireTrackingSecret({
      headers: { "X-Tracking-Secret": KNOWN_SECRET },
    });

    expect(result).toBeNull();
  });
});
