import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import {
  CLIENT_SESSION_COOKIE,
  buildSessionCookie,
  requireClientSession,
  signClientSession,
  verifyClientCredentials,
  verifyClientSessionToken,
} from "./client-auth.js";

const PASS = "ClaveSegura123";
const HASH = createHash("sha256").update(PASS).digest("hex");
const NOW = 1_750_000_000_000;

beforeEach(() => {
  process.env.CLIENT_USERNAME = "cliente";
  process.env.CLIENT_PASSWORD_HASH = HASH;
  process.env.CLIENT_SESSION_SECRET = "test-session-secret-abc123";
  delete process.env.VERCEL;
});

afterEach(() => {
  delete process.env.CLIENT_USERNAME;
  delete process.env.CLIENT_PASSWORD_HASH;
  delete process.env.CLIENT_SESSION_SECRET;
});

describe("verifyClientCredentials", () => {
  it("accepts the correct username + password", () => {
    expect(verifyClientCredentials("cliente", PASS)).toBe(true);
  });
  it("rejects a wrong password", () => {
    expect(verifyClientCredentials("cliente", "wrong")).toBe(false);
  });
  it("rejects a wrong username", () => {
    expect(verifyClientCredentials("otro", PASS)).toBe(false);
  });
  it("rejects when credentials are not configured", () => {
    delete process.env.CLIENT_PASSWORD_HASH;
    expect(verifyClientCredentials("cliente", PASS)).toBe(false);
  });
});

describe("client session token", () => {
  it("signs a token that verifies within its TTL", () => {
    const token = signClientSession(NOW);
    expect(verifyClientSessionToken(token, NOW + 1000)).toBe(true);
  });
  it("rejects a tampered signature", () => {
    const token = signClientSession(NOW);
    const tampered = `${token.slice(0, -2)}xx`;
    expect(verifyClientSessionToken(tampered, NOW + 1000)).toBe(false);
  });
  it("rejects an expired token", () => {
    const token = signClientSession(NOW);
    expect(verifyClientSessionToken(token, NOW + 13 * 60 * 60 * 1000)).toBe(false);
  });
  it("rejects a token signed with a different secret", () => {
    const token = signClientSession(NOW);
    process.env.CLIENT_SESSION_SECRET = "a-different-secret";
    expect(verifyClientSessionToken(token, NOW + 1000)).toBe(false);
  });
});

describe("requireClientSession (isolation guard)", () => {
  it("returns 401 when there is no session cookie", () => {
    const res = requireClientSession({ headers: {} }, NOW);
    expect(res?.status).toBe(401);
  });

  it("returns null (authorized) for a valid session cookie", () => {
    const token = signClientSession(NOW);
    const cookie = buildSessionCookie(token).split(";")[0]; // name=token
    const res = requireClientSession({ headers: { cookie } }, NOW + 1000);
    expect(res).toBeNull();
  });

  it("does NOT accept the internal tracking secret as a client session", () => {
    // A request carrying x-tracking-secret but no client cookie must be 401:
    // the client surface is fully separate from the marketing secret.
    process.env.TRACKING_API_SECRET = "super-secret-internal";
    const res = requireClientSession(
      { headers: { "x-tracking-secret": "super-secret-internal" } },
      NOW,
    );
    expect(res?.status).toBe(401);
    delete process.env.TRACKING_API_SECRET;
  });

  it("uses the documented cookie name", () => {
    expect(CLIENT_SESSION_COOKIE).toBe("drdiente_client_session");
  });
});
