import {
  methodNotAllowed,
  send,
  toHttpRequest,
  type VercelRequest,
  type VercelResponse,
} from "../_lib/http.js";
import { requireTrackingSecret, serverError } from "../../src/index.js";
import { getDentalinkConfig } from "../../src/modules/dentalink/config.js";
import { buildPaymentsQuery } from "../../src/modules/dentalink/payloads.js";

interface ReferenceCatalogProbe {
  path: string;
  ok: boolean;
  status: number;
  returnedCount: number | null;
  sample: Array<{
    id: string | null;
    label: string | null;
    keys: string[];
  }>;
}

interface PatientReferenceProbe {
  patientId: number;
  patientName: string | null;
  fields: Array<{
    key: string;
    value: string;
  }>;
  checkedPaths: Array<{
    path: string;
    status: number;
    fields: Array<{
      key: string;
      value: string;
    }>;
  }>;
}

const REFERENCE_CATALOG_PATHS = [
  "/referencias/",
  "/referencias",
  "/campos_adicionales/",
];

const PATIENT_REFERENCE_PATH_TEMPLATES = [
  "/pacientes/{id}/campos_adicionales/",
  "/pacientes/{id}/campos_adicionales",
  "/pacientes/{id}/adicionales/",
  "/pacientes/{id}/referencias/",
];

const MAX_PATIENT_REFERENCE_PROBES = 3;

export default async function handler(
  request: VercelRequest,
  response: VercelResponse,
): Promise<void> {
  if (request.method !== "GET") {
    methodNotAllowed(response);
    return;
  }

  const authError = requireTrackingSecret(toHttpRequest(request));
  if (authError) {
    send(response, authError);
    return;
  }

  try {
    const config = getDentalinkConfig();

    if (config.mode !== "api") {
      send(response, {
        status: 200,
        body: {
          ok: true,
          mode: config.mode,
          message: "Dentalink is running in stub mode.",
        },
      });
      return;
    }

    const [catalogProbes, patientProbes] = await Promise.all([
      probeReferenceCatalogs(config.baseUrl, config.apiAuthScheme, config.apiToken),
      probeRecentPatientReferences(config, request),
    ]);

    send(response, {
      status: 200,
      body: {
        ok: true,
        mode: config.mode,
        configuredPatientReferenceField: config.patientReferenceField,
        catalogProbes,
        patientProbes,
        recommendation: buildRecommendation(catalogProbes, patientProbes),
      },
    });
  } catch (error) {
    send(
      response,
      serverError("failed to diagnose Dentalink references", {
        message: error instanceof Error ? error.message : "unknown error",
      }),
    );
  }
}

async function probeReferenceCatalogs(
  baseUrl: string,
  apiAuthScheme: string,
  apiToken: string,
): Promise<ReferenceCatalogProbe[]> {
  const probes: ReferenceCatalogProbe[] = [];

  for (const path of REFERENCE_CATALOG_PATHS) {
    const url = new URL(path.replace(/^\/+/, ""), baseUrl);
    const result = await requestDentalink(url, apiAuthScheme, apiToken);
    const records = result.ok ? readCollection(result.body) : [];

    probes.push({
      path,
      ok: result.ok,
      status: result.status,
      returnedCount: result.ok ? records.length : null,
      sample: records.slice(0, 8).map((record) => ({
        id: readReferenceId(record),
        label: readReferenceLabel(record),
        keys: Object.keys(record).sort(),
      })),
    });
  }

  return probes;
}

async function probeRecentPatientReferences(
  config: ReturnType<typeof getDentalinkConfig>,
  request: VercelRequest,
) {
  const sinceIso = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const paymentsUrl = new URL(config.paymentsPath.replace(/^\/+/, ""), config.baseUrl);
  paymentsUrl.search = buildPaymentsQuery(config.paymentDateField, sinceIso);
  const paymentsResult = await requestDentalink(
    paymentsUrl,
    config.apiAuthScheme,
    config.apiToken,
  );

  if (!paymentsResult.ok) {
    return [];
  }

  const explicitPatientId = readQueryPatientId(request);
  const payments = readCollection(paymentsResult.body);
  const seenPatients = new Set<number>();
  const probes: PatientReferenceProbe[] = [];

  if (explicitPatientId) {
    const payment = payments.find(
      (candidate) =>
        readNumber(candidate, config.paymentPatientIdField) === explicitPatientId,
    );
    return [
      await probePatientReference(
        config,
        explicitPatientId,
        payment ? readString(payment, config.paymentPatientNameField) : null,
      ),
    ];
  }

  for (const payment of payments) {
    if (probes.length >= MAX_PATIENT_REFERENCE_PROBES) {
      break;
    }

    const patientId = readNumber(payment, config.paymentPatientIdField);
    if (!patientId || seenPatients.has(patientId)) {
      continue;
    }

    seenPatients.add(patientId);
    probes.push(
      await probePatientReference(
        config,
        patientId,
        readString(payment, config.paymentPatientNameField),
      ),
    );
    await wait(250);
  }

  return probes;
}

