import { getWindsorConfig, type WindsorConfig } from "./config.js";

export interface WindsorMarketingRow {
  date?: string | null;
  datasource?: string | null;
  source?: string | null;
  campaign?: string | null;
  campaignId?: string | null;
  campaignName?: string | null;
  accountName?: string | null;
  accountId?: string | null;
  adAccountName?: string | null;
  adAccountId?: string | null;
  businessManager?: string | null;
  spend?: number;
  clicks?: number;
  impressions?: number;
  reach?: number;
  videoTrueviewViews?: number;
  currency?: string | null;
  accountCurrency?: string | null;
}

export interface WindsorSourceSummary {
  source: string;
  spend: number;
  clicks: number;
  impressions: number;
  reach: number;
  videoTrueviewViews: number;
  campaigns: number;
}

export interface WindsorAccountSummary {
  key: string;
  accountName: string | null;
  accountId: string | null;
  adAccountName: string | null;
  adAccountId: string | null;
  businessManager: string | null;
  sources: string[];
  campaigns: string[];
  rows: number;
  spend: number;
  clicks: number;
  impressions: number;
  reach: number;
  videoTrueviewViews: number;
}

export interface WindsorDateOptions {
  datePreset?: string;
  /** YYYY-MM-DD — when both dateFrom and dateTo are set they win over datePreset. */
  dateFrom?: string;
  dateTo?: string;
}

export interface WindsorSearchConsoleRow {
  page: string | null;
  query: string | null;
  clicks: number;
  impressions: number;
  position: number | null;
}

export interface WindsorSearchConsoleReport {
  connector: string;
  dimension: "page" | "query";
  dateFrom: string | null;
  dateTo: string | null;
  datePreset: string | null;
  rowCount: number;
  rows: WindsorSearchConsoleRow[];
  totals: {
    clicks: number;
    impressions: number;
  };
}

export interface WindsorMarketingSummary {
  connector: string;
  datePreset: string;
  dateFrom?: string | null;
  dateTo?: string | null;
  filters: {
    includeText: string[];
    excludeText: string[];
  };
  rawRowCount: number;
  filteredRowCount: number;
  rows: WindsorMarketingRow[];
  totals: {
    spend: number;
    clicks: number;
    impressions: number;
    reach: number;
    videoTrueviewViews: number;
  };
  bySource: WindsorSourceSummary[];
}

export class WindsorRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "WindsorRequestError";
  }
}

export class WindsorClient {
  constructor(private readonly config: WindsorConfig = getWindsorConfig()) {}

  isConfigured(): boolean {
    return Boolean(this.config.apiKey);
  }

  async listConnectors(): Promise<unknown> {
    const url = new URL(
      "list_connectors",
      normalizeBaseUrl(this.config.baseUrl),
    );
    if (this.config.apiKey) {
      url.searchParams.set("api_key", this.config.apiKey);
    }

    return this.request(url);
  }

  async getMarketingSummary(
    options?: string | WindsorDateOptions,
  ): Promise<WindsorMarketingSummary> {
    const dateOptions = normalizeDateOptions(options);
    const connector = this.config.defaultConnector;
    const resolvedDatePreset =
      dateOptions.datePreset ?? this.config.defaultDatePreset;
    const url = new URL(connector, normalizeBaseUrl(this.config.baseUrl));
    url.searchParams.set("api_key", this.config.apiKey);
    url.searchParams.set("fields", this.config.defaultFields.join(","));
    applyDateParams(url, dateOptions, resolvedDatePreset);
    url.searchParams.set("_max_rows", "500");

    const body = await this.request(url);
    const rawRows = readRows(body).map(normalizeMarketingRow);
    const rows = rawRows.filter((row) =>
      rowMatchesTextFilters(row, this.config),
    );

    return {
      connector,
      datePreset: resolvedDatePreset,
      dateFrom: dateOptions.dateFrom ?? null,
      dateTo: dateOptions.dateTo ?? null,
      filters: {
        includeText: this.config.includeTextFilters,
        excludeText: this.config.excludeTextFilters,
      },
      rawRowCount: rawRows.length,
      filteredRowCount: rows.length,
      rows,
      totals: {
        spend: rows.reduce((sum, row) => sum + (row.spend ?? 0), 0),
        clicks: rows.reduce((sum, row) => sum + (row.clicks ?? 0), 0),
        impressions: rows.reduce((sum, row) => sum + (row.impressions ?? 0), 0),
        reach: rows.reduce((sum, row) => sum + (row.reach ?? 0), 0),
        videoTrueviewViews: rows.reduce(
          (sum, row) => sum + (row.videoTrueviewViews ?? 0),
          0,
        ),
      },
      bySource: summarizeBySource(rows),
    };
  }

