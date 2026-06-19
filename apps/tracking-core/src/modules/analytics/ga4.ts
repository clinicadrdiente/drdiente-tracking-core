// Lectura de Google Analytics 4 (Data API v1beta) con una service account, sin
// dependencias externas: se firma un JWT RS256 con node:crypto, se cambia por un
// access token OAuth2, y se consultan los reportes. Sólo se usa del lado del
// servidor (api/client/web-analytics.ts). Devuelve agregados listos para la UI.

import { createSign } from "node:crypto";

export interface WebAnalyticsTotals {
  visitors: number;
  pageViews: number;
  sessions: number;
  bounceRatePct: number | null;
}

export interface WebAnalyticsPoint {
  date: string; // YYYY-MM-DD
  visitors: number;
  pageViews: number;
}

export interface NamedCount {
  name: string;
  visitors: number;
}

export interface WebAnalytics {
  rangeDays: number;
  totals: WebAnalyticsTotals;
  timeseries: WebAnalyticsPoint[];
  topPages: Array<{ path: string; visitors: number; pageViews: number }>;
  topSources: NamedCount[];
  countries: NamedCount[];
  devices: NamedCount[];
}

export interface Ga4Config {
  propertyId: string;
  clientEmail: string;
  privateKey: string;
}

export function readGa4Config(): Ga4Config | null {
  const propertyId = process.env.GA4_PROPERTY_ID;
  const clientEmail = process.env.GA_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GA_SERVICE_ACCOUNT_PRIVATE_KEY;
  if (!propertyId || !clientEmail || !privateKey) return null;
  return { propertyId, clientEmail, privateKey: normalizePrivateKey(privateKey) };
}

// Las env vars suelen guardar el PEM con "\n" literales; los volvemos saltos reales.
function normalizePrivateKey(key: string): string {
  return key.includes("\\n") ? key.replace(/\\n/g, "\n") : key;
}

function base64url(input: string): string {
  return Buffer.from(input, "utf8").toString("base64url");
}

