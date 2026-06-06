import type { CanonicalLead, LeadInput } from "../../types/domain.js";
import { normalizeEmail, normalizePhone } from "../../lib/normalize.js";
import { getElevatorConfig, type ElevatorConfig } from "./config.js";
import {
  buildCreateLeadPayload,
  buildSearchPayload,
  buildStagePayload,
  mapElevatorRecordToCanonicalLead,
} from "./payloads.js";

export interface ElevatorClient {
  createLead(input: LeadInput): Promise<CanonicalLead>;
  findLeadsByIdentity(phone: string, email?: string | null): Promise<CanonicalLead[]>;
  updateLeadStage(elevatorId: string, stage: string): Promise<void>;
}

export class StubElevatorClient implements ElevatorClient {
  async createLead(input: LeadInput): Promise<CanonicalLead> {
    return {
      elevatorId: "ELV_STUB_001",
      firstName: input.firstName,
      lastName: input.lastName ?? null,
      phoneRaw: input.phone,
      phoneNormalized: normalizePhone(input.phone),
      emailRaw: input.email ?? null,
      emailNormalized: normalizeEmail(input.email),
      branch: input.branch,
      attribution: input.attribution,
    };
  }

  async findLeadsByIdentity(
    phone: string,
    email?: string | null,
  ): Promise<CanonicalLead[]> {
    return [
      {
        elevatorId: "ELV_STUB_001",
        firstName: "Paciente",
        lastName: "Demo",
        phoneRaw: phone,
        phoneNormalized: normalizePhone(phone),
        emailRaw: email ?? null,
        emailNormalized: normalizeEmail(email),
        branch: "Polanco",
        attribution: {},
      },
    ];
  }

  async updateLeadStage(_elevatorId: string, _stage: string): Promise<void> {
    return;
  }
}

export class ApiElevatorClient implements ElevatorClient {
  constructor(
    private readonly config: ElevatorConfig,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async createLead(input: LeadInput): Promise<CanonicalLead> {
    const payload = buildCreateLeadPayload(this.config, input);
    const response = await this.request("POST", this.config.contactsPath, payload);
    const record = unwrapRecord(response, "contact");
    return mapElevatorRecordToCanonicalLead(
      this.config,
      record,
    );
  }

  async findLeadsByIdentity(
    phone: string,
    email?: string | null,
  ): Promise<CanonicalLead[]> {
    const payload = buildSearchPayload(this.config, phone, email);
    const response = await this.request("POST", this.config.searchPath, payload);
    const records = unwrapCollection(response);

    return records.map((record) =>
      mapElevatorRecordToCanonicalLead(
        this.config,
        record,
      ),
    );
  }

  async updateLeadStage(elevatorId: string, stage: string): Promise<void> {
    if (!this.config.stagePathTemplate) {
      return;
    }

    const path = this.config.stagePathTemplate.replace("{id}", elevatorId);
    const payload = buildStagePayload(this.config, stage);
    await this.request("PATCH", path, payload);
  }

  private async request(
    method: "POST" | "PATCH",
    path: string,
    body?: Record<string, unknown>,
  ): Promise<unknown> {
    const response = await this.fetchImpl(new URL(path, this.config.baseUrl), {
      method,
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        "Content-Type": "application/json",
        Version: this.config.apiVersion,
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const details = await readErrorDetails(response);
      throw new Error(
        `Elevator API request failed with status ${response.status}${details}`,
      );
    }

    return (await response.json()) as unknown;
  }
}

function unwrapRecord(response: unknown, preferredKey: string): Record<string, unknown> {
  if (isRecord(response) && isRecord(response[preferredKey])) {
    return response[preferredKey];
  }

  return isRecord(response) ? response : {};
}

function unwrapCollection(response: unknown): Record<string, unknown>[] {
  if (Array.isArray(response)) {
    return response.filter(isRecord);
  }

  if (isRecord(response) && Array.isArray(response.contacts)) {
    return response.contacts.filter(isRecord);
  }

  if (isRecord(response) && Array.isArray(response.data)) {
    return response.data.filter(isRecord);
  }

  return [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

async function readErrorDetails(response: Response): Promise<string> {
  try {
    const body = await response.text();
    return body ? `: ${body.slice(0, 300)}` : "";
  } catch {
    return "";
  }
}

export function createElevatorClient(): ElevatorClient {
  const config = getElevatorConfig();
  return config.mode === "api"
    ? new ApiElevatorClient(config)
    : new StubElevatorClient();
}
