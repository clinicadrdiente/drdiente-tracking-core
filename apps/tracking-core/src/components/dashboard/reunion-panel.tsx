"use client";
import { useEffect, useMemo, useState } from "react";
import {
  CalendarClockIcon,
  PresentationIcon,
  RocketIcon,
  SparklesIcon,
  TrendingUpIcon,
  UsersRoundIcon,
} from "lucide-react";
import {
  Area,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as ChartTip,
  XAxis,
  YAxis,
} from "recharts";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

/* ---------- tipos del JSON generado por scripts/generar_status_data.py ---------- */
interface Dia {
  fecha: string; clinica: string;
  gImp: number; gClics: number; gCosto: number; gCostoMaps: number; gConv: number; gLeads: number;
  mImp: number; mClics: number; mGasto: number;
  citas: number; atendidas: number; presupN: number; presupMonto: number; caja: number; pagosN: number;
}
interface Atrib {
  fecha: string; clinica: string; canal: string;
  caja: number; pagos: number; citas: number; atendidas: number; presupMonto: number;
}
interface Rec { fecha: string; clinica: string; quien: string; caja: number; pagos: number; pacientes: number }
interface ShareDia {
  fecha: string; clinica: string; campana: string;
  imp: number; disp: number; pp: number; pr: number;
}
interface Canasta {
  etiqueta: string; totalPromedio: number;
  keywords: { keyword: string; promedio: number | null }[];
  serie: { anio: number; mes: number; total: number }[];
  ult12: number; prev12: number; prev24: number;
}
interface Esfuerzo { grupo: "hecho" | "activo" | "siguiente"; titulo: string; detalle: string; quien?: string }
interface Campana {
  nombre: string; estado: string; gasto: number; leads: number;
  cpl: number | null; esMaps: boolean; deltaGasto: number | null;
}
interface StatusData {
  generado: string; cierreDatos: string;
  rango: { desde: string; hasta: string };
  pilarDeCanal: Record<string, string>;
  dias: Dia[];
  atribucion: Atrib[];
  recomendadores: Rec[];
  agendaFutura: { total: number; hastaFecha: string | null; porClinica: Record<string, number>; porCanal: Record<string, number> };
  mercado: { shareDiario: ShareDia[]; canastas: { mx: Canasta; usa: Canasta } };
  esfuerzos: Esfuerzo[];
  campanasSemana: { ventana: { desde: string; hasta: string }; cuentas: Record<string, Campana[]> };
  notas: Record<string, string>;
}

type Clinica = "todas" | "polanco" | "roma";
type TipoPeriodo = "semana" | "cuatro" | "mes" | "todo" | "rango";

const MESES = [
  { clave: "2026-05", etiqueta: "Mayo" },
  { clave: "2026-06", etiqueta: "Junio" },
  { clave: "2026-07", etiqueta: "Julio" },
];

const COLORES_CANAL: Record<string, string> = {
  Google: "#4373E8",
  "Google Maps": "#2E9E6B",
  "Meta / Redes": "#8B6ED4",
  TikTok: "#3EBFC4",
  "IA (ChatGPT)": "#C58ED9",
  Recomendación: "#C5A55A",
  Cercanía: "#8C8577",
  "Sin registro": "#C9C2B2",
  Doctoralia: "#5FB3D9",
  WhatsApp: "#57BE7C",
  "Página web": "#6E93E8",
  Otro: "#AFA795",
};
const COLORES_PILAR: Record<string, string> = {
  Marketing: "#A88B3D",
  Recomendación: "#4373E8",
  Cercanía: "#8C8577",
  "Sin registro": "#C9C2B2",
  Otro: "#AFA795",
};
const ORDEN_PILARES = ["Marketing", "Recomendación", "Cercanía", "Sin registro", "Otro"];

const fmtInt = (n: number) => Math.round(n).toLocaleString("es-MX");
const fmtMoney = (n: number) => `$${Math.round(n).toLocaleString("es-MX")}`;
const fmtCompact = (n: number) =>
  n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `$${Math.round(n / 1000)}k` : `$${Math.round(n)}`;
const fmtPct = (n: number, dec = 1) => `${n.toFixed(dec)}%`;
const fmtFecha = (iso: string) => {
  const [, m, d] = iso.split("-");
  return `${Number(d)} ${["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"][Number(m) - 1]}`;
};

function sumarDias(dias: number, iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
}

function deltaPct(actual: number, previo: number): number | null {
  if (!previo) return null;
  return ((actual - previo) / previo) * 100;
}

function DeltaPill({ delta, invertir = false }: { delta: number | null; invertir?: boolean }) {
  if (delta === null) return null;
  const bueno = invertir ? delta < 0 : delta > 0;
  const tono = Math.abs(delta) < 2 ? "neutro" : bueno ? "bueno" : "malo";
  return <span className={`rn-pill rn-pill-${tono}`}>{delta > 0 ? "+" : ""}{delta.toFixed(0)}%</span>;
}

/* ---------- agregación diaria ---------- */
interface Agregado {
  imp: number; clics: number; inversion: number; invGoogle: number; invMaps: number; invMeta: number;
  leadsPlataforma: number; citas: number; atendidas: number;
  presupN: number; presupMonto: number; caja: number; pagosN: number;
}
const AGREGADO_CERO: Agregado = {
  imp: 0, clics: 0, inversion: 0, invGoogle: 0, invMaps: 0, invMeta: 0,
  leadsPlataforma: 0, citas: 0, atendidas: 0, presupN: 0, presupMonto: 0, caja: 0, pagosN: 0,
};

function enRango(fecha: string, desde: string, hasta: string) {
  return fecha >= desde && fecha <= hasta;
}
function deClinica(cl: string, clinica: Clinica) {
  return clinica === "todas" || cl === clinica;
}

