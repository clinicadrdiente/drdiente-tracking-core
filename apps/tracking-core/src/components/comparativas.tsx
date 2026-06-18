"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  MinusIcon,
  Scale3dIcon,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

interface WindsorRow {
  source?: string | null;
  campaign?: string | null;
  spend?: number;
  clicks?: number;
  impressions?: number;
  reach?: number;
}

interface WindsorSummaryResponse {
  configured?: boolean;
  rows?: WindsorRow[];
  totals?: {
    spend?: number;
    clicks?: number;
    impressions?: number;
    reach?: number;
  };
  bySource?: Array<{
    source: string;
    spend?: number;
    clicks?: number;
    impressions?: number;
  }>;
}

interface MonthBucketLite {
  monthKey: string;
  label: string;
  revenue: number;
  payments: number;
}

interface MonthMetrics {
  monthKey: string;
  spend: number;
  clicks: number;
  impressions: number;
  reach: number;
  revenue: number;
  payments: number;
  bySource: Array<{ source: string; spend: number }>;
  topCampaigns: Array<{
    campaign: string;
    source: string;
    spend: number;
    clicks: number;
    cpc: number;
  }>;
}

type LoadState = "idle" | "loading" | "ready" | "error";

export function Comparativas({ secret }: { secret: string }) {
  const [monthA, setMonthA] = useState<string>(() =>
    shiftMonth(currentMonthKey(), -1),
  );
  const [monthB, setMonthB] = useState<string>(() => currentMonthKey());
  const [metricsA, setMetricsA] = useState<MonthMetrics | null>(null);
  const [metricsB, setMetricsB] = useState<MonthMetrics | null>(null);
  const [revenueBuckets, setRevenueBuckets] = useState<MonthBucketLite[]>([]);
  const [state, setState] = useState<LoadState>("idle");
  const [error, setError] = useState<string | null>(null);

  const storedSecret =
    secret || window.localStorage.getItem("trackingSecret") || "";

  useEffect(() => {
    if (!storedSecret) return;
    let cancelled = false;
    fetch("/api/dev/dentalink-monthly-dashboard?rangeDays=180", {
      headers: { "x-tracking-secret": storedSecret },
    })
      .then((response) => response.json())
      .then((body: { months?: MonthBucketLite[] }) => {
        if (!cancelled) setRevenueBuckets(body.months ?? []);
      })
      .catch(() => {
        // revenue optional: comparativa still works with spend-only KPIs
      });
    return () => {
      cancelled = true;
    };
  }, [storedSecret]);

  useEffect(() => {
    if (!storedSecret) return;
    let cancelled = false;
    setState("loading");
    setError(null);

    Promise.all([
      fetchMonthMetrics(storedSecret, monthA),
      fetchMonthMetrics(storedSecret, monthB),
    ])
      .then(([a, b]) => {
        if (cancelled) return;
        setMetricsA(a);
        setMetricsB(b);
        setState("ready");
      })
      .catch((fetchError: Error) => {
        if (cancelled) return;
        setError(fetchError.message);
        setState("error");
      });

    return () => {
      cancelled = true;
    };
  }, [storedSecret, monthA, monthB]);

  const enrichedA = useMemo(
    () => enrichWithRevenue(metricsA, revenueBuckets),
    [metricsA, revenueBuckets],
  );
  const enrichedB = useMemo(
    () => enrichWithRevenue(metricsB, revenueBuckets),
    [metricsB, revenueBuckets],
  );

  if (!storedSecret) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-muted-foreground text-sm">
          Pega el TRACKING_API_SECRET en Control para ver las comparativas.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h1 className="font-semibold text-3xl tracking-tight">
            Comparativas
          </h1>
          <Badge variant="secondary">mes vs mes</Badge>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            aria-label="Mes A"
            className="h-9 w-40"
            max={currentMonthKey()}
            onChange={(event) =>
              event.target.value && setMonthA(event.target.value)
            }
            type="month"
            value={monthA}
          />
          <span className="text-muted-foreground text-sm">vs</span>
          <Input
            aria-label="Mes B"
            className="h-9 w-40"
            max={currentMonthKey()}
            onChange={(event) =>
              event.target.value && setMonthB(event.target.value)
            }
            type="month"
            value={monthB}
          />
        </div>
      </section>

      {state === "loading" ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground text-sm">
            Cargando inversion y resultados de ambos meses...
          </CardContent>
        </Card>
      ) : null}

      {state === "error" ? (
        <Card className="border-danger/40">
          <CardContent className="py-10 text-center text-danger text-sm">
            No se pudo cargar la comparativa: {error}
          </CardContent>
        </Card>
      ) : null}

      {state === "ready" && enrichedA && enrichedB ? (
        <>
          <KpiComparisonCard
            a={enrichedA}
            b={enrichedB}
            monthA={monthA}
            monthB={monthB}
          />
          <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <ChannelComparisonCard
              metrics={enrichedA}
              title={monthLabel(monthA)}
            />
            <ChannelComparisonCard
              metrics={enrichedB}
              title={monthLabel(monthB)}
            />
          </section>
          <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <CampaignsCard metrics={enrichedA} title={monthLabel(monthA)} />
            <CampaignsCard metrics={enrichedB} title={monthLabel(monthB)} />
          </section>
        </>
      ) : null}
    </div>
  );
}

