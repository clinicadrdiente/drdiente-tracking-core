"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CalculatorIcon,
  MegaphoneIcon,
  PlusIcon,
  SparklesIcon,
  TargetIcon,
  TrendingDownIcon,
  TrendingUpIcon,
  Trash2Icon,
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

// Minimal slice of the monthly dashboard payload we use as the projection
// baseline. Typed as a subset so the full MonthlyDashboard object passes through
// structurally without coupling this file to dashboard.tsx.
interface ProjectionBaseline {
  revenueTotal: number;
  paymentsTotal: number;
  uniquePatientsTotal: number;
  averagePaymentValue: number;
  month?: { label: string };
}

interface FixedCost {
  id: string;
  label: string;
  amount: number;
}

type VariableMode = "percent" | "perPatient";

interface ProjectionInputs {
  adSpend: number;
  acquisitionRoas: number;
  conservativeFactor: number;
  optimisticFactor: number;
  avgTicket: number;
  variableMode: VariableMode;
  variablePercent: number;
  variablePerPatient: number;
  fixedCosts: FixedCost[];
  manualRoiEnabled: boolean;
  manualRoiTarget: number;
}

interface ScenarioResult {
  key: string;
  label: string;
  factor: number;
  revenue: number;
  patients: number;
  adSpend: number;
  fixedTotal: number;
  variableCosts: number;
  totalCosts: number;
  profit: number;
  roas: number;
  roi: number;
}

const STORAGE_KEY = "drdienteProjectionInputs";

const DEFAULT_INPUTS: ProjectionInputs = {
  adSpend: 150000,
  acquisitionRoas: 4,
  conservativeFactor: 0.8,
  optimisticFactor: 1.25,
  avgTicket: 8000,
  variableMode: "percent",
  variablePercent: 20,
  variablePerPatient: 1200,
  fixedCosts: [
    { id: "renta", label: "Renta", amount: 60000 },
    { id: "nomina", label: "Nomina fija", amount: 180000 },
  ],
  manualRoiEnabled: false,
  manualRoiTarget: 120,
};

function generateId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `cost-${Date.now()}`;
}

function effectiveVariableRate(inputs: ProjectionInputs): number {
  if (inputs.variableMode === "percent") {
    return inputs.variablePercent / 100;
  }
  return inputs.avgTicket > 0 ? inputs.variablePerPatient / inputs.avgTicket : 0;
}

function sumFixed(inputs: ProjectionInputs): number {
  return inputs.fixedCosts.reduce((total, cost) => total + (cost.amount || 0), 0);
}

function computeScenario(
  inputs: ProjectionInputs,
  key: string,
  label: string,
  factor: number,
): ScenarioResult {
  const fixedTotal = sumFixed(inputs);
  const variableRate = effectiveVariableRate(inputs);
  const revenue = inputs.adSpend * inputs.acquisitionRoas * factor;
  const patients = inputs.avgTicket > 0 ? revenue / inputs.avgTicket : 0;
  const variableCosts = revenue * variableRate;
  const totalCosts = inputs.adSpend + fixedTotal + variableCosts;
  const profit = revenue - totalCosts;
  const roas = inputs.adSpend > 0 ? revenue / inputs.adSpend : 0;
  const roi = totalCosts > 0 ? (profit / totalCosts) * 100 : 0;

  return {
    key,
    label,
    factor,
    revenue,
    patients,
    adSpend: inputs.adSpend,
    fixedTotal,
    variableCosts,
    totalCosts,
    profit,
    roas,
    roi,
  };
}

