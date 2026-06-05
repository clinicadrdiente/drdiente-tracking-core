import type {
  AppointmentEvent,
  DentalinkPatient,
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
    const response = await this.request("GET", path);
    return mapPatientRecord(
      this.config,
      response as Record<string, unknown>,
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
    const response = await this.request("GET", path);
    const paymentRecords = Array.isArray(response) ? response : [];
    const payments: PaymentEvent[] = [];

    for (const paymentRecord of paymentRecords) {
      const record = paymentRecord as Record<string, unknown>;
      const treatmentId = record[this.config.paymentTreatmentIdField];
      const treatment = await this.getTreatment(Number(treatmentId));
      payments.push(mapPaymentRecord(this.config, record, treatment));
    }

    return payments;
  }

  private async getTreatment(treatmentId: number) {
    const path = this.config.treatmentsPathTemplate.replace(
      "{id}",
      String(treatmentId),
    );
    const response = await this.request("GET", path);
    return mapTreatmentRecord(
      this.config,
      response as Record<string, unknown>,
    );
  }

  private async request(
    method: "GET" | "PUT",
    path: string,
    body?: Record<string, unknown>,
  ): Promise<unknown> {
    const response = await this.fetchImpl(new URL(path, this.config.baseUrl), {
      method,
      headers: {
        Authorization: `Bearer ${this.config.apiToken}`,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      throw new Error(`Dentalink API request failed with status ${response.status}`);
    }

    return (await response.json()) as unknown;
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
