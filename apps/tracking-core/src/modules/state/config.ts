export type StateStoreMode = "memory" | "file" | "redis";

export interface StateStoreConfig {
  mode: StateStoreMode;
  filePath: string;
  redisRestUrl?: string;
  redisRestToken?: string;
  redisKeyPrefix: string;
}

export function getStateStoreConfig(): StateStoreConfig {
  // Accept both UPSTASH_REDIS_REST_* (explicit) and KV_REST_API_* (Vercel/Upstash auto-created)
  const redisRestUrl =
    process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const redisRestToken =
    process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  const requestedMode = process.env.STATE_STORE_MODE;
  // Auto-enable redis if KV credentials are present and no explicit mode is set
  const hasRedisCredentials = Boolean(redisRestUrl && redisRestToken);
  const mode =
    (requestedMode === "redis" || (!requestedMode && hasRedisCredentials)) && hasRedisCredentials
      ? "redis"
      : requestedMode === "memory"
        ? "memory"
        : "file";

  if (process.env.VERCEL === "1" && mode === "file") {
    throw new Error(
      "STATE_STORE_MODE=file is not safe on Vercel (ephemeral /tmp). " +
      "Set STATE_STORE_MODE=redis and configure UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN " +
      "(or connect an Upstash Redis database via the Vercel Storage tab).",
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
