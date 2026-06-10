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
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
import { ModuleFrame } from "./module-frame";
import type { MonthlyDashboard, PaymentBlock, DayBlock } from "@/types/dashboard";

const chartConfig = {
  revenue: {
    label: "Revenue",
    color: "var(--chart-1)",
  },
} satisfies ChartConfig;

export type ChartRow = {
  date: string;
  revenue: number;
};

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

function formatPercent(value: number) {
  return new Intl.NumberFormat("es-MX", {
    maximumFractionDigits: 1,
  }).format(value) + "%";
}

export function HeroMetric({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border bg-background/55 p-4 backdrop-blur">
      <p className="text-muted-foreground text-xs uppercase tracking-[0.2em]">
        {label}
      </p>
      <p className="mt-3 font-semibold text-3xl tracking-tight">{value}</p>
    </div>
  );
}

export function StatCard({
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

export function StatsGrid({ data }: { data: MonthlyDashboard | null }) {
  return (
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
  );
}

export function RevenueChart({
  chartRows,
  data,
}: {
  chartRows: ChartRow[];
  data: MonthlyDashboard | null;
}) {
  return (
    <Card className="md:col-span-2 lg:col-span-4">
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Revenue</CardTitle>
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
  );
}

export function PatientItem({ payment }: { payment: PaymentBlock }) {
  return (
    <Item size="sm">
      <ItemMedia variant="icon">
        <UserRoundIcon aria-hidden="true" />
      </ItemMedia>
      <ItemContent>
        <ItemTitle>{payment.patientName ?? "Paciente sin nombre"}</ItemTitle>
        <ItemDescription className="line-clamp-2">
          {payment.patientEmail ?? "Sin email"} · {payment.patientPhone ?? "Sin telefono"} ·{" "}
          {payment.patientReference ?? "Sin referencia"} ·{" "}
          {payment.treatmentName ?? `Tratamiento #${payment.treatmentId || "-"}`}
        </ItemDescription>
      </ItemContent>
      <ItemActions className="flex-col items-end gap-1">
        <span className="font-semibold text-brand">
          {formatMoney(payment.amount)}
        </span>
        <span className="text-muted-foreground text-xs">
          ID {payment.patientId || "-"}
        </span>
      </ItemActions>
    </Item>
  );
}

export function RecentPatientsCard({ payments }: { payments: PaymentBlock[] }) {
  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <CardTitle>Ultimos pacientes Dentalink</CardTitle>
      </CardHeader>
      <CardContent>
        <ItemGroup className="gap-2">
          {payments.length > 0 ? (
            payments.map((payment) => (
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
  );
}

export function TreatmentListCard({ data }: { data: MonthlyDashboard | null }) {
  const treatments = data?.treatmentShare ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tratamientos y revenue</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-3">
          {treatments.length > 0 ? (
            treatments.map((treatment) => (
              <div
                className="rounded-xl border bg-background/50 p-4"
                key={treatment.category}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="truncate font-medium">{treatment.category}</span>
                  <span className="font-semibold text-brand">
                    {formatMoney(treatment.revenue)}
                  </span>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-brand"
                    style={{ width: `${Math.max(3, treatment.share)}%` }}
                  />
                </div>
                <p className="mt-2 text-muted-foreground text-xs">
                  {formatInteger(treatment.share)}% del revenue clasificado
                </p>
              </div>
            ))
          ) : (
            <p className="py-8 text-center text-muted-foreground text-sm">
              Sin tratamientos cargados todavia.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function BranchRevenueCard({ data }: { data: MonthlyDashboard | null }) {
  const branches = data?.branchShare ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Revenue por sucursal</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-3">
          {branches.length > 0 ? (
            branches.map((branch) => (
              <div className="rounded-xl border bg-background/50 p-4" key={branch.branch}>
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <p className="font-semibold text-lg">{branch.branch}</p>
                    <p className="text-muted-foreground text-sm">
                      {formatInteger(branch.payments)} pagos ·{" "}
                      {formatInteger(branch.uniquePatients)} pacientes · promedio{" "}
                      {formatMoney(branch.averagePaymentValue)}
                    </p>
                  </div>
                  <div className="text-left md:text-right">
                    <p className="font-semibold text-brand text-xl">
                      {formatMoney(branch.revenue)}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {formatPercent(branch.share)} del revenue
                    </p>
                  </div>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-brand"
                    style={{ width: `${Math.max(3, branch.share)}%` }}
                  />
                </div>
                <div className="mt-4 grid grid-cols-1 gap-2">
                  {branch.topPatients.slice(0, 3).map((payment) => (
                    <div
                      className="flex items-center justify-between gap-3 rounded-lg bg-muted/30 px-3 py-2 text-sm"
                      key={`${branch.branch}-${payment.paymentId}`}
                    >
                      <span className="truncate">
                        {payment.patientName ?? "Paciente"} ·{" "}
                        <span className="text-muted-foreground">
                          {payment.patientReference ?? "Sin referencia"}
                        </span>
                      </span>
                      <span className="shrink-0 font-medium">
                        {formatMoney(payment.amount)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))
          ) : (
            <p className="py-8 text-center text-muted-foreground text-sm">
              Sin sucursales cargadas todavia.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function DayRevenueBlock({ day }: { day: DayBlock }) {
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
                <span className="font-semibold text-brand">
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

export function DayBlocksCard({ data }: { data: MonthlyDashboard | null }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Bloques del mes</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {(data?.days ?? []).map((day) => (
            <DayRevenueBlock key={day.date} day={day} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export function QuickPanel({ data }: { data: MonthlyDashboard | null }) {
  const topTreatments = data?.treatmentShare.slice(0, 5) ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Quick actions</CardTitle>
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
              <span className="font-medium text-brand">
                {formatMoney(treatment.revenue)}
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export function EmptyState({
  message,
  cta,
  isLoading,
  onClick,
}: {
  message: string;
  cta: string;
  isLoading: boolean;
  onClick: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed py-10 text-center">
      <p className="text-muted-foreground text-sm">{message}</p>
      <Button disabled={isLoading} onClick={onClick} variant="outline">
        <RefreshCwIcon aria-hidden="true" data-icon="inline-start" />
        {isLoading ? "Cargando" : cta}
      </Button>
    </div>
  );
}

export function AttributionPanel({
  chartRows,
  data,
}: {
  chartRows: ChartRow[];
  data: MonthlyDashboard | null;
}) {
  return (
    <ModuleFrame accent="attribution" title="Revenue y pacientes">
      <StatsGrid data={data} />
      <RevenueChart chartRows={chartRows} data={data} />
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <BranchRevenueCard data={data} />
        <TreatmentListCard data={data} />
      </section>
      <DayBlocksCard data={data} />
    </ModuleFrame>
  );
}
