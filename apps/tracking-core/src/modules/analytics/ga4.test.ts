import { describe, expect, it } from "vitest";
import { createVerify, generateKeyPairSync } from "node:crypto";
import {
  parseGa4Reports,
  signServiceAccountJwt,
  type Ga4Report,
} from "./ga4.js";

const SAMPLE: Ga4Report[] = [
  // 0 totals: visitors, pageViews, sessions, bounceRate(0-1)
  { rows: [{ metricValues: [{ value: "255" }, { value: "556" }, { value: "300" }, { value: "0.71" }] }] },
  // 1 timeseries (unsorted on purpose)
  {
    rows: [
      { dimensionValues: [{ value: "20260618" }], metricValues: [{ value: "225" }, { value: "496" }] },
      { dimensionValues: [{ value: "20260617" }], metricValues: [{ value: "30" }, { value: "60" }] },
    ],
  },
  // 2 top pages
  { rows: [{ dimensionValues: [{ value: "/dentista-roma-norte" }], metricValues: [{ value: "105" }, { value: "120" }] }] },
  // 3 sources
  { rows: [{ dimensionValues: [{ value: "google" }], metricValues: [{ value: "72" }] }] },
  // 4 countries
  { rows: [{ dimensionValues: [{ value: "Mexico" }], metricValues: [{ value: "200" }] }] },
  // 5 devices
  { rows: [{ dimensionValues: [{ value: "mobile" }], metricValues: [{ value: "180" }] }] },
];

describe("parseGa4Reports", () => {
  const a = parseGa4Reports(SAMPLE, 7);

  it("reads totals and converts bounce rate to a percentage", () => {
    expect(a.totals.visitors).toBe(255);
    expect(a.totals.pageViews).toBe(556);
    expect(a.totals.sessions).toBe(300);
    expect(a.totals.bounceRatePct).toBe(71);
  });

  it("normalizes and sorts the timeseries dates", () => {
    expect(a.timeseries).toHaveLength(2);
    expect(a.timeseries[0]).toEqual({ date: "2026-06-17", visitors: 30, pageViews: 60 });
    expect(a.timeseries[1].date).toBe("2026-06-18");
  });

  it("maps top pages, sources, countries and devices", () => {
    expect(a.topPages[0]).toEqual({ path: "/dentista-roma-norte", visitors: 105, pageViews: 120 });
    expect(a.topSources[0]).toEqual({ name: "google", visitors: 72 });
    expect(a.countries[0]).toEqual({ name: "Mexico", visitors: 200 });
    expect(a.devices[0]).toEqual({ name: "mobile", visitors: 180 });
  });

  it("is defensive against empty/missing reports", () => {
    const empty = parseGa4Reports([], 7);
    expect(empty.totals.visitors).toBe(0);
    expect(empty.totals.bounceRatePct).toBeNull();
    expect(empty.timeseries).toEqual([]);
    expect(empty.topPages).toEqual([]);
  });
});

describe("signServiceAccountJwt", () => {
  it("produces a verifiable RS256 JWT with the right claims", () => {
    const { publicKey, privateKey } = generateKeyPairSync("rsa", {
      modulusLength: 2048,
      publicKeyEncoding: { type: "spki", format: "pem" },
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
    });
    const now = 1_700_000_000;
    const jwt = signServiceAccountJwt("svc@proj.iam.gserviceaccount.com", privateKey, now);
    const [header, claim, signature] = jwt.split(".");
    expect(header && claim && signature).toBeTruthy();

    const verified = createVerify("RSA-SHA256")
      .update(`${header}.${claim}`)
      .verify(publicKey, signature, "base64url");
    expect(verified).toBe(true);

    const decoded = JSON.parse(Buffer.from(claim, "base64url").toString("utf8")) as {
      iss: string;
      aud: string;
      scope: string;
      exp: number;
    };
    expect(decoded.iss).toBe("svc@proj.iam.gserviceaccount.com");
    expect(decoded.aud).toBe("https://oauth2.googleapis.com/token");
    expect(decoded.scope).toContain("analytics.readonly");
    expect(decoded.exp).toBe(now + 3600);
  });
});
