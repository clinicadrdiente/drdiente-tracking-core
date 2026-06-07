import { createDentalinkClient, type DentalinkClient } from "../modules/dentalink/client.js";
import { createElevatorClient, type ElevatorClient } from "../modules/elevator/client.js";
import { ConsoleLogger, type Logger } from "../modules/observability/logger.js";
import { StubStapeClient, type StapeClient } from "../modules/stape/client.js";
import {
  FileStateStore,
  InMemoryStateStore,
  RedisStateStore,
  type StateStore,
} from "../modules/state/state-store.js";
import { getStateStoreConfig } from "../modules/state/config.js";
import { getAppConfig, type AppConfig } from "../config/app-config.js";

export interface AppServices {
  config: AppConfig;
  logger: Logger;
  elevatorClient: ElevatorClient;
  dentalinkClient: DentalinkClient;
  stapeClient: StapeClient;
  stateStore: StateStore;
}

export function bootstrapApp(): AppServices {
  const stateStoreConfig = getStateStoreConfig();

  return {
    config: getAppConfig(),
    logger: new ConsoleLogger(),
    elevatorClient: createElevatorClient(),
    dentalinkClient: createDentalinkClient(),
    stapeClient: new StubStapeClient(),
    stateStore: createStateStore(stateStoreConfig),
  };
}

function createStateStore(
  stateStoreConfig: ReturnType<typeof getStateStoreConfig>,
): StateStore {
  if (
    stateStoreConfig.mode === "redis" &&
    stateStoreConfig.redisRestUrl &&
    stateStoreConfig.redisRestToken
  ) {
    return new RedisStateStore(
      stateStoreConfig.redisRestUrl,
      stateStoreConfig.redisRestToken,
      stateStoreConfig.redisKeyPrefix,
    );
  }

  if (stateStoreConfig.mode === "memory") {
    return new InMemoryStateStore();
  }

  return new FileStateStore(stateStoreConfig.filePath);
}
