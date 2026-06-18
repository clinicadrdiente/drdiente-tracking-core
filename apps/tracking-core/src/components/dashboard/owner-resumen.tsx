"use client";

import { useEffect, useMemo, useState } from "react";
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
import { windsorSourceToChannel, type MarketingChannel } from "@/modules/reports/marketing-channels";

interface WindsorSource {
  source: string;
  spend?: number;
}
interface WindsorSummary {
  configured?: boolean;
  bySource?: WindsorSource[];
  totals?: { spend?: number };
}

function money(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (Math.abs(value) >= 1_000) return `$${Math.round(value / 1_000)}k`;
  return `$${Math.round(value)}`;
}
function moneyFull(value: number): string {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }).format(value);
}
function pct(value: number): string {
  return `${Math.round(value)}%`;
}

function parseCsv(text: string): Record<string, unknown>[] {
  const rows: string[][] = [];
  let field = "", row: string[] = [], inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i += 1; } else inQuotes = false; }
      else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") { row.push(field); field = ""; }
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
  if (file.name.toLowerCase().endsWith(".csv")) return parseCsv(await file.text());
  const specifier = "https://esm.sh/xlsx@0.18.5";
  const XLSX = await import(/* @vite-ignore */ specifier);
  const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
  return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: null });
}

type Preset = "all" | "30" | "90" | "custom";

