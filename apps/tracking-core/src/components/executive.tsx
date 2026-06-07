"use client";

import { useEffect, useMemo, useState } from "react";
import {
  GaugeIcon,
  InfoIcon,
  MegaphoneIcon,
  TargetIcon,
  TrendingDownIcon,
  TrendingUpIcon,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

interface ExecutiveBaseline {
  revenueTotal: number;
  paymentsTotal: number;
  uniquePatientsTotal: number;
  averagePaymentValue: number;
  month?: { label: string };
}

interface WindsorSource {
  source: string;
  spend?: number;
  clicks?: number;
  impressions?: number;
  campaigns?: number;
}

interface WindsorSummaryResponse {
  ok?: boolean;
  configured?: boolean;
  message?: string;
  totals?: { spend?: number; clicks?: number; impressions?: number };
  bySource?: WindsorSource[];
}

interface ExecutiveInputs {
  monthlyGoal: number;
  adSpendOverride: number | null;
  operatingCosts: number;
  roiManualEnabled: boolean;
  roiManual: number;
  funnelLeads: number;
  funnelScheduled: number;
  funnelAttended: number;
}

const STORAGE_KEY = "drdienteExecutiveInputs";

const DEFAULT_INPUTS: ExecutiveInputs = {
  monthlyGoal: 6000000,
  adSpendOverride: null,
  operatingCosts: 0,
  roiManualEnabled: false,
  roiManual: 100,
  funnelLeads: 0,
  funnelScheduled: 0,
  funnelAttended: 0,
};

function loadInputs(): ExecutiveInputs {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return DEFAULT_INPUTS;
    }
    return { ...DEFAULT_INPUTS, ...(JSON.parse(raw) as Partial<ExecutiveInputs>) };
  } catch {
    return DEFAULT_INPUTS;
  }
}

