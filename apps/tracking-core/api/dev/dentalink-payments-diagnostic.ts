import {
  methodNotAllowed,
  send,
  toHttpRequest,
  type VercelRequest,
  type VercelResponse,
} from "../_lib/http.js";
import { requireTrackingSecret, serverError } from "../../src/index.js";
import { getDentalinkConfig } from "../../src/modules/dentalink/config.js";
import { buildPaymentsQuery } from "../../src/modules/dentalink/payloads.js";

interface PaymentWindowProbe {
  label: string;
  lookbackDays: number;
  ok: boolean;
  status: number;
  statusText: string;
  urlPath: string;
  returnedCount: number | null;
  responseShape: string[];
  samplePaymentShape: PaymentShape | null;
}

interface PaymentShape {
  fields: Array<{
    name: string;
    type: string;
  }>;
  expectedFields: Record<string, boolean>;
}

const WINDOWS = [
  { label: "7 dias", days: 7 },
  { label: "30 dias", days: 30 },
  { label: "90 dias", days: 90 },
];

export default async function handler(
  request: VercelRequest,
  response: VercelResponse,
): Promise<void> {
  if (request.method !== "GET") {
    methodNotAllowed(response);
    return;
  }

  const authError = requireTrackingSecret(toHttpRequest(request));
  if (authError) {
    send(response, authError);
    return;
  }

  try {
    const config = getDentalinkConfig();

    if (config.mode !== "api") {
      send(response, {
        status: 200,
        body: {
          ok: true,
          mode: config.mode,
          message: "Dentalink is running in stub mode.",
        },
      });
      return;
    }

    if (!config.apiToken) {
      send(response, {
        status: 500,
        body: {
          ok: false,
          error: "Dentalink API token is not configured.",
        },
      });
      return;
    }

    const probes = await Promise.all(
      WINDOWS.map((window) =>
        probePaymentsWindow(
          config.baseUrl,
          config.apiAuthScheme,
          config.apiToken,
          config.paymentsPath,
          config.paymentDateField,
          {
            paymentIdField: config.paymentIdField,
            paymentPatientIdField: config.paymentPatientIdField,
            paymentTreatmentIdField: config.paymentTreatmentIdField,
            paymentAmountField: config.paymentAmountField,
            paymentDateField: config.paymentDateField,
          },
          window.label,
          window.days,
        ),
      ),
    );

    send(response, {
      status: 200,
      body: {
        ok: probes.some((probe) => probe.ok),
        mode: config.mode,
        paymentDateField: config.paymentDateField,
        paymentAmountField: config.paymentAmountField,
        probes,
      },
    });
  } catch (error) {
    send(
      response,
      serverError("failed to diagnose Dentalink payments", {
        message: error instanceof Error ? error.message : "unknown error",
      }),
    );
  }
}

async function probePaymentsWindow(
  baseUrl: string,
  apiAuthScheme: string,
  apiToken: string,
  paymentsPath: string,
  paymentDateField: string,
  expectedFields: {
    paymentIdField: string;
    paymentPatientIdField: string;
    paymentTreatmentIdField: string;
    paymentAmountField: string;
    paymentDateField: string;
  },
  label: string,
  lookbackDays: number,
): Promise<PaymentWindowProbe> {
  const sinceIso = new Date(
    Date.now() - lookbackDays * 24 * 60 * 60 * 1000,
  ).toISOString();
  const query = buildPaymentsQuery(paymentDateField, sinceIso);
  const url = new URL(paymentsPath.replace(/^\/+/, ""), baseUrl);
  url.search = query;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: `${apiAuthScheme} ${apiToken}`,
    },
  });

  if (!response.ok) {
    return {
      label,
      lookbackDays,
      ok: false,
      status: response.status,
      statusText: response.statusText,
      urlPath: `${url.pathname}${url.search}`,
      returnedCount: null,
      responseShape: [],
      samplePaymentShape: null,
    };
  }

  const body = (await response.json()) as unknown;
  const collection = readCollection(body);

  return {
    label,
    lookbackDays,
    ok: true,
    status: response.status,
    statusText: response.statusText,
    urlPath: `${url.pathname}${url.search}`,
    returnedCount: collection?.length ?? null,
    responseShape: describeShape(body),
    samplePaymentShape: collection?.[0]
      ? describePaymentShape(collection[0], expectedFields)
      : null,
  };
}

function readCollection(body: unknown): Record<string, unknown>[] | null {
  if (Array.isArray(body)) {
    return body.filter(isRecord);
  }

  if (isRecord(body) && Array.isArray(body.data)) {
    return body.data.filter(isRecord);
  }

  return null;
}

function describeShape(body: unknown): string[] {
  return isRecord(body) ? Object.keys(body).sort() : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function describePaymentShape(
  payment: Record<string, unknown>,
  expectedFields: {
    paymentIdField: string;
    paymentPatientIdField: string;
    paymentTreatmentIdField: string;
    paymentAmountField: string;
    paymentDateField: string;
  },
): PaymentShape {
  return {
    fields: Object.keys(payment)
      .sort()
      .map((name) => ({
        name,
        type: describeValueType(payment[name]),
      })),
    expectedFields: {
      [expectedFields.paymentIdField]: Object.hasOwn(payment, expectedFields.paymentIdField),
      [expectedFields.paymentPatientIdField]: Object.hasOwn(
        payment,
        expectedFields.paymentPatientIdField,
      ),
      [expectedFields.paymentTreatmentIdField]: Object.hasOwn(
        payment,
        expectedFields.paymentTreatmentIdField,
      ),
      [expectedFields.paymentAmountField]: Object.hasOwn(
        payment,
        expectedFields.paymentAmountField,
      ),
      [expectedFields.paymentDateField]: Object.hasOwn(payment, expectedFields.paymentDateField),
    },
  };
}

function describeValueType(value: unknown): string {
  if (Array.isArray(value)) {
    return "array";
  }

  if (value === null) {
    return "null";
  }

  return typeof value;
}
