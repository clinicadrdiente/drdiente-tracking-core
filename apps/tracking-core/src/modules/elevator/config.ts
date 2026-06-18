import { getEnv } from "../../config/env.js";

export type ElevatorMode = "stub" | "api";

export interface ElevatorConfig {
  mode: ElevatorMode;
  baseUrl: string;
  apiKey: string;
  locationId: string;
  apiVersion: string;
  contactsPath: string;
  searchPath: string;
  duplicateSearchPath: string;
  stagePathTemplate: string;
  idField: string;
  phoneField: string;
  emailField: string;
  branchField: string;
  firstNameField: string;
  lastNameField: string;
  stageField: string;
  attributionFieldPrefix: string;
  // Optional object key under which attribution fields are nested when writing
  // to / reading from the contact (e.g. GoHighLevel's `customFields`). When
  // empty, attribution fields are written/read flat at the contact root.
  attributionContainer: string;
}

export function getElevatorConfig(): ElevatorConfig {
  return {
    mode: getEnv("ELEVATOR_MODE", "stub") === "api" ? "api" : "stub",
    baseUrl: getEnv(
      "ELEVATOR_BASE_URL",
      "https://services.leadconnectorhq.com",
    ),
    apiKey: getEnv("ELEVATOR_API_KEY"),
    locationId: getEnv("ELEVATOR_LOCATION_ID"),
    apiVersion: getEnv("ELEVATOR_API_VERSION", "2021-07-28"),
    contactsPath: getEnv("ELEVATOR_CONTACTS_PATH", "/contacts/"),
    searchPath: getEnv("ELEVATOR_SEARCH_PATH", "/contacts/search"),
    duplicateSearchPath: getEnv(
      "ELEVATOR_DUPLICATE_SEARCH_PATH",
      "/contacts/search/duplicate",
    ),
    stagePathTemplate: getEnv("ELEVATOR_STAGE_PATH_TEMPLATE", ""),
    idField: getEnv("ELEVATOR_ID_FIELD", "id"),
    phoneField: getEnv("ELEVATOR_PHONE_FIELD", "phone"),
    emailField: getEnv("ELEVATOR_EMAIL_FIELD", "email"),
    branchField: getEnv("ELEVATOR_BRANCH_FIELD", "branch"),
    firstNameField: getEnv("ELEVATOR_FIRST_NAME_FIELD", "firstName"),
    lastNameField: getEnv("ELEVATOR_LAST_NAME_FIELD", "lastName"),
    stageField: getEnv("ELEVATOR_STAGE_FIELD", "stage"),
    attributionFieldPrefix: getEnv(
      "ELEVATOR_ATTRIBUTION_FIELD_PREFIX",
      "attr_",
    ),
    attributionContainer: getEnv("ELEVATOR_ATTRIBUTION_CONTAINER", ""),
  };
}
