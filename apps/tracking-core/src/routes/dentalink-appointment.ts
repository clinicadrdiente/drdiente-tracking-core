import type { DentalinkClient } from "../modules/dentalink/client.js";
import type { ElevatorClient } from "../modules/elevator/client.js";
import type { AppointmentEvent } from "../types/domain.js";
import { matchPatientToLead } from "../modules/matching/match-patient-to-lead.js";

export async function handleDentalinkAppointment(
  dentalinkClient: DentalinkClient,
  elevatorClient: ElevatorClient,
  event: AppointmentEvent,
) {
  const patient = await dentalinkClient.getPatient(event.patientId);
  const candidates = await elevatorClient.findLeadsByIdentity(
    patient.phone ?? "",
    patient.email,
  );

  const match = matchPatientToLead(patient, candidates);

  if (match.status === "linked" && match.elevatorId) {
    await dentalinkClient.setPatientElevatorId(patient.patientId, match.elevatorId);
    await elevatorClient.updateLeadStage(match.elevatorId, "agendo");
  }

  return match;
}
