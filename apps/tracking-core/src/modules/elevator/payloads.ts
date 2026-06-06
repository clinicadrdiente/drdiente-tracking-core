import type { CanonicalLead, LeadInput } from "../../types/domain.js";
import { normalizeEmail, normalizePhone } from "../../lib/normalize.js";
import type { ElevatorConfig } from "./config.js";

type ElevatorRecord = Record<string, unknown>;

export function buildCreateLeadPayload(
  config: ElevatorConfig,
  input: LeadInput,
): ElevatorRecord {
  return {
    locationId: config.locationId,
    firstName: input.firstName,
    lastName: input.lastName ?? null,
    [config.phoneField]: normalizePhone(input.phone),
    [config.emailField]: normalizeEmail(input.email),
    source: input.attribution.utmSource ?? "DrDiente Tracking Core",
    tags: ["tracking-core", input.branch].filter(Boolean),
  };
}

export function buildSearchPayload(
  config: ElevatorConfig,
  phone: string,
  email?: string | null,
): ElevatorRecord {
  const filters = [
    {
      field: config.phoneField,
      operator: "eq",
      value: normalizePhone(phone),
    },
  ];
  const normalizedEmail = normalizeEmail(email);

  if (normalizedEmail) {
    filters.push({
      field: config.emailField,
      operator: "eq",
      value: normalizedEmail,
    });
  }

  return {
    locationId: config.locationId,
    page: 1,
    pageLimit: 20,
    filters,
  };
}

export function buildStagePayload(
  config: ElevatorConfig,
  stage: string,
): ElevatorRecord {
  return {
    [config.stageField]: stage,
  };
}

export function mapElevatorRecordToCanonicalLead(
  config: ElevatorConfig,
  record: ElevatorRecord,
): CanonicalLead {
  const emailRaw = readString(record, config.emailField);
  const phoneRaw = readString(record, config.phoneField) ?? "";

  return {
    elevatorId: readString(record, config.idField) ?? "unknown",
    firstName:
      readString(record, "firstName") ??
      readString(record, config.firstNameField) ??
      "",
    lastName:
      readString(record, "lastName") ??
      readString(record, config.lastNameField),
    phoneRaw,
    phoneNormalized: normalizePhone(phoneRaw),
    emailRaw,
    emailNormalized: normalizeEmail(emailRaw),
    branch: readString(record, config.branchField) ?? "",
    attribution: {
      fbclid: readString(record, `${config.attributionFieldPrefix}fbclid`),
      gclid: readString(record, `${config.attributionFieldPrefix}gclid`),
      ttclid: readString(record, `${config.attributionFieldPrefix}ttclid`),
      utmSource: readString(
        record,
        `${config.attributionFieldPrefix}utm_source`,
      ),
      utmMedium: readString(
        record,
        `${config.attributionFieldPrefix}utm_medium`,
      ),
      utmCampaign: readString(
        record,
        `${config.attributionFieldPrefix}utm_campaign`,
      ),
      landingUrl: readString(
        record,
        `${config.attributionFieldPrefix}landing_url`,
      ),
    },
  };
}

function readString(record: ElevatorRecord, key: string): string | null {
  const value = record[key];
  return typeof value === "string" ? value : null;
}
