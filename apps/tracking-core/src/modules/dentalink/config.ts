import { getEnv } from "../../config/env.js";

export type DentalinkMode = "stub" | "api";

export interface DentalinkConfig {
  mode: DentalinkMode;
  baseUrl: string;
  apiToken: string;
  apiAuthScheme: string;
  patientsPathTemplate: string;
  paymentsPath: string;
  treatmentsPathTemplate: string;
  treatmentsListPath: string;
  treatmentPatientIdField: string;
  patientUpdatePathTemplate: string;
  patientIdField: string;
  patientFirstNameField: string;
  patientLastNameField: string;
  patientPhoneField: string;
  patientEmailField: string;
  patientBranchField: string;
  patientReferenceField: string;
  paymentIdField: string;
  paymentPatientIdField: string;
  paymentTreatmentIdField: string;
  paymentPatientNameField: string;
  paymentBranchField: string;
  paymentMethodField: string;
  paymentFolioField: string;
  paymentReferenceField: string;
  paymentAmountField: string;
  paymentVoidedField: string;
  paymentDateField: string;
  treatmentIdField: string;
  treatmentBudgetTotalField: string;
  treatmentNameField: string;
  additionalFieldsContainer: string;
  elevatorIdField: string;
}

export function getDentalinkConfig(): DentalinkConfig {
  return {
    mode: getEnv("DENTALINK_MODE", "stub") === "api" ? "api" : "stub",
    baseUrl: getEnv(
      "DENTALINK_BASE_URL",
      "https://api.dentalink.healthatom.com/api/v1/",
    ),
    apiToken: getEnv("DENTALINK_API_TOKEN"),
    apiAuthScheme: getEnv("DENTALINK_API_AUTH_SCHEME", "Token"),
    patientsPathTemplate: getEnv(
      "DENTALINK_PATIENTS_PATH_TEMPLATE",
      "/pacientes/{id}",
    ),
    paymentsPath: getEnv("DENTALINK_PAYMENTS_PATH", "/pagos/"),
    treatmentsPathTemplate: getEnv(
      "DENTALINK_TREATMENTS_PATH_TEMPLATE",
      "/tratamientos/{id}",
    ),
    treatmentsListPath: getEnv(
      "DENTALINK_TREATMENTS_LIST_PATH",
      "/tratamientos/",
    ),
    treatmentPatientIdField: getEnv(
      "DENTALINK_TREATMENT_PATIENT_ID_FIELD",
      "id_paciente",
    ),
    patientUpdatePathTemplate: getEnv(
      "DENTALINK_PATIENT_UPDATE_PATH_TEMPLATE",
      "/pacientes/{id}",
    ),
    patientIdField: getEnv("DENTALINK_PATIENT_ID_FIELD", "id"),
    patientFirstNameField: getEnv(
      "DENTALINK_PATIENT_FIRST_NAME_FIELD",
      "nombre",
    ),
    patientLastNameField: getEnv(
      "DENTALINK_PATIENT_LAST_NAME_FIELD",
      "apellido",
    ),
    patientPhoneField: getEnv("DENTALINK_PATIENT_PHONE_FIELD", "telefono"),
    patientEmailField: getEnv("DENTALINK_PATIENT_EMAIL_FIELD", "email"),
    patientBranchField: getEnv("DENTALINK_PATIENT_BRANCH_FIELD", "sucursal"),
    patientReferenceField: getEnv(
      "DENTALINK_PATIENT_REFERENCE_FIELD",
      "referencia",
    ),
    paymentIdField: getEnv("DENTALINK_PAYMENT_ID_FIELD", "id"),
    paymentPatientIdField: getEnv(
      "DENTALINK_PAYMENT_PATIENT_ID_FIELD",
      "id_paciente",
    ),
    paymentTreatmentIdField: getEnv(
      "DENTALINK_PAYMENT_TREATMENT_ID_FIELD",
      "id_tratamiento",
    ),
    paymentPatientNameField: getEnv(
      "DENTALINK_PAYMENT_PATIENT_NAME_FIELD",
      "nombre_paciente",
    ),
    paymentBranchField: getEnv(
      "DENTALINK_PAYMENT_BRANCH_FIELD",
      "nombre_sucursal",
    ),
    paymentMethodField: getEnv("DENTALINK_PAYMENT_METHOD_FIELD", "medio_pago"),
    paymentFolioField: getEnv("DENTALINK_PAYMENT_FOLIO_FIELD", "folio"),
    paymentReferenceField: getEnv(
      "DENTALINK_PAYMENT_REFERENCE_FIELD",
      "numero_referencia",
    ),
    paymentAmountField: getEnv("DENTALINK_PAYMENT_AMOUNT_FIELD", "monto_pago"),
    paymentVoidedField: getEnv("DENTALINK_PAYMENT_VOIDED_FIELD", "anulado"),
    paymentDateField: getEnv("DENTALINK_PAYMENT_DATE_FIELD", "fecha_creacion"),
    treatmentIdField: getEnv("DENTALINK_TREATMENT_ID_FIELD", "id"),
    treatmentBudgetTotalField: getEnv(
      "DENTALINK_TREATMENT_BUDGET_TOTAL_FIELD",
      "valor_total",
    ),
    treatmentNameField: getEnv("DENTALINK_TREATMENT_NAME_FIELD", "nombre"),
    additionalFieldsContainer: getEnv(
      "DENTALINK_ADDITIONAL_FIELDS_CONTAINER",
      "campos_adicionales",
    ),
    elevatorIdField: getEnv("DENTALINK_ELEVATOR_ID_FIELD", "elevator_id"),
  };
}
