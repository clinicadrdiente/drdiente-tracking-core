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
}: {
  secret: string;
  rangeDays: 7 | 30 | 180 | null;
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