function agregar(dias: Dia[], desde: string, hasta: string, clinica: Clinica): Agregado {
  const a = { ...AGREGADO_CERO };
  for (const d of dias) {
    if (!enRango(d.fecha, desde, hasta) || !deClinica(d.clinica, clinica)) continue;
    a.imp += d.gImp + d.mImp;
    a.clics += d.gClics + d.mClics;
    a.inversion += d.gCosto + d.mGasto;
    a.invGoogle += d.gCosto - d.gCostoMaps;
    a.invMaps += d.gCostoMaps;
    a.invMeta += d.mGasto;
    a.leadsPlataforma += d.gLeads;
    a.citas += d.citas;
    a.atendidas += d.atendidas;
    a.presupN += d.presupN;
    a.presupMonto += d.presupMonto;
    a.caja += d.caja;
    a.pagosN += d.pagosN;
  }
  return a;
}

interface CanalAgg { canal: string; caja: number; pagos: number; citas: number; atendidas: number; presupMonto: number }
function porCanal(atrib: Atrib[], desde: string, hasta: string, clinica: Clinica): CanalAgg[] {
  const mapa = new Map<string, CanalAgg>();
  for (const f of atrib) {
    if (!enRango(f.fecha, desde, hasta) || !deClinica(f.clinica, clinica)) continue;
    const item = mapa.get(f.canal) ?? { canal: f.canal, caja: 0, pagos: 0, citas: 0, atendidas: 0, presupMonto: 0 };
    item.caja += f.caja; item.pagos += f.pagos; item.citas += f.citas;
    item.atendidas += f.atendidas; item.presupMonto += f.presupMonto;
    mapa.set(f.canal, item);
  }
  return [...mapa.values()].sort((a, b) => b.caja - a.caja);
}

/* ---------- embudo ---------- */
function FunnelStage({ etiqueta, valor, detalle, pct, max, familia, retardo }: {
  etiqueta: string; valor: string; detalle?: string; pct?: string | null;
  max: number; familia: "plataforma" | "real"; retardo: number;
}) {
  return (
    <div className="rn-stage" style={{ animationDelay: `${retardo}ms` }}>
      <div className="rn-stage-meta">
        <span className="rn-stage-label">{etiqueta}</span>
        {pct ? <span className="rn-stage-pct">{pct}</span> : null}
      </div>
      <div className={`rn-bar rn-bar-${familia}`} style={{ width: `${Math.max(6, max)}%` }}>
        <span className="rn-bar-valor">{valor}</span>
        {detalle ? <span className="rn-bar-detalle">{detalle}</span> : null}
      </div>
    </div>
  );
}

