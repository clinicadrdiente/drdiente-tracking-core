import { bootstrapApp, type AppServices } from "./bootstrap.js";
import { handleDentalinkAppointment } from "../routes/dentalink-appointment.js";
import { handleLeadCapture } from "../routes/lead.js";
import { handlePaymentsSync } from "../routes/payments-sync.js";
import type { AppointmentEvent, LeadInput } from "../types/domain.js";

export class TrackingApp {
  constructor(private readonly services: AppServices) {}

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

  async syncPayments(sinceIso?: string) {
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
    );
  }
}

export function createTrackingApp(): TrackingApp {
  return new TrackingApp(bootstrapApp());
}