// Given a target ROI, solve for the revenue (and implied ROAS) required, holding
// ad spend, fixed costs and the variable rate constant.
//   ROI = (R - C) / C, with C = F + R*v, F = adSpend + fixedTotal
//   => R = F*(1 + t) / ((1 - v) - t*v)
function solveForRoi(inputs: ProjectionInputs): {
  feasible: boolean;
  requiredRevenue: number;
  requiredRoas: number;
  requiredPatients: number;
} {
  const fixedTotal = sumFixed(inputs);
  const fixedAndAds = inputs.adSpend + fixedTotal;
  const v = effectiveVariableRate(inputs);
  const t = inputs.manualRoiTarget / 100;
  const denom = 1 - v - t * v;

  if (denom <= 0 || fixedAndAds <= 0) {
    return {
      feasible: false,
      requiredRevenue: 0,
      requiredRoas: 0,
      requiredPatients: 0,
    };
  }

  const requiredRevenue = (fixedAndAds * (1 + t)) / denom;
  const requiredRoas =
    inputs.adSpend > 0 ? requiredRevenue / inputs.adSpend : 0;
  const requiredPatients =
    inputs.avgTicket > 0 ? requiredRevenue / inputs.avgTicket : 0;

  return {
    feasible: true,
    requiredRevenue,
    requiredRoas,
    requiredPatients,
  };
}

function loadInputs(): ProjectionInputs {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return DEFAULT_INPUTS;
    }
    const parsed = JSON.parse(raw) as Partial<ProjectionInputs>;
    return {
      ...DEFAULT_INPUTS,
      ...parsed,
      fixedCosts: Array.isArray(parsed.fixedCosts)
        ? parsed.fixedCosts
        : DEFAULT_INPUTS.fixedCosts,
    };
  } catch {
    return DEFAULT_INPUTS;
  }
}

