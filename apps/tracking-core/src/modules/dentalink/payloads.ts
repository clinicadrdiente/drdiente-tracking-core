import type {
  DentalinkPatient,
  DentalinkTreatment,
  PaymentEvent,
} from "../../types/domain.js";
import type { DentalinkConfig } from "./config.js";

type DentalinkRecord = Record<string, unknown>;

export function mapPatientRecord(
  config: DentalinkConfig,
  record: DentalinkRecord,
): DentalinkPatient {
  const additionalFields = readRecord(record, config.additionalFieldsContainer);

  return {
    patientId: readNumber(record, config.patientIdField),
    firstName: readString(record, config.patientFirstNameField) ?? "",
    lastName: readString(record, config.patientLastNameField),
    phone: readString(record, config.patientPhoneField),
    email: readString(record, config.patientEmailField),
    branch: readString(record, config.patientBranchField),
    elevatorId: readString(additionalFields, config.elevatorIdField),
  };
}

export function buildPatientElevatorIdPayload(
  config: DentalinkConfig,
  elevatorId: string,
): DentalinkRecord {
  return {
    [config.additionalFieldsContainer]: {
      [config.elevatorIdField]: elevatorId,
    },
  };
}

export function mapTreatmentRecord(
  config: DentalinkConfig,
  record: DentalinkRecord,
): DentalinkTreatment {
  return {
    treatmentId: readNumber(record, config.treatmentIdField),
    name: readString(record, config.treatmentNameField),
    budgetTotal: readNumber(record, config.treatmentBudgetTotalField),
  };
}

export function mapPaymentRecord(
  config: DentalinkConfig,
  record: DentalinkRecord,
  treatment: DentalinkTreatment,
): PaymentEvent {
  const paymentAmount = readNumber(record, config.paymentAmountField);
  const hasTreatmentBudget = treatment.budgetTotal > 0;

  return {
    paymentId: readNumber(record, config.paymentIdField),
    patientId: readNumber(record, config.paymentPatientIdField),
    treatmentId: readNumber(record, config.paymentTreatmentIdField),
    treatmentName: treatment.name ?? "Pago Dentalink",
    paymentAmount,
    budgetTotal: hasTreatmentBudget ? treatment.budgetTotal : paymentAmount,
    currency: treatment.currency ?? "MXN",
    isVoided: readBooleanish(record, config.paymentVoidedField),
    paidAt: readString(record, config.paymentDateField) ?? new Date().toISOString(),
  };
}

export function buildPaymentsQuery(dateField: string, sinceIso: string): string {
  const filter = JSON.stringify({
    [dateField]: { gte: toDentalinkDateTime(sinceIso) },
  });
  return `q=${encodeURIComponent(filter)}`;
}

function toDentalinkDateTime(isoDate: string): string {
  const date = new Date(isoDate);

  if (Number.isNaN(date.getTime())) {
    return isoDate;
  }

  return date.toISOString().replace("T", " ").replace(/\.\d{3}Z$/, "");
}

function readRecord(
  record: DentalinkRecord,
  key: string,
): DentalinkRecord {
  const value = record[key];
  return typeof value === "object" && value !== null
    ? (value as DentalinkRecord)
    : {};
}

function readString(record: DentalinkRecord, key: string): string | null {
  const value = record[key];
  return typeof value === "string" ? value : null;
}

function readNumber(record: DentalinkRecord, key: string): number {
  const value = record[key];

  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "string" && value.trim() !== "") {
    return Number(value);
  }

  return 0;
}

function readBooleanish(record: DentalinkRecord, key: string): boolean {
  const value = record[key];
  return value === true || value === 1 || value === "1";
}
