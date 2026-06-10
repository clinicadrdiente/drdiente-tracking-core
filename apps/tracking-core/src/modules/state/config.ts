export type StateStoreMode = "memory" | "file" | "redis";

export interface StateStoreConfig {
  mode: StateStoreMode;
  filePath: string;
  redisRestUrl?: string;
  redisRestToken?: string;
  redisKeyPrefix: string;
}

export function getStateStoreConfig(): StateStoreConfig {
  const redisRestUrl = process.env.UPSTASH_REDIS_REST_URL;
  const redisRestToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  const requestedMode = process.env.STATE_STORE_MODE;
  const mode =
    requestedMode === "redis" && redisRestUrl && redisRestToken
      ? "redis"
      : requestedMode === "memory"
        ? "memory"
        : "file";

  if (process.env.VERCEL === "1" && mode === "file") {
    throw new Error(
      "STATE_STORE_MODE=file is not safe on Vercel (ephemeral /tmp). " +
      "Set STATE_STORE_MODE=redis and configure UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN.",
    );
  }

  return {
    mode,
    filePath: process.env.STATE_STORE_FILE_PATH ?? ".runtime/payment-sync-state.json",
    redisRestUrl,
    redisRestToken,
    redisKeyPrefix: process.env.STATE_STORE_REDIS_KEY_PREFIX ?? "drdiente:tracking",
  };
}
