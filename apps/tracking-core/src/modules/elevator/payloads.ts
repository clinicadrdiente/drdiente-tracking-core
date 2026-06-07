import type {
  AttributionData,
  CanonicalLead,
  LeadInput,
} from "../../types/domain.js";
import { normalizeEmail, normalizePhone } from "../../lib/normalize.js";
import type { ElevatorConfig } from "./config.js";

type ElevatorRecord = Record<string, unknown>;

// Suffix -> value extractor for every attribution field we persist on the
// contact. These are the inputs to the deterministic spend<->revenue join:
// the click ids let downstream CAPI dedupe, and `campaign_id` is the stable
// key joined against Windsor spend. Written on create and read back on lookup
// using the exact same suffixes so the round-trip is symmetric.
const ATTRIBUTION_FIELDS: Array<
  [suffix: string, get: (a: AttributionData) => string | null | undefined]
> = [
  ["fbclid", (a) => a.fbclid],
  ["gclid", (a) => a.gclid],
  ["ttclid", (a) => a.ttclid],
  ["utm_source", (a) => a.utmSource],
  ["utm_medium", (a) => a.utmMedium],
  ["utm_campaign", (a) => a.utmCampaign],
  ["campaign_id", (a) => a.campaignId],
  ["landing_url", (a) => a.landingUrl],
];

export function buildCreateLeadPayload(
  config: ElevatorConfig,
  input: LeadInput,
): ElevatorRecord {
  const phone = normalizePhone(input.phone);
  const email = normalizeEmail(input.email);
  const payload: ElevatorRecord = {
    locationId: config.locationId,
    firstName: input.firstName,
    lastName: input.lastName ?? null,
    source: input.attribution.utmSource ?? "DrDiente Tracking Core",
    tags: ["tracking-core", input.branch].filter(Boolean),
  };

  if (phone) {
    payload[config.phoneField] = phone;
  }

  if (email) {
    payload[config.emailField] = email;
  }

  const attributionFields = buildAttributionFields(config, input.attribution);
  if (Object.keys(attributionFields).length > 0) {
    if (config.attributionContainer) {
      payload[config.attributionContainer] = attributionFields;
    } else {
      Object.assign(payload, attributionFields);
    }
  }

  return payload;
}

function buildAttributionFields(
  config: ElevatorConfig,
  attribution: AttributionData,
): ElevatorRecord {
  const fields: ElevatorRecord = {};
  for (const [suffix, get] of ATTRIBUTION_FIELDS) {
    const value = get(attribution);
    if (typeof value === "string" && value.trim() !== "") {
      fields[`${config.attributionFieldPrefix}${suffix}`] = value.trim();
    }
  }

  return fields;
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
  const attr = readAttributionSource(config, record);
  const prefix = config.attributionFieldPrefix;

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
      fbclid: readString(attr, `${prefix}fbclid`),
      gclid: readString(attr, `${prefix}gclid`),
      ttclid: readString(attr, `${prefix}ttclid`),
      utmSource: readString(attr, `${prefix}utm_source`),
      utmMedium: readString(attr, `${prefix}utm_medium`),
      utmCampaign: readString(attr, `${prefix}utm_campaign`),
      campaignId: readString(attr, `${prefix}campaign_id`),
      landingUrl: readString(attr, `${prefix}landing_url`),
    },
  };
}

// Attribution fields live under the configured container (e.g. GoHighLevel's
// `customFields`) when set; otherwise flat at the record root. Falls back to the
// root if the container is configured but absent on this particular record.
function readAttributionSource(
  config: ElevatorConfig,
  record: ElevatorRecord,
): ElevatorRecord {
  if (config.attributionContainer) {
    const container = record[config.attributionContainer];
    if (typeof container === "object" && container !== null) {
      return container as ElevatorRecord;
    }
  }

  return record;
}

function readString(record: ElevatorRecord, key: string): string | null {
  const value = record[key];
  return typeof value === "string" ? value : null;
}
