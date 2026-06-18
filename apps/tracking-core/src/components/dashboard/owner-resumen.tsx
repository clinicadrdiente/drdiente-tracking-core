"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { RefreshCwIcon, UploadIcon, BriefcaseIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  buildFinancialSummary,
  buildTreatmentMargin,
  parseAccionesRealizadas,
  parsePagosDetalle,
  type AccionRecord,
  type PagoDetalleRecord,
} from "@/modules/reports/financial-detail";
import { CHANNEL_LABELS, windsorSourceToChannel, type MarketingChannel } from "@/modules/reports/marketing-channels";
import {
  buildCartera,
  buildPipeline,
  parsePresupuestos,
  parseSaldos,
  type CarteraSummary,
  type PipelineSummary,
  type PresupuestoRecord,
  type SaldoRecord,
} from "@/modules/reports/cartera";
import { computeKpis, project, type Kpis, type ProjectionMode, type ProjectionResult } from "@/modules/reports/projections";

interface WindsorSource {
  source: string;
  spend?: number;
}
interface WindsorSummary {
  ok?: boolean;
  configured?: boolean;
  bySource?: WindsorSource[];
  totals?: { spend?: number };
}

function money(value: number): string {
  if (!Number.isFinite(value)) return "—";
  if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (Math.abs(value) >= 1_000) return `$${(value / 1_000).toFixed(1)}k`;
  return `$${Math.round(value)}`;
}
function moneyFull(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }).format(value);
}
function pct(value: number): string {
  return `${Math.round(value)}%`;
}

function parseDelimited(text: string, delimiter: string): Record<string, unknown>[] {
  const rows: string[][] = [];
  let field = "", row: string[] = [], inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i += 1; } else inQuotes = false; }
      else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === delimiter) { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i += 1;
      row.push(field); field = "";
      if (row.some((x) => x.trim() !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== "" || row.length) { row.push(field); if (row.some((x) => x.trim() !== "")) rows.push(row); }
  if (rows.length < 2) return [];
  const headers = rows[0].map((h) => h.trim());
  return rows.slice(1).map((cells) => {
    const r: Record<string, unknown> = {};
    headers.forEach((h, i) => { r[h] = cells[i] ?? null; });
    return r;
  });
}

async function parseFile(file: File): Promise<Record<string, unknown>[]> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".csv")) return parseDelimited(await file.text(), ",");
  // Dentalink a veces exporta ".xls" como TSV UTF-16 (no es un xls binario real).
  if (name.endsWith(".xls")) {
    const buf = await file.arrayBuffer();
    const head = new Uint8Array(buf.slice(0, 2));
    const enc = head[0] === 0xfe && head[1] === 0xff ? "utf-16be" : "utf-16le";
    const text = new TextDecoder(enc).decode(buf).replace(/^﻿/, "");
    const rows = parseDelimited(text, "\t");
    if (rows.length === 0) {
      throw new Error("Este .xls no parece TSV de Dentalink. Expórtalo de nuevo, o súbelo como .xlsx o .csv.");
    }
    return rows;
  }
  if (!name.endsWith(".xlsx")) {
    throw new Error("Formato no soportado. Sube el reporte en .xlsx, .xls o .csv.");
  }
  let XLSX: {
    read: (data: ArrayBuffer, opts: Record<string, unknown>) => { SheetNames: string[]; Sheets: Record<string, unknown> };
    utils: { sheet_to_json: (sheet: unknown, opts: Record<string, unknown>) => Record<string, unknown>[] };
  };
  try {
    const specifier = "https://esm.sh/xlsx@0.18.5";
    XLSX = await import(/* @vite-ignore */ specifier);
  } catch {
    throw new Error("No se pudo cargar el lector de Excel (revisa tu conexión) — o sube el archivo en CSV.");
  }
  const wb = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
  // cellDates: las fechas llegan como Date (no seriales) para no perder la fecha.
  return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: null });
}

type Preset = "all" | "30" | "90" | "custom";

