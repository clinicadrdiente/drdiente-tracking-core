export type MatchStatus =
  | "pending_match"
  | "linked"
  | "manual_review"
  | "match_failed";

export type DispatchStatus =
  | "pending_dispatch"
  | "dispatched"
  | "retrying"
  | "dead_letter";

export interface AttributionData {
  fbclid?: string | null;
  gclid?: string | null;
  ttclid?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  landingUrl?: string | null;
}

export interface LeadInput {
  firstName: string;
  lastName?: string | null;
  phone: string;
  email?: string | null;
  branch: string;
  attribution: AttributionData;
}

export interface CanonicalLead {
  elevatorId: string;
  firstName: string;
  lastName?: string | null;
  phoneRaw: string;
  phoneNormalized: string;
  emailRaw?: string | null;
  emailNormalized?: string | null;
  branch: string;
  attribution: AttributionData;
}

export interface DentalinkPatient {
  patientId: number;
  firstName: string;
  lastName?: string | null;
  phone?: string | null;
  email?: string | null;
  elevatorId?: string | null;
  branch?: string | null;
  reference?: string | null;
}

export interface AppointmentEvent {
  appointmentId: number;
  patientId: number;
  scheduledAt: string;
  branch?: string | null;
}

export interface PaymentEvent {
  paymentId: number;
  patientId: number;
  treatmentId: number;
  treatmentName?: string | null;
  patientName?: string | null;
  branch?: string | null;
  paymentMethod?: string | null;
  folio?: string | null;
  reference?: string | null;
  paymentAmount: number;
  budgetTotal: number;
  currency: string;
  isVoided: boolean;
  paidAt: string;
}

export interface DentalinkTreatment {
  treatmentId: number;
  patientId?: number | null;
  name?: string | null;
  budgetTotal: number;
  currency?: string | null;
}

export interface MatchResult {
  status: MatchStatus;
  elevatorId?: string;
  confidence: number;
  reason: string;
}

export interface ConversionEvent {
  eventId: string;
  eventName: "Lead" | "Agendamiento" | "Compra" | "Refund";
  eventTime: number;
  actionSource: "website" | "physical_store";
  userData: {
    em?: string | null;
    ph?: string | null;
    fbc?: string | null;
    gclid?: string | null;
    ttclid?: string | null;
  };
  customData: Record<string, string | number | boolean | null>;
}
