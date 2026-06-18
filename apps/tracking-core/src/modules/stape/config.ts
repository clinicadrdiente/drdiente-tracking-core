import { getEnv } from "../../config/env.js";

export type StapeMode = "stub" | "api";

export interface StapeConfig {
  mode: StapeMode;
  serverUrl: string;
  requestPath: string;
  containerId: string;
  containerIdentifier: string;
  apiKey: string;
  apiKeyHeader: string;
  targetPlatforms: string[];
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
    targetPlatforms: getEnv("STAPE_TARGET_PLATFORMS")
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean),
  };
}
