export type StateStoreMode = "memory" | "file";

export interface StateStoreConfig {
  mode: StateStoreMode;
  filePath: string;
}

export function getStateStoreConfig(): StateStoreConfig {
  return {
    mode: process.env.STATE_STORE_MODE === "memory" ? "memory" : "file",
    filePath: process.env.STATE_STORE_FILE_PATH ?? ".runtime/payment-sync-state.json",
  };
}