  async getAccountSummaries(datePreset?: string): Promise<{
    connector: string;
    datePreset: string;
    rowCount: number;
    accounts: WindsorAccountSummary[];
  }> {
    const connector = this.config.defaultConnector;
    const resolvedDatePreset = datePreset ?? this.config.defaultDatePreset;
    const url = new URL(connector, normalizeBaseUrl(this.config.baseUrl));
    url.searchParams.set("api_key", this.config.apiKey);
    url.searchParams.set("fields", this.config.defaultFields.join(","));
    url.searchParams.set("date_preset", resolvedDatePreset);
    url.searchParams.set("_max_rows", "500");

    const body = await this.request(url);
    const rows = readRows(body).map(normalizeMarketingRow);

    return {
      connector,
      datePreset: resolvedDatePreset,
      rowCount: rows.length,
      accounts: summarizeAccounts(rows),
    };
  }

  /**
   * Organic search data from the Windsor `searchconsole` connector,
   * aggregated by page or by query over the requested range.
   */
  async getSearchConsoleReport(
    options: WindsorDateOptions & { dimension: "page" | "query" },
  ): Promise<WindsorSearchConsoleReport> {
    const connector = "searchconsole";
    const dateOptions = normalizeDateOptions(options);
    const resolvedDatePreset =
      dateOptions.datePreset ?? this.config.defaultDatePreset;
    const url = new URL(connector, normalizeBaseUrl(this.config.baseUrl));
    url.searchParams.set("api_key", this.config.apiKey);
    url.searchParams.set(
      "fields",
      `${options.dimension},clicks,impressions,position`,
    );
    applyDateParams(url, dateOptions, resolvedDatePreset);
    url.searchParams.set("_max_rows", "3000");

    const body = await this.request(url);
    const rows = aggregateSearchConsoleRows(readRows(body), options.dimension);

    return {
      connector,
      dimension: options.dimension,
      dateFrom: dateOptions.dateFrom ?? null,
      dateTo: dateOptions.dateTo ?? null,
      datePreset:
        dateOptions.dateFrom && dateOptions.dateTo ? null : resolvedDatePreset,
      rowCount: rows.length,
      rows,
      totals: {
        clicks: rows.reduce((sum, row) => sum + row.clicks, 0),
        impressions: rows.reduce((sum, row) => sum + row.impressions, 0),
      },
    };
  }

  private async request(url: URL): Promise<unknown> {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "User-Agent": "Windsor/1.0",
      },
    });

    const contentType = response.headers.get("content-type") ?? "";
    const body = contentType.includes("application/json")
      ? ((await response.json()) as unknown)
      : await response.text();

    if (!response.ok) {
      throw new WindsorRequestError(
        `Windsor request failed with status ${response.status}`,
        response.status,
      );
    }

    return body;
  }
}

export function createWindsorClient(): WindsorClient {
  return new WindsorClient();
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
}

function normalizeDateOptions(
  options?: string | WindsorDateOptions,
): WindsorDateOptions {
  if (typeof options === "string") {
    return { datePreset: options };
  }

  return options ?? {};
}

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function applyDateParams(
  url: URL,
  options: WindsorDateOptions,
  fallbackPreset: string,
): void {
  const hasRange =
    options.dateFrom !== undefined &&
    options.dateTo !== undefined &&
    ISO_DATE_PATTERN.test(options.dateFrom) &&
    ISO_DATE_PATTERN.test(options.dateTo);

  if (hasRange) {
    url.searchParams.set("date_from", options.dateFrom as string);
    url.searchParams.set("date_to", options.dateTo as string);
    return;
  }

  url.searchParams.set("date_preset", options.datePreset ?? fallbackPreset);
}

function aggregateSearchConsoleRows(
  rawRows: Record<string, unknown>[],
  dimension: "page" | "query",
): WindsorSearchConsoleRow[] {
  const groups = new Map<
    string,
    {
      clicks: number;
      impressions: number;
      positionSum: number;
      positionCount: number;
    }
  >();

  for (const raw of rawRows) {
    const key = readString(raw, dimension) ?? "";
    if (!key) continue;
    const group = groups.get(key) ?? {
      clicks: 0,
      impressions: 0,
      positionSum: 0,
      positionCount: 0,
    };
    group.clicks += readNumber(raw, "clicks");
    group.impressions += readNumber(raw, "impressions");
    const position = readNumber(raw, "position");
    if (position > 0) {
      group.positionSum += position;
      group.positionCount += 1;
    }
    groups.set(key, group);
  }

  return [...groups.entries()]
    .map(([key, group]) => ({
      page: dimension === "page" ? key : null,
      query: dimension === "query" ? key : null,
      clicks: group.clicks,
      impressions: group.impressions,
      position:
        group.positionCount > 0
          ? Math.round((group.positionSum / group.positionCount) * 10) / 10
          : null,
    }))
    .sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions);
}

function readRows(body: unknown): Record<string, unknown>[] {
  if (Array.isArray(body)) {
    return body.filter(isRecord);
  }

  if (isRecord(body) && Array.isArray(body.data)) {
    return body.data.filter(isRecord);
  }

  return [];
}