async function probePatientReference(
  config: ReturnType<typeof getDentalinkConfig>,
  patientId: number,
  paymentPatientName: string | null,
): Promise<PatientReferenceProbe> {
  const patientUrl = new URL(
    config.patientsPathTemplate.replace("{id}", String(patientId)).replace(/^\/+/, ""),
    config.baseUrl,
  );
  const patientResult = await requestDentalink(
    patientUrl,
    config.apiAuthScheme,
    config.apiToken,
  );

  if (!patientResult.ok) {
    return {
      patientId,
      patientName: paymentPatientName,
      fields: [{ key: "patient_detail", value: `unavailable_${patientResult.status}` }],
      checkedPaths: [],
    };
  }

  const patient = unwrapRecord(patientResult.body);
  const patientNameFromRecord = [
    readString(patient, config.patientFirstNameField),
    readString(patient, config.patientLastNameField),
  ]
    .filter(Boolean)
    .join(" ");
  const checkedPaths: PatientReferenceProbe["checkedPaths"] = [];
  const fields = describeReferenceFields(patient, config.patientReferenceField);

  if (hasUsefulReferenceFields(fields)) {
    return {
      patientId,
      patientName: paymentPatientName ?? (patientNameFromRecord || null),
      fields,
      checkedPaths,
    };
  }

  for (const pathTemplate of PATIENT_REFERENCE_PATH_TEMPLATES) {
    const path = pathTemplate.replace("{id}", String(patientId));
    const url = new URL(path.replace(/^\/+/, ""), config.baseUrl);
    const result = await requestDentalink(url, config.apiAuthScheme, config.apiToken);
    const candidateFields = result.ok
      ? describeReferenceFieldsFromUnknown(result.body)
      : [];

    checkedPaths.push({
      path,
      status: result.status,
      fields: candidateFields,
    });

    if (hasUsefulReferenceFields(candidateFields)) {
      fields.push(...candidateFields.map((field) => ({
        key: `${path}.${field.key}`,
        value: field.value,
      })));
      break;
    }

    if (result.status === 429) {
      break;
    }

    await wait(250);
  }

  return {
    patientId,
    patientName: paymentPatientName ?? (patientNameFromRecord || null),
    fields,
    checkedPaths,
  };
}

async function requestDentalink(
  url: URL,
  apiAuthScheme: string,
  apiToken: string,
): Promise<{ ok: boolean; status: number; body: unknown }> {
  const response = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: `${apiAuthScheme} ${apiToken}`,
    },
  });

  return {
    ok: response.ok,
    status: response.status,
    body: response.headers.get("content-type")?.includes("application/json")
      ? await response.json()
      : null,
  };
}

function describeReferenceFields(
  record: Record<string, unknown>,
  configuredField: string,
): Array<{ key: string; value: string }> {
  const fields: Array<{ key: string; value: string }> = [];
  const recordLabel = readAdditionalFieldLabel(record);

  if (recordLabel && isReferenceKey(recordLabel)) {
    fields.push({
      key: recordLabel,
      value: describeValue(
        record.valor ??
          record.value ??
          record.respuesta ??
          record.contenido ??
          record.valor_campo ??
          record.valorCampo ??
          record,
      ),
    });
  }

  for (const [key, value] of Object.entries(record)) {
    if (key === configuredField || isReferenceKey(key)) {
      fields.push({ key, value: describeValue(value) });
    }
  }

  for (const containerKey of ["campos_adicionales", "camposAdicionales", "custom_fields"]) {
    const value = record[containerKey];
    if (!value) {
      continue;
    }

    fields.push(...describeAdditionalReferenceFields(containerKey, value));
  }

  return fields.length > 0
    ? fields
    : [{ key: "reference_fields", value: "no candidates found" }];
}

function describeAdditionalReferenceFields(
  containerKey: string,
  value: unknown,
): Array<{ key: string; value: string }> {
  const fields: Array<{ key: string; value: string }> = [];

  if (isRecord(value) && Array.isArray(value.data)) {
    return describeAdditionalReferenceFields(containerKey, value.data);
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      if (!isRecord(item)) {
        continue;
      }

      const label = readAdditionalFieldLabel(item);
      if (label && isReferenceKey(label)) {
        fields.push({
          key: `${containerKey}.${label}`,
          value: describeValue(
            item.valor ??
              item.value ??
              item.respuesta ??
              item.contenido ??
              item.valor_campo ??
              item.valorCampo ??
              item,
          ),
        });
      }
    }
  }

  if (isRecord(value)) {
    for (const [key, entry] of Object.entries(value)) {
      if (isReferenceKey(key)) {
        fields.push({ key: `${containerKey}.${key}`, value: describeValue(entry) });
      }
    }
  }

  return fields;
}