export function Projection({ data }: { data: ProjectionBaseline | null }) {
  const [inputs, setInputs] = useState<ProjectionInputs>(() => loadInputs());
  const [seededFromBaseline, setSeededFromBaseline] = useState(false);

  // One-time seed of the average ticket from the real current-month data, so the
  // per-patient math starts from a realistic number without overwriting edits.
  useEffect(() => {
    if (
      !seededFromBaseline &&
      data &&
      data.averagePaymentValue > 0 &&
      window.localStorage.getItem(STORAGE_KEY) === null
    ) {
      setInputs((prev) => ({
        ...prev,
        avgTicket: Math.round(data.averagePaymentValue),
      }));
      setSeededFromBaseline(true);
    }
  }, [data, seededFromBaseline]);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(inputs));
  }, [inputs]);

  const scenarios = useMemo(
    () => [
      computeScenario(inputs, "conservador", "Conservador", inputs.conservativeFactor),
      computeScenario(inputs, "base", "Base", 1),
      computeScenario(inputs, "optimista", "Optimista", inputs.optimisticFactor),
    ],
    [inputs],
  );

  const reverse = useMemo(() => solveForRoi(inputs), [inputs]);

  function patch(partial: Partial<ProjectionInputs>) {
    setInputs((prev) => ({ ...prev, ...partial }));
  }

  function updateFixedCost(id: string, partial: Partial<FixedCost>) {
    setInputs((prev) => ({
      ...prev,
      fixedCosts: prev.fixedCosts.map((cost) =>
        cost.id === id ? { ...cost, ...partial } : cost,
      ),
    }));
  }

  function addFixedCost() {
    setInputs((prev) => ({
      ...prev,
      fixedCosts: [
        ...prev.fixedCosts,
        { id: generateId(), label: "Nuevo gasto", amount: 0 },
      ],
    }));
  }

  function removeFixedCost(id: string) {
    setInputs((prev) => ({
      ...prev,
      fixedCosts: prev.fixedCosts.filter((cost) => cost.id !== id),
    }));
  }

  function resetInputs() {
    setInputs(DEFAULT_INPUTS);
  }

  const base = scenarios[1];
  const conservative = scenarios[0];
  const optimistic = scenarios[2];

  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-semibold text-3xl tracking-tight md:text-4xl">
            Proyeccion y escenarios
          </h1>
          <Badge variant="secondary">ESTIMADO</Badge>
        </div>
        <p className="max-w-3xl text-muted-foreground text-sm">
          Ajusta inversion en anuncios, gastos fijos y variables para ver el ROAS
          y ROI aproximados del proximo mes en un rango conservador-optimista.
          Todos los numeros son estimaciones para decision, no datos medidos.
        </p>
      </section>

      {/* Norte conservador <-> optimista */}
      <Card className="overflow-hidden border-brand/30 bg-[radial-gradient(circle_at_top_left,rgba(110,231,183,0.16),transparent_40%)]">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <SparklesIcon aria-hidden="true" className="size-5 text-brand" />
            El norte del proximo mes
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <NorthMetric
            label="Profit estimado"
            range={`${formatMoney(conservative.profit)} -> ${formatMoney(optimistic.profit)}`}
            value={formatMoney(base.profit)}
            tone={base.profit >= 0 ? "good" : "bad"}
          />
          <NorthMetric
            label="ROI estimado"
            range={`${formatPercent(conservative.roi)} -> ${formatPercent(optimistic.roi)}`}
            value={formatPercent(base.roi)}
            tone={base.roi >= 0 ? "good" : "bad"}
          />
          <NorthMetric
            label="ROAS estimado"
            range={`${formatRoas(conservative.roas)} -> ${formatRoas(optimistic.roas)}`}
            value={formatRoas(base.roas)}
            tone={base.roas >= 1 ? "good" : "bad"}
          />
        </CardContent>
        {data ? (
          <CardFooter className="border-t bg-background/30 text-muted-foreground text-xs">
            Base real del mes actual ({data.month?.label ?? "mes en curso"}):{" "}
            {formatMoney(data.revenueTotal)} revenue ·{" "}
            {formatInteger(data.uniquePatientsTotal)} pacientes · ticket{" "}
            {formatMoney(data.averagePaymentValue)}
          </CardFooter>
        ) : null}
      </Card>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        {/* Panel de supuestos */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <CalculatorIcon aria-hidden="true" className="size-5" />
              Supuestos
            </CardTitle>
            <Button onClick={resetInputs} size="sm" variant="ghost">
              Reiniciar
            </Button>
          </CardHeader>
          <CardContent className="space-y-5">
            <FieldRow
              hint="Cuanto planeas invertir en anuncios el proximo mes."
              icon={<MegaphoneIcon aria-hidden="true" className="size-4" />}
              label="Inversion en anuncios"
            >
              <MoneyInput
                onChange={(value) => patch({ adSpend: value })}
                value={inputs.adSpend}
              />
            </FieldRow>

            <FieldRow
              hint="Revenue esperado por cada peso invertido (ROAS de adquisicion base). Es la palanca principal."
              icon={<TargetIcon aria-hidden="true" className="size-4" />}
              label="ROAS de adquisicion (base)"
            >
              <NumberInput
                onChange={(value) => patch({ acquisitionRoas: value })}
                step={0.1}
                suffix="x"
                value={inputs.acquisitionRoas}
              />
            </FieldRow>

            <div className="grid grid-cols-2 gap-3">
              <FieldRow
                hint="Factor para el escenario malo."
                label="Factor conservador"
              >
                <NumberInput
                  onChange={(value) => patch({ conservativeFactor: value })}
                  step={0.05}
                  suffix="x"
                  value={inputs.conservativeFactor}
                />
              </FieldRow>
              <FieldRow
                hint="Factor para el escenario bueno."
                label="Factor optimista"
              >
                <NumberInput
                  onChange={(value) => patch({ optimisticFactor: value })}
                  step={0.05}
                  suffix="x"
                  value={inputs.optimisticFactor}
                />
              </FieldRow>
            </div>

            <FieldRow
              hint="Valor promedio por paciente cerrado (sirve para convertir revenue en numero de pacientes)."
              label="Ticket promedio"
            >
              <MoneyInput
                onChange={(value) => patch({ avgTicket: value })}
                value={inputs.avgTicket}
              />
            </FieldRow>

            {/* Gastos variables */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-medium text-sm">Gastos variables</span>
                <div className="flex gap-1 rounded-lg border p-1">
                  <ModeButton
                    active={inputs.variableMode === "percent"}
                    onClick={() => patch({ variableMode: "percent" })}
                  >
                    % revenue
                  </ModeButton>
                  <ModeButton
                    active={inputs.variableMode === "perPatient"}
                    onClick={() => patch({ variableMode: "perPatient" })}
                  >
                    $ por paciente
                  </ModeButton>
                </div>
              </div>
              {inputs.variableMode === "percent" ? (
                <NumberInput
                  onChange={(value) => patch({ variablePercent: value })}
                  step={1}
                  suffix="%"
                  value={inputs.variablePercent}
                />
              ) : (
                <MoneyInput
                  onChange={(value) => patch({ variablePerPatient: value })}
                  value={inputs.variablePerPatient}
                />
              )}
            </div>

            {/* Gastos fijos */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-medium text-sm">Gastos fijos</span>
                <Button onClick={addFixedCost} size="sm" variant="outline">
                  <PlusIcon aria-hidden="true" className="size-4" />
                  Agregar
                </Button>
              </div>
              <div className="space-y-2">
                {inputs.fixedCosts.map((cost) => (
                  <div className="flex items-center gap-2" key={cost.id}>
                    <Input
                      aria-label="Nombre del gasto"
                      className="flex-1"
                      onChange={(event) =>
                        updateFixedCost(cost.id, { label: event.target.value })
                      }
                      value={cost.label}
                    />
                    <div className="w-36">
                      <MoneyInput
                        onChange={(value) =>
                          updateFixedCost(cost.id, { amount: value })
                        }
                        value={cost.amount}
                      />
                    </div>
                    <Button
                      aria-label="Eliminar gasto"
                      onClick={() => removeFixedCost(cost.id)}
                      size="icon"
                      variant="ghost"
                    >
                      <Trash2Icon aria-hidden="true" className="size-4" />
                    </Button>
                  </div>
                ))}
              </div>
              <p className="text-right text-muted-foreground text-xs">
                Total fijos: {formatMoney(sumFixed(inputs))}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Escenarios + ROI manual */}
        <div className="flex flex-col gap-4">
          <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {scenarios.map((scenario) => (
              <ScenarioCard key={scenario.key} scenario={scenario} />
            ))}
          </section>

          <ManualRoiCard
            enabled={inputs.manualRoiEnabled}
            onToggle={(enabled) => patch({ manualRoiEnabled: enabled })}
            onTargetChange={(value) => patch({ manualRoiTarget: value })}
            reverse={reverse}
            target={inputs.manualRoiTarget}
          />
        </div>
      </section>
    </div>
  );
}

