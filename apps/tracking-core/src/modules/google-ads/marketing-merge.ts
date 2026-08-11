export interface WindsorMarketingMetricRow {
  source?: string | null;
  datasource?: string | null;
  accountId?: string | null;
  impressions?: number;
  clicks?: number;
  spend?: number;
}

export interface MarketingSourceMetrics {
  source: string;
  impressions: number;
  clicks: number;
  spend: number;
}

export interface DirectGoogleAccountMetrics {
  name: string;
  customerId: string;
  impressions: number;
  clicks: number;
  spend: number;
}

export function mergeDirectGoogleAds(
  existingRows: WindsorMarketingMetricRow[],
  accounts: DirectGoogleAccountMetrics[],
): {
  bySource: MarketingSourceMetrics[];
  totals: { impressions: number; clicks: number; spend: number };
} {
  const directCustomerIds = new Set(
    accounts.map((account) => normalizeId(account.customerId)),
  );
  const grouped = new Map<string, MarketingSourceMetrics>();

  for (const row of existingRows) {
    const accountId = normalizeId(row.accountId ?? "");
    if (accountId && directCustomerIds.has(accountId)) continue;

    const source = row.source?.trim() || row.datasource?.trim() || "unknown";
    const current = grouped.get(source) ?? {
      source,
      impressions: 0,
      clicks: 0,
      spend: 0,
    };
    current.impressions += numberValue(row.impressions);
    current.clicks += numberValue(row.clicks);
    current.spend += numberValue(row.spend);
    grouped.set(source, current);
  }

  const bySource = [
    ...grouped.values(),
    ...accounts.map((account) => ({
      source: `Google Ads · ${account.name}`,
      impressions: account.impressions,
      clicks: account.clicks,
      spend: account.spend,
    })),
  ];

  return {
    bySource,
    totals: {
      impressions: bySource.reduce((sum, item) => sum + item.impressions, 0),
      clicks: bySource.reduce((sum, item) => sum + item.clicks, 0),
      spend: bySource.reduce((sum, item) => sum + item.spend, 0),
    },
  };
}

function normalizeId(value: string): string {
  return value.replace(/\D/g, "");
}

function numberValue(value: number | undefined): number {
  return Number.isFinite(value) ? value! : 0;
}
