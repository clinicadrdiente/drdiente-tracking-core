import { createSign } from "node:crypto";
import {
  getGoogleAdsConfig,
  type GoogleAdsAccount,
  type GoogleAdsConfig,
} from "./config.js";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_ADS_SCOPE = "https://www.googleapis.com/auth/adwords";
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

type FetchFn = typeof fetch;

export interface GoogleAdsAccountSummary extends GoogleAdsAccount {
  currency: string | null;
  campaigns: number;
  impressions: number;
  clicks: number;
  spend: number;
}

export interface GoogleAdsSummary {
  from: string;
  to: string;
  accounts: GoogleAdsAccountSummary[];
  errors: Array<{
    key: GoogleAdsAccount["key"];
    name: GoogleAdsAccount["name"];
    status: number;
  }>;
  totals: {
    impressions: number;
    clicks: number;
    spend: number;
  };
}

interface GoogleAdsResult {
  customer?: { currencyCode?: string };
  campaign?: { id?: string; name?: string };
  metrics?: {
    impressions?: string | number;
    clicks?: string | number;
    costMicros?: string | number;
  };
}

export class GoogleAdsRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "GoogleAdsRequestError";
  }
}

export class GoogleAdsValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GoogleAdsValidationError";
  }
}

export class GoogleAdsClient {
  private tokenCache: { value: string; expiresAtMs: number } | null = null;

  constructor(
    private readonly config: GoogleAdsConfig,
    private readonly fetchFn: FetchFn = fetch,
  ) {}

  isConfigured(): boolean {
    return this.config.isConfigured;
  }

  async getSummary(range: { from: string; to: string }): Promise<GoogleAdsSummary> {
    const fromDate = assertDate(range.from, "from");
    const toDate = assertDate(range.to, "to");
    if (fromDate.getTime() > toDate.getTime()) {
      throw new GoogleAdsValidationError("from must not be after to");
    }
    if (!this.isConfigured()) {
      throw new Error("Google Ads is not configured");
    }

    const accessToken = await this.getAccessToken();
    const settled = await Promise.allSettled(
      this.config.accounts.map((account) =>
        this.getAccountSummary(account, range, accessToken),
      ),
    );
    const accounts: GoogleAdsAccountSummary[] = [];
    const errors: GoogleAdsSummary["errors"] = [];
    settled.forEach((result, index) => {
      if (result.status === "fulfilled") {
        accounts.push(result.value);
        return;
      }
      const account = this.config.accounts[index]!;
      errors.push({
        key: account.key,
        name: account.name,
        status:
          result.reason instanceof GoogleAdsRequestError
            ? result.reason.status
            : 500,
      });
    });

    if (accounts.length === 0 && errors.length > 0) {
      throw new GoogleAdsRequestError(
        "Google Ads requests failed for all configured accounts",
        errors[0]!.status,
      );
    }

    return {
      ...range,
      accounts,
      errors,
      totals: {
        impressions: accounts.reduce((sum, item) => sum + item.impressions, 0),
        clicks: accounts.reduce((sum, item) => sum + item.clicks, 0),
        spend: accounts.reduce((sum, item) => sum + item.spend, 0),
      },
    };
  }

