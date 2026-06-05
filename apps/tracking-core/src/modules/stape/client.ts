import type { ConversionEvent } from "../../types/domain.js";

export interface StapeClient {
  dispatch(event: ConversionEvent): Promise<void>;
}

export class StubStapeClient implements StapeClient {
  async dispatch(_event: ConversionEvent): Promise<void> {
    return;
  }
}
