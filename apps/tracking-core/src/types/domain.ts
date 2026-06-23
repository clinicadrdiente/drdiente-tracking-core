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
  // Stable platform campaign id (Windsor `campaign_id`). This is the JOIN key
  // between Windsor spend and Dentalink revenue — preferred over campaign name,
  // which is editable and breaks the match silently.
  campaignId?: string | null;
  landingUrl?: string | null;
  // First-touch attribution fallback for organic/referral traffic where UTMs are absent.
  // Sourced from the landing page's first_touch_source field.
  firstTouchSource?: string | null;
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

export type LeadContactChannel =
  | "llamada"
  | "whatsapp"
  | "google_maps"
  | "email"
  | "visita_directa"
  | "otro";

// --- Cierre diario de recepción: vocabularios controlados para el detalle por lead.
// Texto libre rompe el análisis de patrones; estas listas mantienen la data agregable.

/** De dónde vino el lead. */
export type LeadOriginChannel =
  | "meta_ads"
  | "facebook_organico"
  | "instagram_organico"
  | "google"
  | "google_maps"
  | "whatsapp_directo"
  | "referido"
  | "walk_in"
  | "tiktok"
  | "otro";

/** Tratamiento por el que consultó el lead. */
export type LeadInterestTreatment =
  | "limpieza"
  | "blanqueamiento"
  | "ortodoncia"
  | "implantes"
  | "endodoncia"
  | "estetica"
  | "urgencia"
  | "protesis"
  | "otro";

/** Pregunta / objeción principal del lead. Campo clave para detectar el cuello de botella de conversión. */
export type LeadQuestionTopic =
  | "precio"
  | "disponibilidad"
  | "ubicacion"
  | "financiamiento"
  | "duracion"
  | "garantia"
  | "dolor_miedo"
  | "solo_info"
  | "otro";

/** Estado del lead dentro del embudo del día. */
export type LeadStatus =
  | "solo_consulto"
  | "agendo"
  | "asistio"
  | "convirtio"
  | "no_contesto"
  | "perdido";

/** Si el lead se perdió, por qué. */
export type LeadLostReason =
  | "precio"
  | "no_respondio"
  | "eligio_otra_clinica"
  | "solo_curioseaba"
  | "sin_horario"
  | "otro";

/** Una fila por lead/paciente contactado en el día (Bloque B del formulario de recepción). */
export interface DailyLeadDetail {
  name: string;
  contact?: string | null;        // teléfono o email — ID para deduplicar y seguir el recorrido
  origin: LeadOriginChannel;
  campaign?: string | null;        // nombre exacto de la campaña activa
  interest: LeadInterestTreatment;
  question: LeadQuestionTopic;
  status: LeadStatus;
  appointmentDate?: string | null; // "YYYY-MM-DD" si agendó
  lostReason?: LeadLostReason | null;
  quotedValue?: number | null;     // valor cotizado/pagado
  note?: string | null;
}

export interface DailyBranchReport {
  reportId: string;          // `${branch}_${date}` — natural key, one report per branch per day
  branch: string;
  date: string;              // "YYYY-MM-DD"
  submittedAt: string;       // ISO
  recepcionist?: string | null;  // quién cierra caja
  contacts: Array<{ channel: LeadContactChannel; count: number }>;
  leadsReceived: number;
  leadsContacted: number;
  followUpsSent: number;
  promoWhatsappSent: number;
  emailsSent: number;
  postsPublished: number;
  // --- Bloque A: agregados del embudo del día (opcionales — retrocompatibles).
  appointmentsCreated?: number | null;   // citas creadas hoy
  appointmentsAttended?: number | null;  // asistencias (show)
  noShows?: number | null;               // no-show + cancelaciones
  conversions?: number | null;           // pacientes que aceptaron/pagaron
  revenueTotal?: number | null;          // ingreso del día (cuadra con caja)
  adSpend?: number | null;               // gasto publicitario del día (si se conoce)
  // --- Bloque B: detalle por lead para análisis de patrones.
  leads?: DailyLeadDetail[];
  notes?: string | null;
}

export interface PatientTreatmentRecord {
  treatmentId: number;
  treatmentName: string | null;
  budgetTotal: number;
  currency: string;
  firstPaymentAt: string;
  lastPaymentAt: string;
  patientId: number;
  patientName: string | null;
  branch: string | null;
}

export interface PatientTreatmentSummary {
  patientId: number;
  patientName: string | null;
  branch: string | null;
  treatments: PatientTreatmentRecord[];
  treatmentCount: number;
  totalBudget: number;
  firstPaymentAt: string;
  lastPaymentAt: string;
}

export interface ConversionEvent {
  eventId: string;
  eventName: "Lead" | "Agendamiento" | "Purchase" | "Refund";
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
