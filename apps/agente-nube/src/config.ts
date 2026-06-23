// Lectura central de variables de entorno. Se evalúa en cada llamada para que
// los tests puedan ajustar process.env y para no cachear config entre invocaciones
// serverless con distinto entorno.

function env(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim() !== "" ? value.trim() : undefined;
}

function envList(name: string): string[] {
  const value = env(name);
  if (!value) return [];
  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item !== "");
}

function envNumber(name: string, fallback: number): number {
  const value = env(name);
  if (value === undefined) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export interface SupabaseConfig {
  url?: string;
  serviceKey?: string;
}

export interface SheetsConfig {
  webhookUrl?: string;
  secret?: string;
}

export interface WhatsappConfig {
  webhookUrl?: string;
  secret?: string;
  owners: string[];
}

export interface WindsorConfig {
  apiKey?: string;
  baseUrl: string;
  connector: string;
  fields: string[];
  includeText: string[];
  excludeText: string[];
}

export interface AgentConfig {
  trackingSecret?: string;
  cronSecret?: string;
  clinicUtcOffsetHours: number;
  reportCurrency: string;
  supabase: SupabaseConfig;
  sheets: SheetsConfig;
  whatsapp: WhatsappConfig;
  windsor: WindsorConfig;
}

export function getAgentConfig(): AgentConfig {
  return {
    trackingSecret: env("TRACKING_API_SECRET"),
    cronSecret: env("CRON_SECRET"),
    clinicUtcOffsetHours: envNumber("CLINIC_UTC_OFFSET_HOURS", -6),
    reportCurrency: env("REPORT_CURRENCY") ?? "MXN",
    supabase: {
      url: env("SUPABASE_URL"),
      serviceKey: env("SUPABASE_SERVICE_ROLE_KEY"),
    },
    sheets: {
      webhookUrl: env("GOOGLE_SHEETS_WEBHOOK_URL"),
      secret: env("GOOGLE_SHEETS_WEBHOOK_SECRET"),
    },
    whatsapp: {
      webhookUrl: env("ELEVATOR_WHATSAPP_WEBHOOK_URL"),
      secret: env("ELEVATOR_WHATSAPP_WEBHOOK_SECRET"),
      owners: envList("OWNER_WHATSAPP_NUMBERS"),
    },
    windsor: {
      apiKey: env("WINDSOR_API_KEY"),
      baseUrl: env("WINDSOR_BASE_URL") ?? "https://connectors.windsor.ai/",
      connector: env("WINDSOR_CONNECTOR") ?? "all",
      fields: envList("WINDSOR_FIELDS").length
        ? envList("WINDSOR_FIELDS")
        : ["source", "campaign", "spend", "clicks", "impressions", "reach"],
      includeText: envList("WINDSOR_INCLUDE_TEXT").map((item) => item.toLowerCase()),
      excludeText: envList("WINDSOR_EXCLUDE_TEXT").map((item) => item.toLowerCase()),
    },
  };
}
