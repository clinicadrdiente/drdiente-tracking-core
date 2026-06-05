import type { LeadInput } from "../types/domain.js";
import type { ElevatorClient } from "../modules/elevator/client.js";

export async function handleLeadCapture(
  elevatorClient: ElevatorClient,
  input: LeadInput,
) {
  return elevatorClient.createLead(input);
}