export function signServiceAccountJwt(
  clientEmail: string,
  privateKey: string,
  nowSec: number,
): string {
  const header = { alg: "RS256", typ: "JWT" };
  const claim = {
    iss: clientEmail,
    scope: "https://www.googleapis.com/auth/analytics.readonly",
    aud: "https://oauth2.googleapis.com/token",
    iat: nowSec,
    exp: nowSec + 3600,
  };
  const unsigned = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(claim))}`;
  const signature = createSign("RSA-SHA256").update(unsigned).sign(privateKey, "base64url");
  return `${unsigned}.${signature}`;
}

interface TokenCache {
  token: string;
  expSec: number;
}
let cachedToken: TokenCache | undefined;

async function getAccessToken(config: Ga4Config, fetchImpl: typeof fetch = fetch): Promise<string> {
  const nowSec = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.expSec - 60 > nowSec) {
    return cachedToken.token;
  }
  const assertion = signServiceAccountJwt(config.clientEmail, config.privateKey, nowSec);
  const res = await fetchImpl("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }).toString(),
  });
  if (!res.ok) {
    throw new Error(`Google token request failed (${res.status})`);
  }
  const body = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!body.access_token) {
    throw new Error("Google token response missing access_token");
  }
  cachedToken = { token: body.access_token, expSec: nowSec + (body.expires_in ?? 3600) };
  return body.access_token;
}

// ---- Tipos mínimos de la respuesta del Data API ----
interface Ga4Row {
  dimensionValues?: Array<{ value?: string }>;
  metricValues?: Array<{ value?: string }>;
}
export interface Ga4Report {
  rows?: Ga4Row[];
}

function num(value: string | undefined): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function dim(row: Ga4Row, i: number): string {
  return row.dimensionValues?.[i]?.value ?? "(sin dato)";
}
function met(row: Ga4Row, i: number): number {
  return num(row.metricValues?.[i]?.value);
}

// Convierte "20260618" (GA4 date dim) → "2026-06-18".
function ga4DateToIso(value: string): string {
  if (/^\d{8}$/.test(value)) {
    return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
  }
  return value;
}

// Parsea los 6 reportes (en orden) que pedimos en runWebAnalyticsReports.
// Función pura → testeable con una respuesta de ejemplo.
export function parseGa4Reports(reports: Ga4Report[], rangeDays: number): WebAnalytics {
  const [totalsR, tsR, pagesR, sourcesR, countriesR, devicesR] = reports;

  const t = totalsR?.rows?.[0];
  const bounceRaw = t ? met(t, 3) : 0; // GA4 bounceRate es 0–1
  const totals: WebAnalyticsTotals = {
    visitors: t ? met(t, 0) : 0,
    pageViews: t ? met(t, 1) : 0,
    sessions: t ? met(t, 2) : 0,
    bounceRatePct: t ? Math.round(bounceRaw * 100) : null,
  };

  const timeseries: WebAnalyticsPoint[] = (tsR?.rows ?? [])
    .map((r) => ({ date: ga4DateToIso(dim(r, 0)), visitors: met(r, 0), pageViews: met(r, 1) }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  const topPages = (pagesR?.rows ?? []).map((r) => ({
    path: dim(r, 0),
    visitors: met(r, 0),
    pageViews: met(r, 1),
  }));

  const topSources: NamedCount[] = (sourcesR?.rows ?? []).map((r) => ({
    name: dim(r, 0),
    visitors: met(r, 0),
  }));

  const countries: NamedCount[] = (countriesR?.rows ?? []).map((r) => ({
    name: dim(r, 0),
    visitors: met(r, 0),
  }));

  const devices: NamedCount[] = (devicesR?.rows ?? []).map((r) => ({
    name: dim(r, 0),
    visitors: met(r, 0),
  }));

  return { rangeDays, totals, timeseries, topPages, topSources, countries, devices };
}

function buildReportRequests(rangeDays: number) {
  const dateRanges = [{ startDate: `${rangeDays}daysAgo`, endDate: "today" }];
  return {
    requests: [
      // 0 — totales
      {
        dateRanges,
        metrics: [
          { name: "activeUsers" },
          { name: "screenPageViews" },
          { name: "sessions" },
          { name: "bounceRate" },
        ],
      },
      // 1 — serie por día
      {
        dateRanges,
        dimensions: [{ name: "date" }],
        metrics: [{ name: "activeUsers" }, { name: "screenPageViews" }],
        orderBys: [{ dimension: { dimensionName: "date" } }],
        limit: 400,
      },
      // 2 — páginas top
      {
        dateRanges,
        dimensions: [{ name: "pagePath" }],
        metrics: [{ name: "activeUsers" }, { name: "screenPageViews" }],
        orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }],
        limit: 12,
      },
      // 3 — fuentes / referrers
      {
        dateRanges,
        dimensions: [{ name: "sessionSource" }],
        metrics: [{ name: "activeUsers" }],
        orderBys: [{ metric: { metricName: "activeUsers" }, desc: true }],
        limit: 12,
      },
      // 4 — países
      {
        dateRanges,
        dimensions: [{ name: "country" }],
        metrics: [{ name: "activeUsers" }],
        orderBys: [{ metric: { metricName: "activeUsers" }, desc: true }],
        limit: 10,
      },
      // 5 — dispositivos
      {
        dateRanges,
        dimensions: [{ name: "deviceCategory" }],
        metrics: [{ name: "activeUsers" }],
        orderBys: [{ metric: { metricName: "activeUsers" }, desc: true }],
        limit: 6,
      },
    ],
  };
}

export async function fetchWebAnalytics(
  config: Ga4Config,
  rangeDays = 28,
  fetchImpl: typeof fetch = fetch,
): Promise<WebAnalytics> {
  const token = await getAccessToken(config, fetchImpl);
  const url = `https://analyticsdata.googleapis.com/v1beta/properties/${config.propertyId}:batchRunReports`;
  const res = await fetchImpl(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(buildReportRequests(rangeDays)),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`GA4 batchRunReports failed (${res.status})${detail ? `: ${detail.slice(0, 200)}` : ""}`);
  }
  const body = (await res.json()) as { reports?: Ga4Report[] };
  return parseGa4Reports(body.reports ?? [], rangeDays);
}