/* ==================================================================== */
export function ReunionPanel() {
  const [data, setData] = useState<StatusData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tipo, setTipo] = useState<TipoPeriodo>("semana");
  const [mes, setMes] = useState<string>("2026-07");
  const [desdeCustom, setDesdeCustom] = useState("");
  const [hastaCustom, setHastaCustom] = useState("");
  const [clinica, setClinica] = useState<Clinica>("todas");

  useEffect(() => {
    let activo = true;
    (async () => {
      try {
        const res = await fetch("/status-data.json", { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const j = (await res.json()) as StatusData;
        if (activo) {
          setData(j);
          setDesdeCustom(j.rango.desde);
          setHastaCustom(j.rango.hasta);
        }
      } catch (e) {
        if (activo) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => { activo = false; };
  }, []);

  /* --- rango seleccionado --- */
  const [desde, hasta, etiquetaPeriodo] = useMemo((): [string, string, string] => {
    if (!data) return ["", "", ""];
    const fin = data.cierreDatos;
    if (tipo === "semana") {
      const ini = sumarDias(-6, fin);
      return [ini, fin, `${fmtFecha(ini)} – ${fmtFecha(fin)} · últimos 7 días`];
    }
    if (tipo === "cuatro") {
      const ini = sumarDias(-27, fin);
      return [ini, fin, `${fmtFecha(ini)} – ${fmtFecha(fin)} · últimas 4 semanas`];
    }
    if (tipo === "mes") {
      const ini = `${mes}-01` < data.rango.desde ? data.rango.desde : `${mes}-01`;
      const finMes = `${mes}-31` > fin ? fin : `${mes}-31`;
      const nombre = MESES.find((m) => m.clave === mes)?.etiqueta ?? mes;
      return [ini, finMes, `${nombre} (${fmtFecha(ini)} – ${fmtFecha(finMes)})`];
    }
    if (tipo === "rango" && desdeCustom && hastaCustom && desdeCustom <= hastaCustom) {
      return [desdeCustom, hastaCustom, `${fmtFecha(desdeCustom)} – ${fmtFecha(hastaCustom)}`];
    }
    return [data.rango.desde, fin, `todo el registro (${fmtFecha(data.rango.desde)} – ${fmtFecha(fin)})`];
  }, [data, tipo, mes, desdeCustom, hastaCustom]);

  const nDias = useMemo(() => (desde && hasta
    ? Math.round((new Date(hasta).getTime() - new Date(desde).getTime()) / 86400000) + 1
    : 0), [desde, hasta]);

  const actual = useMemo(() => (data ? agregar(data.dias, desde, hasta, clinica) : null), [data, desde, hasta, clinica]);
  const previo = useMemo(() => {
    if (!data || !desde) return null;
    const prevHasta = sumarDias(-1, desde);
    const prevDesde = sumarDias(-(nDias - 1), prevHasta);
    if (prevHasta < data.rango.desde) return null;
    return agregar(data.dias, prevDesde, prevHasta, clinica);
  }, [data, desde, nDias, clinica]);

  const canales = useMemo(() => (data ? porCanal(data.atribucion, desde, hasta, clinica) : []), [data, desde, hasta, clinica]);

  const pilares = useMemo(() => {
    if (!data) return [] as { pilar: string; caja: number; pagos: number; pct: number }[];
    const mapa = new Map<string, { caja: number; pagos: number }>();
    for (const c of canales) {
      const p = data.pilarDeCanal[c.canal] ?? "Otro";
      const item = mapa.get(p) ?? { caja: 0, pagos: 0 };
      item.caja += c.caja; item.pagos += c.pagos;
      mapa.set(p, item);
    }
    const total = [...mapa.values()].reduce((s, x) => s + x.caja, 0) || 1;
    return ORDEN_PILARES.filter((p) => mapa.has(p)).map((p) => ({
      pilar: p, caja: mapa.get(p)!.caja, pagos: mapa.get(p)!.pagos,
      pct: (100 * mapa.get(p)!.caja) / total,
    }));
  }, [data, canales]);

  const citasDig = useMemo(() => canales
    .filter((c) => data?.pilarDeCanal[c.canal] === "Marketing")
    .reduce((s, c) => s + c.citas, 0), [canales, data]);

  /* --- ROAS real por plataforma --- */
  const plataformas = useMemo(() => {
    if (!actual) return [] as { nombre: string; inversion: number; caja: number; citas: number; roas: number | null }[];
    const cajaDe = (canal: string) => canales.find((c) => c.canal === canal)?.caja ?? 0;
    const citasDe = (canal: string) => canales.find((c) => c.canal === canal)?.citas ?? 0;
    return [
      { nombre: "Google", inversion: actual.invGoogle, caja: cajaDe("Google"), citas: citasDe("Google") },
      { nombre: "Google Maps", inversion: actual.invMaps, caja: cajaDe("Google Maps"), citas: citasDe("Google Maps") },
      { nombre: "Meta / Redes", inversion: actual.invMeta, caja: cajaDe("Meta / Redes"), citas: citasDe("Meta / Redes") },
      { nombre: "TikTok", inversion: 0, caja: cajaDe("TikTok"), citas: citasDe("TikTok") },
      { nombre: "IA (ChatGPT)", inversion: 0, caja: cajaDe("IA (ChatGPT)"), citas: citasDe("IA (ChatGPT)") },
    ].map((p) => ({ ...p, roas: p.inversion > 0 ? p.caja / p.inversion : null }))
      .filter((p) => p.inversion > 0 || p.caja > 0)
      .sort((a, b) => b.caja - a.caja);
  }, [actual, canales]);

  const recomendadores = useMemo(() => {
    if (!data) return [] as { quien: string; caja: number; pagos: number }[];
    const mapa = new Map<string, { caja: number; pagos: number }>();
    for (const r of data.recomendadores) {
      if (!enRango(r.fecha, desde, hasta) || !deClinica(r.clinica, clinica)) continue;
      const item = mapa.get(r.quien) ?? { caja: 0, pagos: 0 };
      item.caja += r.caja; item.pagos += r.pagos;
      mapa.set(r.quien, item);
    }
    return [...mapa.entries()].map(([quien, v]) => ({ quien, ...v })).sort((a, b) => b.caja - a.caja);
  }, [data, desde, hasta, clinica]);

  /* --- serie semanal (todo el rango, para contexto) --- */
  const serie = useMemo(() => {
    if (!data) return [] as { etiqueta: string; caja: number; inversion: number }[];
    const semanas = new Map<number, { etiqueta: string; caja: number; inversion: number }>();
    const ancla = new Date(`${data.rango.desde}T00:00:00`).getTime();
    for (const d of data.dias) {
      if (!deClinica(d.clinica, clinica)) continue;
      const i = Math.floor((new Date(`${d.fecha}T00:00:00`).getTime() - ancla) / (7 * 86400000));
      const ini = sumarDias(i * 7, data.rango.desde);
      const item = semanas.get(i) ?? { etiqueta: fmtFecha(ini), caja: 0, inversion: 0 };
      item.caja += d.caja;
      item.inversion += d.gCosto + d.mGasto;
      semanas.set(i, item);
    }
    return [...semanas.entries()].sort((a, b) => a[0] - b[0])
      .map(([, v]) => ({ ...v, inversion: Math.round(v.inversion) }));
  }, [data, clinica]);

  /* --- mercado: share del periodo seleccionado + capturado por mes --- */
  const mercadoCalc = useMemo(() => {
    if (!data) return null;
    const porCampana = new Map<string, { campana: string; imp: number; disp: number; pp: number; pr: number }>();
    for (const f of data.mercado.shareDiario) {
      if (!enRango(f.fecha, desde, hasta) || !deClinica(f.clinica, clinica)) continue;
      const item = porCampana.get(f.campana) ?? { campana: f.campana, imp: 0, disp: 0, pp: 0, pr: 0 };
      item.imp += f.imp; item.disp += f.disp; item.pp += f.pp; item.pr += f.pr;
      porCampana.set(f.campana, item);
    }
    // Campañas donde Google aún no calcula share: disp==imp y nada perdido (recién encendidas)
    const todas = [...porCampana.values()];
    const sinMedir = todas.filter((c) => c.pp === 0 && c.pr === 0 && c.disp === c.imp);
    const conShare = todas.filter((c) => !sinMedir.includes(c))
      .map((c) => ({ ...c, share: c.disp ? c.imp / c.disp : 0, ppPct: c.disp ? c.pp / c.disp : 0, prPct: c.disp ? c.pr / c.disp : 0 }))
      .sort((a, b) => b.share - a.share);
    const capturadas = conShare.reduce((s, c) => s + c.imp, 0);
    const disponibles = conShare.reduce((s, c) => s + c.disp, 0);
    const topPresupuesto = [...conShare].sort((a, b) => b.ppPct - a.ppPct).slice(0, 3);
    // Capturado por mes (respeta clínica, ignora el periodo: para ver el patrón de un vistazo)
    const meses = new Map<string, { imp: number; disp: number }>();
    for (const f of data.mercado.shareDiario) {
      if (!deClinica(f.clinica, clinica)) continue;
      const m = f.fecha.slice(0, 7);
      const item = meses.get(m) ?? { imp: 0, disp: 0 };
      item.imp += f.imp; item.disp += f.disp;
      meses.set(m, item);
    }
    const diasMes = new Map<string, Set<string>>();
    for (const f of data.mercado.shareDiario) {
      if (!deClinica(f.clinica, clinica)) continue;
      const m = f.fecha.slice(0, 7);
      (diasMes.get(m) ?? diasMes.set(m, new Set()).get(m)!).add(f.fecha);
    }
    const porMes = [...meses.entries()].sort()
      .map(([m, v]) => {
        const dias = diasMes.get(m)?.size ?? 1;
        return {
          mes: MESES.find((x) => x.clave === m)?.etiqueta ?? m, ...v,
          share: v.disp ? v.imp / v.disp : 0, dias,
          impDia: v.imp / dias, dispDia: v.disp / dias,
        };
      });
    return {
      shareGlobal: disponibles ? capturadas / disponibles : null,
      disponibles, capturadas, conShare, sinMedir, topPresupuesto, porMes,
    };
  }, [data, desde, hasta, clinica]);

  if (error) {
    return (
      <Card><CardContent className="py-10 text-center text-muted-foreground">
        No pude cargar <code>status-data.json</code> ({error}). Corre <code>python3 scripts/generar_status_data.py</code> y recarga.
      </CardContent></Card>
    );
  }
  if (!data || !actual) {
    return <div className="rn-cargando">Cargando la reunión…</div>;
  }

  const maxLog = Math.log10(Math.max(actual.imp, 10));
  const ancho = (v: number) => (v > 0 ? (Math.log10(Math.max(v, 1.5)) / maxLog) * 100 : 4);
  const ctr = actual.imp ? (actual.clics / actual.imp) * 100 : 0;
  const factorRealidad = actual.leadsPlataforma > 0 ? citasDig / actual.leadsPlataforma : null;

  const campanas = clinica === "roma"
    ? (data.campanasSemana.cuentas.roma ?? [])
    : clinica === "polanco"
      ? (data.campanasSemana.cuentas.polanco ?? [])
      : [...(data.campanasSemana.cuentas.polanco ?? []), ...(data.campanasSemana.cuentas.roma ?? [])];

  const donutData = canales.filter((c) => c.caja > 0).map((c) => ({ name: c.canal, value: c.caja }));
  const sinNombre = recomendadores.find((r) => r.quien === "(sin nombre)");

  return (
    <div className="rn reunion-view flex flex-col gap-5">
      {/* encabezado */}
      <div className="rn-head">
        <div>
          <div className="rn-kicker"><PresentationIcon className="size-3.5" /> Reunión de Status</div>
          <h2 className="rn-titulo">Plataformas contra realidad,<br />en una sola vista.</h2>
          <p className="rn-sub">
            Viendo <b>{etiquetaPeriodo}</b> · datos al {data.cierreDatos} · generado {data.generado.replace("T", " ")}
          </p>
        </div>
        <div className="rn-controles">
          <div className="rn-seg">
            {([["semana", "7 días"], ["cuatro", "4 semanas"], ["todo", "Todo"]] as [TipoPeriodo, string][]).map(([v, t]) => (
              <button key={v} className={tipo === v ? "activo" : ""} onClick={() => setTipo(v)}>{t}</button>
            ))}
            {MESES.map((m) => (
              <button key={m.clave} className={tipo === "mes" && mes === m.clave ? "activo" : ""}
                onClick={() => { setTipo("mes"); setMes(m.clave); }}>{m.etiqueta}</button>
            ))}
            <button className={tipo === "rango" ? "activo" : ""} onClick={() => setTipo("rango")}>Calendario</button>
          </div>
          <div className="rn-seg">
            {([["todas", "Ambas clínicas"], ["polanco", "Polanco"], ["roma", "Roma Norte"]] as [Clinica, string][]).map(([v, t]) => (
              <button key={v} className={clinica === v ? "activo" : ""} onClick={() => setClinica(v)}>{t}</button>
            ))}
          </div>
          {tipo === "rango" ? (
            <div className="rn-fechas">
              <Input type="date" value={desdeCustom} min={data.rango.desde} max={hastaCustom || data.rango.hasta}
                onChange={(e) => setDesdeCustom(e.target.value)} aria-label="Desde" />
              <span>→</span>
              <Input type="date" value={hastaCustom} min={desdeCustom || data.rango.desde} max={data.rango.hasta}
                onChange={(e) => setHastaCustom(e.target.value)} aria-label="Hasta" />
            </div>
          ) : null}
        </div>
      </div>

      {/* KPIs */}
      <div className="rn-kpis">
        {[
          { label: "Inversión publicitaria", valor: fmtMoney(actual.inversion), delta: previo ? deltaPct(actual.inversion, previo.inversion) : null, invertir: true, nota: "Google + Meta" },
          { label: "Impresiones", valor: fmtInt(actual.imp), delta: previo ? deltaPct(actual.imp, previo.imp) : null, nota: "veces que aparecimos" },
          { label: "Clics al sitio", valor: fmtInt(actual.clics), delta: previo ? deltaPct(actual.clics, previo.clics) : null, nota: `CTR ${fmtPct(ctr)}` },
          { label: "Caja real (Dentalink)", valor: fmtMoney(actual.caja), delta: previo ? deltaPct(actual.caja, previo.caja) : null, nota: `${actual.pagosN} pagos`, dorado: true },
        ].map((k) => (
          <div key={k.label} className={`rn-kpi${k.dorado ? " rn-kpi-oro" : ""}`}>
            <span className="rn-kpi-label">{k.label}</span>
            <span className="rn-kpi-valor">{k.valor}</span>
            <span className="rn-kpi-pie">
              <DeltaPill delta={k.delta} invertir={k.invertir} />
              <span>{k.nota}</span>
            </span>
          </div>
        ))}
      </div>

      {/* EMBUDO */}
      <div className="rn-panel">
        <div className="rn-panel-head">
          <h3>El embudo completo</h3>
          <p>De la primera impresión al dinero en caja · {etiquetaPeriodo}. Barras en escala logarítmica para poder verlas juntas.</p>
        </div>
        <div className="rn-funnel">
          <div className="rn-grupo-label">Lo que dicen las plataformas</div>
          <FunnelStage etiqueta="Impresiones" valor={fmtInt(actual.imp)} max={ancho(actual.imp)} familia="plataforma" retardo={0} />
          <FunnelStage etiqueta="Clics" valor={fmtInt(actual.clics)} pct={`${fmtPct(ctr)} de las impresiones`} max={ancho(actual.clics)} familia="plataforma" retardo={80} />
          <FunnelStage etiqueta="Leads que Google reporta" valor={fmtInt(actual.leadsPlataforma)} detalle="sin la campaña de Maps" pct={actual.clics ? `${fmtPct((actual.leadsPlataforma / actual.clics) * 100, 2)} de los clics` : null} max={ancho(actual.leadsPlataforma)} familia="plataforma" retardo={160} />

          <div className="rn-vs">
            <span className="rn-vs-linea" />
            <span className="rn-vs-texto">la realidad de la clínica</span>
            <span className="rn-vs-linea" />
          </div>

          <FunnelStage etiqueta="Citas de canales digitales" valor={fmtInt(citasDig)} detalle="registradas por recepción" pct={factorRealidad ? `${factorRealidad.toFixed(1)}× lo que Google reporta` : null} max={ancho(citasDig)} familia="real" retardo={240} />
          <FunnelStage etiqueta="Citas totales agendadas" valor={fmtInt(actual.citas)} detalle="todos los canales" max={ancho(actual.citas)} familia="real" retardo={320} />
          <FunnelStage etiqueta="Citas atendidas" valor={fmtInt(actual.atendidas)} pct={actual.citas ? `${fmtPct((actual.atendidas / actual.citas) * 100, 0)} asistencia` : null} max={ancho(actual.atendidas)} familia="real" retardo={400} />
          <FunnelStage etiqueta="Presupuestos generados" valor={fmtCompact(actual.presupMonto)} detalle={`${actual.presupN} planes`} max={ancho(actual.presupN)} familia="real" retardo={480} />
          <FunnelStage etiqueta="Caja cobrada" valor={fmtMoney(actual.caja)} detalle={`${actual.pagosN} pagos`} max={ancho(actual.pagosN)} familia="real" retardo={560} />
        </div>
        <div className="rn-nota">
          <SparklesIcon className="size-3.5" />
          <span>
            {factorRealidad
              ? <>Google reportó <b>{fmtInt(actual.leadsPlataforma)} leads</b>, pero recepción registró <b>{fmtInt(citasDig)} citas</b> llegadas por canales digitales — la realidad es <b>{factorRealidad.toFixed(1)}× mayor</b>. Por eso la fuente de verdad es Dentalink, no el conteo de la plataforma.</>
              : <>La plataforma no reporta leads en este periodo; la realidad la cuenta Dentalink: <b>{fmtInt(citasDig)} citas</b> de canales digitales.</>}
          </span>
        </div>
      </div>

      {/* PILARES DE INGRESO */}
      <div className="rn-panel">
        <div className="rn-panel-head">
          <h3>¿De quién es el dinero?</h3>
          <p>La caja del periodo separada por pilar de origen (campo Referencia de recepción) · {etiquetaPeriodo}.</p>
        </div>
        <div className="rn-pilares-barra">
          {pilares.map((p) => (
            <div key={p.pilar} className="rn-pilares-seg" title={`${p.pilar}: ${fmtMoney(p.caja)} (${fmtPct(p.pct, 1)})`}
              style={{ width: `${Math.max(p.pct, 2)}%`, background: COLORES_PILAR[p.pilar] }} />
          ))}
        </div>
        <div className="rn-pilares-cards">
          {pilares.map((p) => (
            <div key={p.pilar} className="rn-pilar">
              <span className="rn-pilar-nombre"><i style={{ background: COLORES_PILAR[p.pilar] }} />{p.pilar}</span>
              <span className="rn-pilar-monto">{fmtMoney(p.caja)}</span>
              <span className="rn-pilar-sub">{fmtPct(p.pct, 1)} · {p.pagos} pagos</span>
            </div>
          ))}
        </div>
      </div>

      {/* ROAS POR PLATAFORMA */}
      <div className="rn-panel">
        <div className="rn-panel-head">
          <h3>ROAS real por plataforma</h3>
          <p>Inversión de la plataforma contra caja que recepción le atribuye · {etiquetaPeriodo}.</p>
        </div>
        <div className="rn-tabla-wrap">
          <table className="rn-tabla">
            <thead><tr><th>Plataforma</th><th>Inversión</th><th>Caja atribuida</th><th>Citas</th><th>ROAS real</th></tr></thead>
            <tbody>
              {plataformas.map((p) => (
                <tr key={p.nombre}>
                  <td><i className="rn-dot" style={{ background: COLORES_CANAL[p.nombre] ?? "#AFA795" }} />{p.nombre}</td>
                  <td>{p.inversion > 0 ? fmtMoney(p.inversion) : "—"}</td>
                  <td>{fmtMoney(p.caja)}</td>
                  <td>{fmtInt(p.citas)}</td>
                  <td className="rn-roas">{p.roas !== null ? `${p.roas.toFixed(1)}×` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="rn-mini-nota">La atribución viene de recepción, no del pixel: es caja cobrada real.</p>
      </div>

      {/* ESFUERZOS DE MARKETING */}
      <div className="rn-panel">
        <div className="rn-panel-head">
          <h3><RocketIcon className="inline size-4 -mt-0.5" /> Los esfuerzos de marketing</h3>
          <p>Lo construido el último mes, lo que se acaba de encender y lo que sigue.</p>
        </div>
        <div className="rn-esfuerzos">
          {([["hecho", "Hecho · último mes"], ["activo", "Encendido · esta semana"], ["siguiente", "Lo que sigue · próximas semanas"]] as const).map(([grupo, titulo]) => (
            <div key={grupo} className="rn-esf-col">
              <div className={`rn-esf-head rn-esf-${grupo}`}>{titulo}</div>
              {data.esfuerzos.filter((e) => e.grupo === grupo).map((e) => (
                <div key={e.titulo} className="rn-esf-card">
                  <b>{e.titulo}{e.quien ? <span className="rn-esf-quien">{e.quien}</span> : null}</b>
                  <span>{e.detalle}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* EL MERCADO (VOLUMEN) */}
      <div className="rn-panel">
        <div className="rn-panel-head">
          <h3><TrendingUpIcon className="inline size-4 -mt-0.5" /> El mercado por el que competimos</h3>
          <p>Cuánto volumen existe, cuánto estamos capturando y cuánto queda disponible · impression share de Google · <b>{etiquetaPeriodo}</b> (obedece al selector de arriba).</p>
        </div>

        <div className="rn-mercado-stats">
          {[
            {
              label: "Búsquedas/mes · México (canasta objetivo)", valor: fmtInt(data.mercado.canastas.mx.totalPromedio),
              yoy: deltaPct(data.mercado.canastas.mx.ult12, data.mercado.canastas.mx.prev12),
              y2: deltaPct(data.mercado.canastas.mx.ult12, data.mercado.canastas.mx.prev24),
            },
            {
              label: "Búsquedas/mes · EE.UU. (turismo dental)", valor: fmtInt(data.mercado.canastas.usa.totalPromedio),
              yoy: deltaPct(data.mercado.canastas.usa.ult12, data.mercado.canastas.usa.prev12),
              y2: deltaPct(data.mercado.canastas.usa.ult12, data.mercado.canastas.usa.prev24),
            },
            mercadoCalc?.shareGlobal != null ? {
              label: `De las subastas donde participamos, capturamos (${etiquetaPeriodo.split(" (")[0]})`, valor: fmtPct(mercadoCalc.shareGlobal * 100, 0),
              yoy: null, y2: null,
              extra: `${fmtInt(mercadoCalc.capturadas)} de ${fmtInt(mercadoCalc.disponibles)} impresiones en nuestras subastas`,
            } : null,
          ].filter(Boolean).map((s) => s ? (
            <div key={s.label} className="rn-mstat">
              <span className="rn-kpi-label">{s.label}</span>
              <span className="rn-mstat-valor">{s.valor}</span>
              <span className="rn-kpi-pie">
                {s.yoy !== null && s.yoy !== undefined ? <span className="rn-pill rn-pill-bueno">{s.yoy > 0 ? "+" : ""}{s.yoy.toFixed(0)}% vs año anterior</span> : null}
                {s.y2 !== null && s.y2 !== undefined ? <span className="rn-pill rn-pill-neutro">{s.y2 > 0 ? "+" : ""}{s.y2.toFixed(0)}% vs hace 2 años</span> : null}
                {"extra" in s && s.extra ? <span>{s.extra}</span> : null}
              </span>
            </div>
          ) : null)}
        </div>

        {mercadoCalc && mercadoCalc.porMes.length > 1 ? (
          <>
            <div className="rn-mes-patron">
              <span className="rn-grupo-label">Nuestra huella mes a mes, en promedio diario (para comparar meses completos con meses en curso):</span>
              {mercadoCalc.porMes.map((m) => (
                <span key={m.mes} className="rn-mes-chip">
                  <b>{m.mes}</b> {fmtPct(m.share * 100, 0)}
                  <small>{fmtInt(m.impDia)}/día de {fmtInt(m.dispDia)}/día · {m.dias} días: {fmtInt(m.imp)} de {fmtInt(m.disp)}</small>
                </span>
              ))}
            </div>
            <p className="rn-mini-nota" style={{ marginTop: "-0.4rem", marginBottom: "1rem" }}>
              Ojo con la lectura: “disponibles” son las subastas donde <b>nuestras campañas participaron</b> — crece cuando encendemos más campañas y presupuesto (es nuestra huella, no el tamaño del mercado). El mercado total es la canasta de búsquedas/mes de abajo. Y las impresiones de hoy se convierten en caja en 4–8 semanas: la siembra de julio se cosecha en agosto.
            </p>
          </>
        ) : null}

        <div className="rn-mercado-grid">
          <div>
            <div className="rn-grupo-label">Cuánto capturamos por campaña (verde) · perdido por presupuesto (ámbar) · por ranking (gris)</div>
            <div className="rn-shares">
              {mercadoCalc?.conShare.map((f) => (
                <div key={f.campana} className="rn-share">
                  <span className="rn-share-nombre" title={f.campana}>{f.campana.replace("Polanco · Search · ", "").replace("Search - ", "").replace("Roma · Search · ", "Roma · ")}</span>
                  <div className="rn-share-barra">
                    <div className="rn-share-cap" style={{ width: `${f.share * 100}%` }} />
                    <div className="rn-share-presup" style={{ width: `${f.ppPct * 100}%` }} />
                    <div className="rn-share-rank" style={{ width: `${f.prPct * 100}%` }} />
                  </div>
                  <span className="rn-share-pct">{fmtPct(f.share * 100, 0)}</span>
                  <span className="rn-share-nums">{fmtInt(f.imp)} de ~{fmtInt(f.disp)}</span>
                </div>
              ))}
            </div>
            {mercadoCalc && mercadoCalc.sinMedir.length > 0 ? (
              <p className="rn-mini-nota">Google aún está midiendo {mercadoCalc.sinMedir.length} campañas recién encendidas (Roma Norte y Turismo USA) — su share aparecerá en unos días.</p>
            ) : null}
          </div>
          <div>
            <div className="rn-grupo-label">El volumen del mercado, mes a mes (jul 2022 → jun 2026)</div>
            <ResponsiveContainer width="100%" height={190}>
              <ComposedChart data={data.mercado.canastas.mx.serie.map((p) => ({
                etiqueta: `${String(p.anio).slice(2)}-${String(p.mes).padStart(2, "0")}`,
                anio: p.anio, mes: p.mes, mx: p.total,
              }))} margin={{ top: 4, right: 8, bottom: 0, left: 8 }}>
                <defs>
                  <linearGradient id="rnMx" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--rn-oro)" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="var(--rn-oro)" stopOpacity={0.03} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="etiqueta" tick={{ fontSize: 10 }} tickLine={false} axisLine={false}
                  ticks={data.mercado.canastas.mx.serie.filter((p) => p.mes === 1).map((p) => `${String(p.anio).slice(2)}-01`)}
                  tickFormatter={(v: string) => `20${v.slice(0, 2)}`} />
                <YAxis tickFormatter={(v: number) => `${Math.round(v / 1000)}k`} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={40} />
                <ChartTip formatter={(value) => [`${fmtInt(Number(value ?? 0))} búsquedas`, "México"]}
                  contentStyle={{ borderRadius: 10, border: "1px solid var(--border)", background: "var(--card)", color: "var(--foreground)", fontSize: 12 }} />
                <Area type="monotone" dataKey="mx" stroke="var(--rn-oro)" strokeWidth={2} fill="url(#rnMx)" />
              </ComposedChart>
            </ResponsiveContainer>
            <ResponsiveContainer width="100%" height={110}>
              <ComposedChart data={data.mercado.canastas.usa.serie.map((p) => ({
                etiqueta: `${String(p.anio).slice(2)}-${String(p.mes).padStart(2, "0")}`,
                usa: p.total,
              }))} margin={{ top: 4, right: 8, bottom: 0, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="etiqueta" tick={{ fontSize: 10 }} tickLine={false} axisLine={false}
                  ticks={data.mercado.canastas.usa.serie.filter((p) => p.mes === 1).map((p) => `${String(p.anio).slice(2)}-01`)}
                  tickFormatter={(v: string) => `20${v.slice(0, 2)}`} />
                <YAxis tickFormatter={(v: number) => `${(v / 1000).toFixed(1)}k`} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={40} />
                <ChartTip formatter={(value) => [`${fmtInt(Number(value ?? 0))} búsquedas`, "EE.UU. turismo"]}
                  contentStyle={{ borderRadius: 10, border: "1px solid var(--border)", background: "var(--card)", color: "var(--foreground)", fontSize: 12 }} />
                <Line type="monotone" dataKey="usa" stroke="#4373E8" strokeWidth={2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rn-kw-grid">
          <div>
            <div className="rn-grupo-label">Búsquedas por palabra · México (promedio mensual)</div>
            <div className="rn-kws">
              {data.mercado.canastas.mx.keywords.map((k) => (
                <span key={k.keyword} className="rn-kw">{k.keyword}<b>{k.promedio ? fmtInt(k.promedio) : "—"}</b></span>
              ))}
            </div>
          </div>
          <div>
            <div className="rn-grupo-label">Búsquedas por palabra · EE.UU. turismo (promedio mensual)</div>
            <div className="rn-kws">
              {data.mercado.canastas.usa.keywords.map((k) => (
                <span key={k.keyword} className="rn-kw">{k.keyword}<b>{k.promedio ? fmtInt(k.promedio) : "—"}</b></span>
              ))}
            </div>
            <p className="rn-mini-nota">Las palabras de procedimientos (implantes, carillas, veneers…) vienen bloqueadas por la política de salud del Keyword Planner: el volumen real del mercado es mayor al mostrado.</p>
          </div>
        </div>

        {mercadoCalc && mercadoCalc.topPresupuesto.length > 0 ? (
          <div className="rn-nota">
            <SparklesIcon className="size-3.5" />
            <span>
              La lectura: en {mercadoCalc.topPresupuesto.map((f, i) => (
                <span key={f.campana}>{i > 0 ? (i === mercadoCalc.topPresupuesto.length - 1 ? " y " : ", ") : ""}<b>{f.campana.replace("Polanco · Search · ", "").replace("Search - ", "")}</b> dejamos <b>{fmtPct(f.ppPct * 100, 0)}</b></span>
              ))} del inventario en la mesa <b>solo por presupuesto</b> — ese volumen se compra con dinero, hoy. Donde el share ya es alto, lo que falta se gana con ranking, no con presupuesto. El mercado además crece: más volumen disponible que en cualquiera de los 3 años anteriores.
            </span>
          </div>
        ) : null}
      </div>

      {/* SERIE SEMANAL */}
      <div className="rn-panel">
        <div className="rn-panel-head">
          <h3>Semana a semana</h3>
          <p>Caja cobrada (área dorada) contra inversión publicitaria (línea) · todo el registro {data.rango.desde} → {data.rango.hasta}.</p>
        </div>
        <div className="rn-chart">
          <ResponsiveContainer width="100%" height={250}>
            <ComposedChart data={serie} margin={{ top: 8, right: 12, bottom: 0, left: 12 }}>
              <defs>
                <linearGradient id="rnOro" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--rn-oro)" stopOpacity={0.45} />
                  <stop offset="100%" stopColor="var(--rn-oro)" stopOpacity={0.04} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="etiqueta" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} interval={0} angle={-20} height={42} dy={10} />
              <YAxis tickFormatter={(v: number) => fmtCompact(v)} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={54} />
              <ChartTip
                formatter={(value, name) => [fmtMoney(Number(value ?? 0)), String(name) === "caja" ? "Caja" : "Inversión"]}
                contentStyle={{ borderRadius: 10, border: "1px solid var(--border)", background: "var(--card)", color: "var(--foreground)", fontSize: 12 }}
              />
              <Area type="monotone" dataKey="caja" stroke="var(--rn-oro)" strokeWidth={2.2} fill="url(#rnOro)" />
              <Line type="monotone" dataKey="inversion" stroke="var(--foreground)" strokeWidth={1.6} dot={false} strokeDasharray="5 3" />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ATRIBUCIÓN */}
      <div className="rn-dos">
        <div className="rn-panel">
          <div className="rn-panel-head">
            <h3>¿De dónde vino la caja?</h3>
            <p>Por canal de referencia · {etiquetaPeriodo}.</p>
          </div>
          <div className="rn-donut">
            <ResponsiveContainer width="100%" height={230}>
              <PieChart>
                <Pie data={donutData} dataKey="value" nameKey="name" innerRadius={62} outerRadius={95} paddingAngle={2} strokeWidth={0}>
                  {donutData.map((d) => <Cell key={d.name} fill={COLORES_CANAL[d.name] ?? "#AFA795"} />)}
                </Pie>
                <ChartTip formatter={(value, name) => [fmtMoney(Number(value ?? 0)), String(name ?? "")]}
                  contentStyle={{ borderRadius: 10, border: "1px solid var(--border)", background: "var(--card)", color: "var(--foreground)", fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
            <div className="rn-donut-centro">
              <span>{fmtCompact(actual.caja)}</span>
              <small>caja del periodo</small>
            </div>
          </div>
          <div className="rn-leyenda">
            {canales.filter((c) => c.caja > 0).slice(0, 6).map((c) => (
              <span key={c.canal}><i style={{ background: COLORES_CANAL[c.canal] ?? "#AFA795" }} />{c.canal} · {fmtCompact(c.caja)}</span>
            ))}
          </div>
        </div>

        <div className="rn-panel">
          <div className="rn-panel-head">
            <h3>Citas por canal</h3>
            <p>Agendadas (y cuántas ya se atendieron) · {etiquetaPeriodo}.</p>
          </div>
          <div className="rn-canales">
            {canales.filter((c) => c.citas > 0).slice(0, 8).map((c) => {
              const maxCitas = Math.max(...canales.map((x) => x.citas), 1);
              return (
                <div key={c.canal} className="rn-canal">
                  <span className="rn-canal-nombre"><i style={{ background: COLORES_CANAL[c.canal] ?? "#AFA795" }} />{c.canal}</span>
                  <div className="rn-canal-barra">
                    <div style={{ width: `${(c.citas / maxCitas) * 100}%`, background: COLORES_CANAL[c.canal] ?? "#AFA795" }} />
                  </div>
                  <span className="rn-canal-n">{c.citas} <small>({c.atendidas} atendidas)</small></span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* RECOMENDADORES + AGENDA FUTURA */}
      <div className="rn-dos rn-dos-desigual">
        <div className="rn-panel">
          <div className="rn-panel-head">
            <h3><UsersRoundIcon className="inline size-4 -mt-0.5" /> ¿Quién nos recomienda?</h3>
            <p>El pilar de recomendación, con nombre y apellido (caja que trajo cada quien) · {etiquetaPeriodo}.</p>
          </div>
          <div className="rn-tabla-wrap">
            <table className="rn-tabla">
              <thead><tr><th>Recomendador</th><th>Pagos</th><th>Caja</th></tr></thead>
              <tbody>
                {recomendadores.filter((r) => r.quien !== "(sin nombre)").slice(0, 7).map((r) => (
                  <tr key={r.quien}>
                    <td>{r.quien}</td>
                    <td>{r.pagos}</td>
                    <td className="rn-roas">{fmtMoney(r.caja)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {sinNombre ? (
            <p className="rn-mini-nota rn-alerta">
              Además hay <b>{fmtMoney(sinNombre.caja)}</b> en {sinNombre.pagos} pagos de recomendación <b>sin nombre</b> — si recepción anota SIEMPRE quién recomendó, este dinero se vuelve accionable (premiar y pedir más referidos).
            </p>
          ) : null}
        </div>

        <div className="rn-panel rn-panel-oro">
          <div className="rn-panel-head">
            <h3><CalendarClockIcon className="inline size-4 -mt-0.5" /> Agenda futura</h3>
            <p>Citas que ya están agendadas hacia adelante.</p>
          </div>
          <div className="rn-futuro">
            <span className="rn-futuro-n">{fmtInt(data.agendaFutura.total)}</span>
            <span className="rn-futuro-sub">citas confirmadas en libros{data.agendaFutura.hastaFecha ? ` · hasta ${data.agendaFutura.hastaFecha}` : ""}</span>
            <div className="rn-futuro-clinicas">
              <span>Polanco <b>{fmtInt(data.agendaFutura.porClinica.polanco ?? 0)}</b></span>
              <span>Roma Norte <b>{fmtInt(data.agendaFutura.porClinica.roma ?? 0)}</b></span>
            </div>
            <div className="rn-futuro-canales">
              {Object.entries(data.agendaFutura.porCanal).slice(0, 6).map(([ca, cn]) => (
                <span key={ca}><i style={{ background: COLORES_CANAL[ca] ?? "#AFA795" }} />{ca} {cn}</span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* CAMPAÑAS */}
      <div className="rn-panel">
        <div className="rn-panel-head">
          <h3>Campañas de Google esta semana</h3>
          <p>{data.campanasSemana.ventana.desde} → {data.campanasSemana.ventana.hasta} · “leads” según Google, con su rezago de 24–48 h.</p>
        </div>
        <div className="rn-tabla-wrap">
          <table className="rn-tabla">
            <thead><tr><th>Campaña</th><th>Inversión</th><th>Leads</th><th>CPL</th></tr></thead>
            <tbody>
              {campanas.map((c) => {
                const tono = c.esMaps ? "a" : c.leads >= 2 && (c.cpl ?? Infinity) <= 2000 ? "g" : c.leads === 0 && c.gasto > 3000 ? "r" : "a";
                return (
                  <tr key={c.nombre} className={c.estado === "PAUSED" ? "rn-fila-pausada" : ""}>
                    <td><span className={`rn-dot rn-dot-${tono}`} />{c.nombre}
                      {c.estado === "PAUSED" ? <Badge variant="secondary" className="ml-2 align-middle">pausada</Badge> : null}
                      {c.esMaps ? <Badge variant="secondary" className="ml-2 align-middle">verificar medición</Badge> : null}
                    </td>
                    <td>{fmtMoney(c.gasto)}</td>
                    <td>{c.esMaps ? `(${fmtInt(c.leads)})` : fmtInt(c.leads)}</td>
                    <td>{c.cpl ? fmtMoney(c.cpl) : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <p className="rn-pie">
        Caja y citas: Dentalink (exports del {data.cierreDatos}, deduplicado por pago — cuadra con la API).
        Impresiones, clics e inversión: Google Ads API y Meta en vivo ({data.notas.meta}).
        “Leads de plataforma” excluye la campaña de Maps. Atribución: campo Referencia de recepción, normalizado a canales y pilares.
      </p>
    </div>
  );
}
