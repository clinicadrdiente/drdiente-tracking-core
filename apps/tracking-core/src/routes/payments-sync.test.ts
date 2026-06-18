import { describe, it, expect } from "vitest";
import { handlePaymentsSync } from "./payments-sync.js";
import { InMemoryStateStore } from "../modules/state/state-store.js";
import type { StateStore } from "../modules/state/state-store.js";
import type { DentalinkClient } from "../modules/dentalink/client.js";
import type { ElevatorClient } from "../modules/elevator/client.js";
import type { ElevatorEventsDispatcher } from "../modules/elevator/events.js";
import type { StapeClient } from "../modules/stape/client.js";
import type {
  CanonicalLead,
  ConversionEvent,
  DentalinkPatient,
  DentalinkTreatment,
  LeadInput,
  PaymentEvent,
} from "../types/domain.js";

const SINCE_ISO = "2026-06-01T00:00:00.000Z";
const HIGH_TICKET_THRESHOLD = 10000;

function makePayment(overrides: Partial<PaymentEvent> = {}): PaymentEvent {
  return {
    paymentId: 5001,
    patientId: 700,
    treatmentId: 900,
    treatmentName: "Implante",
    patientName: "Paciente Demo",
    branch: "Polanco",
    paymentMethod: "tarjeta",
    folio: null,
    reference: null,
    paymentAmount: 5000,
    budgetTotal: 25000,
    currency: "MXN",
    isVoided: false,
    paidAt: "2026-06-05T10:00:00.000Z",
    ...overrides,
  };
}

function makePatient(overrides: Partial<DentalinkPatient> = {}): DentalinkPatient {
  return {
    patientId: 700,
    firstName: "Paciente",
    lastName: "Demo",
    phone: "5215555555555",
    email: "paciente@example.com",
    branch: "Polanco",
    ...overrides,
  };
}

function makeLead(overrides: Partial<CanonicalLead> = {}): CanonicalLead {
  return {
    elevatorId: "ELV_TEST_001",
    firstName: "Paciente",
    lastName: "Demo",
    phoneRaw: "5215555555555",
    phoneNormalized: "5215555555555",
    emailRaw: "paciente@example.com",
    emailNormalized: "paciente@example.com",
    branch: "Polanco",
    attribution: {},
    ...overrides,
  };
}

function makeDentalinkClient(payment: PaymentEvent, patient: DentalinkPatient): DentalinkClient {
  return {
    async getPatient(_patientId: number): Promise<DentalinkPatient> {
      return patient;
    },
    async setPatientElevatorId(_patientId: number, _elevatorId: string): Promise<void> {
      // no-op
    },
    async listRecentPayments(_sinceIso: string, _limit?: number): Promise<PaymentEvent[]> {
      return [payment];
    },
    async getPatientTreatments(_patientId: number): Promise<DentalinkTreatment[]> {
      return [];
    },
  };
}

function makeElevatorClient(lead: CanonicalLead): ElevatorClient {
  return {
    async createLead(_input: LeadInput): Promise<CanonicalLead> {
      return lead;
    },
    async findLeadsByIdentity(
      _phone: string,
      _email?: string | null,
    ): Promise<CanonicalLead[]> {
      return [lead];
    },
    async updateLeadStage(_elevatorId: string, _stage: string): Promise<void> {
      // no-op
    },
  };
}

interface RecordingStapeClient extends StapeClient {
  received: ConversionEvent[];
}

function makeStapeClient(shouldThrow: () => boolean): RecordingStapeClient {
  const received: ConversionEvent[] = [];
  return {
    received,
    getMode(): "stub" {
      return "stub";
    },
    async dispatch(event: ConversionEvent): Promise<void> {
      if (shouldThrow()) {
        throw new Error("stape dispatch failed");
      }
      received.push(event);
    },
  };
}

interface RecordingElevatorEvents extends ElevatorEventsDispatcher {
  received: ConversionEvent[];
}

function makeElevatorEvents(shouldThrow: () => boolean): RecordingElevatorEvents {
  const received: ConversionEvent[] = [];
  return {
    received,
    getMode(): "stub" {
      return "stub";
    },
    async dispatch(event: ConversionEvent): Promise<void> {
      if (shouldThrow()) {
        throw new Error("elevator events dispatch failed");
      }
      received.push(event);
    },
  };
}

