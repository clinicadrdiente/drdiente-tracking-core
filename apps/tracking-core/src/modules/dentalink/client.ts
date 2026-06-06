import type {
  AppointmentEvent,
  DentalinkPatient,
  DentalinkTreatment,
  PaymentEvent,
} from "../../types/domain.js";
import { getDentalinkConfig, type DentalinkConfig } from "./config.js";
import {
  buildPatientElevatorIdPayload,
  buildPaymentsQuery,
  mapPatientRecord,
  mapPaymentRecord,
  mapTreatmentRecord,
} from "./payloads.js";

export interface DentalinkClient {
  getPatient(patientId: number): Promise<DentalinkPatient>;
  setPatientElevatorId(patientId: number, elevatorId: string): Promise<void>;
  listRecentPayments(sinceIso: string): Promise<PaymentEvent[]>;
}

export class StubDentalinkClient implements DentalinkClient {
  async getPatient(patientId: number): Promise<DentalinkPatient> {
    return {
      patientId,
      firstName: "Paciente",
      lastName: "Demo",
      phone: "+52 55 1234 5678",
      email: "paciente@example.com",
      branch: "Polanco",
    };
  }

  async setPatientElevatorId(
    _patientId: number,
    _elevatorId: string,
  ): Promise<void> {
    return;
  }

  async listRecentPayments(_sinceIso: string): Promise<PaymentEvent[]> {
    return [
      {
        paymentId: 9123,
        patientId: 482,
        treatmentId: 77,
        treatmentName: "Diseno de Sonrisa",
        paymentAmount: 30000,
        budgetTotal: 150000,
        currency: "MXN",
        isVoided: false,
        paidAt: new Date().toISOString(),
      },
    ];
  }
}

export class ApiDentalinkClient implements DentalinkClient {
  constructor(
    private readonly config: DentalinkConfig,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async getPatient(patientId: number): Promise<DentalinkPatient> {
    const path = this.config.patientsPathTemplate.replace("{id}", String(patientId));
    const response = unwrapRecord(await this.request("GET", path));
    return mapPatientRecord(
      this.config,
      response,
    );
  }

  async setPatientElevatorId(
    patientId: number,
    elevatorId: string,
  ): Promise<void> {
    const path = this.config.patientUpdatePathTemplate.replace(
      "{id}",
      String(patientId),
    );
    const payload = buildPatientElevatorIdPayload(this.config, elevatorId);
    await this.request("PUT", path, payload);
  }

  async listRecentPayments(sinceIso: string): Promise<PaymentEvent[]> {
    const query = buildPaymentsQuery(sinceIso);
    const path = `${this.config.paymentsPath}?${query}`;
    const response = await this.requestWithFallbackForBadFilter(path);
    const paymentRecords = unwrapCollection(response).filter((record) =>
      isRecordOnOrAfter(record, this.config.paymentDateField, sinceIso),
    );
    const payments: PaymentEvent[] = [];

    for (const paymentRecord of paymentRecords) {
      const record = paymentRecord;
      const treatmentId = record[this.config.paymentTreatmentIdField];
      const treatment = await this.getTreatmentIfAvailable(Number(treatmentId));
      payments.push(mapPaymentRecord(this.config, record, treatment));
    }

    return payments;
  }

  private async requestWithFallbackForBadFilter(path: string): Promise<unknown> {
    try {
      return await this.request("GET", path);
    } catch (error) {
      if (
        error instanceof DentalinkRequestError &&
        error.status === 400 &&
        path.includes("?")
      ) {
        return this.request("GET", this.config.paymentsPath);
      }

      throw error;
    }
  }

  private async getTreatmentIfAvailable(
    treatmentId: number,
  ): Promise<DentalinkTreatment> {
    if (!Number.isFinite(treatmentId) || treatmentId <= 0) {
      return emptyTreatment(treatmentId);
    }

    try {
      return await this.getTreatment(treatmentId);
    } catch (error) {
      if (error instanceof DentalinkRequestError && error.status === 404) {
        return emptyTreatment(treatmentId);
      }

      throw error;
    }
  }

  private async getTreatment(treatmentId: number) {
    const path = this.config.treatmentsPathTemplate.replace(
      "{id}",
      String(treatmentId),
    );
    const response = await this.request("GET", path);
    const record = unwrapRecord(response);
    return mapTreatmentRecord(
      this.config,
      record,
    );
  }

  private async request(
    method: "GET" | "PUT",
    path: string,
    body?: Record<string, unknown>,
  ): Promise<unknown> {
    const url = new URL(path.replace(/^\/+/, ""), this.config.baseUrl);
    const response = await this.fetchImpl(url, {
      method,
      headers: {
        Authorization: `${this.config.apiAuthScheme} ${this.config.apiToken}`,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      throw new DentalinkRequestError(
        response.status,
        `Dentalink API request failed with status ${response.status} for ${url.pathname}`,
      );
    }

    return (await response.json()) as unknown;
  }
}

class DentalinkRequestError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "DentalinkRequestError";
  }
}

export function parseAppointmentEvent(payload: AppointmentEvent): AppointmentEvent {
  return payload;
}

export function createDentalinkClient(): DentalinkClient {
  const config = getDentalinkConfig();
  return config.mode === "api"
    ? new ApiDentalinkClient(config)
    : new StubDentalinkClient();
}

function unwrapRecord(response: unknown): Record<string, unknown> {
  if (isRecord(response) && isRecord(response.data)) {
    return response.data;
  }

  return isRecord(response) ? response : {};
}

function unwrapCollection(response: unknown): Record<string, unknown>[] {
  if (isRecord(response) && Array.isArray(response.data)) {
    return response.data.filter(isRecord);
  }

  if (Array.isArray(response)) {
    return response.filter(isRecord);
  }

  return [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isRecordOnOrAfter(
  record: Record<string, unknown>,
  dateField: string,
  sinceIso: string,
): boolean {
  const value = record[dateField];

  if (typeof value !== "string" || value.trim() === "") {
    return true;
  }

  const date = Date.parse(value);
  return Number.isNaN(date) ? true : date >= Date.parse(sinceIso);
}

function emptyTreatment(treatmentId: number): DentalinkTreatment {
  return {
    treatmentId,
    name: null,
    budgetTotal: 0,
  };
}
