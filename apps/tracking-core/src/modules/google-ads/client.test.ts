import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { GoogleAdsClient } from "./client.js";
import type { GoogleAdsConfig } from "./config.js";

function config(): GoogleAdsConfig {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  return {
    developerToken: "developer-token",
    loginCustomerId: "1234567890",
    accounts: [
      { key: "polanco", name: "Polanco", customerId: "1111111111" },
      { key: "roma", name: "Roma Norte", customerId: "2222222222" },
    ],
    serviceAccount: {
      clientEmail: "google-ads@example.iam.gserviceaccount.com",
      privateKey: privateKey.export({ format: "pem", type: "pkcs8" }).toString(),
    },
    apiVersion: "v25",
    isConfigured: true,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("GoogleAdsClient", () => {
  it("reads Polanco and Roma separately and returns an aggregated total", async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ access_token: "access-token", expires_in: 3600 }))
      .mockResolvedValueOnce(
        jsonResponse([
          {
            results: [
              {
                customer: { currencyCode: "MXN" },
                campaign: { id: "1", name: "Implantes Polanco" },
                metrics: { impressions: "100", clicks: "10", costMicros: "2500000" },
              },
            ],
          },
        ]),
      )
      .mockResolvedValueOnce(
        jsonResponse([
          {
            results: [
              {
                customer: { currencyCode: "MXN" },
                campaign: { id: "2", name: "Implantes Roma" },
                metrics: { impressions: "200", clicks: "20", costMicros: "5000000" },
              },
            ],
          },
        ]),
      );

    const client = new GoogleAdsClient(config(), fetchFn);
    const summary = await client.getSummary({ from: "2026-08-01", to: "2026-08-10" });

    expect(summary.accounts).toEqual([
      expect.objectContaining({
        key: "polanco",
        customerId: "1111111111",
        impressions: 100,
        clicks: 10,
        spend: 2.5,
      }),
      expect.objectContaining({
        key: "roma",
        customerId: "2222222222",
        impressions: 200,
        clicks: 20,
        spend: 5,
      }),
    ]);
    expect(summary.totals).toEqual({ impressions: 300, clicks: 30, spend: 7.5 });
    expect(summary.errors).toEqual([]);

    const accountCalls = fetchFn.mock.calls.slice(1);
    expect(accountCalls[0]?.[0].toString()).toContain("customers/1111111111/googleAds:searchStream");
    expect(accountCalls[1]?.[0].toString()).toContain("customers/2222222222/googleAds:searchStream");
    expect(accountCalls[0]?.[1]?.headers).toMatchObject({
      Authorization: "Bearer access-token",
      "developer-token": "developer-token",
      "login-customer-id": "1234567890",
    });
    expect(accountCalls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal);
  });

  it("keeps Roma metrics when Polanco fails", async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ access_token: "access-token", expires_in: 3600 }))
      .mockResolvedValueOnce(jsonResponse({ error: "denied" }, 403))
      .mockResolvedValueOnce(
        jsonResponse([
          {
            results: [
              {
                customer: { currencyCode: "MXN" },
                campaign: { id: "2", name: "Roma" },
                metrics: { impressions: "200", clicks: "20", costMicros: "5000000" },
              },
            ],
          },
        ]),
      );

    const summary = await new GoogleAdsClient(config(), fetchFn).getSummary({
      from: "2026-08-01",
      to: "2026-08-10",
    });

    expect(summary.accounts).toEqual([
      expect.objectContaining({ key: "roma", impressions: 200, spend: 5 }),
    ]);
    expect(summary.errors).toEqual([
      { key: "polanco", name: "Polanco", status: 403 },
    ]);
  });

  it("rejects impossible or reversed date ranges before calling Google", async () => {
    const fetchFn = vi.fn<typeof fetch>();
    const client = new GoogleAdsClient(config(), fetchFn);

    await expect(
      client.getSummary({ from: "2026-99-99", to: "2026-08-10" }),
    ).rejects.toThrow("from must be a valid YYYY-MM-DD date");
    await expect(
      client.getSummary({ from: "2026-08-11", to: "2026-08-10" }),
    ).rejects.toThrow("from must not be after to");
    expect(fetchFn).not.toHaveBeenCalled();
  });
});
