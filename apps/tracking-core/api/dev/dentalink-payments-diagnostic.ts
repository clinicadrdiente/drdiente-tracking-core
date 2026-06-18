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
  recentPayments?: RecentPayment[];
}

interface PaymentShape {
  fields: Array<{
    name: string;
    type: string;
  }>;
  expectedFields: Record<string, boolean>;
}

interface RecentPayment {
  id: number;
  patientId: number;
  patientName: string | null;
  patientEmail: string | null;
  patientEmailStatus: string;
  patientPhone: string | null;
  patientPhoneStatus: string;
  treatmentId: number;
  treatmentName: string | null;
  treatmentBudgetTotal: number;
  branch: string | null;
  amount: number;
  paymentMethod: string | null;
  createdAt: string | null;
  folio: string | null;
  reference: string | null;
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
            patientsPathTemplate: config.patientsPathTemplate,
            patientEmailField: config.patientEmailField,
            patientPhoneField: config.patientPhoneField,
            patientFirstNameField: config.patientFirstNameField,
            patientLastNameField: config.patientLastNameField,
            treatmentsPathTemplate: config.treatmentsPathTemplate,
            treatmentNameField: config.treatmentNameField,
            treatmentBudgetTotalField: config.treatmentBudgetTotalField,
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
        recentPayments: probes[0]?.recentPayments ?? [],
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
    patientsPathTemplate: string;
    patientEmailField: string;
    patientPhoneField: string;
    patientFirstNameField: string;
    patientLastNameField: string;
    treatmentsPathTemplate: string;
    treatmentNameField: string;
    treatmentBudgetTotalField: string;
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
  const recentPayments =
    lookbackDays === 7 && collection
      ? await describeRecentPayments(
          collection.slice(0, 10),
          baseUrl,
          apiAuthScheme,
          apiToken,
          expectedFields,
        )
      : undefined;

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
    recentPayments,
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
      [expectedFields.paymentIdField]: Object.hasOwn(
        payment,
        expectedFields.paymentIdField,
      ),
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
      [expectedFields.paymentDateField]: Object.hasOwn(
        payment,
        expectedFields.paymentDateField,
      ),
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

async function describeRecentPayments(
  payments: Record<string, unknown>[],
  baseUrl: string,
  apiAuthScheme: string,
  apiToken: string,
  config: {
    paymentPatientIdField: string;
    paymentTreatmentIdField: string;
    patientsPathTemplate: string;
    patientEmailField: string;
    patientPhoneField: string;
    patientFirstNameField: string;
    patientLastNameField: string;
    treatmentsPathTemplate: string;
    treatmentNameField: string;
    treatmentBudgetTotalField: string;
  },
): Promise<RecentPayment[]> {
  const recentPayments: RecentPayment[] = [];

  for (const payment of payments) {
    const patientId = readNumber(payment, config.paymentPatientIdField);
    const treatmentId = readNumber(payment, config.paymentTreatmentIdField);
    const patient =
      patientId > 0
        ? await fetchPatientDetails(
            baseUrl,
            apiAuthScheme,
            apiToken,
            config.patientsPathTemplate,
            patientId,
            config,
          )
        : null;
    const treatment =
      treatmentId > 0
        ? await fetchTreatmentDetails(
            baseUrl,
            apiAuthScheme,
            apiToken,
            config.treatmentsPathTemplate,
            treatmentId,
            config,
          )
        : null;

    recentPayments.push(describeRecentPayment(payment, patient, treatment));
  }

  return recentPayments;
}

async function fetchPatientDetails(
  baseUrl: string,
  apiAuthScheme: string,
  apiToken: string,
  patientsPathTemplate: string,
  patientId: number,
  config: {
    patientEmailField: string;
    patientPhoneField: string;
    patientFirstNameField: string;
    patientLastNameField: string;
  },
): Promise<{
  email: string | null;
  emailStatus: string;
  phone: string | null;
  phoneStatus: string;
  fullName: string | null;
}> {
  const path = patientsPathTemplate.replace("{id}", String(patientId));
  const url = new URL(path.replace(/^\/+/, ""), baseUrl);
  const response = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: `${apiAuthScheme} ${apiToken}`,
    },
  });

  if (!response.ok) {
    return {
      email: null,
      emailStatus: `unavailable_${response.status}`,
      phone: null,
      phoneStatus: `unavailable_${response.status}`,
      fullName: null,
    };
  }

  const record = unwrapRecord((await response.json()) as unknown);
  const firstName = readString(record, config.patientFirstNameField);
  const lastName = readString(record, config.patientLastNameField);
  const email = readString(record, config.patientEmailField);
  const phone = readString(record, config.patientPhoneField);

  return {
    email,
    emailStatus: email ? "found" : "empty",
    phone,
    phoneStatus: phone ? "found" : "empty",
    fullName: [firstName, lastName].filter(Boolean).join(" ") || null,
  };
}

async function fetchTreatmentDetails(
  baseUrl: string,
  apiAuthScheme: string,
  apiToken: string,
  treatmentsPathTemplate: string,
  treatmentId: number,
  config: {
    treatmentNameField: string;
    treatmentBudgetTotalField: string;
  },
): Promise<{
  name: string | null;
  budgetTotal: number;
  status: string;
}> {
  const path = treatmentsPathTemplate.replace("{id}", String(treatmentId));
  const url = new URL(path.replace(/^\/+/, ""), baseUrl);
  const response = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: `${apiAuthScheme} ${apiToken}`,
    },
  });

  if (!response.ok) {
    return {
      name: null,
      budgetTotal: 0,
      status: `unavailable_${response.status}`,
    };
  }

  const record = unwrapRecord((await response.json()) as unknown);
  const name = readString(record, config.treatmentNameField);
  const budgetTotal = readNumber(record, config.treatmentBudgetTotalField);

  return {
    name,
    budgetTotal,
    status: name || budgetTotal > 0 ? "found" : "empty",
  };
}

function describeRecentPayment(
  payment: Record<string, unknown>,
  patient: {
    email: string | null;
    emailStatus: string;
    phone: string | null;
    phoneStatus: string;
    fullName: string | null;
  } | null,
  treatment: {
    name: string | null;
    budgetTotal: number;
    status: string;
  } | null,
): RecentPayment {
  return {
    id: readNumber(payment, "id"),
    patientId: readNumber(payment, "id_paciente"),
    patientName:
      readString(payment, "nombre_paciente") ?? patient?.fullName ?? null,
    patientEmail: patient?.email ?? null,
    patientEmailStatus: patient?.emailStatus ?? "not_requested",
    patientPhone: patient?.phone ?? null,
    patientPhoneStatus: patient?.phoneStatus ?? "not_requested",
    treatmentId: readNumber(payment, "id_tratamiento"),
    treatmentName: treatment?.name ?? null,
    treatmentBudgetTotal: treatment?.budgetTotal ?? 0,
    branch: readString(payment, "nombre_sucursal"),
    amount: readNumber(payment, "monto_pago"),
    paymentMethod: readString(payment, "medio_pago"),
    createdAt: readString(payment, "fecha_creacion"),
    folio: readString(payment, "folio"),
    reference: readString(payment, "numero_referencia"),
  };
}

function unwrapRecord(response: unknown): Record<string, unknown> {
  if (isRecord(response) && isRecord(response.data)) {
    return response.data;
  }

  return isRecord(response) ? response : {};
}

function readString(
  record: Record<string, unknown>,
  key: string,
): string | null {
  const value = record[key];
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function readNumber(record: Record<string, unknown>, key: string): number {
  const value = record[key];

  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}
