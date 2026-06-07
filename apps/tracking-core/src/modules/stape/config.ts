export type StapeMode = "stub" | "api";

export interface StapeConfig {
  mode: StapeMode;
  serverUrl: string;
  requestPath: string;
  containerId: string;
  containerIdentifier: string;
  apiKey: string;
  apiKeyHeader: string;
}

function getEnv(name: string, fallback = ""): string {
  return process.env[name] ?? fallback;
}

export function getStapeConfig(): StapeConfig {
  const mode = getEnv("STAPE_MODE", "stub") === "api" ? "api" : "stub";

  return {
    mode,
    serverUrl: getEnv("STAPE_SERVER_URL"),
    requestPath: getEnv("STAPE_REQUEST_PATH", "/data"),
    containerId: getEnv("STAPE_CONTAINER_ID"),
    containerIdentifier: getEnv("STAPE_CONTAINER_IDENTIFIER"),
    apiKey: getEnv("STAPE_API_KEY"),
    apiKeyHeader: getEnv("STAPE_API_KEY_HEADER", "x-stape-api-key"),
  };
}
