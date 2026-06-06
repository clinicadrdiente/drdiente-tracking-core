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
    const existingLeads = await this.findLeadsByIdentity(input.phone, null);
    if (existingLeads[0]) {
      return existingLeads[0];
    }

    const payload = buildCreateLeadPayload(this.config, input);
    let response: unknown;
    try {
      response = await this.request("POST", this.config.contactsPath, payload);
    } catch (error) {
      const duplicateContactId = readDuplicateContactId(error);
      if (duplicateContactId) {
        return buildCanonicalLeadFromInput(duplicateContactId, input);
      }

      throw error;
    }

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
      const bodyText = await readResponseText(response);
      throw new ElevatorApiError(response.status, bodyText);
    }

    return (await response.json()) as unknown;
  }
}

class ElevatorApiError extends Error {
  readonly parsedBody: unknown;

  constructor(
    readonly status: number,
    readonly bodyText: string,
  ) {
    super(
      `Elevator API request failed with status ${status}${
        bodyText ? `: ${bodyText.slice(0, 300)}` : ""
      }`,
    );
    this.parsedBody = parseJson(bodyText);
  }
}

function buildCanonicalLeadFromInput(
  elevatorId: string,
  input: LeadInput,
): CanonicalLead {
  return {
    elevatorId,
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

function readDuplicateContactId(error: unknown): string | null {
  if (!(error instanceof ElevatorApiError)) {
    return null;
  }

  if (error.status !== 400 || !isRecord(error.parsedBody)) {
    return null;
  }

  const message = error.parsedBody.message;
  const meta = error.parsedBody.meta;
  if (
    typeof message === "string" &&
    message.includes("duplicated contacts") &&
    isRecord(meta) &&
    typeof meta.contactId === "string"
  ) {
    return meta.contactId;
  }

  return null;
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

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

async function readResponseText(response: Response): Promise<string> {
  try {
    return await response.text();
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
