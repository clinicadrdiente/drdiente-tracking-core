import { describe, it, expect } from "vitest";
import { handleDentalinkAppointment } from "./dentalink-appointment.js";
import { InMemoryStateStore } from "../modules/state/state-store.js";
import type { DentalinkClient } from "../modules/dentalink/client.js";
import type { ElevatorClient } from "../modules/elevator/client.js";
import type {
  AppointmentEvent,
  CanonicalLead,
  DentalinkPatient,
  DentalinkTreatment,
  PaymentEvent,
} from "../types/domain.js";

const patient: DentalinkPatient = {
  patientId: 42,
  firstName: "Ada",
  lastName: "Lovelace",
  phone: "+56911112222",
  email: "ada@example.com",
};

const lead: CanonicalLead = {
  elevatorId: "elev-1",
  firstName: "Ada",
  phoneRaw: "+56911112222",
  phoneNormalized: "56911112222",
  emailRaw: "ada@example.com",
  emailNormalized: "ada@example.com",
  branch: "main",
  attribution: {},
};

const event: AppointmentEvent = {
  appointmentId: 7,
  patientId: 42,
  scheduledAt: "2026-06-17T10:00:00.000Z",
};

interface FakeDentalink extends DentalinkClient {
  getPatientCalls: number;
  setElevatorIdCalls: number;
}

interface FakeElevator extends ElevatorClient {
  findLeadsCalls: number;
  updateStageCalls: number;
}

function makeDentalink(overrides?: {
  getPatient?: () => Promise<DentalinkPatient>;
}): FakeDentalink {
  const fake: FakeDentalink = {
    getPatientCalls: 0,
    setElevatorIdCalls: 0,
    async getPatient(): Promise<DentalinkPatient> {
      fake.getPatientCalls += 1;
      if (overrides?.getPatient) {
        return overrides.getPatient();
      }
      return patient;
    },
    async setPatientElevatorId(): Promise<void> {
      fake.setElevatorIdCalls += 1;
    },
    async listRecentPayments(): Promise<PaymentEvent[]> {
      return [];
    },
    async getPatientTreatments(): Promise<DentalinkTreatment[]> {
      return [];
    },
  };
  return fake;
}

function makeElevator(): FakeElevator {
  const fake: FakeElevator = {
    findLeadsCalls: 0,
    updateStageCalls: 0,
    async createLead(): Promise<CanonicalLead> {
      return lead;
    },
    async findLeadsByIdentity(): Promise<CanonicalLead[]> {
      fake.findLeadsCalls += 1;
      return [lead];
    },
    async updateLeadStage(): Promise<void> {
      fake.updateStageCalls += 1;
    },
  };
  return fake;
}

describe("handleDentalinkAppointment idempotency", () => {
  it("processes a linked match once and performs the Elevator writes", async () => {
    const dentalink = makeDentalink();
    const elevator = makeElevator();
    const stateStore = new InMemoryStateStore();

    const result = await handleDentalinkAppointment(
      dentalink,
      elevator,
      stateStore,
      event,
    );

    expect(result.status).toBe("linked");
    expect(dentalink.getPatientCalls).toBe(1);
    expect(dentalink.setElevatorIdCalls).toBe(1);
    expect(elevator.findLeadsCalls).toBe(1);
    expect(elevator.updateStageCalls).toBe(1);
  });

  it("returns duplicate on a retry with the same appointmentId without re-calling clients", async () => {
    const dentalink = makeDentalink();
    const elevator = makeElevator();
    const stateStore = new InMemoryStateStore();

    await handleDentalinkAppointment(dentalink, elevator, stateStore, event);

    const second = await handleDentalinkAppointment(
      dentalink,
      elevator,
      stateStore,
      event,
    );

    expect(second.status).toBe("duplicate");
    expect(dentalink.getPatientCalls).toBe(1);
    expect(dentalink.setElevatorIdCalls).toBe(1);
    expect(elevator.findLeadsCalls).toBe(1);
    expect(elevator.updateStageCalls).toBe(1);
  });

  it("releases the claim when the work throws so a retry can re-claim it", async () => {
    const dentalink = makeDentalink({
      getPatient: async () => {
        throw new Error("dentalink outage");
      },
    });
    const elevator = makeElevator();
    const stateStore = new InMemoryStateStore();

    await expect(
      handleDentalinkAppointment(dentalink, elevator, stateStore, event),
    ).rejects.toThrow("dentalink outage");

    expect(await stateStore.claimPaymentProcessed("appointment_7")).toBe(true);
  });
});