  private async getAccessToken(): Promise<string> {
    if (this.tokenCache && this.tokenCache.expiresAtMs > Date.now() + 60_000) {
      return this.tokenCache.value;
    }

    const serviceAccount = this.config.serviceAccount!;
    const issuedAt = Math.floor(Date.now() / 1000);
    const assertion = signJwt(
      {
        iss: serviceAccount.clientEmail,
        scope: GOOGLE_ADS_SCOPE,
        aud: GOOGLE_TOKEN_URL,
        iat: issuedAt,
        exp: issuedAt + 3600,
      },
      serviceAccount.privateKey,
    );
    const body = new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    });
    const response = await this.fetchFn(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(10_000),
    });
    const payload = await readJson(response);
    if (!response.ok) {
      throw new GoogleAdsRequestError(
        `Google OAuth token exchange failed with status ${response.status}`,
        response.status,
      );
    }

    const token = readString(payload, "access_token");
    if (!token) {
      throw new Error("Google OAuth token response did not include access_token");
    }
    const expiresIn = readNumber(payload, "expires_in") || 3600;
    this.tokenCache = {
      value: token,
      expiresAtMs: Date.now() + expiresIn * 1000,
    };
    return token;
  }

  private async getAccountSummary(
    account: GoogleAdsAccount,
    range: { from: string; to: string },
    accessToken: string,
  ): Promise<GoogleAdsAccountSummary> {
    const url = `https://googleads.googleapis.com/${this.config.apiVersion}/customers/${account.customerId}/googleAds:searchStream`;
    const query = [
      "SELECT",
      "customer.currency_code,",
      "campaign.id,",
      "campaign.name,",
      "metrics.impressions,",
      "metrics.clicks,",
      "metrics.cost_micros",
      "FROM campaign",
      `WHERE segments.date BETWEEN '${range.from}' AND '${range.to}'`,
      "AND campaign.status != 'REMOVED'",
    ].join(" ");
    const response = await this.fetchFn(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "developer-token": this.config.developerToken,
        "login-customer-id": this.config.loginCustomerId,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query }),
      signal: AbortSignal.timeout(15_000),
    });
    const payload = await readJson(response);
    if (!response.ok) {
      throw new GoogleAdsRequestError(
        `Google Ads request for ${account.name} failed with status ${response.status}`,
        response.status,
      );
    }

    const results = readSearchResults(payload);
    const campaignIds = new Set<string>();
    let currency: string | null = null;
    let impressions = 0;
    let clicks = 0;
    let costMicros = 0;
    for (const result of results) {
      if (result.campaign?.id) campaignIds.add(String(result.campaign.id));
      currency ??= result.customer?.currencyCode ?? null;
      impressions += numberValue(result.metrics?.impressions);
      clicks += numberValue(result.metrics?.clicks);
      costMicros += numberValue(result.metrics?.costMicros);
    }

    return {
      ...account,
      currency,
      campaigns: campaignIds.size,
      impressions,
      clicks,
      spend: costMicros / 1_000_000,
    };
  }
}

export function createGoogleAdsClient(): GoogleAdsClient {
  return new GoogleAdsClient(getGoogleAdsConfig());
}

function signJwt(payload: Record<string, string | number>, privateKey: string): string {
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const encodedPayload = base64Url(JSON.stringify(payload));
  const unsigned = `${header}.${encodedPayload}`;
  const signature = createSign("RSA-SHA256").update(unsigned).end().sign(privateKey);
  return `${unsigned}.${signature.toString("base64url")}`;
}

function base64Url(value: string): string {
  return Buffer.from(value).toString("base64url");
}

function assertDate(value: string, name: string): Date {
  if (!DATE_PATTERN.test(value)) {
    throw new GoogleAdsValidationError(`${name} must be a valid YYYY-MM-DD date`);
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new GoogleAdsValidationError(`${name} must be a valid YYYY-MM-DD date`);
  }
  return parsed;
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new GoogleAdsRequestError(
      `Google API returned non-JSON with status ${response.status}`,
      response.status,
    );
  }
}

function readSearchResults(payload: unknown): GoogleAdsResult[] {
  if (!Array.isArray(payload)) return [];
  const results: GoogleAdsResult[] = [];
  for (const chunk of payload) {
    if (!isObject(chunk) || !Array.isArray(chunk.results)) continue;
    for (const item of chunk.results) {
      if (isObject(item)) results.push(item as GoogleAdsResult);
    }
  }
  return results;
}

function readString(payload: unknown, key: string): string {
  return isObject(payload) && typeof payload[key] === "string" ? payload[key] : "";
}

function readNumber(payload: unknown, key: string): number {
  return isObject(payload) ? numberValue(payload[key]) : 0;
}

function numberValue(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