function readAdditionalFieldLabel(record: Record<string, unknown>): string | null {
  return (
    readReferenceLabel(record) ??
    (isRecord(record.campo) ? readReferenceLabel(record.campo) : null) ??
    (isRecord(record.campo_adicional) ? readReferenceLabel(record.campo_adicional) : null) ??
    (isRecord(record.campoAdicional) ? readReferenceLabel(record.campoAdicional) : null)
  );
}

function describeReferenceFieldsFromUnknown(
  body: unknown,
): Array<{ key: string; value: string }> {
  if (Array.isArray(body)) {
    return body
      .filter(isRecord)
      .flatMap((record, index) =>
        describeReferenceFields(record, "referencia").map((field) => ({
          key: `${index}.${field.key}`,
          value: field.value,
        })),
      )
      .filter((field) => field.key !== "reference_fields");
  }

  if (isRecord(body) && Array.isArray(body.data)) {
    return describeReferenceFieldsFromUnknown(body.data);
  }

  if (isRecord(body)) {
    return describeReferenceFields(unwrapRecord(body), "referencia");
  }

  return [];
}

function hasUsefulReferenceFields(fields: Array<{ key: string; value: string }>): boolean {
  return fields.some(
    (field) =>
      field.key !== "reference_fields" &&
      field.key !== "request" &&
      !field.value.startsWith("unavailable_") &&
      field.value !== "no candidates found",
  );
}

function buildRecommendation(
  catalogProbes: ReferenceCatalogProbe[],
  patientProbes: PatientReferenceProbe[],
): string {
  const workingCatalog = catalogProbes.find(
    (probe) => probe.ok && (probe.returnedCount ?? 0) > 0,
  );
  const candidateField = patientProbes
    .flatMap((probe) => probe.fields)
    .find((field) => field.key !== "reference_fields" && field.key !== "request");

  if (workingCatalog && candidateField) {
    return `Usar campo ${candidateField.key} y resolver IDs con ${workingCatalog.path}.`;
  }

  if (candidateField) {
    return `Usar campo ${candidateField.key}. No se encontro catalogo; si devuelve ID se mostrara como Referencia #ID.`;
  }

  return "No se detecto campo de referencia en pacientes recientes. Revisar permisos de Pacientes/Campos adicionales en Dentalink.";
}

function readQueryPatientId(request: VercelRequest): number | null {
  const value = request.query?.patientId;
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== "string" || raw.trim() === "") {
    return null;
  }

  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
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

function unwrapRecord(body: unknown): Record<string, unknown> {
  if (isRecord(body) && isRecord(body.data)) {
    return body.data;
  }

  return isRecord(body) ? body : {};
}

function readReferenceId(record: Record<string, unknown>): string | null {
  for (const key of [
    "id",
    "id_referencia",
    "id_fuente",
    "id_origen",
    "id_canal",
    "codigo",
  ]) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }

    if (typeof value === "string" && value.trim() !== "") {
      return value.trim();
    }
  }

  return null;
}

function readReferenceLabel(record: Record<string, unknown>): string | null {
  for (const key of [
    "nombre",
    "nombre_campo",
    "nombreCampo",
    "name",
    "campo",
    "etiqueta",
    "titulo",
    "valor",
    "value",
    "descripcion",
    "description",
    "label",
  ]) {
    const value = readString(record, key);
    if (value) {
      return value;
    }
  }

  return null;
}

function describeValue(value: unknown): string {
  if (typeof value === "string" && value.trim() !== "") {
    return value.trim();
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (Array.isArray(value)) {
    return `[${value.length} items]`;
  }

  if (isRecord(value)) {
    const id = readReferenceId(value);
    const label = readReferenceLabel(value);
    return [id ? `id=${id}` : null, label ? `label=${label}` : null]
      .filter(Boolean)
      .join(", ") || `{${Object.keys(value).sort().join(", ")}}`;
  }

  return "empty";
}

function isReferenceKey(value: string): boolean {
  const normalized = value.toLowerCase();
  return (
    normalized.includes("refer") ||
    normalized.includes("fuente") ||
    normalized.includes("origen") ||
    normalized.includes("canal")
  );
}

function readString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
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
