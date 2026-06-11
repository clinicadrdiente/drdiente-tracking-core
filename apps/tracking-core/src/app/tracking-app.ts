import { bootstrapApp, type AppServices } from "./bootstrap.js";
import { handleDentalinkAppointment } from "../routes/dentalink-appointment.js";
import { handleLeadCapture } from "../routes/lead.js";
import { handlePaymentsSync } from "../routes/payments-sync.js";
import { getStateStoreConfig } from "../modules/state/config.js";
import type { StateStore } from "../modules/state/state-store.js";
import type { AppointmentEvent, LeadInput } from "../types/domain.js";

export class TrackingApp {
  constructor(readonly services: AppServices) {}

  get stateStore(): StateStore {
    return this.services.stateStore;
  }

  async getStatus() {
    const state = await this.services.stateStore.getPaymentSyncState();
    const stateStoreMode = getStateStoreConfig().mode;

    return {
      ok: true,
      service: "drdiente-tracking-core",
      generatedAt: new Date().toISOString(),
      config: {
        elevatorMode: process.env.ELEVATOR_MODE ?? "stub",
        dentalinkMode: process.env.DENTALINK_MODE ?? "stub",
        stapeMode: this.services.stapeClient.getMode(),
        stateStoreMode,
        defaultCurrency: this.services.config.defaultCurrency,
        highTicketThreshold: this.services.config.highTicketThreshold,
        paymentsSyncLookbackMinutes:
          this.services.config.paymentsSyncLookbackMinutes,
        trackingSecretConfigured: Boolean(process.env.TRACKING_API_SECRET),
      },
      paymentSync: {
        lastCheckIso: state.lastCheckIso ?? null,
        processedPaymentCount: state.processedPaymentIds.length,
      },
      integrations: {
        elevator: process.env.ELEVATOR_MODE ?? "stub",
        dentalink: process.env.DENTALINK_MODE ?? "stub",
        stape: this.services.stapeClient.getMode(),
      },
    };
  }

  async captureLead(input: LeadInput) {
    this.services.logger.info("capturing lead", { branch: input.branch });
    return handleLeadCapture(this.services.elevatorClient, input);
  }

  async processAppointment(event: AppointmentEvent) {
    this.services.logger.info("processing appointment", {
      appointmentId: event.appointmentId,
      patientId: event.patientId,
    });

    return handleDentalinkAppointment(
      this.services.dentalinkClient,
      this.services.elevatorClient,
      event,
    );
  }

  async syncPayments(sinceIso?: string, maxPayments?: number) {
    const state = await this.services.stateStore.getPaymentSyncState();
    const resolvedSinceIso =
      sinceIso ??
      state.lastCheckIso ??
      new Date(
        Date.now() - this.services.config.paymentsSyncLookbackMinutes * 60_000,
      ).toISOString();

    this.services.logger.info("syncing payments", { sinceIso: resolvedSinceIso });

    return handlePaymentsSync(
      this.services.dentalinkClient,
      this.services.elevatorClient,
      this.services.stapeClient,
      this.services.stateStore,
      resolvedSinceIso,
      this.services.config.highTicketThreshold,
      maxPayments,
    );
  }
}

export function createTrackingApp(): TrackingApp {
  return new TrackingApp(bootstrapApp());
}
