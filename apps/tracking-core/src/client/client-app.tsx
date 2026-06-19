import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type {
  ClientChannelRow,
  ClientSummarySnapshot,
} from "@/modules/reports/client-snapshot";
import type { NamedCount, WebAnalytics } from "@/modules/analytics/ga4";
import type { SearchTrafficSummary } from "@/modules/analytics/search-traffic";

// Formato MXN (es-MX) — la clínica factura en pesos.
function moneyFull(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  }).format(value);
}
function moneyShort(value: number): string {
  if (!Number.isFinite(value)) return "—";
  if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (Math.abs(value) >= 1_000) return `$${(value / 1_000).toFixed(1)}k`;
  return `$${Math.round(value)}`;
}
function pct(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return `${Math.round(value)}%`;
}
function roasText(value: number | null): string {
  return value === null ? "—" : `${value.toFixed(1)}x`;
}
function intFmt(value: number): string {
  return new Intl.NumberFormat("es-MX", { maximumFractionDigits: 0 }).format(value);
}

type Tab = "resumen" | "web";

export function ClientApp() {
  const [tab, setTab] = useState<Tab>("resumen");
  return (
    <div className="mx-auto max-w-5xl px-4 py-6 flex flex-col gap-5">
      <header className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-2xl font-semibold tracking-tight">DrDiente</h1>
        <div className="flex gap-2" role="tablist" aria-label="Secciones">
          <Button size="sm" variant={tab === "resumen" ? "default" : "outline"} aria-pressed={tab === "resumen"} onClick={() => setTab("resumen")}>
            Resumen
          </Button>
          <Button size="sm" variant={tab === "web" ? "default" : "outline"} aria-pressed={tab === "web"} onClick={() => setTab("web")}>
            Tráfico web
          </Button>
        </div>
      </header>

      {tab === "resumen" ? <ResumenView /> : <WebTrafficView />}
    </div>
  );
}

