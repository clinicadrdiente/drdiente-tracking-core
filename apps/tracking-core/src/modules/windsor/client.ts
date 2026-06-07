import { getWindsorConfig, type WindsorConfig } from "./config.js";

export interface WindsorMarketingRow {
  date?: string | null;
  source?: string | null;
  campaign?: string | null;
  spend?: number;
  clicks?: number;
  impressions?: number;
}

export interface WindsorSourceSummary {
  source: string;
  spend: number;
  clicks: number;
  impressions: number;
  campaigns: number;
}

export interface WindsorMarketingSummary {
  connector: string;
  datePreset: string;
  rows: WindsorMarketingRow[];
  totals: {
    spend: number;
    clicks: number;
    impressions: number;
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
    const url = new URL("list_connectors", normalizeBaseUrl(this.config.baseUrl));
    if (this.config.apiKey) {
      url.searchParams.set("api_key", this.config.apiKey);
    }

    return this.request(url);
  }

  async getMarketingSummary(
    datePreset = "last_30d",
  ): Promise<WindsorMarketingSummary> {
    const connector = this.config.defaultConnector;
    const url = new URL(connector, normalizeBaseUrl(this.config.baseUrl));
    url.searchParams.set("api_key", this.config.apiKey);
    url.searchParams.set("fields", this.config.defaultFields.join(","));
    url.searchParams.set("date_preset", datePreset);
    url.searchParams.set("_max_rows", "500");

    const body = await this.request(url);
    const rows = readRows(body).map(normalizeMarketingRow);

    return {
      connector,
      datePreset,
      rows,
      totals: {
        spend: rows.reduce((sum, row) => sum + (row.spend ?? 0), 0),
        clicks: rows.reduce((sum, row) => sum + (row.clicks ?? 0), 0),
        impressions: rows.reduce((sum, row) => sum + (row.impressions ?? 0), 0),
      },
      bySource: summarizeBySource(rows),
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

function readRows(body: unknown): Record<string, unknown>[] {
  if (Array.isArray(body)) {
    return body.filter(isRecord);
  }

  if (isRecord(body) && Array.isArray(body.data)) {
    return body.data.filter(isRecord);
  }

  return [];
}

function normalizeMarketingRow(row: Record<string, unknown>): WindsorMarketingRow {
  return {
    date: readString(row, "date"),
    source: readString(row, "source"),
    campaign: readString(row, "campaign"),
    spend: readNumber(row, "spend"),
    clicks: readNumber(row, "clicks"),
    impressions: readNumber(row, "impressions"),
  };
}

function summarizeBySource(rows: WindsorMarketingRow[]): WindsorSourceSummary[] {
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
      impressions: sourceRows.reduce((sum, row) => sum + (row.impressions ?? 0), 0),
      campaigns: new Set(
        sourceRows.map((row) => row.campaign).filter((campaign): campaign is string =>
          Boolean(campaign),
        ),
      ).size,
    }))
    .sort((a, b) => b.spend - a.spend);
}

function readString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
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
