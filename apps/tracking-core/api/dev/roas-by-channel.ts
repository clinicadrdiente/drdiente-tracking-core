import {
  methodNotAllowed,
  send,
  toHttpRequest,
  type VercelRequest,
  type VercelResponse,
} from "../_lib/http.js";
import { requireTrackingSecret, serverError } from "../../src/index.js";
import { getDentalinkConfig } from "../../src/modules/dentalink/config.js";
import { parsePatientReferenceReport } from "../../src/modules/dentalink/patient-reference-report.js";
import {
  buildRoasByChannel,
  type AttributedRevenueInput,
  type ChannelSpendInput,
} from "../../src/modules/reports/roas-by-channel.js";
import { windsorSourceToChannel } from "../../src/modules/reports/marketing-channels.js";
import { createWindsorClient } from "../../src/modules/windsor/client.js";

const MAX_PAYMENT_PAGES = 40;

// Recibe las filas del reporte "Pacientes nuevos" de Dentalink (el frontend
// parsea el XLSX/CSV y manda los renglones como objetos por header), las cruza
// con los pagos reales de Dentalink (Beneficio) y el gasto de Windsor
// (Inversión) para devolver el ROAS por canal.
export default async function handler(
  request: VercelRequest,
  response: VercelResponse,
): Promise<void> {
  if (request.method !== "POST") {
    methodNotAllowed(response);
    return;
  }

  const authError = requireTrackingSecret(toHttpRequest(request));
  if (authError) {
    send(response, authError);
    return;
  }

  try {
    const payload = parseBody(request.body);
    if (!payload.rows || payload.rows.length === 0) {
      send(response, {
        status: 400,
        body: {
          ok: false,
          error:
            "Envía el reporte de pacientes en `rows` (filas con encabezados como claves).",
        },
      });
      return;
    }

    const ingestion = parsePatientReferenceReport(payload.rows);
    if (ingestion.records.length === 0) {
      send(response, {
        status: 422,
        body: {
          ok: false,
          error:
            "No se encontró la columna '# Paciente' en el reporte. Revisa los encabezados.",
          unresolvedColumns: ingestion.unresolvedColumns,
        },
      });
      return;
    }

    const { dateFrom, dateTo } = resolveDateRange(payload, ingestion.records);
    const warnings: string[] = [];

    const revenueByPatient = await fetchRevenueByPatient(dateFrom).catch(
      (error: unknown) => {
        warnings.push(
          `No se pudieron leer pagos de Dentalink: ${
            error instanceof Error ? error.message : "error desconocido"
          }`,
        );
        return new Map<number, number>();
      },
    );

    const spends = await fetchSpendByChannel(dateFrom, dateTo).catch(
      (error: unknown) => {
        warnings.push(
          `No se pudo leer el gasto de Windsor: ${
            error instanceof Error ? error.message : "error desconocido"
          }`,
        );
        return [] as ChannelSpendInput[];
      },
    );

    const revenues: AttributedRevenueInput[] = ingestion.records.map(
      (record) => ({
        patientId: record.patientId,
        channel: record.channel,
        revenue: revenueByPatient.get(record.patientId) ?? 0,
      }),
    );

    const roas = buildRoasByChannel(revenues, spends);

    send(response, {
      status: 200,
      body: {
        ok: true,
        dateFrom,
        dateTo,
        ingestion: {
          totalRows: ingestion.totalRows,
          patients: ingestion.records.length,
          withReference: ingestion.withReference,
          coverage: ingestion.coverage,
          unresolvedColumns: ingestion.unresolvedColumns,
        },
        roas,
        warnings,
      },
    });
  } catch (error) {
    send(
      response,
      serverError("failed to build ROAS by channel", {
        message: error instanceof Error ? error.message : "unknown error",
      }),
    );
  }
}

interface RoasRequestPayload {
  rows: Record<string, unknown>[];
  dateFrom?: string;
  dateTo?: string;
}

