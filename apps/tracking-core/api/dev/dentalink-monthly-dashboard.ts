import {
  methodNotAllowed,
  send,
  toHttpRequest,
  type VercelRequest,
  type VercelResponse,
} from "../_lib/http.js";
import { requireTrackingSecret, serverError } from "../../src/index.js";
import { getDentalinkConfig } from "../../src/modules/dentalink/config.js";

interface MonthlyPaymentBlock {
  paymentId: number;
  patientId: number;
  patientName: string | null;
  patientEmail: string | null;
  patientPhone: string | null;
  treatmentId: number;
  treatmentName: string | null;
  treatmentBudgetTotal: number;
  branch: string | null;
  paymentMethod: string | null;
  folio: string | null;
  reference: string | null;
  amount: number;
  createdAt: string | null;
}

interface DayBlock {
  day: number;
  date: string;
  label: string;
  revenue: number;
  payments: number;
  patients: MonthlyPaymentBlock[];
}

const MAX_PAYMENT_PAGES = 20;

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
          revenueTotal: 0,
          paymentsTotal: 0,
          uniquePatientsTotal: 0,
          averagePaymentValue: 0,
          days: [],
          patients: [],
          treatmentShare: [],
        },
      });
      return;
    }

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const monthEnd = new Date(nextMonthStart.getTime() - 1000);
    const paymentRecords = await fetchMonthlyPaymentRecords(
      config.baseUrl,
      config.apiAuthScheme,
      config.apiToken,
      config.paymentsPath,
      config.paymentDateField,
      monthStart,
      monthEnd,
    );

    const patientCache = new Map<number, PatientDetail>();
    const treatmentCache = new Map<number, TreatmentDetail>();
    const payments: MonthlyPaymentBlock[] = [];

    for (const record of paymentRecords) {
      const patientId = readNumber(record, config.paymentPatientIdField);
      const treatmentId = readNumber(record, config.paymentTreatmentIdField);
      const patient = await getCachedPatient(
        patientCache,
        config.baseUrl,
        config.apiAuthScheme,
        config.apiToken,
        config.patientsPathTemplate,
        patientId,
        {
          emailField: config.patientEmailField,
          phoneField: config.patientPhoneField,
          firstNameField: config.patientFirstNameField,
          lastNameField: config.patientLastNameField,
        },
      );
      const treatment = await getCachedTreatment(
        treatmentCache,
        config.baseUrl,
        config.apiAuthScheme,
        config.apiToken,
        config.treatmentsPathTemplate,
        treatmentId,
        {
          nameField: config.treatmentNameField,
          budgetTotalField: config.treatmentBudgetTotalField,
        },
      );

      payments.push({
        paymentId: readNumber(record, config.paymentIdField),
        patientId,
        patientName:
          readString(record, config.paymentPatientNameField) ??
          patient.fullName,
        patientEmail: patient.email,
        patientPhone: patient.phone,
        treatmentId,
        treatmentName: treatment.name,
        treatmentBudgetTotal: treatment.budgetTotal,
        branch: readString(record, config.paymentBranchField),
        paymentMethod: readString(record, config.paymentMethodField),
        folio: readString(record, config.paymentFolioField),
        reference: readString(record, config.paymentReferenceField),
        amount: readNumber(record, config.paymentAmountField),
        createdAt: readString(record, config.paymentDateField),
      });
    }

    payments.sort((a, b) => Date.parse(b.createdAt ?? "") - Date.parse(a.createdAt ?? ""));

    const days = buildDayBlocks(monthStart, monthEnd, payments);
    const revenueTotal = payments.reduce((sum, payment) => sum + payment.amount, 0);
    const uniquePatientsTotal = new Set(
      payments.map((payment) => payment.patientId).filter((id) => id > 0),
    ).size;

    send(response, {
      status: 200,
      body: {
        ok: true,
        mode: config.mode,
        month: {
          label: monthStart.toLocaleDateString("es-MX", {
            month: "long",
            year: "numeric",
          }),
          fromIso: monthStart.toISOString(),
          toIso: monthEnd.toISOString(),
        },
        revenueTotal,
        paymentsTotal: payments.length,
        uniquePatientsTotal,
        averagePaymentValue: payments.length > 0 ? revenueTotal / payments.length : 0,
        days,
        patients: payments,
        treatmentShare: buildTreatmentShare(payments),
      },
    });
  } catch (error) {
    send(
      response,
      serverError("failed to build monthly Dentalink dashboard", {
        message: error instanceof Error ? error.message : "unknown error",
      }),
    );
  }
}