function Centered({ children }: { children: ReactNode }) {
  return (
    <div className="py-16 text-center text-muted-foreground text-sm">{children}</div>
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

/* ============================ TAB 1: RESUMEN ============================ */

type LoadState = "loading" | "ready" | "error";

function ResumenView() {
  const [state, setState] = useState<LoadState>("loading");
  const [snapshot, setSnapshot] = useState<ClientSummarySnapshot | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/client/summary");
        const body = (await res.json()) as { snapshot?: ClientSummarySnapshot | null };
        if (cancelled) return;
        setSnapshot(body.snapshot ?? null);
        setState("ready");
      } catch {
        if (!cancelled) setState("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (state === "loading") return <Centered>Cargando…</Centered>;
  if (state === "error") return <Centered>No se pudo cargar el resumen. Intenta recargar la página.</Centered>;

  if (!snapshot) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-10 text-center text-muted-foreground text-sm">
          Aún no hay un reporte publicado. Tu equipo de marketing lo publicará en breve.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {snapshot.bounds && (
        <p className="text-muted-foreground text-sm -mt-2">
          Periodo {snapshot.bounds.min} → {snapshot.bounds.max}
          {snapshot.generatedAt ? ` · actualizado ${snapshot.generatedAt.slice(0, 10)}` : ""}
        </p>
      )}
      <HeroSection snapshot={snapshot} />
      <InvestmentByChannel snapshot={snapshot} />
      <AdResultsByChannel snapshot={snapshot} />
      <PatientResultsByChannel snapshot={snapshot} />
      {(snapshot.cartera || snapshot.pipeline) && <CarteraPipeline snapshot={snapshot} />}
      {snapshot.months.length > 1 && <MonthlyTable snapshot={snapshot} />}
      <Recommendations snapshot={snapshot} />
    </div>
  );
}

function HeroSection({ snapshot }: { snapshot: ClientSummarySnapshot }) {
  const { totals, kpis } = snapshot;
  return (
    <section className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric label="Facturado" value={moneyFull(totals.revenue)} hint="ingreso cobrado" />
        <Metric label="Invertido" value={moneyFull(totals.spend)} hint="gasto en anuncios" accent />
        <Metric label="De marketing" value={moneyFull(totals.marketingRevenue)} hint={`${pct(totals.revenue ? (totals.marketingRevenue / totals.revenue) * 100 : 0)} del total`} />
        <Metric label="Ganancia neta (con margen)" value={kpis.roiPct === null ? "—" : pct(kpis.roiPct)} hint="ROI sobre inversión" />
      </div>
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Tus números clave</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <Metric label="ROAS" value={roasText(kpis.roas)} hint="ingreso ÷ inversión" accent />
            <Metric label="ROI" value={kpis.roiPct === null ? "—" : pct(kpis.roiPct)} hint="retorno con margen" />
            <Metric label="AOV" value={moneyFull(kpis.aov)} hint="ticket promedio" />
            <Metric label="CAC" value={moneyFull(kpis.cac)} hint={`${intFmt(kpis.payingPatients)} pagaron`} />
            <Metric label="LTV" value={moneyFull(kpis.ltv)} hint={kpis.ltvCac === null ? "valor de vida" : `LTV/CAC ${kpis.ltvCac.toFixed(1)}x`} />
          </div>
        </CardContent>
      </Card>
    </section>
  );
}

function InvestmentByChannel({ snapshot }: { snapshot: ClientSummarySnapshot }) {
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-base">¿En qué se invirtió y qué devolvió? (por canal)</CardTitle></CardHeader>
      <CardContent>
        <ChannelTable channels={snapshot.channels} columns={["inversion", "ingreso", "roas", "cac"]} />
        <p className="text-muted-foreground text-xs mt-2">
          Inversión = gasto de anuncios del periodo. ROAS = ingreso ÷ inversión. CAC = costo por paciente que pagó.
        </p>
      </CardContent>
    </Card>
  );
}

function AdResultsByChannel({ snapshot }: { snapshot: ClientSummarySnapshot }) {
  const withSpend = snapshot.channels.filter((c) => c.spend > 0);
  if (withSpend.length === 0) return null;
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-base">Resultados de los anuncios</CardTitle></CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-muted-foreground text-xs border-b">
              <th scope="col" className="text-left font-medium py-2 pr-2">Canal</th>
              <th scope="col" className="text-right font-medium py-2 px-2">Inversión</th>
              <th scope="col" className="text-right font-medium py-2 px-2 hidden sm:table-cell">Impresiones</th>
              <th scope="col" className="text-right font-medium py-2 px-2">Clics</th>
              <th scope="col" className="text-right font-medium py-2 px-2 hidden md:table-cell">CTR</th>
              <th scope="col" className="text-right font-medium py-2 pl-2">CPC</th>
            </tr></thead>
            <tbody>
              {withSpend.map((c) => (
                <tr key={c.channel} className="border-b last:border-0">
                  <td className="py-2 pr-2 font-medium">{c.label}</td>
                  <td className="py-2 px-2 text-right tabular-nums">{moneyShort(c.spend)}</td>
                  <td className="py-2 px-2 text-right tabular-nums text-muted-foreground hidden sm:table-cell">{c.impressions > 0 ? intFmt(c.impressions) : "—"}</td>
                  <td className="py-2 px-2 text-right tabular-nums">{c.clicks > 0 ? intFmt(c.clicks) : "—"}</td>
                  <td className="py-2 px-2 text-right tabular-nums text-muted-foreground hidden md:table-cell">{c.ctr === null ? "—" : `${(c.ctr * 100).toFixed(1)}%`}</td>
                  <td className="py-2 pl-2 text-right tabular-nums">{c.cpc === null ? "—" : moneyFull(c.cpc)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function PatientResultsByChannel({ snapshot }: { snapshot: ClientSummarySnapshot }) {
  return (
    <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Pacientes que pagaron (por canal)</CardTitle></CardHeader>
        <CardContent>
          <ChannelTable channels={snapshot.channels} columns={["pacientes", "ingreso"]} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Qué deja más dinero (tratamientos)</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {snapshot.treatments.slice(0, 7).map((t) => {
            const max = snapshot.treatments[0]?.revenue || 1;
            return (
              <div key={t.category}>
                <div className="flex justify-between text-sm mb-0.5">
                  <span className="truncate">
                    {t.category}
                    {t.marginPct !== null ? <span className="text-muted-foreground text-xs"> · margen {pct(t.marginPct)}</span> : null}
                  </span>
                  <span className="font-medium tabular-nums">{moneyShort(t.revenue)}</span>
                </div>
                <div className="h-1.5 rounded-full bg-muted overflow-hidden" aria-hidden="true">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(3, (t.revenue / max) * 100)}%` }} />
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </section>
  );
}

function ChannelTable({ channels, columns }: { channels: ClientChannelRow[]; columns: Array<"inversion" | "ingreso" | "roas" | "cac" | "pacientes"> }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead><tr className="text-muted-foreground text-xs border-b">
          <th scope="col" className="text-left font-medium py-2 pr-2">Canal</th>
          {columns.includes("pacientes") && <th scope="col" className="text-right font-medium py-2 px-2">Pac.</th>}
          {columns.includes("inversion") && <th scope="col" className="text-right font-medium py-2 px-2">Inversión</th>}
          {columns.includes("ingreso") && <th scope="col" className="text-right font-medium py-2 px-2">Ingreso</th>}
          {columns.includes("roas") && <th scope="col" className="text-right font-medium py-2 px-2">ROAS</th>}
          {columns.includes("cac") && <th scope="col" className="text-right font-medium py-2 pl-2">CAC</th>}
        </tr></thead>
        <tbody>
          {channels.map((c) => (
            <tr key={c.channel} className="border-b last:border-0">
              <td className="py-2 pr-2 font-medium">
                {c.label}
                {!c.isMarketing && <span className="text-muted-foreground text-xs"> · sin marketing</span>}
              </td>
              {columns.includes("pacientes") && <td className="py-2 px-2 text-right tabular-nums">{intFmt(c.payingPatients)}</td>}
              {columns.includes("inversion") && <td className="py-2 px-2 text-right tabular-nums text-muted-foreground">{c.spend > 0 ? moneyShort(c.spend) : "—"}</td>}
              {columns.includes("ingreso") && <td className="py-2 px-2 text-right tabular-nums">{moneyShort(c.revenue)}</td>}
              {columns.includes("roas") && <td className="py-2 px-2 text-right tabular-nums font-medium">{roasText(c.roas)}</td>}
              {columns.includes("cac") && <td className="py-2 pl-2 text-right tabular-nums text-muted-foreground">{c.cac === null ? "—" : moneyFull(c.cac)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CarteraPipeline({ snapshot }: { snapshot: ClientSummarySnapshot }) {
  const { cartera, pipeline } = snapshot;
  return (
    <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {cartera && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Cartera (vendido, pendiente de cobro)</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Metric label="Saldo pendiente" value={moneyFull(cartera.saldoPendiente)} accent />
              <Metric label="Cobrado" value={pct(cartera.cobradoPct)} hint={`${moneyFull(cartera.totalAbonado)} de ${moneyFull(cartera.totalPresupuestado)}`} />
            </div>
            <div className="text-sm text-muted-foreground space-y-1">
              <div className="flex justify-between"><span>Con próxima cita</span><span className="tabular-nums text-foreground">{moneyFull(cartera.saldoConCitaAgendada)}</span></div>
              <div className="flex justify-between"><span>Sin cita (a reactivar)</span><span className="tabular-nums text-warn">{moneyFull(cartera.saldoSinCita)}</span></div>
            </div>
          </CardContent>
        </Card>
      )}
      {pipeline && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Pipeline — presupuestos creados</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Metric label="Presupuestado" value={moneyFull(pipeline.montoPresupuestado)} hint={`${intFmt(pipeline.count)} presupuestos`} />
              <Metric label="Tasa de inicio" value={pct(pipeline.tasaInicio)} hint={`${intFmt(pipeline.iniciados)} arrancaron`} accent />
            </div>
          </CardContent>
        </Card>
      )}
    </section>
  );
}

function MonthlyTable({ snapshot }: { snapshot: ClientSummarySnapshot }) {
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-base">Mes a mes</CardTitle></CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-muted-foreground text-xs border-b">
              <th scope="col" className="text-left font-medium py-2 pr-2">Mes</th>
              <th scope="col" className="text-right font-medium py-2 px-2">Ingreso</th>
              <th scope="col" className="text-right font-medium py-2 px-2 hidden sm:table-cell">Inversión</th>
              <th scope="col" className="text-right font-medium py-2 px-2">ROAS</th>
              <th scope="col" className="text-right font-medium py-2 pl-2 hidden md:table-cell">Pac.</th>
            </tr></thead>
            <tbody>
              {snapshot.months.map((m) => (
                <tr key={m.key} className="border-b last:border-0">
                  <td className="py-2 pr-2 font-medium">{m.label}</td>
                  <td className="py-2 px-2 text-right tabular-nums">{moneyShort(m.ingreso)}</td>
                  <td className="py-2 px-2 text-right tabular-nums text-muted-foreground hidden sm:table-cell">{m.spend > 0 ? moneyShort(m.spend) : "—"}</td>
                  <td className="py-2 px-2 text-right tabular-nums font-medium">{roasText(m.roas)}</td>
                  <td className="py-2 pl-2 text-right tabular-nums text-muted-foreground hidden md:table-cell">{intFmt(m.pacientes)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

const SEVERITY_STYLE: Record<string, string> = {
  alta: "border-l-destructive",
  media: "border-l-warn",
  oportunidad: "border-l-success",
};
const SEVERITY_LABEL: Record<string, string> = {
  alta: "Prioridad alta",
  media: "A mejorar",
  oportunidad: "Oportunidad",
};

function Recommendations({ snapshot }: { snapshot: ClientSummarySnapshot }) {
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-base">Qué se puede hacer para mejorar</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        {snapshot.recommendations.length === 0 ? (
          <p className="text-muted-foreground text-sm">Sin alertas: los números están sanos en este periodo.</p>
        ) : (
          snapshot.recommendations.map((r) => (
            <div key={r.id} className={`border-l-2 ${SEVERITY_STYLE[r.severity] ?? "border-l-muted"} pl-3 py-1`}>
              <p className="text-sm font-medium">
                {r.title}
                <span className="text-muted-foreground text-xs font-normal"> · {SEVERITY_LABEL[r.severity] ?? r.severity}</span>
              </p>
              <p className="text-muted-foreground text-sm">{r.detail}</p>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

/* ========================== TAB 2: TRÁFICO WEB ========================== */

interface WebResponse {
  source?: "ga4" | "search_console" | null;
  analytics?: WebAnalytics | null;
  search?: SearchTrafficSummary | null;
  reason?: string;
  rangeDays?: number;
}

function WebTrafficView() {
  const [state, setState] = useState<LoadState>("loading");
  const [res, setRes] = useState<WebResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch("/api/client/web-analytics");
        const body = (await r.json()) as WebResponse;
        if (cancelled) return;
        setRes(body);
        setState("ready");
      } catch {
        if (!cancelled) setState("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (state === "loading") return <Centered>Cargando analítica web…</Centered>;
  if (state === "error") return <Centered>No se pudo cargar la analítica web.</Centered>;

  if (res?.source === "ga4" && res.analytics) return <Ga4View data={res.analytics} />;
  if (res?.source === "search_console" && res.search) return <SearchView data={res.search} />;

  return (
    <Card className="border-dashed">
      <CardContent className="py-10 text-center text-muted-foreground text-sm">
        {res?.reason === "not_configured"
          ? "La analítica del sitio aún no está conectada. Tu equipo la activará en breve."
          : "No hay datos de analítica web disponibles por ahora."}
      </CardContent>
    </Card>
  );
}

function Ga4View({ data }: { data: WebAnalytics }) {
  return (
    <div className="flex flex-col gap-5">
      <p className="text-muted-foreground text-sm -mt-2">Tráfico del sitio · últimos {data.rangeDays} días</p>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric label="Visitantes" value={intFmt(data.totals.visitors)} accent />
        <Metric label="Páginas vistas" value={intFmt(data.totals.pageViews)} />
        <Metric label="Sesiones" value={intFmt(data.totals.sessions)} />
        <Metric label="Rebote" value={data.totals.bounceRatePct === null ? "—" : pct(data.totals.bounceRatePct)} />
      </section>

      {data.timeseries.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Visitantes por día</CardTitle></CardHeader>
          <CardContent>
            <DayBars points={data.timeseries} />
          </CardContent>
        </Card>
      )}

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Páginas más vistas</CardTitle></CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-muted-foreground text-xs border-b">
                  <th scope="col" className="text-left font-medium py-2 pr-2">Página</th>
                  <th scope="col" className="text-right font-medium py-2 px-2">Visitantes</th>
                  <th scope="col" className="text-right font-medium py-2 pl-2">Vistas</th>
                </tr></thead>
                <tbody>
                  {data.topPages.map((p) => (
                    <tr key={p.path} className="border-b last:border-0">
                      <td className="py-2 pr-2 font-medium truncate max-w-[16rem]">{p.path}</td>
                      <td className="py-2 px-2 text-right tabular-nums">{intFmt(p.visitors)}</td>
                      <td className="py-2 pl-2 text-right tabular-nums text-muted-foreground">{intFmt(p.pageViews)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
        <NamedCountCard title="De dónde llegan (fuentes)" rows={data.topSources} />
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <NamedCountCard title="Países" rows={data.countries} />
        <NamedCountCard title="Dispositivos" rows={data.devices} />
      </section>
    </div>
  );
}

function SearchView({ data }: { data: SearchTrafficSummary }) {
  return (
    <div className="flex flex-col gap-5">
      <p className="text-muted-foreground text-sm -mt-2">
        Tráfico orgánico de Google (Search Console) · últimos {data.rangeDays} días
      </p>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric label="Clics desde Google" value={intFmt(data.totals.clicks)} hint="visitas orgánicas" accent />
        <Metric label="Impresiones" value={intFmt(data.totals.impressions)} hint="apariciones en Google" />
        <Metric label="CTR" value={data.totals.ctrPct === null ? "—" : `${data.totals.ctrPct.toFixed(1)}%`} />
        <Metric label="Posición prom." value={data.totals.avgPosition === null ? "—" : data.totals.avgPosition.toFixed(1)} />
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Páginas que más traen tráfico</CardTitle></CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-muted-foreground text-xs border-b">
                  <th scope="col" className="text-left font-medium py-2 pr-2">Página</th>
                  <th scope="col" className="text-right font-medium py-2 px-2">Clics</th>
                  <th scope="col" className="text-right font-medium py-2 px-2 hidden sm:table-cell">Impres.</th>
                  <th scope="col" className="text-right font-medium py-2 pl-2 hidden md:table-cell">CTR</th>
                </tr></thead>
                <tbody>
                  {data.topPages.map((p) => (
                    <tr key={p.page} className="border-b last:border-0">
                      <td className="py-2 pr-2 font-medium truncate max-w-[16rem]">{p.page}</td>
                      <td className="py-2 px-2 text-right tabular-nums">{intFmt(p.clicks)}</td>
                      <td className="py-2 px-2 text-right tabular-nums text-muted-foreground hidden sm:table-cell">{intFmt(p.impressions)}</td>
                      <td className="py-2 pl-2 text-right tabular-nums text-muted-foreground hidden md:table-cell">{p.ctrPct === null ? "—" : `${p.ctrPct.toFixed(1)}%`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Búsquedas que te encuentran</CardTitle></CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-muted-foreground text-xs border-b">
                  <th scope="col" className="text-left font-medium py-2 pr-2">Búsqueda</th>
                  <th scope="col" className="text-right font-medium py-2 px-2">Clics</th>
                  <th scope="col" className="text-right font-medium py-2 pl-2 hidden sm:table-cell">Impres.</th>
                </tr></thead>
                <tbody>
                  {data.topQueries.map((q) => (
                    <tr key={q.query} className="border-b last:border-0">
                      <td className="py-2 pr-2 font-medium truncate max-w-[16rem]">{q.query}</td>
                      <td className="py-2 px-2 text-right tabular-nums">{intFmt(q.clicks)}</td>
                      <td className="py-2 pl-2 text-right tabular-nums text-muted-foreground hidden sm:table-cell">{intFmt(q.impressions)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </section>

      <p className="text-muted-foreground text-xs">
        Fuente: Google Search Console (tráfico orgánico de búsqueda). El tráfico total (directo, redes, pago,
        países y dispositivos) se agrega cuando se conecta Google Analytics.
      </p>
    </div>
  );
}

function DayBars({ points }: { points: WebAnalytics["timeseries"] }) {
  const max = Math.max(...points.map((p) => p.visitors), 1);
  return (
    <div className="flex items-end gap-1 h-32">
      {points.map((p) => (
        <div
          key={p.date}
          className="flex-1 rounded-t bg-primary/70"
          style={{ height: `${Math.max(2, (p.visitors / max) * 100)}%` }}
          title={`${p.date}: ${intFmt(p.visitors)} visitantes`}
        />
      ))}
    </div>
  );
}

function NamedCountCard({ title, rows }: { title: string; rows: NamedCount[] }) {
  const max = rows[0]?.visitors || 1;
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-base">{title}</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        {rows.length === 0 ? (
          <p className="text-muted-foreground text-sm">Sin datos.</p>
        ) : (
          rows.map((r) => (
            <div key={r.name}>
              <div className="flex justify-between text-sm mb-0.5">
                <span className="truncate">{r.name}</span>
                <span className="font-medium tabular-nums">{intFmt(r.visitors)}</span>
              </div>
              <div className="h-1.5 rounded-full bg-muted overflow-hidden" aria-hidden="true">
                <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(3, (r.visitors / max) * 100)}%` }} />
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
