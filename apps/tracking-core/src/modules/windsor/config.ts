export interface WindsorConfig {
  apiKey: string;
  baseUrl: string;
  defaultConnector: string;
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
    defaultFields: getEnv(
      "WINDSOR_DEFAULT_FIELDS",
      "date,source,campaign,spend,clicks,impressions,account_name,account_id,ad_account_name,ad_account_id,business_manager",
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
