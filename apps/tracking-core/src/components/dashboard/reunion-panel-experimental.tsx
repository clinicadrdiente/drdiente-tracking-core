import { useEffect, useState } from "react";
import { FlaskConicalIcon, GitCompareArrowsIcon, Layers3Icon, LoaderCircleIcon, RocketIcon } from "lucide-react";
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

const phases = [
  {
    id: "fase-1",
    title: "Fase 1 · Nutrido mínimo viable",
    icon: <Layers3Icon className="size-4" />,
    goal: "Conectar la reunión a una capa live sin tocar la reunión vieja.",
    bullets: [
      "Marketing summary: impresiones, clics y spend por plataforma.",
      "Leads reales desde Elevator/Supabase: total, por account y por source.",
      "Agendamientos reales desde appointments: total y cortes operativos.",
      "Revenue/pagos desde Dentalink: total, por branch y por periodo.",
      "Funnel KPIs: click→lead, lead→appointment, appointment→payment.",
      "Operación SAC: contacto, follow-ups, llamadas, promo WhatsApp y notas.",
    ],
  },
  {
    id: "fase-2",
    title: "Fase 2 · Enriquecer las secciones actuales",
    icon: <GitCompareArrowsIcon className="size-4" />,
    goal: "Mantener el diseño ejecutivo actual, pero cambiando el motor de datos.",
    bullets: [
      "Reemplazar el corazón de status-data.json por agregación live.",
      "Mapear funnel, plataformas, citas, caja y atribución a las nuevas fuentes.",
      "Comparar legacy vs live dentro de la misma operación para validar equivalencia.",
    ],
  },
  {
    id: "fase-3",
    title: "Fase 3 · Nuevos bloques de decisión",
    icon: <RocketIcon className="size-4" />,
    goal: "Agregar lo que hoy falta para operar mejor marketing + recepción + caja.",
    bullets: [
      "Lead Quality: completitud, UTM/source, duplicados, match/no match.",
      "Lead → Cita: tiempos, conversión por source/account y pendientes.",
      "Recepción / SAC: seguimiento operativo, cuellos de botella y observaciones.",
    ],
  },
];

export function ReunionPanelExperimental({ secret }: { secret: string }) {
  const [liveData, setLiveData] = useState<ReunionStatusLive | null>(null);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [isLoadingLive, setIsLoadingLive] = useState(false);

  useEffect(() => {
    async function loadLive() {
      if (!secret.trim()) {
        setLiveError("Pega el TRACKING_API_SECRET para cargar la Fase 1 live.");
        setLiveData(null);
        return;
      }

      setIsLoadingLive(true);
      setLiveError(null);
      try {
        const response = await fetch("/api/dev/reunion-status-live?rangeDays=7", {
          headers: {
            "x-tracking-secret": secret.trim(),
          },
        });
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
  }, [secret]);

  return (
    <div className="flex flex-col gap-6">
      <Card className="border-brand/30 bg-[radial-gradient(circle_at_top_left,rgba(24,186,251,0.12),transparent_36%),linear-gradient(135deg,rgba(24,88,251,0.08),transparent_48%)]">
        <CardHeader className="gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="bg-brand/15 text-brand hover:bg-brand/15">Experimental</Badge>
            <Badge variant="outline">No reemplaza lo actual</Badge>
            <Badge variant="secondary">Ruta de debate</Badge>
          </div>
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-2xl">
              <FlaskConicalIcon className="size-5" />
              Reunión de Status · Laboratorio
            </CardTitle>
            <CardDescription>
              Esta vista duplica la reunión actual dentro de Operar para comparar sin perder lo viejo.
              Aquí vamos a debatir si la evolución live realmente nos sirve antes de sustituir la versión legacy.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-xl border bg-background/70 p-4">
              <p className="text-sm font-medium">Base actual</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Copia directa de la reunión legacy para preservar lectura, layout y narrativa.
              </p>
            </div>
            <div className="rounded-xl border bg-background/70 p-4">
              <p className="text-sm font-medium">Objetivo del laboratorio</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Evaluar una transición progresiva hacia data viva de Dentalink + Elevator + SAC.
              </p>
            </div>
            <div className="rounded-xl border bg-background/70 p-4">
              <p className="text-sm font-medium">Criterio de decisión</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Si la versión nueva sirve, sustituye a la vieja. Si no, la vieja sigue intacta.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">Fase 1 live</Badge>
            {liveData ? <Badge variant="secondary">Últimos {liveData.range.days} días</Badge> : null}
            {liveData ? <Badge variant="secondary">Windsor: {liveData.sources.windsor}</Badge> : null}
            {liveData ? <Badge variant="secondary">Dentalink: {liveData.sources.dentalink}</Badge> : null}
            {liveData ? <Badge variant="secondary">Supabase: {liveData.sources.supabase}</Badge> : null}
          </div>
          <div>
            <CardTitle className="text-xl">Lectura live mínima</CardTitle>
            <CardDescription>
              Esta capa nueva no reemplaza el panel legacy todavía. Solo nos deja debatir con data viva al lado.
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

      <section className="grid gap-4 xl:grid-cols-3">
        {phases.map((phase) => (
          <Card key={phase.id} className="h-full">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                {phase.icon}
                {phase.title}
              </CardTitle>
              <CardDescription>{phase.goal}</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm text-muted-foreground">
                {phase.bullets.map((bullet) => (
                  <li key={bullet} className="flex gap-2">
                    <span className="mt-1 size-1.5 shrink-0 rounded-full bg-brand" />
                    <span>{bullet}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ))}
      </section>
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
