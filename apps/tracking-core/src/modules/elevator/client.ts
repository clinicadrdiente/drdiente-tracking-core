import type { CanonicalLead, LeadInput } from "../../types/domain.js";
import { normalizeEmail, normalizePhone } from "../../lib/normalize.js";
import { HttpRequestError, jsonRequest } from "../../http/json-client.js";
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
    const existingLeads = await this.findLeadsByIdentity(input.phone, input.email);
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
    const duplicateRecords = await this.findDuplicateContacts(phone, email);
    if (duplicateRecords.length > 0) {
      return duplicateRecords.map((record) =>
        mapElevatorRecordToCanonicalLead(
          this.config,
          record,
        ),
      );
    }

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

  private async findDuplicateContacts(
    phone: string,
    email?: string | null,
  ): Promise<Record<string, unknown>[]> {
    const queries = buildDuplicateQueries(this.config.locationId, phone, email);

    for (const query of queries) {
      const response = await this.request(
        "GET",
        this.config.duplicateSearchPath,
        undefined,
        query,
      );
      const records = unwrapDuplicateRecords(response);
      if (records.length > 0) {
        return records;
      }
    }

    return [];
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
    method: "GET" | "POST" | "PATCH",
    path: string,
    body?: Record<string, unknown>,
    query?: Record<string, string>,
  ): Promise<unknown> {
    const url = new URL(path, this.config.baseUrl);
    for (const [key, value] of Object.entries(query ?? {})) {
      url.searchParams.set(key, value);
    }

    try {
      return await jsonRequest({
        url,
        method,
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          "Content-Type": "application/json",
          Version: this.config.apiVersion,
        },
        body,
        fetchImpl: this.fetchImpl,
      });
    } catch (error) {
      if (error instanceof HttpRequestError) {
        throw new ElevatorApiError(error.status, error.bodyText);
      }

      throw error;
    }
  }
}

function buildDuplicateQueries(
  locationId: string,
  phone: string,
  email?: string | null,
): Record<string, string>[] {
  const queries: Record<string, string>[] = [];
  const phoneVariants = buildPhoneVariants(phone);

  for (const number of phoneVariants) {
    queries.push({ locationId, number });
  }

  const normalizedEmail = normalizeEmail(email);
  if (normalizedEmail) {
    queries.push({ locationId, email: normalizedEmail });
  }

  return queries;
}

function buildPhoneVariants(phone: string): string[] {
  const trimmed = phone.trim();
  const normalized = normalizePhone(trimmed);
  const variants = [trimmed];

  if (normalized) {
    variants.push(normalized, `+${normalized}`);
  }

  return [...new Set(variants.filter(Boolean))];
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

function unwrapDuplicateRecords(response: unknown): Record<string, unknown>[] {
  const records = unwrapCollection(response);
  if (records.length > 0) {
    return records;
  }

  if (isRecord(response) && isRecord(response.contact)) {
    return [response.contact];
  }

  if (isRecord(response) && typeof response.contactId === "string") {
    return [
      {
        id: response.contactId,
        firstName:
          typeof response.contactName === "string" ? response.contactName : "",
      },
    ];
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

export function createElevatorClient(): ElevatorClient {
  const config = getElevatorConfig();
  return config.mode === "api"
    ? new ApiElevatorClient(config)
    : new StubElevatorClient();
}