function ScenarioCard({ scenario }: { scenario: ScenarioResult }) {
  const tone =
    scenario.key === "optimista"
      ? "border-brand/40 bg-brand/5"
      : scenario.key === "conservador"
        ? "border-warn/30 bg-warn/5"
        : "border-brand/30 bg-brand/5";

  return (
    <Card className={tone}>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between text-base">
          <span>{scenario.label}</span>
          <Badge variant="secondary">{scenario.factor.toFixed(2)}x</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <BigMetric
          label="ROI"
          tone={scenario.roi >= 0 ? "good" : "bad"}
          value={formatPercent(scenario.roi)}
        />
        <div className="grid grid-cols-2 gap-2">
          <SmallMetric label="ROAS" value={formatRoas(scenario.roas)} />
          <SmallMetric label="Revenue" value={formatMoney(scenario.revenue)} />
          <SmallMetric label="Profit" value={formatMoney(scenario.profit)} tone={scenario.profit >= 0 ? "good" : "bad"} />
          <SmallMetric label="Pacientes" value={formatInteger(scenario.patients)} />
        </div>
        <div className="space-y-1 border-t pt-2 text-muted-foreground text-xs">
          <CostLine label="Anuncios" value={formatMoney(scenario.adSpend)} />
          <CostLine label="Fijos" value={formatMoney(scenario.fixedTotal)} />
          <CostLine label="Variables" value={formatMoney(scenario.variableCosts)} />
          <CostLine label="Costo total" value={formatMoney(scenario.totalCosts)} strong />
        </div>
      </CardContent>
    </Card>
  );
}

