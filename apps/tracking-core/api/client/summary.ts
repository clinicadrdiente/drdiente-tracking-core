import {
  methodNotAllowed,
  send,
  type VercelRequest,
  type VercelResponse,
} from "../_lib/http.js";
import { serverError, trackingHttpHandlers } from "../../src/index.js";
import {
  buildClientSnapshot,
  type ClientSummarySnapshot,
  type WindsorDailyRow,
} from "../../src/modules/reports/client-snapshot.js";
import {
  buildTreatmentMargin,
  parseAccionesRealizadas,
  parsePagosDetalle,
} from "../../src/modules/reports/financial-detail.js";
import {
  buildPipeline,
  parsePresupuestos,
  type CarteraSummary,
} from "../../src/modules/reports/cartera.js";

// Vista del cliente: SOLO el snapshot agregado (sin PII, sin internos). Acceso
// abierto por URL — lo usa únicamente el dueño. Si marketing ya publicó un
// snapshot, se devuelve ese; si no, se arma uno desde los datos precargados
// (owner-demo-data.json) para que /cliente muestre datos al instante.
// La escritura del snapshot (api/client/publish) SÍ exige TRACKING_API_SECRET.
export default async function handler(
  request: VercelRequest,
  response: VercelResponse,
): Promise<void> {
  if (request.method !== "GET") {
    methodNotAllowed(response);
    return;
  }

  try {
    const published = await trackingHttpHandlers.stateStore.getClientSnapshot();
    if (published) {
      send(response, { status: 200, body: { ok: true, snapshot: published, source: "published" } });
      return;
    }

    const fallback = await buildFallbackSnapshot(request);
    send(response, {
      status: 200,
      body: { ok: true, snapshot: fallback, source: fallback ? "preloaded" : "none" },
    });
  } catch (error) {
    send(
      response,
      serverError("failed to load client summary", {
        message: error instanceof Error ? error.message : "unknown error",
      }),
    );
  }
}

interface OwnerDemoData {
  pagos?: Record<string, unknown>[];
  acciones?: Record<string, unknown>[];
  presupuestos?: Record<string, unknown>[];
  cartera?: CarteraSummary;
  windsorDaily?: WindsorDailyRow[];
}

async function buildFallbackSnapshot(
  request: VercelRequest,
): Promise<ClientSummarySnapshot | null> {
  const demo = await fetchDemoData(request);
  if (!demo) return null;

  const pagos = parsePagosDetalle(demo.pagos ?? []);
  if (pagos.length === 0) return null;
  const acciones = parseAccionesRealizadas(demo.acciones ?? []);
  const presupuestos = parsePresupuestos(demo.presupuestos ?? []);

  const dates = pagos
    .map((p) => p.date)
    .filter((d): d is string => Boolean(d))
    .sort();
  const bounds = dates.length
    ? { min: dates[0], max: dates[dates.length - 1] }
    : null;

  // Margen real desde "acciones" si está disponible; si no, 60% por defecto.
  const margins = buildTreatmentMargin(acciones, {});
  const totalMargin = margins.reduce((s, m) => s + m.margin, 0);
  const marginRevenue = margins.reduce((s, m) => s + m.revenue, 0);
  const marginPct = marginRevenue > 0 ? Math.round((totalMargin / marginRevenue) * 100) : 60;

  return buildClientSnapshot({
    pagos,
    acciones,
    windsorDaily: demo.windsorDaily ?? [],
    cartera: demo.cartera ?? null,
    pipeline: presupuestos.length ? buildPipeline(presupuestos, {}) : null,
    marginPct,
    repurchase: 1.3,
    bounds,
    nowIso: new Date().toISOString(),
  });
}

// La función serverless lee el asset estático de su propio deployment.
async function fetchDemoData(request: VercelRequest): Promise<OwnerDemoData | null> {
  const headers = request.headers ?? {};
  const host = headers["x-forwarded-host"] ?? headers.host;
  if (!host) return null;
  const proto = headers["x-forwarded-proto"] ?? "https";
  try {
    const res = await fetch(`${proto}://${host}/owner-demo-data.json`);
    if (!res.ok) return null;
    return (await res.json()) as OwnerDemoData;
  } catch {
    return null;
  }
}