export function OwnerResumen({ secret }: { secret: string }) {
  const [pagos, setPagos] = useState<PagoDetalleRecord[] | null>(null);
  const [acciones, setAcciones] = useState<AccionRecord[] | null>(null);
  const [saldos, setSaldos] = useState<SaldoRecord[] | null>(null);
  const [presupuestos, setPresupuestos] = useState<PresupuestoRecord[] | null>(null);
  const [names, setNames] = useState<{ pagos?: string; acciones?: string; saldos?: string; presupuestos?: string }>({});
  const [bounds, setBounds] = useState<{ min: string; max: string } | null>(null);
  const [marginInput, setMarginInput] = useState<number>(60);
  const [repurchase, setRepurchase] = useState<number>(1.3);
  const [projMode, setProjMode] = useState<ProjectionMode>("scale");
  const [scalePct, setScalePct] = useState<number>(50);
  const [goalRevenue, setGoalRevenue] = useState<number>(0);
  const [preset, setPreset] = useState<Preset>("all");
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");
  const [spendByChannel, setSpendByChannel] = useState<Map<MarketingChannel, number>>(new Map());
  const [totalSpend, setTotalSpend] = useState<number>(0);
  const [windsorState, setWindsorState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const customInvalid = preset === "custom" && (!from || !to || from > to);

  const range = useMemo(() => {
    if (preset === "all") return {};
    if (preset === "custom") return customInvalid ? {} : { from, to };
    if (!bounds) return {};
    const days = Number(preset);
    const end = new Date(`${bounds.max}T00:00:00`);
    const start = new Date(end.getTime() - days * 86400000);
    return { from: start.toISOString().slice(0, 10), to: bounds.max };
  }, [preset, from, to, bounds, customInvalid]);

  // El gasto de Windsor se pide para el MISMO periodo que el ingreso. En "Todo"
  // se usa el rango completo de los datos del archivo (bounds).
  const windsorRange = useMemo(() => {
    if (range.from && range.to) return { from: range.from, to: range.to };
    if (bounds) return { from: bounds.min, to: bounds.max };
    return null;
  }, [range, bounds]);

  const summary = useMemo(() => (pagos ? buildFinancialSummary(pagos, range) : null), [pagos, range]);
  const margins = useMemo(() => (acciones ? buildTreatmentMargin(acciones, range) : null), [acciones, range]);
  const totalMargin = margins?.reduce((s, m) => s + m.margin, 0) ?? null;
  const marginRevenue = margins?.reduce((s, m) => s + m.revenue, 0) ?? 0;

  useEffect(() => {
    if (!secret.trim() || !windsorRange) return;
    let cancelled = false;
    setWindsorState("loading");
    setSpendByChannel(new Map());
    setTotalSpend(0);
    (async () => {
      try {
        const res = await fetch(`/api/dev/windsor-marketing-summary?from=${windsorRange.from}&to=${windsorRange.to}`, {
          headers: { "x-tracking-secret": secret.trim() },
        });
        const body = (await res.json()) as WindsorSummary;
        if (cancelled) return;
        if (!res.ok || body.ok === false || body.configured === false) {
          setWindsorState("error");
          return;
        }
        const map = new Map<MarketingChannel, number>();
        for (const s of body.bySource ?? []) {
          const ch = windsorSourceToChannel(s.source);
          map.set(ch, (map.get(ch) ?? 0) + (s.spend ?? 0));
        }
        setSpendByChannel(map);
        setTotalSpend(body.totals?.spend ?? 0);
        setWindsorState("ready");
      } catch {
        if (!cancelled) setWindsorState("error");
      }
    })();
    return () => { cancelled = true; };
  }, [windsorRange, secret]);

  const revenueButZero = summary !== null && pagos !== null && pagos.length > 0 && summary.totals.revenue === 0;

  // Canales con gasto en Windsor pero sin ingreso atribuido: se muestran igual
  // para que la suma de inversiones cuadre con el total de cabecera.
  const orphanSpend = useMemo(() => {
    if (!summary) return [] as Array<[MarketingChannel, number]>;
    const shown = new Set(summary.byChannel.map((c) => c.channel));
    return [...spendByChannel.entries()].filter(([ch, s]) => s > 0 && !shown.has(ch));
  }, [summary, spendByChannel]);

  const today = new Date().toISOString().slice(0, 10);
  const cartera = useMemo(() => (saldos ? buildCartera(saldos, today) : null), [saldos, today]);
  const pipeline = useMemo(() => (presupuestos ? buildPipeline(presupuestos, range) : null), [presupuestos, range]);

  // Periodo inmediatamente anterior, misma longitud → "de dónde vengo".
  const priorRange = useMemo(() => {
    if (!range.from || !range.to) return null;
    const fromMs = new Date(`${range.from}T00:00:00`).getTime();
    const toMs = new Date(`${range.to}T00:00:00`).getTime();
    const lenDays = Math.round((toMs - fromMs) / 86400000) + 1;
    const pTo = new Date(fromMs - 86400000);
    const pFrom = new Date(pTo.getTime() - (lenDays - 1) * 86400000);
    return { from: pFrom.toISOString().slice(0, 10), to: pTo.toISOString().slice(0, 10) };
  }, [range]);
  const priorSummary = useMemo(
    () => (pagos && priorRange ? buildFinancialSummary(pagos, priorRange) : null),
    [pagos, priorRange],
  );

  const mktPaying = summary ? summary.byChannel.filter((c) => c.isMarketing).reduce((s, c) => s + c.payingPatients, 0) : 0;
  const avgTicket = summary && mktPaying > 0 ? summary.marketing.revenue / mktPaying : 0;

  // Prefill del margen con el real de "acciones" SOLO la primera vez (no pisa
  // ediciones manuales del usuario al cambiar el rango).
  const marginTouched = useRef(false);
  useEffect(() => {
    if (!marginTouched.current && totalMargin !== null && marginRevenue > 0) {
      setMarginInput(Math.round((totalMargin / marginRevenue) * 100));
    }
  }, [totalMargin, marginRevenue]);
  const handleMarginChange = (v: number) => {
    marginTouched.current = true;
    setMarginInput(v);
  };

  const kpis = useMemo(
    () =>
      summary
        ? computeKpis({
            marketingRevenue: summary.marketing.revenue,
            spend: totalSpend,
            payingPatients: mktPaying,
            avgTicket,
            marginPct: marginInput,
            repurchase,
          })
        : null,
    [summary, totalSpend, mktPaying, avgTicket, marginInput, repurchase],
  );

  const projection = useMemo(
    () =>
      summary
        ? project({
            mode: projMode,
            marketingRevenue: summary.marketing.revenue,
            spend: totalSpend,
            payingPatients: mktPaying,
            avgTicket,
            marginPct: marginInput,
            periodDays: 30,
            elapsedDays: 30,
            scalePct,
            goalRevenue,
          })
        : null,
    [summary, totalSpend, mktPaying, avgTicket, marginInput, projMode, scalePct, goalRevenue],
  );

  async function handleFile(file: File, kind: "pagos" | "acciones" | "saldos" | "presupuestos") {
    setLoading(true);
    setError(null);
    try {
      const rows = await parseFile(file);
      if (kind === "pagos") {
        const parsed = parsePagosDetalle(rows);
        if (parsed.length === 0) throw new Error("No reconocí columnas del reporte de pagos por acción.");
        const dates = parsed.map((p) => p.date).filter((d): d is string => Boolean(d)).sort();
        setPagos(parsed);
        setNames((n) => ({ ...n, pagos: file.name }));
        if (dates.length) setBounds({ min: dates[0], max: dates[dates.length - 1] });
      } else if (kind === "acciones") {
        setAcciones(parseAccionesRealizadas(rows));
        setNames((n) => ({ ...n, acciones: file.name }));
      } else if (kind === "saldos") {
        setSaldos(parseSaldos(rows));
        setNames((n) => ({ ...n, saldos: file.name }));
      } else {
        setPresupuestos(parsePresupuestos(rows));
        setNames((n) => ({ ...n, presupuestos: file.name }));
      }
      window.localStorage.setItem("trackingSecret", secret.trim());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al procesar el archivo.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <BriefcaseIcon className="size-6 text-primary" />
            Resumen para dueños
          </h2>
          <p className="text-muted-foreground text-sm mt-0.5">
            Sube los reportes de Dentalink (pagos por acción + acciones realizadas). El dinero, los
            canales, los tratamientos y el margen se calculan al instante y filtran por fecha.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <UploadButton label={names.pagos ? "Pagos ✓" : "Subir pagos"} onFile={(f) => handleFile(f, "pagos")} loading={loading} primary />
          <UploadButton label={names.acciones ? "Acciones ✓" : "Acciones (margen)"} onFile={(f) => handleFile(f, "acciones")} loading={loading} />
          <UploadButton label={names.saldos ? "Saldos ✓" : "Saldos (cartera)"} onFile={(f) => handleFile(f, "saldos")} loading={loading} />
          <UploadButton label={names.presupuestos ? "Presupuestos ✓" : "Presupuestos"} onFile={(f) => handleFile(f, "presupuestos")} loading={loading} />
        </div>
      </div>

      {error && (
        <Card className="border-destructive/40"><CardContent className="py-3 text-destructive text-sm">{error}</CardContent></Card>
      )}

      {!summary && !error && (
        <Card className="border-dashed"><CardContent className="py-10 text-center text-muted-foreground text-sm">
          <UploadIcon className="size-8 mx-auto mb-3 opacity-50" aria-hidden="true" />
          Sube el reporte "finanzas / pagos detalle por acción" para empezar. Opcional: "tratamientos / acciones realizadas" para ver el margen.
        </CardContent></Card>
      )}

      {revenueButZero && (
        <Card className="border-warn/40"><CardContent className="py-3 text-warn text-sm">
          El ingreso del periodo salió en $0. Probablemente no reconocí la columna de monto del reporte —
          confirma que subiste "finanzas / pagos detalle por acción".
        </CardContent></Card>
      )}

      {summary && (
        <>
          <div className="flex items-center gap-2 flex-wrap" role="group" aria-label="Rango de fechas">
            {(["all", "30", "90", "custom"] as Preset[]).map((p) => (
              <Button
                key={p}
                size="sm"
                variant={preset === p ? "default" : "outline"}
                aria-pressed={preset === p}
                aria-label={p === "all" ? "Todo el periodo" : p === "custom" ? "Rango personalizado" : `Últimos ${p} días`}
                onClick={() => setPreset(p)}
              >
                {p === "all" ? "Todo" : p === "custom" ? "Personalizado" : `${p}d`}
              </Button>
            ))}
            {preset === "custom" && (
              <span className="flex items-center gap-1">
                <Input type="date" aria-label="Desde" className="h-8 w-36" min={bounds?.min} max={to || bounds?.max} value={from} onChange={(e) => setFrom(e.target.value)} />
                <span className="text-muted-foreground text-sm">→</span>
                <Input type="date" aria-label="Hasta" className="h-8 w-36" min={from || bounds?.min} max={bounds?.max} value={to} onChange={(e) => setTo(e.target.value)} />
              </span>
            )}
            {bounds && <Badge variant="secondary">datos: {bounds.min} → {bounds.max}</Badge>}
          </div>

          {customInvalid && (
            <p className="text-warn text-xs -mt-1">Elige fecha de inicio y fin (inicio ≤ fin). Mientras tanto se muestra todo el periodo.</p>
          )}

          <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Metric label="Ingreso cobrado" value={moneyFull(summary.totals.revenue)} />
            <Metric label="De marketing" value={moneyFull(summary.marketing.revenue)} hint={`${summary.marketing.patients} pacientes · ${pct(summary.totals.revenue ? (summary.marketing.revenue / summary.totals.revenue) * 100 : 0)}`} accent />
            <Metric label="No-marketing" value={moneyFull(summary.nonMarketing.revenue)} hint={`${summary.nonMarketing.patients} pacientes`} />
            <Metric label={totalMargin !== null ? "Margen de contribución" : "Inversión"} value={totalMargin !== null ? moneyFull(totalMargin) : moneyFull(totalSpend)} hint={totalMargin !== null ? `${pct(marginRevenue ? (totalMargin / marginRevenue) * 100 : 0)} sobre lo realizado` : "Windsor"} />
          </section>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">De dónde viene el dinero (por canal)</CardTitle></CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <caption className="sr-only">Ingreso, inversión, ROAS y CAC por canal de origen del paciente.</caption>
                  <thead><tr className="text-muted-foreground text-xs border-b">
                    <th scope="col" className="text-left font-medium py-2 pr-2">Canal</th>
                    <th scope="col" className="text-right font-medium py-2 px-2"><abbr title="Pacientes">Pac.</abbr></th>
                    <th scope="col" className="text-right font-medium py-2 px-2">Ingreso</th>
                    <th scope="col" className="text-right font-medium py-2 px-2 hidden sm:table-cell">Inversión</th>
                    <th scope="col" className="text-right font-medium py-2 px-2">ROAS</th>
                    <th scope="col" className="text-right font-medium py-2 pl-2 hidden md:table-cell"><abbr title="Costo por paciente que pagó">CAC</abbr></th>
                  </tr></thead>
                  <tbody>
                    {summary.byChannel.map((c) => {
                      const spend = c.isMarketing ? spendByChannel.get(c.channel) ?? 0 : 0;
                      const roas = spend > 0 ? c.revenue / spend : null;
                      const cac = spend > 0 && c.payingPatients > 0 ? spend / c.payingPatients : null;
                      return (
                        <tr key={c.channel} className="border-b last:border-0">
                          <td className="py-2 pr-2 font-medium">{c.label}{!c.isMarketing && <span className="text-muted-foreground text-xs"> · sin marketing</span>}</td>
                          <td className="py-2 px-2 text-right tabular-nums">{c.patients}</td>
                          <td className="py-2 px-2 text-right tabular-nums">{money(c.revenue)}</td>
                          <td className="py-2 px-2 text-right tabular-nums text-muted-foreground hidden sm:table-cell">{spend > 0 ? money(spend) : "—"}</td>
                          <td className="py-2 px-2 text-right tabular-nums font-medium">{roas !== null ? `${roas.toFixed(1)}x` : "—"}</td>
                          <td className="py-2 pl-2 text-right tabular-nums text-muted-foreground hidden md:table-cell">{cac !== null ? moneyFull(cac) : "—"}</td>
                        </tr>
                      );
                    })}
                    {orphanSpend.map(([ch, spend]) => (
                      <tr key={`spend-${ch}`} className="border-b last:border-0 text-muted-foreground">
                        <td className="py-2 pr-2">{CHANNEL_LABELS[ch]}<span className="text-xs"> · gasto sin pacientes</span></td>
                        <td className="py-2 px-2 text-right tabular-nums">0</td>
                        <td className="py-2 px-2 text-right tabular-nums">—</td>
                        <td className="py-2 px-2 text-right tabular-nums hidden sm:table-cell">{money(spend)}</td>
                        <td className="py-2 px-2 text-right tabular-nums">0.0x</td>
                        <td className="py-2 pl-2 text-right tabular-nums hidden md:table-cell">—</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-muted-foreground text-xs mt-2">
                {windsorState === "error"
                  ? "No se pudo leer el gasto de Windsor (revisa el secret/credenciales): el ROAS/CAC quedan vacíos por falta de dato, no por falta de inversión."
                  : windsorState === "loading"
                    ? "Cargando inversión de Windsor…"
                    : `Inversión = gasto de Windsor${windsorRange ? ` (${windsorRange.from} → ${windsorRange.to})` : ""}. "Google" mezcla Ads + búsqueda orgánica (ROAS = techo).`}
              </p>
            </CardContent>
          </Card>

          <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">Qué deja más dinero (tratamientos)</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {summary.byTreatment.slice(0, 7).map((t) => {
                  const max = summary.byTreatment[0]?.revenue || 1;
                  const m = margins?.find((x) => x.category === t.category);
                  return (
                    <div key={t.category}>
                      <div className="flex justify-between text-sm mb-0.5">
                        <span className="truncate">{t.category}{m ? <span className="text-muted-foreground text-xs"> · margen {pct(m.marginPct)}</span> : null}</span>
                        <span className="font-medium tabular-nums">{money(t.revenue)}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-muted overflow-hidden" aria-hidden="true"><div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(3, (t.revenue / max) * 100)}%` }} /></div>
                    </div>
                  );
                })}
                {!margins && <p className="text-muted-foreground text-xs pt-1">Sube "acciones realizadas" para ver el margen por tratamiento.</p>}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">Qué vende cada canal</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {summary.treatmentByChannel.slice(0, 5).map((c) => (
                  <div key={c.channel}>
                    <p className="text-sm font-medium mb-1">{c.label}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {c.top.map((t) => (
                        <span key={t.category} className="text-xs px-2 py-0.5 rounded-md bg-muted text-muted-foreground">
                          {t.category} · {money(t.revenue)}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </section>

          {(cartera || pipeline) && (
            <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {cartera && <CarteraCard cartera={cartera} />}
              {pipeline && <PipelineCard pipeline={pipeline} />}
            </section>
          )}

          {kpis && projection && summary && (
            <Calculadora
              kpis={kpis}
              projection={projection}
              marketingRevenue={summary.marketing.revenue}
              priorMarketingRevenue={priorSummary ? priorSummary.marketing.revenue : null}
              payingPatients={mktPaying}
              avgTicket={avgTicket}
              windsorState={windsorState}
              hasRealMargin={totalMargin !== null}
              marginInput={marginInput}
              setMarginInput={handleMarginChange}
              repurchase={repurchase}
              setRepurchase={setRepurchase}
              projMode={projMode}
              setProjMode={setProjMode}
              scalePct={scalePct}
              setScalePct={setScalePct}
              goalRevenue={goalRevenue}
              setGoalRevenue={setGoalRevenue}
            />
          )}
        </>
      )}
    </div>
  );
}

function UploadButton({ label, onFile, loading, primary }: { label: string; onFile: (f: File) => void; loading: boolean; primary?: boolean }) {
  const id = `up-${label.replace(/[^a-zA-Z0-9]/g, "")}`;
  return (
    <label htmlFor={id}>
      <input id={id} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ""; }} />
      <Button asChild variant={primary ? "default" : "outline"} disabled={loading} size="sm">
        <span className="cursor-pointer">{loading ? <RefreshCwIcon className="animate-spin" aria-hidden="true" /> : <UploadIcon aria-hidden="true" />}{label}</span>
      </Button>
    </label>
  );
}

function Metric({ label, value, hint, accent }: { label: string; value: string; hint?: string; accent?: boolean }) {
  return (
    <div className="rounded-lg bg-muted/40 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-xl font-semibold mt-1 ${accent ? "text-primary" : ""}`}>{value}</p>
      {hint ? <p className="text-xs text-muted-foreground mt-0.5">{hint}</p> : null}
    </div>
  );
}

function roasText(v: number | null): string {
  return v === null ? "—" : `${v.toFixed(1)}x`;
}

function CarteraCard({ cartera }: { cartera: CarteraSummary }) {
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-base">Cartera (revenue ya vendido, pendiente de cobro)</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Metric label="Saldo pendiente" value={moneyFull(cartera.saldoPendiente)} accent />
          <Metric label="Cobrado" value={pct(cartera.cobradoPct)} hint={`${moneyFull(cartera.totalAbonado)} de ${moneyFull(cartera.totalPresupuestado)}`} />
        </div>
        <div className="text-sm text-muted-foreground space-y-1">
          <div className="flex justify-between"><span>Planes con saldo</span><span className="tabular-nums text-foreground">{cartera.planesConSaldo} · {cartera.pacientesConSaldo} pacientes</span></div>
          <div className="flex justify-between"><span>Con próxima cita agendada</span><span className="tabular-nums text-foreground">{moneyFull(cartera.saldoConCitaAgendada)}</span></div>
          <div className="flex justify-between"><span>Sin cita (a reactivar)</span><span className="tabular-nums text-warn">{moneyFull(cartera.saldoSinCita)}</span></div>
        </div>
        <p className="text-muted-foreground text-xs">Foto actual de todos los planes (no filtra por fecha). El saldo sin cita es la oportunidad de recuperación.</p>
      </CardContent>
    </Card>
  );
}

function PipelineCard({ pipeline }: { pipeline: PipelineSummary }) {
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-base">Pipeline — presupuestos creados</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Metric label="Presupuestado" value={moneyFull(pipeline.montoPresupuestado)} hint={`${pipeline.count} presupuestos`} />
          <Metric label="Tasa de inicio" value={pct(pipeline.tasaInicio)} hint={`${pipeline.iniciados} arrancaron · cobro ${pct(pipeline.tasaCobro)}`} accent />
        </div>
        <div className="space-y-1.5">
          {pipeline.byChannel.filter((c) => c.isMarketing).slice(0, 5).map((c) => (
            <div key={c.channel} className="flex justify-between text-sm">
              <span className="truncate">{c.label} · {c.presupuestos}</span>
              <span className="font-medium tabular-nums">{money(c.montoPresupuestado)}</span>
            </div>
          ))}
        </div>
        <p className="text-muted-foreground text-xs">Presupuestos capturados en el rango (por fecha de captura). "Tasa de inicio" = cuántos arrancaron tratamiento.</p>
      </CardContent>
    </Card>
  );
}

function Delta({ cur, prev }: { cur: number; prev: number | null }) {
  if (prev === null || prev === 0) return null;
  const d = ((cur - prev) / prev) * 100;
  const up = d >= 0;
  return <span className={up ? "text-success" : "text-destructive"}>{up ? "▲" : "▼"} {pct(Math.abs(d))}</span>;
}

function Calculadora(props: {
  kpis: Kpis;
  projection: ProjectionResult;
  marketingRevenue: number;
  priorMarketingRevenue: number | null;
  payingPatients: number;
  avgTicket: number;
  windsorState: "idle" | "loading" | "ready" | "error";
  hasRealMargin: boolean;
  marginInput: number;
  setMarginInput: (v: number) => void;
  repurchase: number;
  setRepurchase: (v: number) => void;
  projMode: ProjectionMode;
  setProjMode: (m: ProjectionMode) => void;
  scalePct: number;
  setScalePct: (v: number) => void;
  goalRevenue: number;
  setGoalRevenue: (v: number) => void;
}) {
  const { kpis, projection } = props;
  const noSpend = props.windsorState !== "ready";
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-base">Calculadora — dónde estoy, de dónde vengo, hacia dónde voy</CardTitle></CardHeader>
      <CardContent className="space-y-5">
        {noSpend && (
          <p className="text-warn text-xs">Sin gasto de Windsor cargado en este rango, el ROAS/ROI/CAC no se pueden calcular. Revisa el secret o el periodo.</p>
        )}

        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Dónde estoy</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Metric label="ROAS marketing" value={roasText(kpis.roas)} accent />
            <Metric label="ROI (con margen)" value={kpis.roiPct === null ? "—" : pct(kpis.roiPct)} />
            <Metric label="CAC" value={kpis.cac === null ? "—" : moneyFull(kpis.cac)} hint={`${props.payingPatients} pagaron`} />
            <Metric label="Ticket promedio" value={moneyFull(props.avgTicket)} />
            <Metric label="LTV" value={moneyFull(kpis.ltv)} hint="ticket × recompra × margen" />
            <Metric label="LTV / CAC" value={kpis.ltvCac === null ? "—" : `${kpis.ltvCac.toFixed(1)}x`} hint=">3x es sano" />
          </div>
        </div>

        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">De dónde vengo (vs periodo anterior)</p>
          {props.priorMarketingRevenue !== null ? (
            <div className="flex items-baseline gap-3 text-sm flex-wrap">
              <span>Revenue marketing: <span className="font-medium">{moneyFull(props.marketingRevenue)}</span></span>
              <Delta cur={props.marketingRevenue} prev={props.priorMarketingRevenue} />
              <span className="text-muted-foreground">(antes {moneyFull(props.priorMarketingRevenue)})</span>
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">Elige un rango de 30d, 90d o personalizado para comparar contra el periodo anterior.</p>
          )}
        </div>

        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Hacia dónde voy</p>
          <div className="flex items-center gap-2 flex-wrap mb-3">
            {([["runrate", "Si no cambio nada"], ["scale", "Escalar gasto"], ["goal", "Meta de ingreso"]] as Array<[ProjectionMode, string]>).map(([m, lbl]) => (
              <Button key={m} size="sm" variant={props.projMode === m ? "default" : "outline"} aria-pressed={props.projMode === m} onClick={() => props.setProjMode(m)}>{lbl}</Button>
            ))}
          </div>

          {props.projMode === "scale" && (
            <div className="flex items-center gap-3 mb-3">
              <label className="text-sm text-muted-foreground" htmlFor="scale">Cambio de gasto</label>
              <input id="scale" type="range" min={-50} max={200} step={10} value={props.scalePct} onChange={(e) => props.setScalePct(Number(e.target.value))} className="flex-1" />
              <span className="text-sm font-medium w-12 text-right">{props.scalePct >= 0 ? "+" : ""}{props.scalePct}%</span>
            </div>
          )}
          {props.projMode === "goal" && (
            <div className="flex items-center gap-2 mb-3">
              <label className="text-sm text-muted-foreground" htmlFor="goal">Meta de ingreso marketing</label>
              <Input id="goal" type="number" className="h-8 w-40" value={props.goalRevenue || ""} onChange={(e) => props.setGoalRevenue(Number(e.target.value) || 0)} />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Metric label="Inversión" value={moneyFull(projection.projectedSpend)} accent={props.projMode === "goal"} />
            <Metric label="Revenue proyectado" value={moneyFull(projection.projectedRevenue)} hint={`rango ${money(projection.low)}–${money(projection.high)}`} accent={props.projMode !== "goal"} />
            <Metric label="Pacientes" value={String(Math.round(projection.projectedPatients))} />
          </div>
          <p className="text-muted-foreground text-xs mt-2">{projection.assumptions}</p>
        </div>

        <div className="border-t pt-3 grid grid-cols-2 gap-3 sm:grid-cols-2">
          <div className="flex items-center gap-2">
            <label className="text-sm text-muted-foreground" htmlFor="margin">Margen %</label>
            <Input id="margin" type="number" min={0} max={100} step={1} className="h-8 w-20" value={props.marginInput} onChange={(e) => props.setMarginInput(Math.min(100, Math.max(0, Number(e.target.value) || 0)))} />
            <span className="text-xs text-muted-foreground">{props.hasRealMargin ? "real (acciones)" : "estimado"}</span>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm text-muted-foreground" htmlFor="recompra">Recompra (LTV)</label>
            <Input id="recompra" type="number" min={1} max={10} step={0.1} className="h-8 w-20" value={props.repurchase} onChange={(e) => props.setRepurchase(Math.min(10, Math.max(1, Number(e.target.value) || 1)))} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