async function fetchMonthlyPaymentRecords(
  baseUrl: string,
  apiAuthScheme: string,
  apiToken: string,
  paymentsPath: string,
  paymentDateField: string,
  monthStart: Date,
  monthEnd: Date,
): Promise<Record<string, unknown>[]> {
  const records: Record<string, unknown>[] = [];
  let pageUrl: URL | null = new URL(paymentsPath.replace(/^\/+/, ""), baseUrl);
  pageUrl.search = buildMonthlyPaymentsQuery(paymentDateField, monthStart, monthEnd);

  for (let page = 0; pageUrl && page < MAX_PAYMENT_PAGES; page += 1) {
    const body = await requestDentalink(pageUrl, apiAuthScheme, apiToken);
    const collection = readCollection(body).filter((record) =>
      isRecordInsideDateRange(record, paymentDateField, monthStart, monthEnd),
    );
    records.push(...collection);
    pageUrl = readNextPageUrl(body, baseUrl);
  }

  return records;
}

function buildMonthlyPaymentsQuery(
  dateField: string,
  monthStart: Date,
  monthEnd: Date,
): string {
  const filter = JSON.stringify({
    [dateField]: {
      gte: toDentalinkDateTime(monthStart),
    },
  });
  return `q=${encodeURIComponent(filter)}`;
}

