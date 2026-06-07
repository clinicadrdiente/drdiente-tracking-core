"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  PolarAngleAxis,
  RadialBar,
  RadialBarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
} from "recharts";
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
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

interface BranchShare {
  branch: string;
  revenue: number;
  payments: number;
  uniquePatients: number;
  averagePaymentValue: number;
  topPatients?: Array<{
    paymentId: number;
    patientName: string | null;
    patientReference: string | null;
    amount: number;
  }>;
}

interface ExecutiveBaseline {
  revenueTotal: number;
  paymentsTotal: number;
  uniquePatientsTotal: number;
  averagePaymentValue: number;
  month?: { label: string };
  branchShare?: BranchShare[];
}

interface WindsorSource {
  source: string;
  spend?: number;
}

interface WindsorSummaryResponse {
  configured?: boolean;
  totals?: { spend?: number };
  bySource?: WindsorSource[];
}

// Logical branches. Dentalink branch strings are matched by keyword, so several
// raw labels can roll up into one branch. Goals are editable and persisted.
const BRANCH_DEFS = [
  {
    id: "polanco",
    label: "Clinica Dr Diente",
    sublabel: "Polanco",
    emoji: "🦷",
    color: "#34d399",
    defaultGoal: 3_500_000,
    matchers: ["diente", "polanco"],
  },
  {
    id: "roma",
    label: "Carlos Ariza Torcat",
    sublabel: "Roma Norte",
    emoji: "✨",
    color: "#a78bfa",
    defaultGoal: 1_500_000,
    matchers: ["ariza", "torcat", "roma"],
  },
] as const;

type BranchId = (typeof BRANCH_DEFS)[number]["id"];
type Scope = "global" | BranchId;

interface ExecutiveInputs {
  goals: Record<string, number>;
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
  goals: { polanco: 3_500_000, roma: 1_500_000 },
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
    const parsed = JSON.parse(raw) as Partial<ExecutiveInputs>;
    return {
      ...DEFAULT_INPUTS,
      ...parsed,
      goals: { ...DEFAULT_INPUTS.goals, ...(parsed.goals ?? {}) },
    };
  } catch {
    return DEFAULT_INPUTS;
  }
}

interface BranchComputed {
  id: BranchId;
  label: string;
  sublabel: string;
  emoji: string;
  color: string;
  goal: number;
  revenue: number;
  patients: number;
  payments: number;
  avgTicket: number;
  topPatients: NonNullable<BranchShare["topPatients"]>;
}

