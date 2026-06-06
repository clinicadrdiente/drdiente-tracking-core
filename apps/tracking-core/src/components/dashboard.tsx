"use client";

import { useEffect, useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, XAxis } from "recharts";
import {
  ActivityIcon,
  ArrowRightIcon,
  CalendarDaysIcon,
  DownloadIcon,
  RefreshCwIcon,
  StethoscopeIcon,
  UserRoundIcon,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
import { Badge } from "@/components/ui/badge";
import { Delta, DeltaIcon, DeltaValue } from "@/components/delta";

interface MonthlyDashboard {
  ok: boolean;
  month: {
    label: string;
    fromIso: string;
    toIso: string;
  };
  revenueTotal: number;
  paymentsTotal: number;
  uniquePatientsTotal: number;
  averagePaymentValue: number;
  days: DayBlock[];
  patients: PaymentBlock[];
  treatmentShare: Array<{
    category: string;
    revenue: number;
    share: number;
  }>;
}

interface DayBlock {
  day: number;
  date: string;
  label: string;
  revenue: number;
  payments: number;
  patients: PaymentBlock[];
}

interface PaymentBlock {
  paymentId: number;
  patientId: number;
  patientName: string | null;
  patientEmail: string | null;
  patientPhone: string | null;
  treatmentId: number;
  treatmentName: string | null;
  treatmentBudgetTotal: number;
  branch: string | null;
  paymentMethod: string | null;
  folio: string | null;
  reference: string | null;
  amount: number;
  createdAt: string | null;
}

const chartConfig = {
  revenue: {
    label: "Revenue",
    color: "var(--chart-1)",
  },
} satisfies ChartConfig;

export function Dashboard() {
  const [secret, setSecret] = useState(() =>
    window.localStorage.getItem("trackingSecret") ?? "",
  );
  const [data, setData] = useState<MonthlyDashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function loadDashboard(nextSecret = secret) {
    if (!nextSecret.trim()) {
      setError("Pega el TRACKING_API_SECRET para cargar datos reales.");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/dev/dentalink-monthly-dashboard", {
        headers: {
          "x-tracking-secret": nextSecret.trim(),
        },
      });
      const body = (await response.json()) as MonthlyDashboard | { error?: string };

      if (!response.ok || !("days" in body)) {
        throw new Error("error" in body ? body.error : "No se pudo cargar Dentalink.");
      }

      window.localStorage.setItem("trackingSecret", nextSecret.trim());
      setData(body);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Error desconocido.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    if (secret) {
      void loadDashboard(secret);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const chartRows = useMemo(
    () =>
      (data?.days ?? []).map((day) => ({
        date: day.date,
        revenue: day.revenue,
      })),
    [data],
  );
  const topPayments = data?.patients.slice(0, 8) ?? [];

  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="font-medium text-emerald-400 text-xs tracking-[0.32em] uppercase">
            Dentalink revenue room
          </p>
          <h1 className="text-balance font-semibold text-4xl tracking-tight md:text-6xl">
            DrDiente revenue dashboard.
          </h1>
          <p className="mt-2 text-muted-foreground">
            Pagos reales del mes, pacientes y conversiones listas para Elevator + Stape.
          </p>
        </div>
        <div className="flex w-full gap-2 md:w-auto">
          <Input
            className="min-w-0 md:w-80"
            onChange={(event) => setSecret(event.target.value)}
            placeholder="TRACKING_API_SECRET"
            type="password"
            value={secret}
          />
          <Button disabled={isLoading} onClick={() => void loadDashboard()}>
            <RefreshCwIcon aria-hidden="true" data-icon="inline-start" />
            {isLoading ? "Cargando" : "Actualizar"}
          </Button>
        </div>
      </section>

      {error ? (
        <Card className="border-destructive/40">
          <CardContent className="py-4 text-destructive text-sm">{error}</CardContent>
        </Card>
      ) : null}

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          delta={0}
          hint={data?.month?.label ?? "Mes actual"}
          label="Revenue total"
          value={formatMoney(data?.revenueTotal ?? 0)}
        />
        <StatCard
          delta={0}
          hint="Pagos Dentalink"
          label="Pagos"
          value={formatInteger(data?.paymentsTotal ?? 0)}
        />
        <StatCard
          delta={0}
          hint="Pacientes unicos"
          label="Pacientes"
          value={formatInteger(data?.uniquePatientsTotal ?? 0)}
        />
        <StatCard
          delta={0}
          hint="Promedio por pago"
          label="Ticket promedio"
          value={formatMoney(data?.averagePaymentValue ?? 0)}
        />
      </section>

      <Card className="md:col-span-2 lg:col-span-4">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Revenue</CardTitle>
            <CardDescription>
              Del dia 1 al ultimo dia del mes. Dias sin pago quedan en cero.
            </CardDescription>
          </div>
          <Badge variant="secondary">{data?.month?.label ?? "Sin datos"}</Badge>
        </CardHeader>
        <CardContent>
          <ChartContainer className="aspect-auto h-72 w-full" config={chartConfig}>
            <AreaChart
              accessibilityLayer
              data={chartRows}
              margin={{ left: 24, right: 8, top: 8, bottom: 0 }}
            >
              <defs>
                <linearGradient id="revenue-area" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-revenue)" stopOpacity={0.25} />
                  <stop offset="100%" stopColor="var(--color-revenue)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid horizontal={false} strokeDasharray="2 2" />
              <XAxis
                axisLine={false}
                dataKey="date"
                interval={2}
                minTickGap={20}
                tickFormatter={(value) => String(value).slice(8, 10)}
                tickLine={false}
                tickMargin={8}
              />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    className="min-w-36"
                    formatter={(value) => formatMoney(Number(value))}
                    indicator="line"
                  />
                }
              />
              <Area
                dataKey="revenue"
                dot={false}
                fill="url(#revenue-area)"
                stroke="var(--color-revenue)"
                strokeWidth={2}
                type="monotone"
              />
            </AreaChart>
          </ChartContainer>
        </CardContent>
        <CardFooter className="justify-between text-muted-foreground text-xs">
          <span>{formatInteger(chartRows.length)} bloques diarios</span>
          <span>Revenue: {formatMoney(data?.revenueTotal ?? 0)}</span>
        </CardFooter>
      </Card>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Ultimos pacientes Dentalink</CardTitle>
            <CardDescription>
              Pagos recientes del mes con email, telefono, tratamiento y monto.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ItemGroup className="gap-2">
              {topPayments.length > 0 ? (
                topPayments.map((payment) => (
                  <PatientItem key={payment.paymentId} payment={payment} />
                ))
              ) : (
                <p className="py-8 text-center text-muted-foreground text-sm">
                  Presiona Actualizar para cargar pacientes.
                </p>
              )}
            </ItemGroup>
          </CardContent>
        </Card>

        <QuickPanel data={data} />
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Bloques del mes</CardTitle>
          <CardDescription>
            Desde el dia 1 hasta el ultimo dia del mes, con pacientes por dia.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {(data?.days ?? []).map((day) => (
              <DayRevenueBlock key={day.date} day={day} />
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({
  label,
  value,
  delta,
  hint,
}: {
  label: string;
  value: string;
  delta: number;
  hint: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-normal text-muted-foreground text-xs">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="font-semibold text-3xl tabular-nums tracking-tight">{value}</p>
      </CardContent>
      <CardFooter className="gap-1.5 text-xs">
        <Delta value={delta} variant="default">
          <DeltaIcon />
          <DeltaValue />
        </Delta>
        <span className="text-muted-foreground">{hint}</span>
      </CardFooter>
    </Card>
  );
}

function PatientItem({ payment }: { payment: PaymentBlock }) {
  return (
    <Item size="sm">
      <ItemMedia variant="icon">
        <UserRoundIcon aria-hidden="true" />
      </ItemMedia>
      <ItemContent>
        <ItemTitle>{payment.patientName ?? "Paciente sin nombre"}</ItemTitle>
        <ItemDescription className="line-clamp-2">
          {payment.patientEmail ?? "Sin email"} · {payment.patientPhone ?? "Sin telefono"} ·{" "}
          {payment.treatmentName ?? `Tratamiento #${payment.treatmentId || "-"}`}
        </ItemDescription>
      </ItemContent>
      <ItemActions className="flex-col items-end gap-1">
        <span className="font-semibold text-emerald-400">
          {formatMoney(payment.amount)}
        </span>
        <span className="text-muted-foreground text-xs">
          ID {payment.patientId || "-"}
        </span>
      </ItemActions>
    </Item>
  );
}

function QuickPanel({ data }: { data: MonthlyDashboard | null }) {
  const topTreatments = data?.treatmentShare.slice(0, 5) ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Quick actions</CardTitle>
        <CardDescription>Acciones de operacion y exportacion.</CardDescription>
      </CardHeader>
      <CardContent>
        <ItemGroup className="gap-0">
          <Item size="sm">
            <ItemMedia variant="icon">
              <CalendarDaysIcon aria-hidden="true" />
            </ItemMedia>
            <ItemContent>
              <ItemTitle>Mes completo</ItemTitle>
              <ItemDescription>Dia 1 al ultimo dia del mes.</ItemDescription>
            </ItemContent>
            <ItemActions>
              <ArrowRightIcon aria-hidden="true" className="size-4 text-muted-foreground" />
            </ItemActions>
          </Item>
          <Item size="sm">
            <ItemMedia variant="icon">
              <DownloadIcon aria-hidden="true" />
            </ItemMedia>
            <ItemContent>
              <ItemTitle>Export listo</ItemTitle>
              <ItemDescription>Revenue y pacientes agrupados.</ItemDescription>
            </ItemContent>
          </Item>
          <Item size="sm">
            <ItemMedia variant="icon">
              <ActivityIcon aria-hidden="true" />
            </ItemMedia>
            <ItemContent>
              <ItemTitle>Stape payload</ItemTitle>
              <ItemDescription>Valor real, tratamiento e IDs internos.</ItemDescription>
            </ItemContent>
          </Item>
        </ItemGroup>
        <div className="mt-6 flex flex-col gap-2">
          <p className="text-muted-foreground text-xs uppercase tracking-[0.2em]">
            Tratamientos top
          </p>
          {topTreatments.map((treatment) => (
            <div className="flex items-center justify-between gap-3 text-sm" key={treatment.category}>
              <span className="truncate">{treatment.category}</span>
              <span className="font-medium text-emerald-400">
                {formatMoney(treatment.revenue)}
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function DayRevenueBlock({ day }: { day: DayBlock }) {
  return (
    <div className="rounded-xl border bg-card/80 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium text-muted-foreground text-xs uppercase tracking-[0.2em]">
            Dia {day.day}
          </p>
          <p className="mt-1 font-semibold text-xl">{formatMoney(day.revenue)}</p>
        </div>
        <Badge variant={day.payments > 0 ? "default" : "secondary"}>
          {day.payments} pagos
        </Badge>
      </div>
      <div className="mt-4 flex max-h-48 flex-col gap-2 overflow-auto pr-1">
        {day.patients.length > 0 ? (
          day.patients.map((patient) => (
            <div
              className="rounded-lg border bg-background/50 p-3 text-sm"
              key={patient.paymentId}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-medium">
                  {patient.patientName ?? "Paciente"}
                </span>
                <span className="font-semibold text-emerald-400">
                  {formatMoney(patient.amount)}
                </span>
              </div>
              <p className="mt-1 truncate text-muted-foreground text-xs">
                {patient.patientEmail ?? patient.patientPhone ?? "Sin contacto"} ·{" "}
                {patient.treatmentName ?? "Tratamiento"}
              </p>
            </div>
          ))
        ) : (
          <div className="flex items-center gap-2 rounded-lg border border-dashed p-3 text-muted-foreground text-sm">
            <StethoscopeIcon aria-hidden="true" className="size-4" />
            Sin pagos registrados
          </div>
        )}
      </div>
    </div>
  );
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatInteger(value: number) {
  return new Intl.NumberFormat("es-MX", {
    maximumFractionDigits: 0,
  }).format(value);
}
