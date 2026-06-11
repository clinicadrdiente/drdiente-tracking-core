"use client";

import { useEffect, useState } from "react";
import { ModuleFrame } from "@/components/dashboard/module-frame";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCompactCurrency, formatInteger } from "@/components/formater";
import type { MarketingAttribution, MonthlyDashboard } from "@/types/dashboard";

// ── Types ──────────────────────────────────────────────────────────────────────

interface Platform {
  source: string;
  spend: number;
  impressions: number;
  reach: number;
  clicks: number;
}

interface EffortsTotals {
  spend: number;
  impressions: number;
  reach: number;
  clicks: number;
}

interface ManualEfforts {
  postsPublished: number;
  leadsReceived: number;
  leadsContacted: number;
  callsReceived: number;
  emailsSent: number;
  promoWhatsappSent: number;
  followUpsSent: number;
  reportingBranches: number;
  daysWithReports: number;
}

interface EffortsSummary {
  range: { fromIso: string; toIso: string };
  platforms: Platform[];
  totals: EffortsTotals;
  manual: ManualEfforts;
  windsorError?: string;
  windsorPresetNote?: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatCompactNumber(n: number): string {
  return new Intl.NumberFormat("es-MX", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(n);
}

function formatRoas(value: number): string {
  return `${new Intl.NumberFormat("es-MX", {
    maximumFractionDigits: 2,
  }).format(value)}x`;
}

function formatPercentShare(value: number): string {
  return `${new Intl.NumberFormat("es-MX", {
    maximumFractionDigits: 1,
  }).format(value)}%`;
}

function formatDayMonth(iso: string): string {
  return new Intl.DateTimeFormat("es-MX", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(iso));
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function PlatformsTable({
  platforms,
  totals,
  windsorError,
}: {
  platforms: Platform[];
  totals: EffortsTotals;
  windsorError?: string;
}) {
  if (windsorError) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Inversión por plataforma</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border border-dashed p-6 text-center space-y-1">
            <p className="text-sm font-medium text-muted-foreground">Sin datos de Windsor</p>
            <p className="text-xs text-muted-foreground">{windsorError}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (platforms.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Inversión por plataforma</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border border-dashed p-6 text-center">
            <p className="text-sm text-muted-foreground">
              Windsor no está configurado o no hay datos en este periodo.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Inversión por plataforma</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-muted-foreground">
                <th className="py-2 text-left font-medium">Plataforma</th>
                <th className="py-2 text-right font-medium">Gasto</th>
                <th className="py-2 text-right font-medium">Impresiones</th>
                <th className="py-2 text-right font-medium">Alcance</th>
                <th className="py-2 text-right font-medium">Clics</th>
              </tr>
            </thead>
            <tbody>
              {platforms.map((p) => (
                <tr key={p.source} className="border-b last:border-0">
                  <td className="py-2 font-medium capitalize">{p.source}</td>
                  <td className="py-2 text-right">{formatCompactCurrency(p.spend)}</td>
                  <td className="py-2 text-right">{formatCompactNumber(p.impressions)}</td>
                  <td className="py-2 text-right">{formatCompactNumber(p.reach)}</td>
                  <td className="py-2 text-right">{formatInteger(p.clicks)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t font-semibold">
                <td className="py-2">Total</td>
                <td className="py-2 text-right">{formatCompactCurrency(totals.spend)}</td>
                <td className="py-2 text-right">{formatCompactNumber(totals.impressions)}</td>
                <td className="py-2 text-right">{formatCompactNumber(totals.reach)}</td>
                <td className="py-2 text-right">{formatInteger(totals.clicks)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Atribución y ROAS ──────────────────────────────────────────────────────────

type SpendState =
  | { status: "idle" | "loading" | "unconfigured" | "error" }
  | { status: "ready"; spend: number };

const CHANNEL_ROWS = [
  { key: "marketing", label: "Marketing (digital)", barClass: "bg-brand" },
  { key: "organico", label: "Orgánico (recomendación, paso, convenio)", barClass: "bg-muted-foreground/50" },
  { key: "desconocido", label: "Sin identificar", barClass: "bg-muted-foreground/25" },
] as const;

function AttributionRoasCard({
  data,
  secret,
}: {
  data: MonthlyDashboard | null;
  secret: string;
}) {
  const attribution: MarketingAttribution | undefined = data?.marketingAttribution;
  const window =
    data?.range ?? (data?.month ? { days: null, fromIso: data.month.fromIso, toIso: data.month.toIso } : null);
  const from = window?.fromIso.slice(0, 10) ?? null;
  const to = window?.toIso.slice(0, 10) ?? null;

  const [spendState, setSpendState] = useState<SpendState>({ status: "idle" });

  useEffect(() => {
    if (!secret.trim() || !from || !to) return;
    let cancelled = false;
    setSpendState({ status: "loading" });
    fetch(`/api/dev/windsor-marketing-summary?from=${from}&to=${to}`, {
      headers: { "x-tracking-secret": secret.trim() },
    })
      .then(async (res) => {
        const body = (await res.json()) as {
          configured?: boolean;
          totals?: { spend?: number };
        };
        if (cancelled) return;
        if (!res.ok) {
          setSpendState({ status: "error" });
        } else if (body.configured === false) {
          setSpendState({ status: "unconfigured" });
        } else {
          setSpendState({ status: "ready", spend: body.totals?.spend ?? 0 });
        }
      })
      .catch(() => {
        if (!cancelled) setSpendState({ status: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [secret, from, to]);

  if (!data) {
    return null;
  }

  if (!attribution) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Atribución y ROAS (según Dentalink)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border border-dashed p-6 text-center">
            <p className="text-sm text-muted-foreground">
              Presiona Actualizar en el dashboard para recalcular la atribución de pacientes.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const spend = spendState.status === "ready" ? spendState.spend : null;
  const roasMarketing =
    spend !== null && spend > 0 ? attribution.marketing.revenue / spend : null;
  const roasGeneral =
    spend !== null && spend > 0 ? data.revenueTotal / spend : null;
  const periodLabel =
    window !== null ? `${formatDayMonth(window.fromIso)} – ${formatDayMonth(window.toIso)}` : null;

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle className="text-base">Atribución y ROAS (según Dentalink)</CardTitle>
        {periodLabel ? (
          <Badge variant="secondary" className="text-xs font-normal">
            {periodLabel}
          </Badge>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="rounded-lg border bg-background/50 p-4 flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">Pacientes de marketing</span>
            <span className="text-2xl font-bold tabular-nums">
              {formatInteger(attribution.marketing.patients)}
            </span>
            <span className="text-xs text-muted-foreground">
              de {formatInteger(data.uniquePatientsTotal)} en el periodo
            </span>
          </div>
          <div className="rounded-lg border bg-background/50 p-4 flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">Revenue de marketing</span>
            <span className="text-2xl font-bold tabular-nums">
              {formatCompactCurrency(attribution.marketing.revenue)}
            </span>
            <span className="text-xs text-muted-foreground">
              {formatPercentShare(attribution.marketing.share)} del revenue total
            </span>
          </div>
          <div className="rounded-lg border bg-background/50 p-4 flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">Inversión del periodo</span>
            <span className="text-2xl font-bold tabular-nums">
              {spendState.status === "loading"
                ? "…"
                : spend !== null
                  ? formatCompactCurrency(spend)
                  : "—"}
            </span>
            <span className="text-xs text-muted-foreground">
              {spendState.status === "unconfigured"
                ? "Windsor no configurado"
                : spendState.status === "error"
                  ? "No se pudo leer Windsor"
                  : "Windsor (todas las fuentes)"}
            </span>
          </div>
          <div className="rounded-lg border border-brand/40 bg-brand/5 p-4 flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">ROAS marketing</span>
            <span className="text-2xl font-bold tabular-nums text-brand">
              {roasMarketing !== null ? formatRoas(roasMarketing) : "—"}
            </span>
            <span className="text-xs text-muted-foreground">
              {roasGeneral !== null
                ? `ROAS general: ${formatRoas(roasGeneral)}`
                : "Necesita inversión registrada"}
            </span>
          </div>
        </div>

        <div className="space-y-2">
          {CHANNEL_ROWS.map(({ key, label, barClass }) => {
            const bucket = attribution[key];
            return (
              <div key={key}>
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span>{label}</span>
                  <span className="text-muted-foreground">
                    {formatInteger(bucket.patients)} pacientes ·{" "}
                    {formatCompactCurrency(bucket.revenue)} ·{" "}
                    {formatPercentShare(bucket.share)}
                  </span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className={`h-full rounded-full ${barClass}`}
                    style={{ width: `${Math.min(100, Math.max(bucket.share > 0 ? 3 : 0, bucket.share))}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        {attribution.topMarketingReferences.length > 0 ? (
          <div>
            <p className="mb-2 text-xs text-muted-foreground uppercase tracking-[0.2em]">
              Top referencias de marketing
            </p>
            <div className="flex flex-col gap-1.5">
              {attribution.topMarketingReferences.map((ref) => (
                <div
                  key={ref.reference}
                  className="flex items-center justify-between gap-3 rounded-lg bg-muted/30 px-3 py-2 text-sm"
                >
                  <span className="truncate capitalize">
                    {ref.reference.toLowerCase()}
                  </span>
                  <span className="shrink-0 text-muted-foreground">
                    {formatInteger(ref.patients)} pacientes ·{" "}
                    {formatCompactCurrency(ref.revenue)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <p className="text-xs text-muted-foreground">
          Clasificación automática del campo "Referencia" de Dentalink: menciones a
          internet, redes sociales o plataformas digitales cuentan como marketing,
          aunque la nota mezcle otras fuentes (p. ej. "GOOGLE/RECOMENDACIÓN").
        </p>
      </CardContent>
    </Card>
  );
}

interface StatTileProps {
  label: string;
  value: number;
}

function StatTile({ label, value }: StatTileProps) {
  return (
    <div className="rounded-lg border bg-background/50 p-4 flex flex-col gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-2xl font-bold tabular-nums">{formatInteger(value)}</span>
    </div>
  );
}

function ManualEffortsGrid({
  manual,
}: {
  manual: ManualEfforts;
}) {
  const hasBranches = manual.reportingBranches > 0;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-base">Esfuerzos operativos</CardTitle>
        {hasBranches ? (
          <Badge variant="secondary" className="text-xs font-normal">
            Fuente: reportes diarios de sucursal ({manual.reportingBranches} sucursal
            {manual.reportingBranches !== 1 ? "es" : ""}, {manual.daysWithReports} día
            {manual.daysWithReports !== 1 ? "s" : ""} reportados)
          </Badge>
        ) : null}
      </CardHeader>
      <CardContent>
        {!hasBranches ? (
          <div className="rounded-lg border border-dashed p-6 text-center">
            <p className="text-sm text-muted-foreground">
              Ninguna sucursal ha reportado en este periodo.
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Los reportes diarios se envían desde la sección "Reporte diario de sucursal".
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            <StatTile label="Posts publicados" value={manual.postsPublished} />
            <StatTile label="Leads recibidos" value={manual.leadsReceived} />
            <StatTile label="Leads contactados" value={manual.leadsContacted} />
            <StatTile label="Llamadas recibidas" value={manual.callsReceived} />
            <StatTile label="Emails enviados" value={manual.emailsSent} />
            <StatTile label="WhatsApp promo" value={manual.promoWhatsappSent} />
            <StatTile label="Seguimientos" value={manual.followUpsSent} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function EffortsPanel({
  secret,
  rangeDays,
  dashboardData,
}: {
  secret: string;
  rangeDays: 7 | 30 | 180 | null;
  dashboardData: MonthlyDashboard | null;
}) {
  const [data, setData] = useState<EffortsSummary | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeRange = rangeDays ?? 30;

  useEffect(() => {
    void loadEfforts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secret, activeRange]);

  async function loadEfforts() {
    if (!secret.trim()) return;
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/reports/efforts?rangeDays=${activeRange}`, {
        headers: { "x-tracking-secret": secret.trim() },
      });
      const body = (await res.json()) as EffortsSummary & { ok?: boolean; error?: string };
      if (!res.ok || !("manual" in body)) {
        throw new Error(body.error ?? "No se pudo cargar esfuerzos.");
      }
      setData(body);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido.");
    } finally {
      setIsLoading(false);
    }
  }

  const rangeLabel = `Últimos ${activeRange} días`;

  return (
    <ModuleFrame accent="marketing" title="Esfuerzos">
      <p className="text-sm text-muted-foreground">{rangeLabel}</p>

      <AttributionRoasCard data={dashboardData} secret={secret} />

      {isLoading ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Cargando…</p>
      ) : error ? (
        <div className="rounded-lg border border-dashed p-6 text-center">
          <p className="text-sm text-muted-foreground">{error}</p>
        </div>
      ) : data ? (
        <div className="space-y-4">
          {data.windsorPresetNote ? (
            <p className="text-xs text-muted-foreground italic">{data.windsorPresetNote}</p>
          ) : null}
          <PlatformsTable
            platforms={data.platforms}
            totals={data.totals}
            windsorError={data.windsorError}
          />
          <ManualEffortsGrid manual={data.manual} />
        </div>
      ) : (
        <p className="py-8 text-center text-sm text-muted-foreground">
          Ingresa el secret para cargar datos.
        </p>
      )}
    </ModuleFrame>
  );
}