export function Executive({ data }: { data: ExecutiveBaseline | null }) {
  const [inputs, setInputs] = useState<ExecutiveInputs>(() => loadInputs());
  const [windsorSpend, setWindsorSpend] = useState<number | null>(null);
  const [windsorSources, setWindsorSources] = useState<WindsorSource[]>([]);
  const [windsorState, setWindsorState] = useState<
    "idle" | "loading" | "ready" | "unconfigured" | "error"
  >("idle");

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(inputs));
  }, [inputs]);

  // Best-effort pull of Windsor spend so the ROAS denominator and the channel
  // breakdown auto-fill. Falls back to manual entry if Windsor is not set up.
  useEffect(() => {
    const secret = window.localStorage.getItem("trackingSecret");
    if (!secret) {
      setWindsorState("idle");
      return;
    }

    let cancelled = false;
    setWindsorState("loading");

    fetch("/api/dev/windsor-marketing-summary", {
      headers: { "x-tracking-secret": secret },
    })
      .then((response) => response.json() as Promise<WindsorSummaryResponse>)
      .then((body) => {
        if (cancelled) {
          return;
        }
        if (body.configured === false) {
          setWindsorState("unconfigured");
          return;
        }
        setWindsorSpend(body.totals?.spend ?? 0);
        setWindsorSources(
          [...(body.bySource ?? [])]
            .sort((a, b) => (b.spend ?? 0) - (a.spend ?? 0))
            .slice(0, 8),
        );
        setWindsorState("ready");
      })
      .catch(() => {
        if (!cancelled) {
          setWindsorState("error");
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  function patch(partial: Partial<ExecutiveInputs>) {
    setInputs((prev) => ({ ...prev, ...partial }));
  }

  const m = useMemo(() => {
    const revenue = data?.revenueTotal ?? 0;
    const patients = data?.uniquePatientsTotal ?? 0;
    const adSpend = inputs.adSpendOverride ?? windsorSpend ?? 0;
    const totalCosts = adSpend + inputs.operatingCosts;
    const profit = revenue - totalCosts;
    const blendedRoas = adSpend > 0 ? revenue / adSpend : 0;
    const roiComputed = totalCosts > 0 ? (profit / totalCosts) * 100 : 0;
    const roiDisplayed = inputs.roiManualEnabled ? inputs.roiManual : roiComputed;

    const { dayOfMonth, daysInMonth } = monthProgress();
    const projectedEom =
      dayOfMonth > 0 ? (revenue / dayOfMonth) * daysInMonth : revenue;
    const goalPct = inputs.monthlyGoal > 0 ? (revenue / inputs.monthlyGoal) * 100 : 0;
    const projectedGoalPct =
      inputs.monthlyGoal > 0 ? (projectedEom / inputs.monthlyGoal) * 100 : 0;

    return {
      revenue,
      patients,
      adSpend,
      totalCosts,
      profit,
      blendedRoas,
      roiComputed,
      roiDisplayed,
      dayOfMonth,
      daysInMonth,
      projectedEom,
      goalPct,
      projectedGoalPct,
      onPace: projectedEom >= inputs.monthlyGoal,
    };
  }, [data, inputs, windsorSpend]);

  const usingWindsorSpend =
    inputs.adSpendOverride === null && windsorSpend !== null;

  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-wrap items-center gap-2">
        <h1 className="font-semibold text-3xl tracking-tight md:text-4xl">
          Resumen ejecutivo
        </h1>
        <Badge variant="secondary">
          {data?.month?.label ?? "Mes en curso"}
        </Badge>
      </section>

      {/* Estrella polar */}
      <Card className="overflow-hidden border-emerald-300/30 bg-[radial-gradient(circle_at_top_left,rgba(110,231,183,0.18),transparent_40%)]">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <TargetIcon aria-hidden="true" className="size-5 text-emerald-300" />
            Estrella polar - camino a la meta
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <BigStat
              label="Revenue del mes"
              value={formatMoney(m.revenue)}
              tone="good"
            />
            <EditableStat
              label="Meta mensual"
              onChange={(value) => patch({ monthlyGoal: value })}
              value={inputs.monthlyGoal}
            />
            <BigStat
              label="Proyeccion a fin de mes"
              sub={`dia ${m.dayOfMonth} de ${m.daysInMonth}`}
              tone={m.onPace ? "good" : "warn"}
              value={formatMoney(m.projectedEom)}
            />
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                {formatPercent(m.goalPct)} de la meta hoy
              </span>
              <span
                className={
                  m.onPace ? "text-emerald-300" : "text-amber-300"
                }
              >
                {m.onPace ? (
                  <TrendingUpIcon
                    aria-hidden="true"
                    className="inline size-3.5"
                  />
                ) : (
                  <TrendingDownIcon
                    aria-hidden="true"
                    className="inline size-3.5"
                  />
                )}{" "}
                ritmo proyectado: {formatPercent(m.projectedGoalPct)}
              </span>
            </div>
            <ProgressBar
              markerPct={Math.min(100, m.projectedGoalPct)}
              valuePct={Math.min(100, m.goalPct)}
            />
            <p className="mt-2 text-muted-foreground text-xs">
              {m.onPace
                ? `Al ritmo actual cierras la meta con ${formatMoney(m.projectedEom - inputs.monthlyGoal)} de margen.`
                : `Al ritmo actual quedas ${formatMoney(inputs.monthlyGoal - m.projectedEom)} por debajo de la meta.`}
            </p>
          </div>
        </CardContent>
      </Card>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        {/* ROAS & ROI */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <GaugeIcon aria-hidden="true" className="size-5" />
              Retorno del mes
              <Badge variant="secondary">ROI estimado</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <MetricTile
                label="ROAS blended"
                tone={m.blendedRoas >= 1 ? "good" : "bad"}
                value={formatRoas(m.blendedRoas)}
              />
              <MetricTile
                label="ROI"
                tone={m.roiDisplayed >= 0 ? "good" : "bad"}
                value={formatPercent(m.roiDisplayed)}
              />
              <MetricTile
                label="Profit"
                tone={m.profit >= 0 ? "good" : "bad"}
                value={formatMoney(m.profit)}
              />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field
                hint={
                  usingWindsorSpend
                    ? "Auto desde Windsor. Escribe para sobreescribir."
                    : "Inversion total en anuncios del mes."
                }
                label="Inversion en anuncios"
              >
                <MoneyInput
                  onChange={(value) => patch({ adSpendOverride: value })}
                  value={m.adSpend}
                />
                {usingWindsorSpend ? (
                  <button
                    className="mt-1 text-emerald-300 text-xs hover:underline"
                    onClick={() => patch({ adSpendOverride: null })}
                    type="button"
                  >
                    Usando Windsor ({formatMoney(windsorSpend ?? 0)}) - reset
                  </button>
                ) : null}
              </Field>
              <Field
                hint="Costos operativos estimados sin anuncios (nomina, renta, lab...)."
                label="Costos operativos (ESTIMADO)"
              >
                <MoneyInput
                  onChange={(value) => patch({ operatingCosts: value })}
                  value={inputs.operatingCosts}
                />
              </Field>
            </div>

            <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-background/40 p-3">
              <Button
                onClick={() => patch({ roiManualEnabled: !inputs.roiManualEnabled })}
                size="sm"
                variant={inputs.roiManualEnabled ? "default" : "outline"}
              >
                ROI manual {inputs.roiManualEnabled ? "ON" : "OFF"}
              </Button>
              {inputs.roiManualEnabled ? (
                <div className="flex items-center gap-2">
                  <div className="w-28">
                    <NumberInput
                      onChange={(value) => patch({ roiManual: value })}
                      step={5}
                      suffix="%"
                      value={inputs.roiManual}
                    />
                  </div>
                  <span className="text-muted-foreground text-xs">
                    sobre {formatPercent(m.roiComputed)} calculado
                  </span>
                </div>
              ) : (
                <span className="text-muted-foreground text-xs">
                  Calculado: revenue - (anuncios + costos) / inversion total.
                </span>
              )}
            </div>

            <p className="flex items-start gap-1.5 text-muted-foreground text-xs">
              <InfoIcon aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
              ROAS blended = todo el revenue / toda la inversion. El ROAS por
              campana (atribucion determinista) requiere el cruce por campaign_id
              en backend - siguiente capa.
            </p>
          </CardContent>
        </Card>

        {/* Gasto por canal */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MegaphoneIcon aria-hidden="true" className="size-5" />
              Gasto por canal
            </CardTitle>
          </CardHeader>
          <CardContent>
            {windsorState === "ready" && windsorSources.length > 0 ? (
              <div className="space-y-2">
                {windsorSources.map((source) => {
                  const spend = source.spend ?? 0;
                  const share =
                    windsorSpend && windsorSpend > 0
                      ? (spend / windsorSpend) * 100
                      : 0;
                  return (
                    <div
                      className="rounded-lg border bg-background/40 p-3"
                      key={source.source}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate font-medium capitalize">
                          {source.source}
                        </span>
                        <span className="font-semibold text-emerald-300">
                          {formatMoney(spend)}
                        </span>
                      </div>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-emerald-300"
                          style={{ width: `${Math.max(2, share)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
                <p className="pt-1 text-muted-foreground text-xs">
                  Total gasto: {formatMoney(windsorSpend ?? 0)} (Windsor)
                </p>
              </div>
            ) : (
              <ChannelEmptyState state={windsorState} />
            )}
          </CardContent>
        </Card>
      </section>

      {/* Embudo */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Embudo del mes
            <Badge variant="secondary">captura manual</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Funnel
            attended={inputs.funnelAttended}
            closed={m.patients}
            leads={inputs.funnelLeads}
            onChange={patch}
            revenue={m.revenue}
            scheduled={inputs.funnelScheduled}
          />
          <p className="mt-3 flex items-start gap-1.5 text-muted-foreground text-xs">
            <InfoIcon aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
            Cerraron y revenue salen de Dentalink (reales). Leads, agendados y
            asistieron son captura manual hasta conectar el conteo de Elevator y
            las citas de Dentalink.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function Funnel({
  attended,
  closed,
  leads,
  onChange,
  revenue,
  scheduled,
}: {
  attended: number;
  closed: number;
  leads: number;
  onChange: (partial: Partial<ExecutiveInputs>) => void;
  revenue: number;
  scheduled: number;
}) {
  const steps = [
    { key: "leads", label: "Leads", value: leads, editable: true },
    { key: "scheduled", label: "Agendados", value: scheduled, editable: true },
    { key: "attended", label: "Asistieron", value: attended, editable: true },
    { key: "closed", label: "Cerraron", value: closed, editable: false },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
      {steps.map((step, index) => {
        const previous = index > 0 ? steps[index - 1].value : 0;
        const rate =
          index > 0 && previous > 0 ? (step.value / previous) * 100 : null;
        return (
          <div
            className="rounded-xl border bg-background/40 p-3"
            key={step.key}
          >
            <p className="text-muted-foreground text-[10px] uppercase tracking-wider">
              {step.label}
            </p>
            {step.editable ? (
              <Input
                className="mt-1 h-8"
                inputMode="numeric"
                onChange={(event) =>
                  onChange({
                    [funnelField(step.key)]: parseNumber(event.target.value),
                  } as Partial<ExecutiveInputs>)
                }
                type="number"
                value={step.value}
              />
            ) : (
              <p className="mt-1 font-semibold text-2xl">{formatInteger(step.value)}</p>
            )}
            {rate !== null ? (
              <p className="mt-1 text-emerald-300 text-xs">
                {formatPercent(rate)} del paso previo
              </p>
            ) : (
              <p className="mt-1 text-muted-foreground text-xs">entrada</p>
            )}
          </div>
        );
      })}
      <div className="rounded-xl border border-emerald-300/30 bg-emerald-500/5 p-3">
        <p className="text-muted-foreground text-[10px] uppercase tracking-wider">
          Revenue
        </p>
        <p className="mt-1 font-semibold text-emerald-300 text-xl">
          {formatMoney(revenue)}
        </p>
        <p className="mt-1 text-muted-foreground text-xs">
          {closed > 0 ? `${formatMoney(revenue / closed)} / cierre` : "-"}
        </p>
      </div>
    </div>
  );
}

function funnelField(key: string): keyof ExecutiveInputs {
  if (key === "leads") return "funnelLeads";
  if (key === "scheduled") return "funnelScheduled";
  return "funnelAttended";
}

function ChannelEmptyState({
  state,
}: {
  state: "idle" | "loading" | "ready" | "unconfigured" | "error";
}) {
  const message =
    state === "loading"
      ? "Cargando gasto de Windsor..."
      : state === "unconfigured"
        ? "Windsor no esta configurado (WINDSOR_API_KEY). Captura la inversion manualmente arriba."
        : state === "error"
          ? "No se pudo leer Windsor. Usa la inversion manual."
          : "Pega el TRACKING_API_SECRET en Control para traer el gasto por canal.";

  return (
    <p className="py-8 text-center text-muted-foreground text-sm">{message}</p>
  );
}

function ProgressBar({
  markerPct,
  valuePct,
}: {
  markerPct: number;
  valuePct: number;
}) {
  return (
    <div className="relative h-3 overflow-hidden rounded-full bg-muted">
      <div
        className="h-full rounded-full bg-emerald-400"
        style={{ width: `${valuePct}%` }}
      />
      <div
        className="absolute top-0 h-full w-0.5 bg-sky-300"
        style={{ left: `${markerPct}%` }}
        title="Proyeccion a fin de mes"
      />
    </div>
  );
}

function BigStat({
  label,
  sub,
  tone,
  value,
}: {
  label: string;
  sub?: string;
  tone: "good" | "warn";
  value: string;
}) {
  return (
    <div className="rounded-2xl border bg-background/50 p-4 backdrop-blur">
      <p className="text-muted-foreground text-xs uppercase tracking-[0.18em]">
        {label}
      </p>
      <p
        className={`mt-2 font-semibold text-3xl tracking-tight ${
          tone === "good" ? "text-emerald-300" : "text-amber-300"
        }`}
      >
        {value}
      </p>
      {sub ? <p className="mt-1 text-muted-foreground text-xs">{sub}</p> : null}
    </div>
  );
}

function EditableStat({
  label,
  onChange,
  value,
}: {
  label: string;
  onChange: (value: number) => void;
  value: number;
}) {
  return (
    <div className="rounded-2xl border bg-background/50 p-4 backdrop-blur">
      <p className="text-muted-foreground text-xs uppercase tracking-[0.18em]">
        {label}
      </p>
      <div className="mt-2">
        <MoneyInput onChange={onChange} value={value} />
      </div>
    </div>
  );
}

function MetricTile({
  label,
  tone,
  value,
}: {
  label: string;
  tone: "good" | "bad";
  value: string;
}) {
  return (
    <div className="rounded-xl border bg-background/40 p-3">
      <p className="text-muted-foreground text-xs uppercase tracking-wider">
        {label}
      </p>
      <p
        className={`mt-1 font-semibold text-2xl tracking-tight ${
          tone === "good" ? "text-emerald-300" : "text-rose-300"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function Field({
  children,
  hint,
  label,
}: {
  children: React.ReactNode;
  hint?: string;
  label: string;
}) {
  return (
    <div className="space-y-1.5">
      <label className="font-medium text-sm">{label}</label>
      {children}
      {hint ? <p className="text-muted-foreground text-xs">{hint}</p> : null}
    </div>
  );
}

function MoneyInput({
  onChange,
  value,
}: {
  onChange: (value: number) => void;
  value: number;
}) {
  return (
    <div className="relative">
      <span className="-translate-y-1/2 absolute top-1/2 left-3 text-muted-foreground text-sm">
        $
      </span>
      <Input
        className="pl-6"
        inputMode="numeric"
        onChange={(event) => onChange(parseNumber(event.target.value))}
        type="number"
        value={Number.isFinite(value) ? value : 0}
      />
    </div>
  );
}

function NumberInput({
  onChange,
  step,
  suffix,
  value,
}: {
  onChange: (value: number) => void;
  step?: number;
  suffix?: string;
  value: number;
}) {
  return (
    <div className="relative">
      <Input
        inputMode="decimal"
        onChange={(event) => onChange(parseNumber(event.target.value))}
        step={step}
        type="number"
        value={Number.isFinite(value) ? value : 0}
      />
      {suffix ? (
        <span className="-translate-y-1/2 absolute top-1/2 right-3 text-muted-foreground text-sm">
          {suffix}
        </span>
      ) : null}
    </div>
  );
}

function monthProgress(): { dayOfMonth: number; daysInMonth: number } {
  const now = new Date();
  const dayOfMonth = now.getDate();
  const daysInMonth = new Date(
    now.getFullYear(),
    now.getMonth() + 1,
    0,
  ).getDate();
  return { dayOfMonth, daysInMonth };
}

function parseNumber(raw: string): number {
  const parsed = Number(raw.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  }).format(Number.isFinite(value) ? value : 0);
}

function formatInteger(value: number): string {
  return new Intl.NumberFormat("es-MX", {
    maximumFractionDigits: 0,
  }).format(Number.isFinite(value) ? value : 0);
}

function formatPercent(value: number): string {
  if (!Number.isFinite(value)) {
    return "--";
  }
  return `${new Intl.NumberFormat("es-MX", { maximumFractionDigits: 1 }).format(value)}%`;
}

function formatRoas(value: number): string {
  if (!Number.isFinite(value)) {
    return "--";
  }
  return `${new Intl.NumberFormat("es-MX", { maximumFractionDigits: 2 }).format(value)}x`;
}
