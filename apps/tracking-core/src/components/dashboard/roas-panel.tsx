"use client";

import { useState } from "react";
import { RefreshCwIcon, UploadIcon, TrendingUpIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface ChannelRoasRow {
  channel: string;
  label: string;
  spend: number;
  revenue: number;
  patients: number;
  payingPatients: number;
  roas: number | null;
  cac: number | null;
  costPerPatient: number | null;
  revenueShare: number;
}

interface RoasResponse {
  ok: boolean;
  dateFrom: string;
  dateTo: string;
  ingestion: {
    totalRows: number;
    patients: number;
    withReference: number;
    coverage: number;
    unresolvedColumns: string[];
  };
  roas: {
    channels: ChannelRoasRow[];
    totals: {
      spend: number;
      revenue: number;
      patients: number;
      payingPatients: number;
      roas: number | null;
    };
    paid: { spend: number; revenue: number; roas: number | null };
  };
  warnings: string[];
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatRoas(value: number | null) {
  return value === null ? "—" : `${value.toFixed(1)}x`;
}

function formatPercent(value: number) {
  return `${Math.round(value)}%`;
}

// Parsea CSV respetando comillas dobles. Devuelve filas como objetos por header.
function parseCsv(text: string): Record<string, unknown>[] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i += 1;
      row.push(field);
      field = "";
      if (row.some((cell) => cell.trim() !== "")) rows.push(row);
      row = [];
    } else {
      field += char;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    if (row.some((cell) => cell.trim() !== "")) rows.push(row);
  }

  if (rows.length < 2) return [];
  const headers = rows[0].map((header) => header.trim());
  return rows.slice(1).map((cells) => {
    const record: Record<string, unknown> = {};
    headers.forEach((header, index) => {
      record[header] = cells[index] ?? null;
    });
    return record;
  });
}

async function parseXlsx(file: File): Promise<Record<string, unknown>[]> {
  const specifier = "https://esm.sh/xlsx@0.18.5";
  const XLSX = await import(/* @vite-ignore */ specifier);
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  return XLSX.utils.sheet_to_json(sheet, { defval: null });
}