export function OwnerResumen({ secret }: { secret: string }) {
  const [pagos, setPagos] = useState<PagoDetalleRecord[] | null>(null);
  const [acciones, setAcciones] = useState<AccionRecord[] | null>(null);
  const [names, setNames] = useState<{ pagos?: string; acciones?: string }>({});
  const [bounds, setBounds] = useState<{ min: string; max: string } | null>(null);
  const [preset, setPreset] = useState<Preset>("all");
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");
  const [spendByChannel, setSpendByChannel] = useState<Map<MarketingChannel, number>>(new Map());
  const [totalSpend, setTotalSpend] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const range = useMemo(() => {
    if (preset === "all") return {};
    if (preset === "custom") return { from: from || undefined, to: to || undefined };
    if (!bounds) return {};
    const days = Number(preset);
    const end = new Date(`${bounds.max}T00:00:00`);
    const start = new Date(end.getTime() - days * 86400000);
    return { from: start.toISOString().slice(0, 10), to: bounds.max };
  }, [preset, from, to, bounds]);

  const summary = useMemo(() => (pagos ? buildFinancialSummary(pagos, range) : null), [pagos, range]);
  const margins = useMemo(() => (acciones ? buildTreatmentMargin(acciones, range) : null), [acciones, range]);
  const totalMargin = margins?.reduce((s, m) => s + m.margin, 0) ?? null;
  const marginRevenue = margins?.reduce((s, m) => s + m.revenue, 0) ?? 0;

  async function loadWindsor() {
    if (!secret.trim() || !range.from || !range.to) return;
    try {
      const res = await fetch(`/api/dev/windsor-marketing-summary?from=${range.from}&to=${range.to}`, {
        headers: { "x-tracking-secret": secret.trim() },
      });
      const body = (await res.json()) as WindsorSummary;
      if (body.configured === false) return;
      const map = new Map<MarketingChannel, number>();
      for (const s of body.bySource ?? []) {
        const ch = windsorSourceToChannel(s.source);
        map.set(ch, (map.get(ch) ?? 0) + (s.spend ?? 0));
      }
      setSpendByChannel(map);
      setTotalSpend(body.totals?.spend ?? 0);
    } catch {
      /* spend opcional */
    }
  }

  useEffect(() => {
    void loadWindsor();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range.from, range.to, secret]);

  async function handleFile(file: File, kind: "pagos" | "acciones") {
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
      } else {
        setAcciones(parseAccionesRealizadas(rows));
        setNames((n) => ({ ...n, acciones: file.name }));
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
        <div className="flex items-center gap-2">
          <UploadButton label={names.pagos ? "Pagos ✓" : "Subir pagos"} onFile={(f) => handleFile(f, "pagos")} loading={loading} primary />
          <UploadButton label={names.acciones ? "Acciones ✓" : "Subir acciones"} onFile={(f) => handleFile(f, "acciones")} loading={loading} />
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

      {summary && (
        <>
          <div className="flex items-center gap-2 flex-wrap">
            {(["all", "30", "90", "custom"] as Preset[]).map((p) => (
              <Button key={p} size="sm" variant={preset === p ? "default" : "outline"} onClick={() => setPreset(p)}>
                {p === "all" ? "Todo" : p === "custom" ? "Personalizado" : `${p}d`}
              </Button>
            ))}
            {preset === "custom" && (
              <span className="flex items-center gap-1">
                <Input type="date" className="h-8 w-36" min={bounds?.min} max={bounds?.max} value={from} onChange={(e) => setFrom(e.target.value)} />
                <span className="text-muted-foreground text-sm">→</span>
                <Input type="date" className="h-8 w-36" min={bounds?.min} max={bounds?.max} value={to} onChange={(e) => setTo(e.target.value)} />
              </span>
            )}
            {bounds && <Badge variant="secondary">datos: {bounds.min} → {bounds.max}</Badge>}
          </div>

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
                  <thead><tr className="text-muted-foreground text-xs border-b">
                    <th className="text-left font-medium py-2 pr-2">Canal</th>
                    <th className="text-right font-medium py-2 px-2">Pac.</th>
                    <th className="text-right font-medium py-2 px-2">Ingreso</th>
                    <th className="text-right font-medium py-2 px-2 hidden sm:table-cell">Inversión</th>
                    <th className="text-right font-medium py-2 px-2">ROAS</th>
                    <th className="text-right font-medium py-2 pl-2 hidden md:table-cell">CAC</th>
                  </tr></thead>
                  <tbody>
                    {summary.byChannel.map((c) => {
                      const spend = c.isMarketing ? spendByChannel.get(c.channel) ?? 0 : 0;
                      const roas = spend > 0 ? c.revenue / spend : null;
                      const cac = spend > 0 && c.payingPatients > 0 ? spend / c.payingPatients : null;
                      return (
                        <tr key={c.channel} className="border-b last:border-0">
                          <td className="py-2 pr-2 font-medium">{c.label}{!c.isMarketing && <span className="text-muted-foreground text-xs"> · no-mkt</span>}</td>
                          <td className="py-2 px-2 text-right tabular-nums">{c.patients}</td>
                          <td className="py-2 px-2 text-right tabular-nums">{money(c.revenue)}</td>
                          <td className="py-2 px-2 text-right tabular-nums text-muted-foreground hidden sm:table-cell">{spend > 0 ? money(spend) : "—"}</td>
                          <td className="py-2 px-2 text-right tabular-nums font-medium">{roas !== null ? `${roas.toFixed(1)}x` : "—"}</td>
                          <td className="py-2 pl-2 text-right tabular-nums text-muted-foreground hidden md:table-cell">{cac !== null ? money(cac) : "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="text-muted-foreground text-xs mt-2">Inversión = gasto de Windsor en el mismo rango. "Google" mezcla Ads + búsqueda orgánica (ROAS = techo).</p>
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
                      <div className="h-1.5 rounded-full bg-muted overflow-hidden"><div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(3, (t.revenue / max) * 100)}%` }} /></div>
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
        </>
      )}
    </div>
  );
}

function UploadButton({ label, onFile, loading, primary }: { label: string; onFile: (f: File) => void; loading: boolean; primary?: boolean }) {
  const id = `up-${label.replace(/\s+/g, "")}`;
  return (
    <label htmlFor={id}>
      <input id={id} type="file" accept=".xlsx,.csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ""; }} />
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
