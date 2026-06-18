// Taxonomía de canales de marketing para el reporte de Inversión vs Beneficio.
//
// El origen del paciente se captura en el campo libre "Referencia" de Dentalink
// (lo llena recepción). Ese campo NO lo expone la API REST de Dentalink: sólo
// aparece en el reporte exportado "Pacientes nuevos". Por eso la atribución se
// alimenta del reporte (ver patient-reference-report.ts) y se cruza con el gasto
// de Windsor (ver roas-by-channel.ts), que llega agrupado por "source".
//
// Aquí vive el puente entre ambos mundos: dos clasificadores que mapean tanto el
// texto libre de la Referencia como la "source" de Windsor a un canal común.

export type MarketingChannel =
  | "meta"
  | "tiktok"
  | "google"
  | "google_maps"
  | "other_digital"
  | "referral_organic"
  | "unknown";

export const MARKETING_CHANNELS: readonly MarketingChannel[] = [
  "google",
  "meta",
  "tiktok",
  "google_maps",
  "other_digital",
  "referral_organic",
  "unknown",
] as const;

export const CHANNEL_LABELS: Record<MarketingChannel, string> = {
  meta: "Meta (IG/FB)",
  tiktok: "TikTok",
  google: "Google (Ads + búsqueda)",
  google_maps: "Google Maps (local/orgánico)",
  other_digital: "Otro digital",
  referral_organic: "Recomendación / Orgánico",
  unknown: "Desconocido",
};

// Canales que SÍ corresponden a esfuerzos pagados/digitales y para los que
// Windsor puede reportar gasto. `referral_organic` y `unknown` quedan fuera del
// ROAS porque no tienen inversión asociada.
export const DIGITAL_CHANNELS: ReadonlySet<MarketingChannel> = new Set<MarketingChannel>([
  "google",
  "meta",
  "tiktok",
  "google_maps",
  "other_digital",
]);

export function isDigitalChannel(channel: MarketingChannel): boolean {
  return DIGITAL_CHANNELS.has(channel);
}

// Normaliza igual que reference-attribution.ts: sin acentos, mayúsculas,
// separadores colapsados a espacio. Token exacto evita falsos positivos.
function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

const META_TOKENS = new Set([
  "INSTAGRAM",
  "INSTA",
  "IG",
  "FACEBOOK",
  "FACE",
  "FB",
  "META",
  "MESSENGER",
  "THREADS",
  "REDES",
]);

const TIKTOK_TOKENS = new Set(["TIKTOK"]);

const OTHER_DIGITAL_TOKENS = new Set([
  "INTERNET",
  "WEB",
  "PAGINA",
  "SITIO",
  "ONLINE",
  "DOCTORALIA",
  "YOUTUBE",
  "WHATSAPP",
  "WAZE",
  "ADS",
  "ANUNCIO",
  "ANUNCIOS",
  "PUBLICIDAD",
  "HUBSPOT",
]);

const ORGANIC_TOKENS = new Set([
  "RECOMENDACION",
  "RECOMENDADO",
  "RECOMENDADA",
  "RECOMIENDA",
  "REFERIDO",
  "REFERIDA",
  "FAMILIAR",
  "FAMILIA",
  "AMIGO",
  "AMIGA",
  "AMIGOS",
  "CONOCIDO",
  "CONOCIDA",
  "PACIENTE",
  "ESPOSO",
  "ESPOSA",
  "HIJO",
  "HIJA",
  "MAMA",
  "PAPA",
  "HERMANO",
  "HERMANA",
  "PRIMO",
  "PRIMA",
  "TIO",
  "TIA",
  "VECINO",
  "VECINA",
  "COMPANERO",
  "COMPANERA",
  "TRABAJO",
  "EMPRESA",
  "CONVENIO",
  "SEGURO",
  "PASO",
  "PASABA",
  "PASANDO",
  "CAMINANDO",
  "LETRERO",
  "ESPECTACULAR",
  "FACHADA",
  "UBICACION",
  "CERCA",
  "DOCTOR",
  "DOCTORA",
  "DENTISTA",
  "DR",
  "DRA",
]);

/**
 * Mapea el texto libre de la "Referencia" del paciente a un canal.
 *
 * El orden importa: lo más específico primero. "GOOGLE MAPS" debe caer en
 * `google_maps` (orgánico local) y no en `google` (Ads + búsqueda), porque para
 * ROAS no se le carga el gasto de Google Ads. Las plataformas sociales ganan
 * sobre "GOOGLE" cuando la cadena mezcla fuentes (ej. "INSTAGRAM/RECOMENDACIÓN").
 */
export function referenceToChannel(
  reference: string | null | undefined,
): MarketingChannel {
  const normalized = reference ? normalize(reference) : "";
  if (!normalized) {
    return "unknown";
  }

  const padded = ` ${normalized} `;
  const tokens = new Set(normalized.split(" "));
  const hasAny = (set: Set<string>): boolean => {
    for (const token of tokens) {
      if (set.has(token)) {
        return true;
      }
    }
    return false;
  };

  if (hasAny(META_TOKENS) || padded.includes(" RED SOCIAL ")) {
    return "meta";
  }
  if (hasAny(TIKTOK_TOKENS) || padded.includes(" TIK TOK ")) {
    return "tiktok";
  }
  if (tokens.has("MAPS")) {
    return "google_maps";
  }
  if (tokens.has("GOOGLE") || tokens.has("ADWORDS")) {
    return "google";
  }
  if (hasAny(OTHER_DIGITAL_TOKENS)) {
    return "other_digital";
  }
  if (hasAny(ORGANIC_TOKENS)) {
    return "referral_organic";
  }

  return "unknown";
}

/**
 * Mapea la "source" del conector Windsor (gasto publicitario) al mismo canal,
 * para poder unir Inversión (Windsor) con Beneficio (Referencia) en roas-by-channel.
 */
export function windsorSourceToChannel(
  source: string | null | undefined,
): MarketingChannel {
  const normalized = (source ?? "").toLowerCase().trim();
  if (!normalized) {
    return "unknown";
  }

  if (
    normalized.includes("facebook") ||
    normalized.includes("instagram") ||
    normalized === "meta"
  ) {
    return "meta";
  }
  if (normalized.includes("tiktok")) {
    return "tiktok";
  }
  // Antes que "google": google_my_business contiene "google".
  if (normalized.includes("my_business") || normalized.includes("gmb")) {
    return "google_maps";
  }
  if (normalized.includes("google") || normalized.includes("adwords")) {
    return "google";
  }

  return "other_digital";
}