export function RoasPanel({ secret }: { secret: string }) {
  const [data, setData] = useState<RoasResponse | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    if (!secret.trim()) {
      setError("Configura el TRACKING_API_SECRET en Configuración.");
      return;
    }
    setIsLoading(true);
    setError(null);
    setFileName(file.name);
    try {
      const rows = file.name.toLowerCase().endsWith(".csv")
        ? parseCsv(await file.text())
        : await parseXlsx(file);

      if (rows.length === 0) {
        throw new Error("El archivo no tiene filas legibles.");
      }

      const response = await fetch("/api/dev/roas-by-channel", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-tracking-secret": secret.trim(),
        },
        body: JSON.stringify({ rows }),
      });
      const body = (await response.json()) as RoasResponse | { error?: string };

      if (!response.ok || !("roas" in body)) {
        throw new Error(
          "error" in body ? body.error : "No se pudo calcular el ROAS.",
        );
      }
      setData(body);
      window.localStorage.setItem("trackingSecret", secret.trim());
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Error desconocido al procesar el archivo.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  const channels = data?.roas.channels ?? [];
  const maxRoas = Math.max(1, ...channels.map((c) => c.roas ?? 0));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <TrendingUpIcon className="size-6 text-primary" />
            Inversión vs Beneficio (ROAS por canal)
          </h2>
          <p className="text-muted-foreground text-sm mt-0.5">
            Sube el reporte "Pacientes nuevos" de Dentalink (.xlsx o .csv). El
            origen sale del campo Referencia; los pagos y el gasto se cruzan
            automáticamente.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="roas-file">
            <input
              id="roas-file"
              type="file"
              accept=".xlsx,.csv"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void handleFile(file);
                event.target.value = "";
              }}
            />
            <Button asChild variant="default" disabled={isLoading}>
              <span className="cursor-pointer">
                {isLoading ? (
                  <RefreshCwIcon className="animate-spin" aria-hidden="true" />
                ) : (
                  <UploadIcon aria-hidden="true" />
                )}
                {isLoading ? "Procesando" : "Subir reporte"}
              </span>
            </Button>
          </label>
        </div>
      </div>

      {error && (
        <Card className="border-destructive/40">
          <CardContent className="py-4 text-destructive text-sm">{error}</CardContent>
        </Card>
      )}

      {data?.warnings.length ? (
        <Card className="border-warn/40">
          <CardContent className="py-3 text-warn text-sm space-y-1">
            {data.warnings.map((warning) => (
              <p key={warning}>{warning}</p>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {isLoading && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
          <Skeleton className="h-24 w-full rounded-lg" />
          <Skeleton className="h-24 w-full rounded-lg" />
          <Skeleton className="h-24 w-full rounded-lg" />
          <Skeleton className="h-24 w-full rounded-lg" />
        </div>
      )}

      {data && !isLoading && (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <MetricCard label="Inversión" value={formatMoney(data.roas.totals.spend)} />
            <MetricCard label="Beneficio" value={formatMoney(data.roas.totals.revenue)} />
            <MetricCard
              label="ROAS pagado"
              value={formatRoas(data.roas.paid.roas)}
              accent
            />
            <MetricCard
              label="Cobertura referencia"
              value={formatPercent(data.ingestion.coverage * 100)}
              hint={`${data.ingestion.withReference}/${data.ingestion.patients} pacientes`}
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center justify-between gap-2">
                <span>ROAS por canal</span>
                <Badge variant="secondary">
                  {data.dateFrom} → {data.dateTo} · {fileName}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-muted-foreground text-xs border-b">
                      <th className="text-left font-medium py-2 pr-2">Canal</th>
                      <th className="text-right font-medium py-2 px-2">Inversión</th>
                      <th className="text-right font-medium py-2 px-2">Beneficio</th>
                      <th className="text-right font-medium py-2 px-2 hidden sm:table-cell">
                        Pac. / pagó
                      </th>
                      <th className="text-right font-medium py-2 px-2 hidden md:table-cell">
                        CAC
                      </th>
                      <th className="text-left font-medium py-2 pl-2 w-[28%]">ROAS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {channels.map((channel) => (
                      <tr key={channel.channel} className="border-b last:border-0">
                        <td className="py-2.5 pr-2 font-medium">{channel.label}</td>
                        <td className="py-2.5 px-2 text-right tabular-nums">
                          {channel.spend > 0 ? formatMoney(channel.spend) : "—"}
                        </td>
                        <td className="py-2.5 px-2 text-right tabular-nums">
                          {formatMoney(channel.revenue)}
                        </td>
                        <td className="py-2.5 px-2 text-right tabular-nums text-muted-foreground hidden sm:table-cell">
                          {channel.patients} / {channel.payingPatients}
                        </td>
                        <td className="py-2.5 px-2 text-right tabular-nums text-muted-foreground hidden md:table-cell">
                          {channel.cac === null ? "—" : formatMoney(channel.cac)}
                        </td>
                        <td className="py-2.5 pl-2">
                          {channel.roas === null ? (
                            <span className="text-muted-foreground text-xs">
                              sin inversión
                            </span>
                          ) : (
                            <div className="flex items-center gap-2">
                              <div className="h-2 rounded-full bg-muted flex-1 overflow-hidden">
                                <div
                                  className="h-full rounded-full bg-primary"
                                  style={{
                                    width: `${Math.max(
                                      4,
                                      ((channel.roas ?? 0) / maxRoas) * 100,
                                    )}%`,
                                  }}
                                />
                              </div>
                              <span className="tabular-nums font-medium w-12 text-right">
                                {formatRoas(channel.roas)}
                              </span>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-muted-foreground text-xs mt-3">
                "Google" mezcla Ads pagado y búsqueda orgánica: su ROAS es un
                techo, no Ads puro. Meta y TikTok son limpios.
              </p>
            </CardContent>
          </Card>
        </>
      )}

      {!data && !isLoading && !error && (
        <Card className="border-dashed">
          <CardContent className="py-10 text-center text-muted-foreground text-sm">
            <UploadIcon className="size-8 mx-auto mb-3 opacity-50" aria-hidden="true" />
            Sube el reporte de pacientes nuevos para ver el ROAS por canal.
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function MetricCard({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: boolean;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className={`text-3xl font-bold ${accent ? "text-primary" : ""}`}>
          {value}
        </p>
        {hint ? (
          <p className="text-muted-foreground text-xs mt-1">{hint}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}