interface EnrichedMetrics extends MonthMetrics {
  ctr: number;
  cpm: number;
  cpc: number;
  frequency: number;
  roas: number;
  ticket: number;
  costPerPayment: number;
}

function enrichWithRevenue(
  metrics: MonthMetrics | null,
  buckets: MonthBucketLite[],
): EnrichedMetrics | null {
  if (!metrics) return null;
  const bucket = buckets.find((entry) => entry.monthKey === metrics.monthKey);
  const revenue = bucket?.revenue ?? metrics.revenue;
  const payments = bucket?.payments ?? metrics.payments;
  return {
    ...metrics,
    revenue,
    payments,
    ctr:
      metrics.impressions > 0
        ? (metrics.clicks / metrics.impressions) * 100
        : 0,
    cpm:
      metrics.impressions > 0
        ? (metrics.spend / metrics.impressions) * 1000
        : 0,
    cpc: metrics.clicks > 0 ? metrics.spend / metrics.clicks : 0,
    frequency: metrics.reach > 0 ? metrics.impressions / metrics.reach : 0,
    roas: metrics.spend > 0 ? revenue / metrics.spend : 0,
    ticket: payments > 0 ? revenue / payments : 0,
    costPerPayment: payments > 0 ? metrics.spend / payments : 0,
  };
}

/** KPI definitions: label, formatter, and whether "up" is good. */
const KPI_DEFS: Array<{
  key: keyof EnrichedMetrics;
  label: string;
  hint?: string;
  format: (value: number) => string;
  upIsGood: boolean;
}> = [
  { key: "spend", label: "Inversion", format: formatMoney, upIsGood: false },
  {
    key: "revenue",
    label: "Revenue (Dentalink)",
    format: formatMoney,
    upIsGood: true,
  },
  {
    key: "roas",
    label: "ROAS",
    hint: "revenue / inversion",
    format: formatRoas,
    upIsGood: true,
  },
  { key: "payments", label: "Pagos", format: formatInteger, upIsGood: true },
  {
    key: "ticket",
    label: "Ticket promedio",
    format: formatMoney,
    upIsGood: true,
  },
  {
    key: "costPerPayment",
    label: "Costo por pago (aprox CAC)",
    hint: "inversion / pagos",
    format: formatMoney,
    upIsGood: false,
  },
  {
    key: "impressions",
    label: "Impresiones",
    format: formatInteger,
    upIsGood: true,
  },
  { key: "reach", label: "Alcance", format: formatInteger, upIsGood: true },
  {
    key: "frequency",
    label: "Frecuencia",
    hint: "impresiones / alcance — alta = audiencia quemada",
    format: (value) => value.toFixed(2),
    upIsGood: false,
  },
  { key: "clicks", label: "Clicks", format: formatInteger, upIsGood: true },
  { key: "ctr", label: "CTR", format: formatPercent, upIsGood: true },
  { key: "cpc", label: "CPC", format: formatMoney, upIsGood: false },
  { key: "cpm", label: "CPM", format: formatMoney, upIsGood: false },
];

