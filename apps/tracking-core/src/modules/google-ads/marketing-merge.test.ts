import { describe, expect, it } from "vitest";
import { mergeDirectGoogleAds } from "./marketing-merge.js";

describe("mergeDirectGoogleAds", () => {
  it("replaces only Windsor rows matching direct Google Ads customer IDs", () => {
    const result = mergeDirectGoogleAds(
      [
        {
          source: "google_ads",
          accountId: "111-111-1111",
          impressions: 999,
          clicks: 99,
          spend: 999,
        },
        {
          source: "paid_search",
          accountId: "2222222222",
          impressions: 888,
          clicks: 88,
          spend: 888,
        },
        {
          source: "facebook",
          accountId: "meta-1",
          impressions: 500,
          clicks: 50,
          spend: 100,
        },
        {
          source: "google_organic",
          accountId: "search-console",
          impressions: 30,
          clicks: 3,
          spend: 0,
        },
      ],
      [
        {
          name: "Polanco",
          customerId: "1111111111",
          impressions: 100,
          clicks: 10,
          spend: 25,
        },
        {
          name: "Roma Norte",
          customerId: "2222222222",
          impressions: 200,
          clicks: 20,
          spend: 50,
        },
      ],
    );

    expect(result.bySource).toEqual([
      { source: "facebook", impressions: 500, clicks: 50, spend: 100 },
      { source: "google_organic", impressions: 30, clicks: 3, spend: 0 },
      { source: "Google Ads · Polanco", impressions: 100, clicks: 10, spend: 25 },
      { source: "Google Ads · Roma Norte", impressions: 200, clicks: 20, spend: 50 },
    ]);
    expect(result.totals).toEqual({ impressions: 830, clicks: 83, spend: 175 });
  });
});