export function Executive({ data }: { data: ExecutiveBaseline | null }) {
  const [inputs, setInputs] = useState<ExecutiveInputs>(() => loadInputs());
  const [scope, setScope] = useState<Scope>("global");
  const [windsorSpend, setWindsorSpend] = useState<number | null>(null);
  const [windsorSources, setWindsorSources] = useState<WindsorSource[]>([]);
  const [windsorState, setWindsorState] = useState<
    "idle" | "loading" | "ready" | "unconfigured" | "error"
  >("idle");

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(inputs));
  }, [inputs]);

  useEffect(() => {
    const secret = window.localStorage.getItem("trackingSecret");
    if (!secret) {
      return;
    }
    let cancelled = false;
    setWindsorState("loading");
    fetch("/api/dev/windsor-marketing-summary", {
      headers: { "x-tracking-secret": secret },
    })
      .then((response) => response.json() as Promise<WindsorSummaryResponse>)
      .then((body) => {
        if (cancelled) return;
        if (body.configured === false) {
          setWindsorState("unconfigured");
          return;
        }
        setWindsorSpend(body.totals?.spend ?? 0);
        setWindsorSources(
          [...(body.bySource ?? [])]
            .sort((a, b) => (b.spend ?? 0) - (a.spend ?? 0))
            .slice(0, 6),
        );
        setWindsorState("ready");
      })
      .catch(() => {
        if (!cancelled) setWindsorState("error");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function patch(partial: Partial<ExecutiveInputs>) {
    setInputs((prev) => ({ ...prev, ...partial }));
  }

  function setGoal(branchId: string, goal: number) {
    setInputs((prev) => ({ ...prev, goals: { ...prev.goals, [branchId]: goal } }));
  }

  const branches: BranchComputed[] = useMemo(() => {
    const shares = data?.branchShare ?? [];
    return BRANCH_DEFS.map((def) => {
      const matched = shares.filter((share) =>
        def.matchers.some((matcher) =>
          (share.branch ?? "").toLowerCase().includes(matcher),
        ),
      );
      const revenue = matched.reduce((sum, share) => sum + share.revenue, 0);
      const payments = matched.reduce((sum, share) => sum + share.payments, 0);
      const patients = matched.reduce(
        (sum, share) => sum + share.uniquePatients,
        0,
      );
      const topPatients = matched
        .flatMap((share) => share.topPatients ?? [])
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 4);
      return {
        id: def.id,
        label: def.label,
        sublabel: def.sublabel,
        emoji: def.emoji,
        color: def.color,
        goal: inputs.goals[def.id] ?? def.defaultGoal,
        revenue,
        patients,
        payments,
        avgTicket: payments > 0 ? revenue / payments : 0,
        topPatients,
      };
    });
  }, [data, inputs.goals]);

  const globalGoal = branches.reduce((sum, branch) => sum + branch.goal, 0);
  const globalRevenue = data?.revenueTotal ?? 0;

  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-semibold text-3xl tracking-tight md:text-4xl">
            Resumen ejecutivo
          </h1>
          <Badge variant="secondary">{data?.month?.label ?? "Mes en curso"}</Badge>
        </div>
        <ScopeTabs branches={branches} onChange={setScope} scope={scope} />
      </section>

      {scope === "global" ? (
        <GlobalView
          branches={branches}
          funnelClosed={data?.uniquePatientsTotal ?? 0}
          inputs={inputs}
          globalGoal={globalGoal}
          globalRevenue={globalRevenue}
          onGoBranch={setScope}
          patch={patch}
          windsorSources={windsorSources}
          windsorSpend={windsorSpend}
          windsorState={windsorState}
        />
      ) : (
        <BranchView
          branch={branches.find((branch) => branch.id === scope)!}
          onGoal={setGoal}
        />
      )}
    </div>
  );
}

function ScopeTabs({
  branches,
  onChange,
  scope,
}: {
  branches: BranchComputed[];
  onChange: (scope: Scope) => void;
  scope: Scope;
}) {
  const tabs: Array<{ id: Scope; label: string }> = [
    { id: "global", label: "🌎 Global" },
    ...branches.map((branch) => ({
      id: branch.id as Scope,
      label: `${branch.emoji} ${branch.sublabel}`,
    })),
  ];
  return (
    <div className="flex flex-wrap gap-1 rounded-xl border bg-background/50 p-1">
      {tabs.map((tab) => (
        <button
          className={`rounded-lg px-3 py-1.5 font-medium text-sm transition ${
            scope === tab.id
              ? "bg-emerald-500/20 text-emerald-200"
              : "text-muted-foreground hover:text-foreground"
          }`}
          key={tab.id}
          onClick={() => onChange(tab.id)}
          type="button"
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

function GlobalView({
  branches,
  funnelClosed,
  globalGoal,
  globalRevenue,
  inputs,
  onGoBranch,
  patch,
  windsorSources,
  windsorSpend,
  windsorState,
}: {
  branches: BranchComputed[];
  funnelClosed: number;
  globalGoal: number;
  globalRevenue: number;
  inputs: ExecutiveInputs;
  onGoBranch: (scope: Scope) => void;
  patch: (partial: Partial<ExecutiveInputs>) => void;
  windsorSources: WindsorSource[];
  windsorSpend: number | null;
  windsorState: "idle" | "loading" | "ready" | "unconfigured" | "error";
}) {
  const pace = projectEndOfMonth(globalRevenue);
  const tone = paceTone(pace.projected, globalGoal);
  const goalPct = pct(globalRevenue, globalGoal);

  const compareData = branches.map((branch) => ({
    name: branch.sublabel,
    Logrado: Math.round(branch.revenue),
    Meta: Math.round(branch.goal),
    color: branch.color,
  }));

  return (
    <div className="flex flex-col gap-5">
      {/* Estrella polar global */}
      <Card className="overflow-hidden border-emerald-300/30 bg-[radial-gradient(circle_at_top,rgba(110,231,183,0.16),transparent_45%)]">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <TargetIcon aria-hidden="true" className="size-5 text-emerald-300" />
            Estrella polar - toda la clinica
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 items-center gap-4 lg:grid-cols-[280px_1fr]">
          <GoalGauge
            caption={`${formatPercent(goalPct)} de la meta`}
            pct={goalPct}
            tone={tone}
          />
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <PlainStat label="Llevamos" tone="good" value={formatMoney(globalRevenue)} />
              <PlainStat label="Meta del mes" value={formatMoney(globalGoal)} />
              <PlainStat
                label="Si seguimos asi, cerramos en"
                tone={tone}
                value={formatMoney(pace.projected)}
              />
            </div>
            <PlainStatusLine
              goal={globalGoal}
              projected={pace.projected}
              revenue={globalRevenue}
              tone={tone}
            />
          </div>
        </CardContent>
      </Card>

      {/* Tarjetas de sucursal */}
      <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {branches.map((branch) => (
          <BranchMiniCard
            branch={branch}
            key={branch.id}
            onOpen={() => onGoBranch(branch.id)}
          />
        ))}
      </section>

      {/* Comparativa visual */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Logrado vs meta por sucursal</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64 w-full">
              <ResponsiveContainer height="100%" width="100%">
                <BarChart data={compareData} margin={{ left: 8, right: 8, top: 8 }}>
                  <XAxis
                    axisLine={false}
                    dataKey="name"
                    tickLine={false}
                    tick={{ fill: "#94a3b8", fontSize: 12 }}
                  />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    cursor={{ fill: "rgba(255,255,255,0.04)" }}
                    formatter={(value) => formatMoney(Number(value))}
                  />
                  <Bar dataKey="Meta" fill="rgba(255,255,255,0.14)" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="Logrado" radius={[6, 6, 0, 0]}>
                    {compareData.map((entry) => (
                      <Cell fill={entry.color} key={entry.name} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>De donde viene el dinero</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              <div className="h-44 w-44 shrink-0">
                <ResponsiveContainer height="100%" width="100%">
                  <PieChart>
                    <Pie
                      data={branches.map((branch) => ({
                        name: branch.sublabel,
                        value: Math.round(branch.revenue),
                      }))}
                      dataKey="value"
                      innerRadius={48}
                      outerRadius={80}
                      paddingAngle={2}
                      stroke="none"
                    >
                      {branches.map((branch) => (
                        <Cell fill={branch.color} key={branch.id} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={tooltipStyle}
                      formatter={(value) => formatMoney(Number(value))}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-2">
                {branches.map((branch) => {
                  const share = pct(branch.revenue, globalRevenue);
                  return (
                    <div className="flex items-center gap-2 text-sm" key={branch.id}>
                      <span
                        className="size-3 rounded-full"
                        style={{ backgroundColor: branch.color }}
                      />
                      <span className="text-muted-foreground">{branch.sublabel}</span>
                      <span className="font-semibold">{formatPercent(share)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Retorno (ROAS/ROI) */}
      <ReturnCard
        inputs={inputs}
        patch={patch}
        revenue={globalRevenue}
        windsorSpend={windsorSpend}
      />

      {/* Gasto por canal + Embudo */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChannelCard
          sources={windsorSources}
          state={windsorState}
          totalSpend={windsorSpend}
        />
        <FunnelCard
          attended={inputs.funnelAttended}
          closed={funnelClosed}
          leads={inputs.funnelLeads}
          patch={patch}
          revenue={globalRevenue}
          scheduled={inputs.funnelScheduled}
        />
      </section>
    </div>
  );
}

function BranchView({
  branch,
  onGoal,
}: {
  branch: BranchComputed;
  onGoal: (branchId: string, goal: number) => void;
}) {
  const pace = projectEndOfMonth(branch.revenue);
  const tone = paceTone(pace.projected, branch.goal);
  const goalPct = pct(branch.revenue, branch.goal);

  return (
    <div className="flex flex-col gap-5">
      <Card
        className="overflow-hidden border-emerald-300/30"
        style={{
          background: `radial-gradient(circle at top, ${branch.color}22, transparent 45%)`,
        }}
      >
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <span className="text-2xl">{branch.emoji}</span>
            {branch.label}
            <Badge variant="secondary">{branch.sublabel}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 items-center gap-4 lg:grid-cols-[280px_1fr]">
          <GoalGauge
            caption={`${formatPercent(goalPct)} de la meta`}
            color={branch.color}
            pct={goalPct}
            tone={tone}
          />
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <PlainStat label="Llevamos" tone="good" value={formatMoney(branch.revenue)} />
              <div className="rounded-2xl border bg-background/50 p-4">
                <p className="text-muted-foreground text-xs uppercase tracking-[0.18em]">
                  Meta del mes
                </p>
                <div className="mt-2">
                  <MoneyInput
                    onChange={(value) => onGoal(branch.id, value)}
                    value={branch.goal}
                  />
                </div>
              </div>
              <PlainStat
                label="Si seguimos asi, cerramos en"
                tone={tone}
                value={formatMoney(pace.projected)}
              />
            </div>
            <PlainStatusLine
              goal={branch.goal}
              projected={pace.projected}
              revenue={branch.revenue}
              tone={tone}
            />
          </div>
        </CardContent>
      </Card>

      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <PlainStat label="Pacientes" value={formatInteger(branch.patients)} />
        <PlainStat label="Pagos" value={formatInteger(branch.payments)} />
        <PlainStat label="Ticket promedio" value={formatMoney(branch.avgTicket)} />
        <PlainStat
          label="Falta para la meta"
          tone={branch.revenue >= branch.goal ? "good" : "warn"}
          value={formatMoney(Math.max(0, branch.goal - branch.revenue))}
        />
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Pacientes mas grandes del mes</CardTitle>
        </CardHeader>
        <CardContent>
          {branch.topPatients.length > 0 ? (
            <div className="space-y-2">
              {branch.topPatients.map((patient) => (
                <div
                  className="flex items-center justify-between gap-3 rounded-lg border bg-background/40 px-3 py-2"
                  key={patient.paymentId}
                >
                  <span className="truncate">
                    {patient.patientName ?? "Paciente"}
                  </span>
                  <span className="font-semibold text-emerald-300">
                    {formatMoney(patient.amount)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="py-8 text-center text-muted-foreground text-sm">
              Carga los datos de Dentalink en Control para ver los pacientes.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function BranchMiniCard({
  branch,
  onOpen,
}: {
  branch: BranchComputed;
  onOpen: () => void;
}) {
  const goalPct = pct(branch.revenue, branch.goal);
  const tone = paceTone(branch.revenue, branch.goal * monthFraction());
  return (
    <Card className="transition hover:border-emerald-300/40">
      <CardContent className="flex items-center gap-4 py-5">
        <div className="h-28 w-28 shrink-0">
          <GoalGauge
            caption={formatPercent(goalPct)}
            color={branch.color}
            compact
            pct={goalPct}
            tone={tone}
          />
        </div>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 font-semibold text-lg">
            <span>{branch.emoji}</span>
            {branch.sublabel}
          </p>
          <p className="text-muted-foreground text-sm">{branch.label}</p>
          <p className="mt-2 font-semibold text-2xl text-emerald-300">
            {formatMoney(branch.revenue)}
          </p>
          <p className="text-muted-foreground text-xs">
            de {formatMoney(branch.goal)} ·{" "}
            {branch.revenue >= branch.goal
              ? "meta cumplida 🎉"
              : `faltan ${formatMoney(branch.goal - branch.revenue)}`}
          </p>
          <Button
            className="mt-3"
            onClick={onOpen}
            size="sm"
            variant="outline"
          >
            Ver detalle
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function ReturnCard({
  inputs,
  patch,
  revenue,
  windsorSpend,
}: {
  inputs: ExecutiveInputs;
  patch: (partial: Partial<ExecutiveInputs>) => void;
  revenue: number;
  windsorSpend: number | null;
}) {
  const adSpend = inputs.adSpendOverride ?? windsorSpend ?? 0;
  const totalCosts = adSpend + inputs.operatingCosts;
  const profit = revenue - totalCosts;
  const roas = adSpend > 0 ? revenue / adSpend : 0;
  const roiComputed = totalCosts > 0 ? (profit / totalCosts) * 100 : 0;
  const roi = inputs.roiManualEnabled ? inputs.roiManual : roiComputed;
  const usingWindsor = inputs.adSpendOverride === null && windsorSpend !== null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <GaugeIcon aria-hidden="true" className="size-5" />
          Cuanto gano la inversion
          <Badge variant="secondary">ROI estimado</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <MetricTile
            hint="Por cada $1 invertido"
            label="ROAS"
            tone={roas >= 1 ? "good" : "bad"}
            value={`${formatRoas(roas)}`}
          />
          <MetricTile label="ROI" tone={roi >= 0 ? "good" : "bad"} value={formatPercent(roi)} />
          <MetricTile
            label="Ganancia"
            tone={profit >= 0 ? "good" : "bad"}
            value={formatMoney(profit)}
          />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field
            hint={usingWindsor ? "Auto desde Windsor. Escribe para cambiar." : "Inversion total en anuncios."}
            label="Inversion en anuncios"
          >
            <MoneyInput
              onChange={(value) => patch({ adSpendOverride: value })}
              value={adSpend}
            />
            {usingWindsor ? (
              <button
                className="mt-1 text-emerald-300 text-xs hover:underline"
                onClick={() => patch({ adSpendOverride: null })}
                type="button"
              >
                Usando Windsor ({formatMoney(windsorSpend ?? 0)})
              </button>
            ) : null}
          </Field>
          <Field
            hint="Nomina, renta, lab... (estimado)."
            label="Otros gastos (ESTIMADO)"
          >
            <MoneyInput
              onChange={(value) => patch({ operatingCosts: value })}
              value={inputs.operatingCosts}
            />
          </Field>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            onClick={() => patch({ roiManualEnabled: !inputs.roiManualEnabled })}
            size="sm"
            variant={inputs.roiManualEnabled ? "default" : "outline"}
          >
            ROI manual {inputs.roiManualEnabled ? "ON" : "OFF"}
          </Button>
          {inputs.roiManualEnabled ? (
            <div className="w-28">
              <NumberInput
                onChange={(value) => patch({ roiManual: value })}
                step={5}
                suffix="%"
                value={inputs.roiManual}
              />
            </div>
          ) : null}
        </div>
        <p className="flex items-start gap-1.5 text-muted-foreground text-xs">
          <InfoIcon aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
          ROAS general = todo el revenue / toda la inversion. El detalle por
          campana exacto es la siguiente capa de backend.
        </p>
      </CardContent>
    </Card>
  );
}

function ChannelCard({
  sources,
  state,
  totalSpend,
}: {
  sources: WindsorSource[];
  state: "idle" | "loading" | "ready" | "unconfigured" | "error";
  totalSpend: number | null;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MegaphoneIcon aria-hidden="true" className="size-5" />
          Gasto por canal
        </CardTitle>
      </CardHeader>
      <CardContent>
        {state === "ready" && sources.length > 0 ? (
          <div className="space-y-2">
            {sources.map((source) => {
              const spend = source.spend ?? 0;
              const share = totalSpend && totalSpend > 0 ? (spend / totalSpend) * 100 : 0;
              return (
                <div className="rounded-lg border bg-background/40 p-3" key={source.source}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-medium capitalize">{source.source}</span>
                    <span className="font-semibold text-emerald-300">{formatMoney(spend)}</span>
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
          </div>
        ) : (
          <p className="py-8 text-center text-muted-foreground text-sm">
            {state === "loading"
              ? "Cargando gasto..."
              : state === "unconfigured"
                ? "Windsor no configurado. Captura la inversion en la tarjeta de arriba."
                : "Pega el TRACKING_API_SECRET en Control para ver el gasto por canal."}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function FunnelCard({
  attended,
  closed,
  leads,
  patch,
  revenue,
  scheduled,
}: {
  attended: number;
  closed: number;
  leads: number;
  patch: (partial: Partial<ExecutiveInputs>) => void;
  revenue: number;
  scheduled: number;
}) {
  const steps = [
    { key: "funnelLeads", label: "Leads", value: leads, editable: true },
    { key: "funnelScheduled", label: "Agendados", value: scheduled, editable: true },
    { key: "funnelAttended", label: "Asistieron", value: attended, editable: true },
    { key: "closed", label: "Cerraron", value: closed, editable: false },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Embudo del mes
          <Badge variant="secondary">captura manual</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {steps.map((step, index) => {
          const previous = index > 0 ? steps[index - 1].value : 0;
          const rate = index > 0 && previous > 0 ? (step.value / previous) * 100 : null;
          return (
            <div className="flex items-center gap-3" key={step.key}>
              <span className="w-24 text-muted-foreground text-sm">{step.label}</span>
              {step.editable ? (
                <Input
                  className="h-8 w-28"
                  inputMode="numeric"
                  onChange={(event) =>
                    patch({
                      [step.key]: parseNumber(event.target.value),
                    } as Partial<ExecutiveInputs>)
                  }
                  type="number"
                  value={step.value}
                />
              ) : (
                <span className="w-28 font-semibold text-lg">{formatInteger(step.value)}</span>
              )}
              {rate !== null ? (
                <span className="text-emerald-300 text-xs">{formatPercent(rate)}</span>
              ) : null}
            </div>
          );
        })}
        <div className="mt-1 flex items-center justify-between rounded-lg border border-emerald-300/30 bg-emerald-500/5 px-3 py-2">
          <span className="font-medium">Revenue</span>
          <span className="font-semibold text-emerald-300">{formatMoney(revenue)}</span>
        </div>
      </CardContent>
    </Card>
  );
}

function GoalGauge({
  caption,
  color = "#34d399",
  compact,
  pct: value,
  tone,
}: {
  caption: string;
  color?: string;
  compact?: boolean;
  pct: number;
  tone: "good" | "warn" | "bad";
}) {
  const clamped = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
  const toneColor =
    tone === "good" ? color : tone === "warn" ? "#fbbf24" : "#fb7185";
  const chartData = [{ name: "meta", value: clamped, fill: toneColor }];

  return (
    <div className="relative w-full" style={{ height: compact ? 112 : 200 }}>
      <ResponsiveContainer height="100%" width="100%">
        <RadialBarChart
          barSize={compact ? 12 : 20}
          data={chartData}
          endAngle={-30}
          innerRadius="68%"
          outerRadius="100%"
          startAngle={210}
        >
          <PolarAngleAxis angleAxisId={0} domain={[0, 100]} tick={false} type="number" />
          <RadialBar
            angleAxisId={0}
            background={{ fill: "rgba(255,255,255,0.06)" }}
            cornerRadius={20}
            dataKey="value"
          />
        </RadialBarChart>
      </ResponsiveContainer>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          className={`font-semibold tracking-tight ${compact ? "text-2xl" : "text-4xl"}`}
          style={{ color: toneColor }}
        >
          {formatPercent(clamped)}
        </span>
        {!compact ? (
          <span className="mt-1 text-muted-foreground text-xs">{caption}</span>
        ) : null}
      </div>
    </div>
  );
}

function PlainStatusLine({
  goal,
  projected,
  revenue,
  tone,
}: {
  goal: number;
  projected: number;
  revenue: number;
  tone: "good" | "warn" | "bad";
}) {
  const onPace = projected >= goal;
  const message = onPace
    ? `Vamos bien: al ritmo de hoy cerramos el mes en ${formatMoney(projected)}, superando la meta por ${formatMoney(projected - goal)}.`
    : `Vamos atras: al ritmo de hoy llegariamos a ${formatMoney(projected)}, ${formatMoney(goal - projected)} por debajo de la meta. Hoy llevamos ${formatMoney(revenue)}.`;
  return (
    <div
      className={`flex items-start gap-2 rounded-xl border p-3 text-sm ${
        tone === "good"
          ? "border-emerald-300/30 bg-emerald-500/5 text-emerald-100"
          : tone === "warn"
            ? "border-amber-300/30 bg-amber-500/5 text-amber-100"
            : "border-rose-300/30 bg-rose-500/5 text-rose-100"
      }`}
    >
      {onPace ? (
        <TrendingUpIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      ) : (
        <TrendingDownIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      )}
      <span>{message}</span>
    </div>
  );
}

function PlainStat({
  label,
  tone,
  value,
}: {
  label: string;
  tone?: "good" | "warn" | "bad";
  value: string;
}) {
  return (
    <div className="rounded-2xl border bg-background/50 p-4">
      <p className="text-muted-foreground text-xs uppercase tracking-[0.16em]">{label}</p>
      <p
        className={`mt-2 font-semibold text-2xl tracking-tight ${
          tone === "good"
            ? "text-emerald-300"
            : tone === "warn"
              ? "text-amber-300"
              : tone === "bad"
                ? "text-rose-300"
                : ""
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function MetricTile({
  hint,
  label,
  tone,
  value,
}: {
  hint?: string;
  label: string;
  tone: "good" | "bad";
  value: string;
}) {
  return (
    <div className="rounded-xl border bg-background/40 p-3">
      <p className="text-muted-foreground text-xs uppercase tracking-wider">{label}</p>
      <p
        className={`mt-1 font-semibold text-2xl tracking-tight ${
          tone === "good" ? "text-emerald-300" : "text-rose-300"
        }`}
      >
        {value}
      </p>
      {hint ? <p className="text-muted-foreground text-[11px]">{hint}</p> : null}
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

const tooltipStyle = {
  backgroundColor: "#0f172a",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 12,
  color: "#e2e8f0",
  fontSize: 12,
};

function pct(value: number, total: number): number {
  return total > 0 ? (value / total) * 100 : 0;
}

function monthFraction(): number {
  const { dayOfMonth, daysInMonth } = monthParts();
  return daysInMonth > 0 ? dayOfMonth / daysInMonth : 1;
}

function projectEndOfMonth(revenue: number): { projected: number } {
  const { dayOfMonth, daysInMonth } = monthParts();
  return {
    projected: dayOfMonth > 0 ? (revenue / dayOfMonth) * daysInMonth : revenue,
  };
}

function paceTone(current: number, target: number): "good" | "warn" | "bad" {
  if (target <= 0) return "warn";
  const ratio = current / target;
  if (ratio >= 1) return "good";
  if (ratio >= 0.8) return "warn";
  return "bad";
}

function monthParts(): { dayOfMonth: number; daysInMonth: number } {
  const now = new Date();
  return {
    dayOfMonth: now.getDate(),
    daysInMonth: new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate(),
  };
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
  return new Intl.NumberFormat("es-MX", { maximumFractionDigits: 0 }).format(
    Number.isFinite(value) ? value : 0,
  );
}

function formatPercent(value: number): string {
  if (!Number.isFinite(value)) return "--";
  return `${new Intl.NumberFormat("es-MX", { maximumFractionDigits: 1 }).format(value)}%`;
}

function formatRoas(value: number): string {
  if (!Number.isFinite(value)) return "--";
  return `${new Intl.NumberFormat("es-MX", { maximumFractionDigits: 2 }).format(value)}x`;
}
