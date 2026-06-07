export interface WindsorConfig {
  apiKey: string;
  baseUrl: string;
  defaultConnector: string;
  defaultDatePreset: string;
  defaultFields: string[];
  includeTextFilters: string[];
  excludeTextFilters: string[];
}

function getEnv(name: string, fallback = ""): string {
  return process.env[name] ?? fallback;
}

export function getWindsorConfig(): WindsorConfig {
  return {
    apiKey: getEnv("WINDSOR_API_KEY"),
    baseUrl: getEnv("WINDSOR_BASE_URL", "https://connectors.windsor.ai"),
    defaultConnector: getEnv("WINDSOR_DEFAULT_CONNECTOR", "all"),
    defaultDatePreset: getEnv("WINDSOR_DATE_PRESET", "last_180d"),
    defaultFields: getEnv(
      "WINDSOR_DEFAULT_FIELDS",
      "date,datasource,account_name,source,campaign,clicks,spend,account_id,reach,video_trueview_views,currency,account_currency,campaign_id,campaign_name,impressions",
    )
      .split(",")
      .map((field) => field.trim())
      .filter(Boolean),
    includeTextFilters: parseCsvEnv("WINDSOR_INCLUDE_TEXT"),
    excludeTextFilters: parseCsvEnv("WINDSOR_EXCLUDE_TEXT"),
  };
}

function parseCsvEnv(name: string): string[] {
  return getEnv(name)
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}
