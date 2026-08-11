export interface GoogleAdsAccount {
  key: "polanco" | "roma";
  name: "Polanco" | "Roma Norte";
  customerId: string;
}

export interface GoogleAdsServiceAccount {
  clientEmail: string;
  privateKey: string;
}

export interface GoogleAdsConfig {
  developerToken: string;
  loginCustomerId: string;
  accounts: GoogleAdsAccount[];
  serviceAccount: GoogleAdsServiceAccount | null;
  apiVersion: string;
  isConfigured: boolean;
}

type Env = Record<string, string | undefined>;

export function getGoogleAdsConfig(env: Env = process.env): GoogleAdsConfig {
  const developerToken = clean(env.GOOGLE_ADS_DEVELOPER_TOKEN);
  const loginCustomerId = normalizeCustomerId(env.GOOGLE_ADS_LOGIN_CUSTOMER_ID);
  const serviceAccount = parseServiceAccount(env.GOOGLE_ADS_SERVICE_ACCOUNT_JSON);
  const accounts = [
    account("polanco", "Polanco", env.GOOGLE_ADS_POLANCO_CUSTOMER_ID),
    account("roma", "Roma Norte", env.GOOGLE_ADS_ROMA_CUSTOMER_ID),
  ].filter((value): value is GoogleAdsAccount => value !== null);

  return {
    developerToken,
    loginCustomerId,
    accounts,
    serviceAccount,
    apiVersion: clean(env.GOOGLE_ADS_API_VERSION) || "v25",
    isConfigured: Boolean(
      developerToken &&
        loginCustomerId &&
        serviceAccount &&
        accounts.length === 2,
    ),
  };
}

function account(
  key: GoogleAdsAccount["key"],
  name: GoogleAdsAccount["name"],
  rawCustomerId: string | undefined,
): GoogleAdsAccount | null {
  const customerId = normalizeCustomerId(rawCustomerId);
  return customerId ? { key, name, customerId } : null;
}

function normalizeCustomerId(value: string | undefined): string {
  return clean(value).replace(/\D/g, "");
}

function clean(value: string | undefined): string {
  return value?.trim() ?? "";
}

function parseServiceAccount(raw: string | undefined): GoogleAdsServiceAccount | null {
  if (!clean(raw)) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw!);
  } catch {
    throw new Error("GOOGLE_ADS_SERVICE_ACCOUNT_JSON is not valid JSON");
  }

  if (!isObject(parsed)) {
    throw new Error("GOOGLE_ADS_SERVICE_ACCOUNT_JSON is missing required fields");
  }

  const clientEmail = typeof parsed.client_email === "string" ? parsed.client_email.trim() : "";
  const privateKey = typeof parsed.private_key === "string" ? parsed.private_key : "";
  if (!clientEmail || !privateKey) {
    throw new Error("GOOGLE_ADS_SERVICE_ACCOUNT_JSON is missing required fields");
  }

  return { clientEmail, privateKey };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