function normalizeMarketingRow(
  row: Record<string, unknown>,
): WindsorMarketingRow {
  return {
    date: readString(row, "date"),
    datasource: readString(row, "datasource"),
    source: readFirstString(row, ["source", "datasource"]),
    campaign: readFirstString(row, ["campaign_name", "campaign"]),
    campaignId: readString(row, "campaign_id"),
    campaignName: readString(row, "campaign_name"),
    accountName: readFirstString(row, ["account_name", "account"]),
    accountId: readFirstString(row, ["account_id"]),
    adAccountName: readFirstString(row, ["ad_account_name", "adaccount_name"]),
    adAccountId: readFirstString(row, ["ad_account_id", "adaccount_id"]),
    businessManager: readFirstString(row, [
      "business_manager",
      "business_manager_name",
      "business_name",
    ]),
    spend: readNumber(row, "spend"),
    clicks: readNumber(row, "clicks"),
    impressions: readNumber(row, "impressions"),
    reach: readNumber(row, "reach"),
    videoTrueviewViews: readNumber(row, "video_trueview_views"),
    currency: readString(row, "currency"),
    accountCurrency: readString(row, "account_currency"),
  };
}

function rowMatchesTextFilters(
  row: WindsorMarketingRow,
  config: WindsorConfig,
): boolean {
  const searchableText = [
    row.source,
    row.datasource,
    row.campaign,
    row.campaignId,
    row.campaignName,
    row.accountName,
    row.accountId,
    row.adAccountName,
    row.adAccountId,
    row.businessManager,
  ]
    .filter((value): value is string => Boolean(value))
    .join(" ")
    .toLowerCase();

  const hasIncludeMatch =
    config.includeTextFilters.length === 0 ||
    config.includeTextFilters.some((filter) => searchableText.includes(filter));
  const hasExcludeMatch = config.excludeTextFilters.some((filter) =>
    searchableText.includes(filter),
  );

  return hasIncludeMatch && !hasExcludeMatch;
}

function summarizeBySource(
  rows: WindsorMarketingRow[],
): WindsorSourceSummary[] {
  const groups = new Map<string, WindsorMarketingRow[]>();

  for (const row of rows) {
    const source = row.source?.trim() || "Sin fuente";
    const sourceRows = groups.get(source) ?? [];
    sourceRows.push(row);
    groups.set(source, sourceRows);
  }

  return [...groups.entries()]
    .map(([source, sourceRows]) => ({
      source,
      spend: sourceRows.reduce((sum, row) => sum + (row.spend ?? 0), 0),
      clicks: sourceRows.reduce((sum, row) => sum + (row.clicks ?? 0), 0),
      impressions: sourceRows.reduce(
        (sum, row) => sum + (row.impressions ?? 0),
        0,
      ),
      reach: sourceRows.reduce((sum, row) => sum + (row.reach ?? 0), 0),
      videoTrueviewViews: sourceRows.reduce(
        (sum, row) => sum + (row.videoTrueviewViews ?? 0),
        0,
      ),
      campaigns: new Set(
        sourceRows
          .map((row) => row.campaign)
          .filter((campaign): campaign is string => Boolean(campaign)),
      ).size,
    }))
    .sort((a, b) => b.spend - a.spend);
}

function summarizeAccounts(
  rows: WindsorMarketingRow[],
): WindsorAccountSummary[] {
  const groups = new Map<string, WindsorMarketingRow[]>();

  for (const row of rows) {
    const key =
      [
        row.accountId,
        row.adAccountId,
        row.businessManager,
        row.accountName,
        row.adAccountName,
        row.source,
      ]
        .filter((value): value is string => Boolean(value))
        .join(" | ") || "Sin cuenta detectada";
    const accountRows = groups.get(key) ?? [];
    accountRows.push(row);
    groups.set(key, accountRows);
  }

  return [...groups.entries()]
    .map(([key, accountRows]) => {
      const first = accountRows[0] ?? {};
      return {
        key,
        accountName: first.accountName ?? null,
        accountId: first.accountId ?? null,
        adAccountName: first.adAccountName ?? null,
        adAccountId: first.adAccountId ?? null,
        businessManager: first.businessManager ?? null,
        sources: uniqueStrings(accountRows.map((row) => row.source)).slice(
          0,
          10,
        ),
        campaigns: uniqueStrings(accountRows.map((row) => row.campaign)).slice(
          0,
          10,
        ),
        rows: accountRows.length,
        spend: accountRows.reduce((sum, row) => sum + (row.spend ?? 0), 0),
        clicks: accountRows.reduce((sum, row) => sum + (row.clicks ?? 0), 0),
        impressions: accountRows.reduce(
          (sum, row) => sum + (row.impressions ?? 0),
          0,
        ),
        reach: accountRows.reduce((sum, row) => sum + (row.reach ?? 0), 0),
        videoTrueviewViews: accountRows.reduce(
          (sum, row) => sum + (row.videoTrueviewViews ?? 0),
          0,
        ),
      };
    })
    .sort((a, b) => b.spend - a.spend);
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return [
    ...new Set(values.filter((value): value is string => Boolean(value))),
  ];
}

function readString(
  record: Record<string, unknown>,
  key: string,
): string | null {
  const value = record[key];
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function readFirstString(
  record: Record<string, unknown>,
  keys: string[],
): string | null {
  for (const key of keys) {
    const value = readString(record, key);
    if (value) {
      return value;
    }
  }

  return null;
}

function readNumber(record: Record<string, unknown>, key: string): number {
  const value = record[key];

  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
