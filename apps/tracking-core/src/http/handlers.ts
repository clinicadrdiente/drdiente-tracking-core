import { createTrackingApp, type TrackingApp } from "../app/tracking-app.js";
import { requireTrackingSecret } from "./auth.js";
import { badRequest, ok, serverError } from "./response.js";
import type { HttpRequest, HttpResponse } from "./types.js";
import { parseAppointmentInput, parseLeadInput } from "./validation.js";

export interface PaymentsSyncQuery {
  since?: string;
  maxPayments?: string | number;
}

export class TrackingHttpHandlers {
  constructor(private readonly app: TrackingApp) {}

  get stateStore() {
    return this.app.stateStore;
  }

  async getStatus(request: HttpRequest): Promise<HttpResponse> {
    const authError = requireTrackingSecret(request);
    if (authError) {
      return authError;
    }

    try {
      const result = await this.app.getStatus();
      return ok(result);
    } catch (error) {
      return serverError("failed to get status", {
        message: toErrorMessage(error),
      });
    }
  }

  async postLead(request: HttpRequest): Promise<HttpResponse> {
    const authError = requireTrackingSecret(request);
    if (authError) {
      return authError;
    }

    const input = parseLeadInput(request.body);
    if (!input) {
      return badRequest("invalid lead payload");
    }

    try {
      const result = await this.app.captureLead(input);
      return ok(result, 201);
    } catch (error) {
      return serverError("failed to capture lead", {
        message: toErrorMessage(error),
      });
    }
  }

  async postDentalinkAppointment(request: HttpRequest): Promise<HttpResponse> {
    const authError = requireTrackingSecret(request);
    if (authError) {
      return authError;
    }

    const input = parseAppointmentInput(request.body);
    if (!input) {
      return badRequest("invalid appointment payload");
    }

    try {
      const result = await this.app.processAppointment(input);
      return ok(result, 202);
    } catch (error) {
      return serverError("failed to process appointment", {
        message: toErrorMessage(error),
      });
    }
  }

  async postPaymentsSync(
    request: HttpRequest<unknown, PaymentsSyncQuery>,
  ): Promise<HttpResponse> {
    const authError = requireTrackingSecret(request);
    if (authError) {
      return authError;
    }

    try {
      const maxPayments = Number(request.query?.maxPayments);
      const result = await this.app.syncPayments(
        request.query?.since,
        Number.isFinite(maxPayments) ? maxPayments : undefined,
      );
      return ok(result, 202);
    } catch (error) {
      return serverError("failed to sync payments", {
        message: toErrorMessage(error),
      });
    }
  }
}

export function createTrackingHttpHandlers(): TrackingHttpHandlers {
  return new TrackingHttpHandlers(createTrackingApp());
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "unknown error";
}
