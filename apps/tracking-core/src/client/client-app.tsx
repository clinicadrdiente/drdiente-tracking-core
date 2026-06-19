import { useEffect, useState, type ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type {
  ClientChannelRow,
  ClientSummarySnapshot,
} from "@/modules/reports/client-snapshot";

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

type LoadState = "loading" | "ready" | "error";

export function ClientApp() {
  const [state, setState] = useState<LoadState>("loading");
  const [snapshot, setSnapshot] = useState<ClientSummarySnapshot | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/client/summary");
        const body = (await res.json()) as {
          ok?: boolean;
          snapshot?: ClientSummarySnapshot | null;
        };
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

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 flex flex-col gap-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Resumen · DrDiente</h1>
        {snapshot?.bounds && (
          <p className="text-muted-foreground text-sm mt-0.5">
            Periodo {snapshot.bounds.min} → {snapshot.bounds.max}
            {snapshot.generatedAt ? ` · actualizado ${snapshot.generatedAt.slice(0, 10)}` : ""}
          </p>
        )}
      </header>

      {!snapshot && (
        <Card className="border-dashed">
          <CardContent className="py-10 text-center text-muted-foreground text-sm">
            Aún no hay un reporte publicado. Tu equipo de marketing lo publicará en breve.
          </CardContent>
        </Card>
      )}

      {snapshot && (
        <>
          <HeroSection snapshot={snapshot} />
          <InvestmentByChannel snapshot={snapshot} />
          <AdResultsByChannel snapshot={snapshot} />
          <PatientResultsByChannel snapshot={snapshot} />
          {(snapshot.cartera || snapshot.pipeline) && <CarteraPipeline snapshot={snapshot} />}
          {snapshot.months.length > 1 && <MonthlyTable snapshot={snapshot} />}
          <Recommendations snapshot={snapshot} />
        </>
      )}
    </div>
  );
}

function Centered({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center text-muted-foreground text-sm">
      {children}
    </div>
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

// 1 — Hero: facturado vs invertido + ROI/ROAS/AOV/CAC/LTV.
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

// 2 — ¿Cuánto se invirtió y en qué canales?
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

// 3 — Resultados de los anuncios (por canal).
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
        <p className="text-muted-foreground text-xs mt-2">
          Métricas de anuncios por canal. El detalle por campaña individual se irá sumando conforme se capture el origen.
        </p>
      </CardContent>
    </Card>
  );
}

// 4 — Resultados a nivel pacientes + tratamientos.
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

// 5 — Qué se puede hacer para mejorar.
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
