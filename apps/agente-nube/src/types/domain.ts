// Entidades canónicas del agente en la nube. Ver docs/agente-nube-arquitectura.md.

/** Cuenta de Elevator de origen del lead. */
export type ClinicAccount = "roma" | "general";

export const CLINIC_ACCOUNTS: readonly ClinicAccount[] = ["roma", "general"];

/** Payload del workflow de SALIDA de Elevator hacia el agente (contrato §4). */
export interface LeadHandoffInput {
  eventId: string;
  occurredAt: string; // ISO 8601
  account: ClinicAccount;
  elevatorId?: string | null;
  firstName: string;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null; // opcional: basta con teléfono o email
  source?: string | null; // origen
  location?: string | null; // localización del paciente
  initialMessage?: string | null; // mensaje inicial captado por el workflow
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  fbclid?: string | null;
  gclid?: string | null;
  ttclid?: string | null;
  landingUrl?: string | null;
  distributedTo?: string[]; // plataformas de anuncio a las que ya se redistribuyó
}

/** Lead normalizado y listo para persistir. */
export interface CanonicalLead extends LeadHandoffInput {
  phoneNormalized: string | null;
  emailNormalized: string | null;
  receivedAt: string; // ISO 8601 — cuándo lo recibió el agente
}

/** Webhook de agendamiento (cita) hacia el agente, para el conteo de agendamientos. */
export interface AppointmentIntakeInput {
  eventId: string;
  occurredAt: string;
  account: ClinicAccount;
  appointmentId: string;
  elevatorId?: string | null;
  patientId?: string | null;
  branch?: string | null;
  scheduledAt?: string | null;
  source?: string | null;
}

export type LeadContactChannel =
  | "whatsapp"
  | "llamada"
  | "email"
  | "instagram"
  | "facebook"
  | "formulario"
  | "otro";

/** Reporte diario de la recepción / plataforma SAC (contrato §5). */
export interface DailyBranchReportInput {
  branch: string;
  date: string; // YYYY-MM-DD
  account?: ClinicAccount | null;
  contacts?: Array<{ channel: LeadContactChannel; count: number }>;
  leadsReceived?: number;
  leadsContacted?: number;
  followUpsSent?: number;
  promoWhatsappSent?: number;
  emailsSent?: number;
  postsPublished?: number;
  callsReceived?: number;
  appointmentsBooked?: number;
  notes?: string | null;
}

export interface DailyBranchReport extends DailyBranchReportInput {
  reportId: string;
  submittedAt: string;
}
