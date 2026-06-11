import { InMemoryStateStore } from "../../src/modules/state/state-store.js";
import {
  methodNotAllowed,
  send,
  type VercelRequest,
  type VercelResponse,
} from "../_lib/http.js";

const DEMO_RECORDS = [
  // María — 3 tratamientos (recurrente top)
  { treatmentId: 101, treatmentName: "Diseño de Sonrisa", budgetTotal: 95000, currency: "MXN", firstPaymentAt: "2024-03-10T10:00:00.000Z", lastPaymentAt: "2024-09-15T10:00:00.000Z", patientId: 101, patientName: "María López", branch: "Polanco" },
  { treatmentId: 102, treatmentName: "Ortodoncia Transparente", budgetTotal: 55000, currency: "MXN", firstPaymentAt: "2024-06-01T10:00:00.000Z", lastPaymentAt: "2024-11-20T10:00:00.000Z", patientId: 101, patientName: "María López", branch: "Polanco" },
  { treatmentId: 103, treatmentName: "Blanqueamiento Dental", budgetTotal: 8500, currency: "MXN", firstPaymentAt: "2024-11-20T10:00:00.000Z", lastPaymentAt: "2024-11-20T10:00:00.000Z", patientId: 101, patientName: "María López", branch: "Polanco" },
  // Carlos — 2 tratamientos (recurrente)
  { treatmentId: 201, treatmentName: "Implante Dental", budgetTotal: 32000, currency: "MXN", firstPaymentAt: "2024-04-05T10:00:00.000Z", lastPaymentAt: "2024-07-10T10:00:00.000Z", patientId: 202, patientName: "Carlos Ramírez", branch: "Santa Fe" },
  { treatmentId: 202, treatmentName: "Corona Cerámica", budgetTotal: 12000, currency: "MXN", firstPaymentAt: "2024-07-10T10:00:00.000Z", lastPaymentAt: "2024-07-10T10:00:00.000Z", patientId: 202, patientName: "Carlos Ramírez", branch: "Santa Fe" },
  // Ana — 2 tratamientos (recurrente)
  { treatmentId: 301, treatmentName: "Limpieza Profunda", budgetTotal: 4500, currency: "MXN", firstPaymentAt: "2024-01-15T10:00:00.000Z", lastPaymentAt: "2024-07-15T10:00:00.000Z", patientId: 303, patientName: "Ana Gutiérrez", branch: "Polanco" },
  { treatmentId: 302, treatmentName: "Ortodoncia Metálica", budgetTotal: 38000, currency: "MXN", firstPaymentAt: "2024-07-15T10:00:00.000Z", lastPaymentAt: "2025-01-15T10:00:00.000Z", patientId: 303, patientName: "Ana Gutiérrez", branch: "Polanco" },
  // Pedro — 1 tratamiento (no recurrente)
  { treatmentId: 401, treatmentName: "Extracción Simple", budgetTotal: 2200, currency: "MXN", firstPaymentAt: "2024-05-20T10:00:00.000Z", lastPaymentAt: "2024-05-20T10:00:00.000Z", patientId: 404, patientName: "Pedro Hernández", branch: "Santa Fe" },
];

export default async function handler(
  request: VercelRequest,
  response: VercelResponse,
): Promise<void> {
  if (request.method !== "GET") {
    methodNotAllowed(response);
    return;
  }

  const minTreatments = Math.max(1, Number(request.query?.min_treatments ?? 1));

  const store = new InMemoryStateStore();
  for (const record of DEMO_RECORDS) {
    await store.recordPatientTreatment(record);
  }

  const patients = await store.listRecurringPatients(minTreatments);

  send(response, {
    status: 200,
    body: {
      ok: true,
      note: "Datos de demostración — no son del estado real de producción",
      minTreatments,
      count: patients.length,
      patients,
    },
  });
}
