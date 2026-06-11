export interface AppConfig {
  highTicketThreshold: number;
  paymentsSyncLookbackMinutes: number;
  defaultCurrency: string;
}

function getNumberEnv(name: string, fallback: number): number {
  const value = process.env[name];
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function getAppConfig(): AppConfig {
  return {
    highTicketThreshold: getNumberEnv("HIGH_TICKET_THRESHOLD", 4000),
    paymentsSyncLookbackMinutes: getNumberEnv(
      "PAYMENTS_SYNC_LOOKBACK_MINUTES",
      10_080,
    ),
    defaultCurrency: process.env.DEFAULT_CURRENCY ?? "MXN",
  };
}
