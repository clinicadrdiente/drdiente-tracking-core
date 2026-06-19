import { readFile } from "node:fs/promises";
import { join } from "node:path";
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
// snapshot se devuelve ese; si no, se arma uno desde los datos precargados
// (owner-demo-data.json) para que /cliente muestre datos al instante.
// La escritura (api/client/publish) SÍ exige TRACKING_API_SECRET.
let cachedFallback: ClientSummarySnapshot | undefined;

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

    if (cachedFallback === undefined) {
      const built = await buildFallbackSnapshot(request);
      if (built) cachedFallback = built;
      send(response, {
        status: 200,
        body: { ok: true, snapshot: built, source: built ? "preloaded" : "none" },
      });
      return;
    }

    send(response, { status: 200, body: { ok: true, snapshot: cachedFallback, source: "preloaded" } });
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
  const demo = (await loadDemoFromDisk()) ?? (await fetchDemoData(request));
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

// Primario: lee el asset incluido en el bundle de la función (independiente de
// la protección de deployment). Ver `includeFiles` en vercel.json.
async function loadDemoFromDisk(): Promise<OwnerDemoData | null> {
  for (const path of [
    join(process.cwd(), "static", "owner-demo-data.json"),
    join(process.cwd(), "apps", "tracking-core", "static", "owner-demo-data.json"),
  ]) {
    try {
      const raw = await readFile(path, "utf8");
      return JSON.parse(raw) as OwnerDemoData;
    } catch {
      // intenta la siguiente ruta
    }
  }
  return null;
}

// Secundario: fetch del asset estático del propio deployment (falla si el
// deployment tiene protección de Vercel, p.ej. en previews).
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
