import type { ConversionEvent } from "../../types/domain.js";
import { HttpRequestError, jsonRequest } from "../../http/json-client.js";
import { getStapeConfig, type StapeConfig } from "./config.js";

export interface StapeClient {
  dispatch(event: ConversionEvent): Promise<void>;
  getMode(): "stub" | "api";
}

export class StubStapeClient implements StapeClient {
  getMode(): "stub" {
    return "stub";
  }

  async dispatch(_event: ConversionEvent): Promise<void> {
    return;
  }
}

export class ApiStapeClient implements StapeClient {
  constructor(private readonly config: StapeConfig) {}

  getMode(): "api" {
    return "api";
  }

  async dispatch(event: ConversionEvent): Promise<void> {
    const url = buildStapeUrl(this.config);
    try {
      await jsonRequest({
        url,
        method: "POST",
        headers: buildHeaders(this.config),
        body: buildStapePayload(event, this.config),
        parseResponse: false,
      });
    } catch (error) {
      if (error instanceof HttpRequestError) {
        throw new Error(
          `Stape request failed with status ${error.status}: ${error.bodyText.slice(0, 300)}`,
        );
      }

      throw error;
    }
  }
}

export function createStapeClient(): StapeClient {
  const config = getStapeConfig();

  if (config.mode !== "api" || !config.serverUrl) {
    return new StubStapeClient();
  }

  return new ApiStapeClient(config);
}

function buildStapeUrl(config: StapeConfig): URL {
  const serverUrl = config.serverUrl.endsWith("/")
    ? config.serverUrl
    : `${config.serverUrl}/`;
  const path = config.requestPath.replace(/^\/+/, "");

  return new URL(path, serverUrl);
}

function buildHeaders(config: StapeConfig): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  if (config.apiKey) {
    headers[config.apiKeyHeader] = config.apiKey;
  }

  return headers;
}

function buildStapePayload(event: ConversionEvent, config: StapeConfig) {
  return {
    event_name: mapEventName(event.eventName),
    event_id: event.eventId,
    event_time: event.eventTime,
    action_source: event.actionSource,
    user_data: event.userData,
    custom_data: event.customData,
    original_event_name: event.eventName,
    source_system: "drdiente-tracking-core",
    stape_container_id: config.containerId || null,
    stape_container_identifier: config.containerIdentifier || null,
    target_platforms: config.targetPlatforms.length > 0 ? config.targetPlatforms : undefined,
  };
}

function mapEventName(eventName: ConversionEvent["eventName"]): string {
  if (eventName === "Agendamiento") {
    return "Schedule";
  }

  return eventName;
}
