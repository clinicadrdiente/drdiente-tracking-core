import { useEffect, useState } from "react";
import { LoaderCircleIcon } from "lucide-react";
import { ReunionPanel } from "@/components/dashboard/reunion-panel";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

interface ReunionStatusLive {
  generatedAt: string;
  range: {
    days: number;
  };
  sources: {
    windsor: string;
    dentalink: string;
    supabase: string;
  };
  marketing: {
    impressions: number | null;
    clicks: number | null;
    spend: number | null;
  };
  leads: {
    total: number | null;
    byAccount: Record<string, number>;
  };
  appointments: {
    total: number | null;
    byBranch: Record<string, number>;
  };
  revenue: {
    total: number | null;
    payments: number | null;
  };
  funnel: {
    clickToLeadPct: number | null;
    leadToAppointmentPct: number | null;
    appointmentToPaymentPct: number | null;
    revenuePerLead: number | null;
    spendToRevenueRatio: number | null;
  };
  sac: {
    reportsCount: number | null;
    leadsContacted: number | null;
    followUpsSent: number | null;
    callsReceived: number | null;
    appointmentsBooked: number | null;
  };
  notes: string[];
}

export function ReunionPanelExperimental() {
  const [liveData, setLiveData] = useState<ReunionStatusLive | null>(null);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [isLoadingLive, setIsLoadingLive] = useState(false);

  useEffect(() => {
    async function loadLive() {
      setIsLoadingLive(true);
      setLiveError(null);
      try {
        const response = await fetch("/api/dev/reunion-status-live?rangeDays=7");
        const body = (await response.json()) as ReunionStatusLive | { error?: string };
        if (!response.ok || !("range" in body)) {
          throw new Error("error" in body ? body.error ?? "No se pudo cargar la fase live." : "No se pudo cargar la fase live.");
        }
        setLiveData(body);
      } catch (error) {
        setLiveError(error instanceof Error ? error.message : "Error desconocido.");
        setLiveData(null);
      } finally {
        setIsLoadingLive(false);
      }
    }

    void loadLive();
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader className="gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">Live</Badge>
            {liveData ? <Badge variant="secondary">Últimos {liveData.range.days} días</Badge> : null}
            {liveData ? <Badge variant="secondary">Windsor: {liveData.sources.windsor}</Badge> : null}
            {liveData ? <Badge variant="secondary">Dentalink: {liveData.sources.dentalink}</Badge> : null}
            {liveData ? <Badge variant="secondary">Supabase: {liveData.sources.supabase}</Badge> : null}
          </div>
          <div>
            <CardTitle className="text-xl">Resumen live</CardTitle>
            <CardDescription>
              Lectura ejecutiva rápida arriba; la reunión original sigue intacta abajo.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoadingLive ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <LoaderCircleIcon className="size-4 animate-spin" />
              Cargando fase live…
            </div>
          ) : null}

          {liveError ? (
            <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
              {liveError}
            </div>
          ) : null}

          {liveData ? (
            <>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <MetricCard label="Impresiones" value={formatInt(liveData.marketing.impressions)} />
                <MetricCard label="Leads" value={formatInt(liveData.leads.total)} />
                <MetricCard label="Agendamientos" value={formatInt(liveData.appointments.total)} />
                <MetricCard label="Revenue capturado" value={formatMoney(liveData.revenue.total)} />
              </div>

              <div className="grid gap-3 xl:grid-cols-3">
                <DetailCard
                  title="Embudo live"
                  lines={[
                    `Click → Lead: ${formatPct(liveData.funnel.clickToLeadPct)}`,
                    `Lead → Appointment: ${formatPct(liveData.funnel.leadToAppointmentPct)}`,
                    `Appointment → Payment: ${formatPct(liveData.funnel.appointmentToPaymentPct)}`,
                    `Revenue por lead: ${formatMoney(liveData.funnel.revenuePerLead)}`,
                    `ROAS bruto: ${formatRatio(liveData.funnel.spendToRevenueRatio)}`,
                  ]}
                />
                <DetailCard
                  title="Leads y citas"
                  lines={[
                    `Leads por account: ${formatRecord(liveData.leads.byAccount)}`,
                    `Citas por branch: ${formatRecord(liveData.appointments.byBranch)}`,
                    `Pagos detectados: ${formatInt(liveData.revenue.payments)}`,
                  ]}
                />
                <DetailCard
                  title="Recepción / SAC"
                  lines={[
                    `Reportes capturados: ${formatInt(liveData.sac.reportsCount)}`,
                    `Leads contactados: ${formatInt(liveData.sac.leadsContacted)}`,
                    `Follow-ups: ${formatInt(liveData.sac.followUpsSent)}`,
                    `Llamadas: ${formatInt(liveData.sac.callsReceived)}`,
                    `Citas apartadas: ${formatInt(liveData.sac.appointmentsBooked)}`,
                  ]}
                />
              </div>

              {liveData.notes.length > 0 ? (
                <div className="rounded-xl border bg-muted/30 p-4">
                  <p className="mb-2 text-sm font-medium">Notas de la agregación live</p>
                  <ul className="space-y-1 text-sm text-muted-foreground">
                    {liveData.notes.map((note) => (
                      <li key={note}>• {note}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </>
          ) : null}
        </CardContent>
      </Card>

      <ReunionPanel />

      <Separator />
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-background/70 p-4">
      <p className="text-sm font-medium text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-tight">{value}</p>
    </div>
  );
}

function DetailCard({ title, lines }: { title: string; lines: string[] }) {
  return (
    <div className="rounded-xl border bg-background/70 p-4">
      <p className="mb-3 text-sm font-medium">{title}</p>
      <ul className="space-y-2 text-sm text-muted-foreground">
        {lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </div>
  );
}

function formatInt(value: number | null) {
  if (value === null) return "—";
  return new Intl.NumberFormat("es-MX", { maximumFractionDigits: 0 }).format(value);
}

function formatMoney(value: number | null) {
  if (value === null) return "—";
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatPct(value: number | null) {
  if (value === null) return "—";
  return `${value.toFixed(1)}%`;
}

function formatRatio(value: number | null) {
  if (value === null) return "—";
  return `${value.toFixed(2)}x`;
}

function formatRecord(value: Record<string, number>) {
  const entries = Object.entries(value);
  if (entries.length === 0) return "—";
  return entries.map(([key, count]) => `${key}: ${formatInt(count)}`).join(" · ");
}
