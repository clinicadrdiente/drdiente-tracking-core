import { timingSafeEqual, createHash } from "node:crypto";
import { getAppConfig, trackingHttpHandlers } from "../../src/index.js";
import {
  methodNotAllowed,
  send,
  toHttpRequest,
  type VercelRequest,
  type VercelResponse,
} from "../_lib/http.js";

export default async function handler(
  request: VercelRequest,
  response: VercelResponse,
): Promise<void> {
  if (request.method !== "POST" && request.method !== "GET") {
    methodNotAllowed(response);
    return;
  }

  if (request.method === "GET") {
    if (!isAuthorizedCronRequest(request)) {
      response.status(401).json({ error: "unauthorized cron request" });
      return;
    }

    request.headers = {
      ...request.headers,
      "x-tracking-secret": process.env.TRACKING_API_SECRET,
    };
    request.query = {
      ...request.query,
      since: new Date(
        Date.now() -
          getAppConfig().paymentsSyncLookbackMinutes * 60 * 1000,
      ).toISOString(),
      maxPayments: "50",
    };
  }

  const result = await trackingHttpHandlers.postPaymentsSync(
    toHttpRequest(request),
  );
  send(response, result);
}

function isAuthorizedCronRequest(request: VercelRequest): boolean {
  const expectedSecret = process.env.CRON_SECRET;
  if (!expectedSecret) {
    // Fail closed: cron must be explicitly protected. Set CRON_SECRET in Vercel env.
    return false;
  }

  const token = readBearerToken(request);
  return timingSafeStringEqual(token ?? "", expectedSecret);
}

function timingSafeStringEqual(a: string, b: string): boolean {
  const hashA = createHash("sha256").update(a).digest();
  const hashB = createHash("sha256").update(b).digest();
  return timingSafeEqual(hashA, hashB);
}

function readBearerToken(request: VercelRequest): string | null {
  const authorization = readHeader(request, "authorization");
  const match = authorization?.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? null;
}

function readHeader(
  request: VercelRequest,
  name: string,
): string | undefined {
  const normalized = name.toLowerCase();
  for (const [key, value] of Object.entries(request.headers ?? {})) {
    if (key.toLowerCase() === normalized) {
      return value;
    }
  }

  return undefined;
}