async function requestDentalink(
  url: URL,
  apiAuthScheme: string,
  apiToken: string,
): Promise<unknown> {
  const response = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: `${apiAuthScheme} ${apiToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(
      `Dentalink API request failed with status ${response.status} for ${url.pathname}`,
    );
  }

  return (await response.json()) as unknown;
}

interface PatientDetail {
  email: string | null;
  phone: string | null;
  fullName: string | null;
}

interface TreatmentDetail {
  name: string | null;
  budgetTotal: number;
}

async function getCachedPatient(
  cache: Map<number, PatientDetail>,
  baseUrl: string,
  apiAuthScheme: string,
  apiToken: string,
  patientsPathTemplate: string,
  patientId: number,
  fields: {
    emailField: string;
    phoneField: string;
    firstNameField: string;
    lastNameField: string;
  },
): Promise<PatientDetail> {
  if (!Number.isFinite(patientId) || patientId <= 0) {
    return emptyPatient();
  }

  const cached = cache.get(patientId);
  if (cached) {
    return cached;
  }

  const path = patientsPathTemplate.replace("{id}", String(patientId));
  const url = new URL(path.replace(/^\/+/, ""), baseUrl);

  try {
    const record = unwrapRecord(await requestDentalink(url, apiAuthScheme, apiToken));
    const firstName = readString(record, fields.firstNameField);
    const lastName = readString(record, fields.lastNameField);
    const patient = {
      email: readString(record, fields.emailField),
      phone: readString(record, fields.phoneField),
      fullName: [firstName, lastName].filter(Boolean).join(" ") || null,
    };
    cache.set(patientId, patient);
    return patient;
  } catch {
    const patient = emptyPatient();
    cache.set(patientId, patient);
    return patient;
  }
}

async function getCachedTreatment(
  cache: Map<number, TreatmentDetail>,
  baseUrl: string,
  apiAuthScheme: string,
  apiToken: string,
  treatmentsPathTemplate: string,
  treatmentId: number,
  fields: {
    nameField: string;
    budgetTotalField: string;
  },
): Promise<TreatmentDetail> {
  if (!Number.isFinite(treatmentId) || treatmentId <= 0) {
    return emptyTreatment();
  }

  const cached = cache.get(treatmentId);
  if (cached) {
    return cached;
  }

  const path = treatmentsPathTemplate.replace("{id}", String(treatmentId));
  const url = new URL(path.replace(/^\/+/, ""), baseUrl);

  try {
    const record = unwrapRecord(await requestDentalink(url, apiAuthScheme, apiToken));
    const treatment = {
      name: readString(record, fields.nameField),
      budgetTotal: readNumber(record, fields.budgetTotalField),
    };
    cache.set(treatmentId, treatment);
    return treatment;
  } catch {
    const treatment = emptyTreatment();
    cache.set(treatmentId, treatment);
    return treatment;
  }
}

function buildDayBlocks(
  monthStart: Date,
  monthEnd: Date,
  payments: MonthlyPaymentBlock[],
): DayBlock[] {
  const days: DayBlock[] = [];
  const cursor = new Date(monthStart);

  while (cursor <= monthEnd) {
    const dateKey = toDateKey(cursor);
    const patients = payments.filter((payment) =>
      payment.createdAt ? toDateKey(new Date(payment.createdAt)) === dateKey : false,
    );
    days.push({
      day: cursor.getDate(),
      date: dateKey,
      label: cursor.toLocaleDateString("es-MX", {
        day: "numeric",
        month: "short",
      }),
      revenue: patients.reduce((sum, payment) => sum + payment.amount, 0),
      payments: patients.length,
      patients,
    });
    cursor.setDate(cursor.getDate() + 1);
  }

  return days;
}

function buildTreatmentShare(payments: MonthlyPaymentBlock[]) {
  const totals = new Map<string, number>();
  const revenueTotal = payments.reduce((sum, payment) => sum + payment.amount, 0);

  for (const payment of payments) {
    const key = payment.treatmentName ?? `Tratamiento #${payment.treatmentId || "sin-id"}`;
    totals.set(key, (totals.get(key) ?? 0) + payment.amount);
  }

  return [...totals.entries()]
    .map(([category, revenue]) => ({
      category,
      revenue,
      share: revenueTotal > 0 ? (revenue / revenueTotal) * 100 : 0,
    }))
    .sort((a, b) => b.revenue - a.revenue);
}

function readNextPageUrl(body: unknown, baseUrl: string): URL | null {
  if (!isRecord(body) || !isRecord(body.links)) {
    return null;
  }

  const next = body.links.next;
  if (typeof next !== "string" || next.trim() === "") {
    return null;
  }

  return new URL(next, baseUrl);
}

function readCollection(body: unknown): Record<string, unknown>[] {
  if (Array.isArray(body)) {
    return body.filter(isRecord);
  }

  if (isRecord(body) && Array.isArray(body.data)) {
    return body.data.filter(isRecord);
  }

  return [];
}

function unwrapRecord(response: unknown): Record<string, unknown> {
  if (isRecord(response) && isRecord(response.data)) {
    return response.data;
  }

  return isRecord(response) ? response : {};
}

function isRecordInsideDateRange(
  record: Record<string, unknown>,
  dateField: string,
  monthStart: Date,
  monthEnd: Date,
): boolean {
  const value = readString(record, dateField);
  if (!value) {
    return false;
  }

  const time = Date.parse(value);
  return Number.isFinite(time) && time >= monthStart.getTime() && time <= monthEnd.getTime();
}

function toDentalinkDateTime(date: Date): string {
  return date.toISOString().replace("T", " ").replace(/\.\d{3}Z$/, "");
}

function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function emptyPatient(): PatientDetail {
  return {
    email: null,
    phone: null,
    fullName: null,
  };
}

function emptyTreatment(): TreatmentDetail {
  return {
    name: null,
    budgetTotal: 0,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readString(record: Record<string, unknown>, key: string): string | null {
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
