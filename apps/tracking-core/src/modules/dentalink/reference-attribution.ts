// Clasifica el campo libre "Referencia" de Dentalink (capturado por recepción)
// en canales de atribución para el ROAS del dashboard. Regla de negocio:
// cualquier mención a internet / redes / plataformas digitales cuenta como
// paciente de marketing, aunque la cadena mezcle otras fuentes
// (p. ej. "GOOGLE/RECOMENDACIÓN" → marketing).

export type ReferenceChannel = "marketing" | "organico" | "desconocido";

export interface ReferenceClassification {
  channel: ReferenceChannel;
  matchedKeyword: string | null;
}

// Tokens exactos tras normalizar (mayúsculas, sin acentos, separadores → espacio).
// Token exacto evita falsos positivos: FACE no matchea FACHADA, PASO no matchea PASANDO… sí matchea.
const MARKETING_KEYWORDS = new Set([
  "GOOGLE",
  "MAPS",
  "INSTAGRAM",
  "INSTA",
  "IG",
  "FACEBOOK",
  "FACE",
  "FB",
  "META",
  "TIKTOK",
  "YOUTUBE",
  "TWITTER",
  "MESSENGER",
  "THREADS",
  "WHATSAPP",
  "INTERNET",
  "WEB",
  "PAGINA",
  "SITIO",
  "ONLINE",
  "REDES",
  "ADS",
  "ADWORDS",
  "ANUNCIO",
  "ANUNCIOS",
  "PUBLICIDAD",
  "CAMPANA",
  "HUBSPOT",
  "DOCTORALIA",
  "WAZE",
]);

const MARKETING_PHRASES = ["TIK TOK", "RED SOCIAL"];

const ORGANIC_KEYWORDS = new Set([
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

function normalizeReference(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

export function classifyReference(reference: string | null): ReferenceClassification {
  const normalized = reference ? normalizeReference(reference) : "";
  if (!normalized) {
    return { channel: "desconocido", matchedKeyword: null };
  }

  const padded = ` ${normalized} `;
  for (const phrase of MARKETING_PHRASES) {
    if (padded.includes(` ${phrase} `)) {
      return { channel: "marketing", matchedKeyword: phrase };
    }
  }

  const tokens = normalized.split(" ");
  for (const token of tokens) {
    if (MARKETING_KEYWORDS.has(token)) {
      return { channel: "marketing", matchedKeyword: token };
    }
  }
  for (const token of tokens) {
    if (ORGANIC_KEYWORDS.has(token)) {
      return { channel: "organico", matchedKeyword: token };
    }
  }

  return { channel: "desconocido", matchedKeyword: null };
}

export interface AttributablePayment {
  patientId: number;
  patientReference: string | null;
  amount: number;
}

export interface AttributionBucket {
  patients: number;
  payments: number;
  revenue: number;
  share: number;
}

export interface MarketingAttributionSummary {
  marketing: AttributionBucket;
  organico: AttributionBucket;
  desconocido: AttributionBucket;
  topMarketingReferences: Array<{
    reference: string;
    patients: number;
    payments: number;
    revenue: number;
  }>;
}

const TOP_MARKETING_REFERENCES_LIMIT = 8;

export function buildMarketingAttribution(
  payments: AttributablePayment[],
): MarketingAttributionSummary {
  const totalRevenue = payments.reduce((sum, p) => sum + p.amount, 0);

  const buckets: Record<ReferenceChannel, { patientIds: Set<number>; payments: number; revenue: number }> = {
    marketing: { patientIds: new Set(), payments: 0, revenue: 0 },
    organico: { patientIds: new Set(), payments: 0, revenue: 0 },
    desconocido: { patientIds: new Set(), payments: 0, revenue: 0 },
  };

  const marketingRefs = new Map<
    string,
    { patientIds: Set<number>; payments: number; revenue: number }
  >();

  for (const payment of payments) {
    const { channel } = classifyReference(payment.patientReference);
    const bucket = buckets[channel];
    bucket.payments += 1;
    bucket.revenue += payment.amount;
    if (payment.patientId > 0) {
      bucket.patientIds.add(payment.patientId);
    }

    if (channel === "marketing") {
      const key = payment.patientReference?.trim() ?? "";
      const entry = marketingRefs.get(key) ?? {
        patientIds: new Set<number>(),
        payments: 0,
        revenue: 0,
      };
      entry.payments += 1;
      entry.revenue += payment.amount;
      if (payment.patientId > 0) {
        entry.patientIds.add(payment.patientId);
      }
      marketingRefs.set(key, entry);
    }
  }

  function toBucket(channel: ReferenceChannel): AttributionBucket {
    const bucket = buckets[channel];
    return {
      patients: bucket.patientIds.size,
      payments: bucket.payments,
      revenue: bucket.revenue,
      share: totalRevenue > 0 ? (bucket.revenue / totalRevenue) * 100 : 0,
    };
  }

  const topMarketingReferences = [...marketingRefs.entries()]
    .map(([reference, entry]) => ({
      reference,
      patients: entry.patientIds.size,
      payments: entry.payments,
      revenue: entry.revenue,
    }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, TOP_MARKETING_REFERENCES_LIMIT);

  return {
    marketing: toBucket("marketing"),
    organico: toBucket("organico"),
    desconocido: toBucket("desconocido"),
    topMarketingReferences,
  };
}