function ManualRoiCard({
  enabled,
  onToggle,
  onTargetChange,
  reverse,
  target,
}: {
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  onTargetChange: (value: number) => void;
  reverse: {
    feasible: boolean;
    requiredRevenue: number;
    requiredRoas: number;
    requiredPatients: number;
  };
  target: number;
}) {
  return (
    <Card className="border-fuchsia-300/30 bg-fuchsia-500/5">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <TargetIcon aria-hidden="true" className="size-5 text-fuchsia-300" />
          ROI objetivo (manual)
        </CardTitle>
        <Button
          onClick={() => onToggle(!enabled)}
          size="sm"
          variant={enabled ? "default" : "outline"}
        >
          {enabled ? "Activo" : "Activar"}
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-muted-foreground text-sm">
          Fija el ROI que quieres y calculamos al reves: cuanto revenue y que ROAS
          necesitarias para lograrlo, con los mismos gastos.
        </p>
        <div className="flex items-center gap-3">
          <div className="w-40">
            <NumberInput
              disabled={!enabled}
              onChange={onTargetChange}
              step={5}
              suffix="%"
              value={target}
            />
          </div>
          <span className="text-muted-foreground text-sm">ROI objetivo</span>
        </div>
        {enabled ? (
          reverse.feasible ? (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <SmallMetric
                label="Revenue necesario"
                value={formatMoney(reverse.requiredRevenue)}
              />
              <SmallMetric
                label="ROAS necesario"
                value={formatRoas(reverse.requiredRoas)}
              />
              <SmallMetric
                label="Pacientes necesarios"
                value={formatInteger(reverse.requiredPatients)}
              />
            </div>
          ) : (
            <p className="rounded-lg border border-warn/40 bg-warn/10 p-3 text-warn text-sm">
              Ese ROI no es alcanzable con la estructura de costos actual (los
              gastos variables se comen el margen). Baja el ROI objetivo o los
              gastos variables.
            </p>
          )
        ) : null}
      </CardContent>
    </Card>
  );
}

function NorthMetric({
  label,
  range,
  value,
  tone,
}: {
  label: string;
  range: string;
  value: string;
  tone: "good" | "bad";
}) {
  return (
    <div className="rounded-2xl border bg-background/50 p-4 backdrop-blur">
      <p className="text-muted-foreground text-xs uppercase tracking-[0.18em]">
        {label}
      </p>
      <p
        className={`mt-2 font-semibold text-3xl tracking-tight ${
          tone === "good" ? "text-brand" : "text-danger"
        }`}
      >
        {value}
      </p>
      <p className="mt-1 flex items-center gap-1 text-muted-foreground text-xs">
        {tone === "good" ? (
          <TrendingUpIcon aria-hidden="true" className="size-3" />
        ) : (
          <TrendingDownIcon aria-hidden="true" className="size-3" />
        )}
        {range}
      </p>
    </div>
  );
}

function BigMetric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "good" | "bad";
}) {
  return (
    <div>
      <p className="text-muted-foreground text-xs uppercase tracking-[0.18em]">
        {label}
      </p>
      <p
        className={`font-semibold text-3xl tracking-tight ${
          tone === "good" ? "text-brand" : "text-danger"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function SmallMetric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "good" | "bad";
}) {
  return (
    <div className="rounded-lg border bg-background/40 p-2">
      <p className="text-muted-foreground text-[10px] uppercase tracking-wider">
        {label}
      </p>
      <p
        className={`font-semibold text-sm ${
          tone === "good"
            ? "text-brand"
            : tone === "bad"
              ? "text-danger"
              : ""
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function CostLine({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className={`flex justify-between ${strong ? "font-medium text-foreground" : ""}`}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

function FieldRow({
  children,
  hint,
  icon,
  label,
}: {
  children: React.ReactNode;
  hint?: string;
  icon?: React.ReactNode;
  label: string;
}) {
  return (
    <div className="space-y-1.5">
      <label className="flex items-center gap-2 font-medium text-sm">
        {icon}
        {label}
      </label>
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
  disabled,
  onChange,
  step,
  suffix,
  value,
}: {
  disabled?: boolean;
  onChange: (value: number) => void;
  step?: number;
  suffix?: string;
  value: number;
}) {
  return (
    <div className="relative">
      <Input
        disabled={disabled}
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

function ModeButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      className={`rounded-md px-2 py-1 text-xs transition ${
        active
          ? "bg-brand/20 text-brand"
          : "text-muted-foreground hover:text-foreground"
      }`}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
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
