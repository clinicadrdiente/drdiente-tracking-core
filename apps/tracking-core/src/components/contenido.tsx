"use client";

import { useEffect, useState } from "react";
import { BookOpenIcon, SearchIcon } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

interface TreatmentRollup {
  treatment: string;
  posts: number;
  clicks: number;
  impressions: number;
}

interface BlogPageRow {
  url: string;
  slug: string;
  treatment: string;
  clicks: number;
  impressions: number;
  position: number | null;
}

interface QueryRow {
  query: string | null;
  clicks: number;
  impressions: number;
  position: number | null;
}

interface BlogReportResponse {
  ok: boolean;
  error?: string;
  totalBlogs?: number;
  byTreatment?: TreatmentRollup[];
  topPages?: BlogPageRow[];
  searchConsole?: {
    configured: boolean;
    error: string | null;
    siteClicks: number;
    siteImpressions: number;
    blogClicks: number;
    blogImpressions: number;
    blogShareOfClicks: number;
    topQueries: QueryRow[];
  };
}

type LoadState = "idle" | "loading" | "ready" | "error";

export function Contenido({ secret }: { secret: string }) {
  const [month, setMonth] = useState<string>(() => currentMonthKey());
  const [report, setReport] = useState<BlogReportResponse | null>(null);
  const [state, setState] = useState<LoadState>("idle");
  const [error, setError] = useState<string | null>(null);

  const storedSecret =
    secret || window.localStorage.getItem("trackingSecret") || "";

  useEffect(() => {
    if (!storedSecret) return;
    let cancelled = false;
    setState("loading");
    setError(null);
    const { from, to } = monthDateRange(month);
    fetch(`/api/dev/blog-report?from=${from}&to=${to}`, {
      headers: { "x-tracking-secret": storedSecret },
    })
      .then(async (response) => {
        const body = (await response.json()) as BlogReportResponse;
        if (!response.ok || !body.ok) {
          throw new Error(body.error ?? `status ${response.status}`);
        }
        return body;
      })
      .then((body) => {
        if (cancelled) return;
        setReport(body);
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
  }, [storedSecret, month]);

  if (!storedSecret) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-muted-foreground text-sm">
          Pega el TRACKING_API_SECRET en Control para ver el reporte de contenido.
        </CardContent>
      </Card>
    );
  }

  const gsc = report?.searchConsole;

  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h1 className="font-semibold text-3xl tracking-tight">Contenido</h1>
          <Badge variant="secondary">blogs + busqueda organica</Badge>
        </div>
        <Input
          aria-label="Mes de metricas organicas"
          className="h-9 w-40"
          max={currentMonthKey()}
          onChange={(event) => event.target.value && setMonth(event.target.value)}
          type="month"
          value={month}
        />
      </section>

      {state === "loading" ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground text-sm">
            Leyendo sitemap y Search Console...
          </CardContent>
        </Card>
      ) : null}

      {state === "error" ? (
        <Card className="border-danger/40">
          <CardContent className="py-10 text-center text-danger text-sm">
            No se pudo cargar el reporte: {error}
          </CardContent>
        </Card>
      ) : null}

      {state === "ready" && report ? (
        <>
          <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatTile label="Blogs publicados" value={formatInteger(report.totalBlogs ?? 0)} />
            <StatTile
              label={`Clicks organicos blog · ${monthLabel(month)}`}
              value={formatInteger(gsc?.blogClicks ?? 0)}
            />
            <StatTile
              label="Impresiones organicas blog"
              value={formatInteger(gsc?.blogImpressions ?? 0)}
            />
            <StatTile
              label="Blog como % de clicks del sitio"
              value={formatPercent(gsc?.blogShareOfClicks ?? 0)}
            />
          </section>

          {gsc && !gsc.configured ? (
            <Card className="border-warn/40">
              <CardContent className="py-4 text-sm text-warn">
                Search Console no disponible
                {gsc.error ? ` (${gsc.error})` : ""}: se muestra solo el conteo de
                blogs del sitemap.
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BookOpenIcon aria-hidden="true" className="size-5" />
                Blogs por tratamiento
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground text-xs uppercase tracking-wider">
                      <th className="py-2 pr-3">Tratamiento</th>
                      <th className="py-2 pr-3">Blogs</th>
                      <th className="py-2 pr-3">Clicks organicos</th>
                      <th className="py-2">Impresiones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(report.byTreatment ?? []).map((row) => (
                      <tr className="border-b last:border-0" key={row.treatment}>
                        <td className="py-2.5 pr-3 font-medium">{row.treatment}</td>
                        <td className="py-2.5 pr-3 tabular-nums">{formatInteger(row.posts)}</td>
                        <td className="py-2.5 pr-3 tabular-nums">{formatInteger(row.clicks)}</td>
                        <td className="py-2.5 tabular-nums">{formatInteger(row.impressions)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Top blogs por clicks · {monthLabel(month)}</CardTitle>
              </CardHeader>
              <CardContent>
                {(report.topPages ?? []).filter((page) => page.clicks > 0).length > 0 ? (
                  <div className="space-y-2">
                    {(report.topPages ?? [])
                      .filter((page) => page.clicks > 0)
                      .map((page) => (
                        <a
                          className="block rounded-lg border bg-background/40 p-3 transition hover:border-brand/40"
                          href={page.url}
                          key={page.slug}
                          rel="noreferrer"
                          target="_blank"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="min-w-0 truncate font-medium" title={page.slug}>
                              {page.slug}
                            </span>
                            <span className="shrink-0 font-semibold text-brand">
                              {formatInteger(page.clicks)} clicks
                            </span>
                          </div>
                          <p className="mt-1 text-muted-foreground text-xs">
                            {page.treatment} · {formatInteger(page.impressions)} impresiones
                            {page.position !== null
                              ? ` · posicion ${page.position.toFixed(1)}`
                              : ""}
                          </p>
                        </a>
                      ))}
                  </div>
                ) : (
                  <p className="py-6 text-center text-muted-foreground text-sm">
                    Ningun blog registro clicks organicos en este rango.
                  </p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <SearchIcon aria-hidden="true" className="size-5" />
                  Top busquedas que traen trafico
                </CardTitle>
              </CardHeader>
              <CardContent>
                {(gsc?.topQueries ?? []).length > 0 ? (
                  <div className="space-y-2">
                    {(gsc?.topQueries ?? []).map((row) => (
                      <div
                        className="flex items-center justify-between gap-2 rounded-lg border bg-background/40 px-3 py-2"
                        key={row.query ?? ""}
                      >
                        <span className="min-w-0 truncate" title={row.query ?? ""}>
                          {row.query}
                        </span>
                        <span className="shrink-0 text-muted-foreground text-xs">
                          {formatInteger(row.clicks)} clicks ·{" "}
                          {formatInteger(row.impressions)} imp.
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="py-6 text-center text-muted-foreground text-sm">
                    Sin datos de busquedas para este rango.
                  </p>
                )}
              </CardContent>
            </Card>
          </section>
        </>
      ) : null}
    </div>
  );
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border bg-background/50 p-4">
      <p className="text-muted-foreground text-xs uppercase tracking-[0.14em]">{label}</p>
      <p className="mt-2 font-semibold text-2xl tracking-tight">{value}</p>
    </div>
  );
}

function currentMonthKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
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
  return new Intl.DateTimeFormat("es-MX", { month: "long", year: "numeric" }).format(
    date,
  );
}

function formatInteger(value: number): string {
  return new Intl.NumberFormat("es-MX", { maximumFractionDigits: 0 }).format(
    Number.isFinite(value) ? value : 0,
  );
}

function formatPercent(value: number): string {
  if (!Number.isFinite(value)) return "--";
  return `${new Intl.NumberFormat("es-MX", { maximumFractionDigits: 1 }).format(value)}%`;
}