function parseBody(body: unknown): RoasRequestPayload {
  const parsed =
    typeof body === "string" ? (JSON.parse(body) as unknown) : body;
  if (typeof parsed !== "object" || parsed === null) {
    return { rows: [] };
  }
  const record = parsed as Record<string, unknown>;
  const rows = Array.isArray(record.rows)
    ? record.rows.filter(
        (row): row is Record<string, unknown> =>
          typeof row === "object" && row !== null,
      )
    : [];
  return {
    rows,
    dateFrom: typeof record.dateFrom === "string" ? record.dateFrom : undefined,
    dateTo: typeof record.dateTo === "string" ? record.dateTo : undefined,
  };
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}/;

function resolveDateRange(
  payload: RoasRequestPayload,
  records: { affiliationDate: string | null }[],
): { dateFrom: string; dateTo: string } {
  const affiliationDates = records
    .map((record) => record.affiliationDate)
    .filter((value): value is string => Boolean(value && ISO_DATE.test(value)))
    .map((value) => value.slice(0, 10))
    .sort();

  const dateFrom =
    payload.dateFrom ?? affiliationDates[0] ?? "2026-01-01";
  const dateTo =
    payload.dateTo ?? new Date().toISOString().slice(0, 10);

  return { dateFrom, dateTo };
}

async function fetchRevenueByPatient(
  dateFromIso: string,
): Promise<Map<number, number>> {
  const config = getDentalinkConfig();
  const revenue = new Map<number, number>();
  const filter = JSON.stringify({
    [config.paymentDateField]: { gte: `${dateFromIso} 00:00:00` },
  });

  let pageUrl: URL | null = new URL(
    config.paymentsPath.replace(/^\/+/, ""),
    config.baseUrl,
  );
  pageUrl.search = `q=${encodeURIComponent(filter)}`;

  for (let page = 0; pageUrl && page < MAX_PAYMENT_PAGES; page += 1) {
    const body: unknown = await requestDentalink(
      pageUrl,
      config.apiAuthScheme,
      config.apiToken,
    );
    for (const record of readCollection(body)) {
      const patientId = readNumber(record, config.paymentPatientIdField);
      if (patientId > 0) {
        revenue.set(
          patientId,
          (revenue.get(patientId) ?? 0) +
            readNumber(record, config.paymentAmountField),
        );
      }
    }
    pageUrl = readNextPageUrl(body, config.baseUrl);
  }

  return revenue;
}

async function fetchSpendByChannel(
  dateFrom: string,
  dateTo: string,
): Promise<ChannelSpendInput[]> {
  const client = createWindsorClient();
  if (!client.isConfigured()) {
    return [];
  }

  const summary = await client.getMarketingSummary({ dateFrom, dateTo });
  return summary.bySource.map((source) => ({
    channel: windsorSourceToChannel(source.source),
    spend: source.spend,
    clicks: source.clicks,
    impressions: source.impressions,
  }));
}

async function requestDentalink(
  url: URL,
  apiAuthScheme: string,
  apiToken: string,
): Promise<unknown> {
  const response = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: `${apiAuthScheme} ${apiToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Dentalink respondió ${response.status} en ${url.pathname}`);
  }

  return (await response.json()) as unknown;
}

function readCollection(body: unknown): Record<string, unknown>[] {
  if (Array.isArray(body)) {
    return body.filter(isRecord);
  }
  if (isRecord(body) && Array.isArray(body.data)) {
    return body.data.filter(isRecord);
  }
  return [];
}

function readNextPageUrl(body: unknown, baseUrl: string): URL | null {
  if (!isRecord(body) || !isRecord(body.links)) {
    return null;
  }
  const next = body.links.next;
  if (typeof next !== "string" || next.trim() === "") {
    return null;
  }
  return new URL(next, baseUrl);
}

function readNumber(record: Record<string, unknown>, key: string): number {
  const value = record[key];
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
