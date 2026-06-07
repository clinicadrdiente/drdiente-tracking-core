export interface WindsorConfig {
  apiKey: string;
  baseUrl: string;
  defaultConnector: string;
  defaultDatePreset: string;
  defaultFields: string[];
  includeTextFilters: string[];
  excludeTextFilters: string[];
}

const FINAL_WINDSOR_FIELDS = [
  "date",
  "datasource",
  "account_name",
  "source",
  "campaign",
  "clicks",
  "spend",
  "account_id",
  "reach",
  "video_trueview_views",
  "currency",
  "account_currency",
  "campaign_id",
  "campaign_name",
  "impressions",
];

const DEPRECATED_WINDSOR_FIELDS = new Set([
  "sessions",
  "screen_page_views",
  "total_pageview",
  "all_conversions",
]);

function getEnv(name: string, fallback = ""): string {
  return process.env[name] ?? fallback;
}

export function getWindsorConfig(): WindsorConfig {
  return {
    apiKey: getEnv("WINDSOR_API_KEY"),
    baseUrl: getEnv("WINDSOR_BASE_URL", "https://connectors.windsor.ai"),
    defaultConnector: getEnv("WINDSOR_DEFAULT_CONNECTOR", "all"),
    defaultDatePreset: getEnv("WINDSOR_DATE_PRESET", "last_180d"),
    defaultFields: normalizeWindsorFields(getEnv("WINDSOR_DEFAULT_FIELDS")),
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

function normalizeWindsorFields(rawFields: string): string[] {
  const configuredFields = rawFields
    .split(",")
    .map((field) => field.trim())
    .filter(Boolean)
    .filter((field) => !DEPRECATED_WINDSOR_FIELDS.has(field));

  const fields = configuredFields.length > 0 ? configuredFields : FINAL_WINDSOR_FIELDS;

  return [...new Set([...fields, ...FINAL_WINDSOR_FIELDS])];
}
