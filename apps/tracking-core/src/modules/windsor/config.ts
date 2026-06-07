export interface WindsorConfig {
  apiKey: string;
  baseUrl: string;
  defaultConnector: string;
  defaultFields: string[];
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
      "date,source,campaign,spend,clicks,impressions",
    )
      .split(",")
      .map((field) => field.trim())
      .filter(Boolean),
  };
}