describe("handlePaymentsSync purchase claim release", () => {
  it("happy path: dispatches, keeps the treatment claim, and marks the payment processed", async () => {
    const payment = makePayment();
    const stateStore = new InMemoryStateStore();
    const stape = makeStapeClient(() => false);

    const result = await handlePaymentsSync(
      makeDentalinkClient(payment, makePatient()),
      makeElevatorClient(makeLead()),
      stape,
      stateStore,
      SINCE_ISO,
      HIGH_TICKET_THRESHOLD,
    );

    expect(result.dispatched).toBe(1);
    expect(stape.received).toHaveLength(1);
    // Treatment claim remains held (re-claim attempt returns false).
    expect(await stateStore.claimPaymentProcessed(`treatment_${payment.treatmentId}`)).toBe(false);
    // Payment row is marked processed.
    expect(await stateStore.hasProcessedPayment(`payment_${payment.paymentId}`)).toBe(true);
  });

  it("regression: total dispatch failure releases the claim and retries on the next sync", async () => {
    const payment = makePayment();
    const stateStore = new InMemoryStateStore();

    // First sync: both dispatch targets fail.
    let stapeFails = true;
    let elevatorFails = true;
    const failingStape = makeStapeClient(() => stapeFails);
    const failingElevator = makeElevatorEvents(() => elevatorFails);

    const firstResult = await handlePaymentsSync(
      makeDentalinkClient(payment, makePatient()),
      makeElevatorClient(makeLead()),
      failingStape,
      stateStore,
      SINCE_ISO,
      HIGH_TICKET_THRESHOLD,
      undefined,
      failingElevator,
    );

    expect(firstResult.dispatched).toBe(0);
    expect(firstResult.stapeEventsFailed).toBe(1);
    expect(firstResult.elevatorEventsFailed).toBe(1);
    expect(failingStape.received).toHaveLength(0);
    // Payment row stays retryable (not marked processed).
    expect(await stateStore.hasProcessedPayment(`payment_${payment.paymentId}`)).toBe(false);
    // The purchase claim was released, so it can be re-claimed.
    expect(await stateStore.claimPaymentProcessed(`treatment_${payment.treatmentId}`)).toBe(true);
    // Release it again so the retry sync can re-claim it itself.
    await stateStore.releasePaymentClaim(`treatment_${payment.treatmentId}`);

    // Second sync: Stape succeeds.
    stapeFails = false;
    elevatorFails = false;
    const okStape = makeStapeClient(() => false);

    const secondResult = await handlePaymentsSync(
      makeDentalinkClient(payment, makePatient()),
      makeElevatorClient(makeLead()),
      okStape,
      stateStore,
      SINCE_ISO,
      HIGH_TICKET_THRESHOLD,
    );

    expect(secondResult.dispatched).toBe(1);
    expect(okStape.received).toHaveLength(1);
    expect(await stateStore.hasProcessedPayment(`payment_${payment.paymentId}`)).toBe(true);
  });

  it("voided path: total dispatch failure does not release a claim that was never made", async () => {
    const payment = makePayment({ isVoided: true });
    const inner = new InMemoryStateStore();
    let releaseCalls = 0;
    const trackingStore: StateStore = {
      getPaymentSyncState: () => inner.getPaymentSyncState(),
      savePaymentSyncState: (state) => inner.savePaymentSyncState(state),
      hasProcessedPayment: (id) => inner.hasProcessedPayment(id),
      markPaymentProcessed: (id) => inner.markPaymentProcessed(id),
      claimPaymentProcessed: (id) => inner.claimPaymentProcessed(id),
      releasePaymentClaim: (id) => {
        releaseCalls += 1;
        return inner.releasePaymentClaim(id);
      },
      writeHeartbeat: (key, ts) => inner.writeHeartbeat(key, ts),
      readHeartbeat: (key) => inner.readHeartbeat(key),
      saveDailyReport: (report) => inner.saveDailyReport(report),
      listDailyReports: (from, to) => inner.listDailyReports(from, to),
      setContactLeadSource: (contact, source) => inner.setContactLeadSource(contact, source),
      getContactLeadSource: (contact) => inner.getContactLeadSource(contact),
      batchGetContactLeadSources: (contacts) => inner.batchGetContactLeadSources(contacts),
      recordPatientTreatment: (record) => inner.recordPatientTreatment(record),
      listRecurringPatients: (min) => inner.listRecurringPatients(min),
    };

    const failingStape = makeStapeClient(() => true);

    const result = await handlePaymentsSync(
      makeDentalinkClient(payment, makePatient()),
      makeElevatorClient(makeLead()),
      failingStape,
      trackingStore,
      SINCE_ISO,
      HIGH_TICKET_THRESHOLD,
    );

    expect(result.dispatched).toBe(0);
    expect(result.stapeEventsFailed).toBe(1);
    // No claim was made for a voided payment, so release must not be called.
    expect(releaseCalls).toBe(0);
  });
});
