import { getAgentConfig, type WindsorConfig } from "../../config.js";

export interface WindsorPlatform {
  source: string;
  impressions: number;
  clicks: number;
  spend: number;
  reach: number;
}

export interface WindsorSummary {
  platforms: WindsorPlatform[];
  totals: { impressions: number; clicks: number; spend: number; reach: number };
}

/**
 * Cliente Windsor enfocado: trae impresiones, clics, spend y reach por plataforma
 * para un día (YYYY-MM-DD). No-op-friendly: `isConfigured()` es false sin api key.
 */
export class WindsorClient {
  constructor(private readonly config: WindsorConfig = getAgentConfig().windsor) {}

  isConfigured(): boolean {
    return Boolean(this.config.apiKey);
  }

  async getDailySummary(date: string): Promise<WindsorSummary> {
    const base = this.config.baseUrl.endsWith("/")
      ? this.config.baseUrl
      : `${this.config.baseUrl}/`;
    const url = new URL(this.config.connector, base);
    url.searchParams.set("api_key", this.config.apiKey ?? "");
    url.searchParams.set("fields", this.config.fields.join(","));
    url.searchParams.set("date_from", date);
    url.searchParams.set("date_to", date);
    url.searchParams.set("_max_rows", "500");

    const response = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json", "User-Agent": "agente-nube/1.0" },
    });
    if (!response.ok) {
      throw new Error(`windsor ${response.status}`);
    }
    const body: unknown = await response.json();
    const rows = readRows(body)
      .map((row) => normalizeRow(row))
      .filter((row) => matchesFilters(row, this.config));

    return summarize(rows);
  }
}

export function createWindsorClient(): WindsorClient {
  return new WindsorClient();
}

interface NormalizedRow {
  source: string;
  impressions: number;
  clicks: number;
  spend: number;
  reach: number;
  searchable: string;
}

function summarize(rows: NormalizedRow[]): WindsorSummary {
  const groups = new Map<string, WindsorPlatform>();
  const totals = { impressions: 0, clicks: 0, spend: 0, reach: 0 };

  for (const row of rows) {
    const current = groups.get(row.source) ?? {
      source: row.source,
      impressions: 0,
      clicks: 0,
      spend: 0,
      reach: 0,
    };
    current.impressions += row.impressions;
    current.clicks += row.clicks;
    current.spend += row.spend;
    current.reach += row.reach;
    groups.set(row.source, current);

    totals.impressions += row.impressions;
    totals.clicks += row.clicks;
    totals.spend += row.spend;
    totals.reach += row.reach;
  }

  const platforms = [...groups.values()].sort((a, b) => b.spend - a.spend);
  return { platforms, totals };
}

function readRows(body: unknown): Record<string, unknown>[] {
  if (Array.isArray(body)) return body.filter(isRecord);
  if (isRecord(body) && Array.isArray(body.data)) return body.data.filter(isRecord);
  return [];
}

function normalizeRow(row: Record<string, unknown>): NormalizedRow {
  const source =
    readString(row, "source") ?? readString(row, "datasource") ?? "Sin fuente";
  const searchable = [
    source,
    readString(row, "campaign"),
    readString(row, "campaign_name"),
    readString(row, "account_name"),
    readString(row, "ad_account_name"),
  ]
    .filter((value): value is string => Boolean(value))
    .join(" ")
    .toLowerCase();

  return {
    source,
    impressions: readNumber(row, "impressions"),
    clicks: readNumber(row, "clicks"),
    spend: readNumber(row, "spend"),
    reach: readNumber(row, "reach"),
    searchable,
  };
}

function matchesFilters(row: NormalizedRow, config: WindsorConfig): boolean {
  const hasInclude =
    config.includeText.length === 0 ||
    config.includeText.some((filter) => row.searchable.includes(filter));
  const hasExclude = config.excludeText.some((filter) =>
    row.searchable.includes(filter),
  );
  return hasInclude && !hasExclude;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function readNumber(record: Record<string, unknown>, key: string): number {
  const value = record[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}