function KpiComparisonCard({
  a,
  b,
  monthA,
  monthB,
}: {
  a: EnrichedMetrics;
  b: EnrichedMetrics;
  monthA: string;
  monthB: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Scale3dIcon aria-hidden="true" className="size-5" />
          KPIs: {monthLabel(monthA)} vs {monthLabel(monthB)}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground text-xs uppercase tracking-wider">
                <th className="py-2 pr-3">KPI</th>
                <th className="py-2 pr-3 capitalize">{monthLabel(monthA)}</th>
                <th className="py-2 pr-3 capitalize">{monthLabel(monthB)}</th>
                <th className="py-2">Variacion</th>
              </tr>
            </thead>
            <tbody>
              {KPI_DEFS.map((def) => {
                const valueA = Number(a[def.key]) || 0;
                const valueB = Number(b[def.key]) || 0;
                const delta =
                  valueA !== 0 ? ((valueB - valueA) / valueA) * 100 : null;
                const improved =
                  delta === null ? null : def.upIsGood ? delta > 0 : delta < 0;
                return (
                  <tr className="border-b last:border-0" key={def.key}>
                    <td className="py-2.5 pr-3">
                      <span className="font-medium">{def.label}</span>
                      {def.hint ? (
                        <span className="block text-muted-foreground text-xs">
                          {def.hint}
                        </span>
                      ) : null}
                    </td>
                    <td className="py-2.5 pr-3 tabular-nums">
                      {def.format(valueA)}
                    </td>
                    <td className="py-2.5 pr-3 font-semibold tabular-nums">
                      {def.format(valueB)}
                    </td>
                    <td className="py-2.5">
                      <DeltaPill delta={delta} improved={improved} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-muted-foreground text-xs">
          Inversion, impresiones, clicks y alcance vienen de Windsor (todas las
          plataformas). Revenue y pagos vienen de Dentalink. Los meses fuera de
          los ultimos 180 dias no tienen revenue disponible.
        </p>
      </CardContent>
    </Card>
  );
}

function DeltaPill({
  delta,
  improved,
}: {
  delta: number | null;
  improved: boolean | null;
}) {
  if (delta === null) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-muted-foreground text-xs">
        <MinusIcon className="size-3" /> nuevo
      </span>
    );
  }
  const Icon = delta > 0 ? ArrowUpIcon : delta < 0 ? ArrowDownIcon : MinusIcon;
  const toneClass =
    improved === null || delta === 0
      ? "bg-muted text-muted-foreground"
      : improved
        ? "bg-brand/15 text-brand"
        : "bg-danger/15 text-danger";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${toneClass}`}
    >
      <Icon className="size-3" />
      {`${Math.abs(delta).toFixed(1)}%`}
    </span>
  );
}

function ChannelComparisonCard({
  metrics,
  title,
}: {
  metrics: EnrichedMetrics;
  title: string;
}) {
  const total = metrics.spend;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="capitalize">Gasto por canal · {title}</CardTitle>
      </CardHeader>
      <CardContent>
        {metrics.bySource.length > 0 ? (
          <div className="space-y-2">
            {metrics.bySource.map((source) => {
              const share = total > 0 ? (source.spend / total) * 100 : 0;
              return (
                <div
                  className="rounded-lg border bg-background/40 p-3"
                  key={source.source}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-medium capitalize">
                      {source.source}
                    </span>
                    <span className="font-semibold text-brand">
                      {formatMoney(source.spend)}
                    </span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-brand"
                      style={{ width: `${Math.max(2, share)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="py-6 text-center text-muted-foreground text-sm">
            Sin gasto registrado este mes.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function CampaignsCard({
  metrics,
  title,
}: {
  metrics: EnrichedMetrics;
  title: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="capitalize">Top campanas · {title}</CardTitle>
      </CardHeader>
      <CardContent>
        {metrics.topCampaigns.length > 0 ? (
          <div className="space-y-2">
            {metrics.topCampaigns.map((campaign) => (
              <div
                className="rounded-lg border bg-background/40 p-3"
                key={`${campaign.source}-${campaign.campaign}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span
                    className="min-w-0 truncate font-medium"
                    title={campaign.campaign}
                  >
                    {campaign.campaign}
                  </span>
                  <span className="shrink-0 font-semibold text-brand">
                    {formatMoney(campaign.spend)}
                  </span>
                </div>
                <p className="mt-1 text-muted-foreground text-xs capitalize">
                  {campaign.source} · {formatInteger(campaign.clicks)} clicks ·
                  CPC {formatMoney(campaign.cpc)}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p className="py-6 text-center text-muted-foreground text-sm">
            Sin campanas con gasto este mes.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

async function fetchMonthMetrics(
  secret: string,
  monthKey: string,
): Promise<MonthMetrics> {
  const { from, to } = monthDateRange(monthKey);
  const response = await fetch(
    `/api/dev/windsor-marketing-summary?from=${from}&to=${to}`,
    { headers: { "x-tracking-secret": secret } },
  );
  const body = (await response.json()) as WindsorSummaryResponse & {
    error?: string;
  };
  if (!response.ok) {
    throw new Error(body.error ?? `Windsor respondio ${response.status}`);
  }
  if (body.configured === false) {
    throw new Error("Windsor no esta configurado (WINDSOR_API_KEY).");
  }

  const campaignGroups = new Map<
    string,
    { campaign: string; source: string; spend: number; clicks: number }
  >();
  for (const row of body.rows ?? []) {
    const campaign = row.campaign?.trim();
    if (!campaign) continue;
    const source = row.source?.trim() ?? "";
    const key = `${source}|${campaign}`;
    const group = campaignGroups.get(key) ?? {
      campaign,
      source,
      spend: 0,
      clicks: 0,
    };
    group.spend += row.spend ?? 0;
    group.clicks += row.clicks ?? 0;
    campaignGroups.set(key, group);
  }

  return {
    monthKey,
    spend: body.totals?.spend ?? 0,
    clicks: body.totals?.clicks ?? 0,
    impressions: body.totals?.impressions ?? 0,
    reach: body.totals?.reach ?? 0,
    revenue: 0,
    payments: 0,
    bySource: (body.bySource ?? [])
      .map((source) => ({ source: source.source, spend: source.spend ?? 0 }))
      .filter((source) => source.spend > 0)
      .sort((a, b) => b.spend - a.spend),
    topCampaigns: [...campaignGroups.values()]
      .filter((campaign) => campaign.spend > 0)
      .sort((a, b) => b.spend - a.spend)
      .slice(0, 8)
      .map((campaign) => ({
        ...campaign,
        cpc: campaign.clicks > 0 ? campaign.spend / campaign.clicks : 0,
      })),
  };
}

function currentMonthKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function shiftMonth(monthKey: string, offset: number): string {
  const [yearStr, monthStr] = monthKey.split("-");
  const date = new Date(Number(yearStr), Number(monthStr) - 1 + offset, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function monthDateRange(monthKey: string): { from: string; to: string } {
  const [yearStr, monthStr] = monthKey.split("-");
  const lastDay = new Date(Number(yearStr), Number(monthStr), 0).getDate();
  const isCurrent = monthKey === currentMonthKey();
  const toDay = isCurrent ? new Date().getDate() : lastDay;
  return {
    from: `${monthKey}-01`,
    to: `${monthKey}-${String(toDay).padStart(2, "0")}`,
  };
}

function monthLabel(monthKey: string): string {
  const [yearStr, monthStr] = monthKey.split("-");
  const date = new Date(Number(yearStr), Number(monthStr) - 1, 1);
  return new Intl.DateTimeFormat("es-MX", {
    month: "long",
    year: "numeric",
  }).format(date);
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  }).format(Number.isFinite(value) ? value : 0);
}

function formatInteger(value: number): string {
  return new Intl.NumberFormat("es-MX", { maximumFractionDigits: 0 }).format(
    Number.isFinite(value) ? value : 0,
  );
}

function formatPercent(value: number): string {
  if (!Number.isFinite(value)) return "--";
  return `${new Intl.NumberFormat("es-MX", { maximumFractionDigits: 2 }).format(value)}%`;
}

function formatRoas(value: number): string {
  if (!Number.isFinite(value)) return "--";
  return `${new Intl.NumberFormat("es-MX", { maximumFractionDigits: 2 }).format(value)}x`;
}
