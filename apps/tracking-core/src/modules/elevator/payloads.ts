import type { AttributionData, CanonicalLead, LeadInput } from "../../types/domain.js";
import { normalizeEmail, normalizePhone } from "../../lib/normalize.js";
import type { ElevatorConfig } from "./config.js";

type ElevatorRecord = Record<string, unknown>;

function toAttributionFields(
  attribution: AttributionData,
  prefix: string,
): ElevatorRecord {
  return {
    [`${prefix}fbclid`]: attribution.fbclid ?? null,
    [`${prefix}gclid`]: attribution.gclid ?? null,
    [`${prefix}ttclid`]: attribution.ttclid ?? null,
    [`${prefix}utm_source`]: attribution.utmSource ?? null,
    [`${prefix}utm_medium`]: attribution.utmMedium ?? null,
    [`${prefix}utm_campaign`]: attribution.utmCampaign ?? null,
    [`${prefix}landing_url`]: attribution.landingUrl ?? null,
  };
}

export function buildCreateLeadPayload(
  config: ElevatorConfig,
  input: LeadInput,
): ElevatorRecord {
  return {
    [config.firstNameField]: input.firstName,
    [config.lastNameField]: input.lastName ?? null,
    [config.phoneField]: normalizePhone(input.phone),
    [config.emailField]: normalizeEmail(input.email),
    [config.branchField]: input.branch,
    ...toAttributionFields(input.attribution, config.attributionFieldPrefix),
  };
}

export function buildSearchPayload(
  config: ElevatorConfig,
  phone: string,
  email?: string | null,
): ElevatorRecord {
  return {
    [config.phoneField]: normalizePhone(phone),
    [config.emailField]: normalizeEmail(email),
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
    firstName: readString(record, config.firstNameField) ?? "",
    lastName: readString(record, config.lastNameField),
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
