import { describe, expect, it } from "vitest";
import { getGoogleAdsConfig } from "./config.js";

const SERVICE_ACCOUNT_JSON = JSON.stringify({
  client_email: "google-ads@example.iam.gserviceaccount.com",
  private_key: "-----BEGIN PRIVATE KEY-----\nexample\n-----END PRIVATE KEY-----\n",
});

describe("getGoogleAdsConfig", () => {
  it("maps Polanco and Roma Norte to isolated customer accounts", () => {
    const config = getGoogleAdsConfig({
      GOOGLE_ADS_DEVELOPER_TOKEN: "developer-token",
      GOOGLE_ADS_SERVICE_ACCOUNT_JSON: SERVICE_ACCOUNT_JSON,
      GOOGLE_ADS_LOGIN_CUSTOMER_ID: "123-456-7890",
      GOOGLE_ADS_POLANCO_CUSTOMER_ID: "111-111-1111",
      GOOGLE_ADS_ROMA_CUSTOMER_ID: "222-222-2222",
    });

    expect(config.loginCustomerId).toBe("1234567890");
    expect(config.accounts).toEqual([
      { key: "polanco", name: "Polanco", customerId: "1111111111" },
      { key: "roma", name: "Roma Norte", customerId: "2222222222" },
    ]);
    expect(config.serviceAccount?.clientEmail).toBe(
      "google-ads@example.iam.gserviceaccount.com",
    );
  });

  it("is not configured when either branch account is missing", () => {
    const config = getGoogleAdsConfig({
      GOOGLE_ADS_DEVELOPER_TOKEN: "developer-token",
      GOOGLE_ADS_SERVICE_ACCOUNT_JSON: SERVICE_ACCOUNT_JSON,
      GOOGLE_ADS_LOGIN_CUSTOMER_ID: "1234567890",
      GOOGLE_ADS_POLANCO_CUSTOMER_ID: "1111111111",
    });

    expect(config.isConfigured).toBe(false);
  });

  it("rejects malformed service-account JSON without exposing its contents", () => {
    expect(() =>
      getGoogleAdsConfig({
        GOOGLE_ADS_SERVICE_ACCOUNT_JSON: "{private-secret",
      }),
    ).toThrow("GOOGLE_ADS_SERVICE_ACCOUNT_JSON is not valid JSON");
  });
});
