import React, { useState } from "react";
import {
  RefreshCwIcon,
  UserRoundIcon,
  WebhookIcon,
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
  ItemGroup,
} from "@/components/ui/item";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Projection } from "@/components/projection";
import { Executive } from "@/components/executive";
import { Comparativas } from "@/components/comparativas";
import { Contenido } from "@/components/contenido";
import type {
  MonthBucket,
  MonthlyDashboard,
  SystemStatus,
  PaymentBlock,
  PaymentsSyncResult,
  ReferenceDiagnostic,
  StapeTestResult,
  WindsorAccountsResult,
  WindsorTestResult,
} from "@/types/dashboard";
import { DailyReport } from "@/components/dashboard/daily-report";
import { EffortsPanel } from "@/components/dashboard/efforts-panel";
import { SystemHealthPanel, SystemHealthCard } from "@/components/dashboard/system-health";
import { GuidedActionsCard, OperationsResultCard, SyncMetric } from "@/components/dashboard/actions";
import { WindsorMarketingCard } from "@/components/dashboard/windsor-panel";
import { ElevatorSyncCard, IntegrationPanel } from "@/components/dashboard/elevator-panel";
import { ReferenceDiagnosticCard, StapeTestCard } from "@/components/dashboard/diagnostics-panel";
import {
  HeroMetric,
  StatsGrid,
  RevenueChart,
  RecentPatientsCard,
  TreatmentListCard,
  BranchRevenueCard,
  DayBlocksCard,
  PatientItem,
  EmptyState,
  type ChartRow,
} from "@/components/dashboard/attribution-panel";

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

export function ControlRoom({
  chartRows,
  cronHeartbeatStatus,
  data,
  isDetectingWindsorAccounts,
  isLoading,
  isSyncingToElevator,
  isTestingRealFlow,
  onDetectWindsorAccounts,
  onRefresh,
  onSendToElevator,
  onTestRealFlow,
  realFlowError,
  realFlowResult,
  syncError,
  syncResult,
  systemStatus,
  topPayments,
  windsorAccounts,
}: {
  chartRows: ChartRow[];
  cronHeartbeatStatus: "ok" | "stale" | "unknown" | null;
  data: MonthlyDashboard | null;
  isDetectingWindsorAccounts: boolean;
  isLoading: boolean;
  isSyncingToElevator: boolean;
  isTestingRealFlow: boolean;
  onDetectWindsorAccounts: () => void;
  onRefresh: () => void;
  onSendToElevator: () => void;
  onTestRealFlow: () => void;
  realFlowError: string | null;
  realFlowResult: PaymentsSyncResult | null;
  syncError: string | null;
  syncResult: PaymentsSyncResult | null;
  systemStatus: SystemStatus | null;
  topPayments: PaymentBlock[];
  windsorAccounts: WindsorAccountsResult | null;
}) {
  return (
    <>
      <section className="grid grid-cols-1 gap-4 xl:grid-cols-[1.45fr_0.9fr]">
        <Card className="overflow-hidden border-brand/30 bg-[radial-gradient(circle_at_top_left,rgba(24,186,251,0.18),transparent_36%),linear-gradient(135deg,rgba(24,88,251,0.10),transparent_48%)]">
          <CardHeader>
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <CardTitle className="text-3xl md:text-4xl">
                  Operacion
                </CardTitle>
              </div>
              <Badge className="w-fit bg-brand/15 text-brand hover:bg-brand/15">
                {systemStatus?.config.stateStoreMode === "redis"
                  ? "Redis activo"
                  : "Redis pendiente"}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <HeroMetric
                label="Revenue del mes"
                value={formatMoney(data?.revenueTotal ?? 0)}
              />
              <HeroMetric
                label="Pacientes"
                value={formatInteger(data?.uniquePatientsTotal ?? 0)}
              />
              <HeroMetric
                label="Pagos guardados"
                value={formatInteger(systemStatus?.paymentSync.processedPaymentCount ?? 0)}
              />
            </div>
          </CardContent>
          <CardFooter className="flex flex-col items-stretch gap-2 border-t bg-background/35 p-4 sm:flex-row sm:items-center">
            <Button disabled={isLoading} onClick={onRefresh}>
              <RefreshCwIcon aria-hidden="true" data-icon="inline-start" />
              {isLoading ? "Actualizando" : "Actualizar Dentalink"}
            </Button>
            <Button asChild variant="secondary">
              <a href="#/patients">
                <UserRoundIcon aria-hidden="true" data-icon="inline-start" />
                Ver pacientes
              </a>
            </Button>
            <Button asChild variant="outline">
              <a href="#/stape">
                <WebhookIcon aria-hidden="true" data-icon="inline-start" />
                Ver conversiones
              </a>
            </Button>
          </CardFooter>
        </Card>

        <SystemHealthCard systemStatus={systemStatus} cronHeartbeatStatus={cronHeartbeatStatus} />
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <GuidedActionsCard
          data={data}
          isDetectingWindsorAccounts={isDetectingWindsorAccounts}
          isLoading={isLoading}
          isSyncingToElevator={isSyncingToElevator}
          isTestingRealFlow={isTestingRealFlow}
          onDetectWindsorAccounts={onDetectWindsorAccounts}
          onRefresh={onRefresh}
          onSendToElevator={onSendToElevator}
          onTestRealFlow={onTestRealFlow}
          realFlowResult={realFlowResult}
          syncResult={syncResult}
          windsorAccounts={windsorAccounts}
        />
        <RecentPatientsCard payments={topPayments} />
      </section>

      {(syncError || realFlowError || syncResult || realFlowResult) ? (
        <OperationsResultCard
          realFlowError={realFlowError}
          realFlowResult={realFlowResult}
          syncError={syncError}
          syncResult={syncResult}
        />
      ) : null}

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-[1.25fr_0.75fr]">
        <RevenueChart chartRows={chartRows} data={data} />
        <BranchRevenueCard data={data} />
      </section>
    </>
  );
}

export function DashboardRoute({
  route,
  data,
  systemStatus,
  cronHeartbeatStatus,
  chartRows,
  topPayments,
  isLoading,
  isDiagnosingReferences,
  isSyncingToElevator,
  isDetectingWindsorAccounts,
  isTestingRealFlow,
  isTestingStape,
  isTestingWindsor,
  onDetectWindsorAccounts,
  onDiagnoseReferences,
  onRefresh,
  onSendToElevator,
  onTestRealFlow,
  onTestStape,
  onTestWindsor,
  rangeDays,
  onRangeChange,
  secret,
  referenceDiagnostic,
  referenceDiagnosticError,
  realFlowError,
  realFlowResult,
  syncError,
  syncResult,
  stapeTestError,
  stapeTestResult,
  windsorAccounts,
  windsorAccountsError,
  windsorError,
  windsorResult,
}: {
  route: string;
  data: MonthlyDashboard | null;
  systemStatus: SystemStatus | null;
  cronHeartbeatStatus: "ok" | "stale" | "unknown" | null;
  chartRows: ChartRow[];
  topPayments: PaymentBlock[];
  isLoading: boolean;
  isDiagnosingReferences: boolean;
  isSyncingToElevator: boolean;
  isDetectingWindsorAccounts: boolean;
  isTestingRealFlow: boolean;
  isTestingStape: boolean;
  isTestingWindsor: boolean;
  onDetectWindsorAccounts: () => void;
  onDiagnoseReferences: () => void;
  onRefresh: () => void;
  onSendToElevator: () => void;
  onTestRealFlow: () => void;
  onTestStape: () => void;
  onTestWindsor: () => void;
  rangeDays: 7 | 30 | 180 | null;
  onRangeChange: (days: 7 | 30 | 180 | null) => void;
  secret: string;
  referenceDiagnostic: ReferenceDiagnostic | null;
  referenceDiagnosticError: string | null;
  realFlowError: string | null;
  realFlowResult: PaymentsSyncResult | null;
  syncError: string | null;
  syncResult: PaymentsSyncResult | null;
  stapeTestError: string | null;
  stapeTestResult: StapeTestResult | null;
  windsorAccounts: WindsorAccountsResult | null;
  windsorAccountsError: string | null;
  windsorError: string | null;
  windsorResult: WindsorTestResult | null;
}) {
  if (route === "resumen" || route === "executive") {
    return <Executive data={data} />;
  }

  if (route === "proyeccion" || route === "projection") {
    return <Projection data={data} />;
  }

  if (route === "comparativas") {
    return <Comparativas secret={secret} />;
  }

  if (route === "contenido" || route === "blogs") {
    return <Contenido secret={secret} />;
  }

  if (route === "revenue") {
    const monthBuckets: MonthBucket[] = data?.months ?? [];
    const [compareEnabled, setCompareEnabled] = useState(false);
    const comparison = compareEnabled ? data?.comparison : undefined;
    return (
      <>
        <div className="flex items-center justify-between gap-4">
          <p className="text-muted-foreground text-sm">
            {rangeDays ? `Últimos ${rangeDays} días` : (data?.month?.label ?? "Mes actual")}
          </p>
          <div className="flex items-center gap-2">
            {rangeDays !== null && (
              <Button
                onClick={() => setCompareEnabled((v) => !v)}
                size="sm"
                variant={compareEnabled ? "default" : "outline"}
              >
                {compareEnabled ? "Comparando" : "Comparar con periodo anterior"}
              </Button>
            )}
            <Select
              value={rangeDays !== null ? String(rangeDays) : "month"}
              onValueChange={(val) => {
                const next = val === "month" ? null : (Number(val) as 7 | 30 | 180);
                setCompareEnabled(false);
                onRangeChange(next);
              }}
            >
              <SelectTrigger className="w-44">
                <SelectValue placeholder="Rango" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="month">Mes actual</SelectItem>
                <SelectItem value="7">Últimos 7 días</SelectItem>
                <SelectItem value="30">Últimos 30 días</SelectItem>
                <SelectItem value="180">Últimos 180 días</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <StatsGrid comparison={comparison} data={data} />
        <RevenueChart chartRows={chartRows} data={data} />
        {monthBuckets.length > 1 ? (
          <Card>
            <CardHeader>
              <CardTitle>Por mes</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-3">
                {monthBuckets.map((bucket) => (
                  <div
                    className="flex items-center justify-between gap-3 rounded-xl border bg-background/50 p-4"
                    key={bucket.monthKey}
                  >
                    <div>
                      <p className="font-medium capitalize">{bucket.label}</p>
                      <p className="text-muted-foreground text-sm">{bucket.payments} pagos</p>
                    </div>
                    <p className="font-semibold text-brand">
                      {new Intl.NumberFormat("es-MX", {
                        style: "currency",
                        currency: "MXN",
                        maximumFractionDigits: 0,
                      }).format(bucket.revenue)}
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ) : null}
        <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <BranchRevenueCard comparison={comparison} data={data} />
          <TreatmentListCard data={data} />
        </section>
        <section className="grid grid-cols-1 gap-4">
          <DayBlocksCard data={data} />
        </section>
      </>
    );
  }

  if (route === "patients" || route === "dentalink/patients") {
    return (
      <>
        <ElevatorSyncCard
          isSyncing={isSyncingToElevator}
          onSend={onSendToElevator}
          result={syncResult}
          syncError={syncError}
        />
        <Card>
          <CardHeader>
            <CardTitle>Pacientes del mes</CardTitle>
          </CardHeader>
          <CardContent>
            <ItemGroup className="gap-2">
              {(data?.patients ?? []).length > 0 ? (
                data?.patients.map((payment) => (
                  <PatientItem key={payment.paymentId} payment={payment} />
                ))
              ) : (
                <EmptyState
                  cta="Actualizar Dentalink"
                  isLoading={isLoading}
                  message="No hay pacientes cargados todavia."
                  onClick={onRefresh}
                />
              )}
            </ItemGroup>
          </CardContent>
        </Card>
      </>
    );
  }

  if (route === "dentalink" || route === "dentalink/payments") {
    return (
      <>
        <StatsGrid data={data} />
        <ReferenceDiagnosticCard
          diagnostic={referenceDiagnostic}
          error={referenceDiagnosticError}
          isLoading={isDiagnosingReferences}
          onDiagnose={onDiagnoseReferences}
        />
        <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <RecentPatientsCard payments={topPayments} />
          <BranchRevenueCard data={data} />
        </section>
        <DayBlocksCard data={data} />
      </>
    );
  }

  if (route === "dentalink/treatments" || route === "marketing") {
    return (
      <>
        <WindsorMarketingCard
          accounts={windsorAccounts}
          accountsError={windsorAccountsError}
          error={windsorError}
          isDetectingAccounts={isDetectingWindsorAccounts}
          isLoading={isTestingWindsor}
          onDetectAccounts={onDetectWindsorAccounts}
          onTest={onTestWindsor}
          result={windsorResult}
        />
        <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <TreatmentListCard data={data} />
          <RevenueChart chartRows={chartRows} data={data} />
        </section>
      </>
    );
  }

  if (route === "elevator" || route.startsWith("elevator/")) {
    return (
      <>
        <ElevatorSyncCard
          isSyncing={isSyncingToElevator}
          onSend={onSendToElevator}
          result={syncResult}
          syncError={syncError}
        />
        <IntegrationPanel
          badge="API conectada"
          rows={[
            ["Modo", "api"],
            ["Leads demo", "creacion y deduplicacion activa"],
            ["Matching pagos", `${formatInteger(data?.patients.length ?? 0)} pagos disponibles`],
          ]}
          title="Elevator CRM"
        />
      </>
    );
  }

  if (route === "stape" || route.startsWith("stape/")) {
    return (
      <StapeTestCard
        error={stapeTestError}
        isTestingRealFlow={isTestingRealFlow}
        isTesting={isTestingStape}
        onTestRealFlow={onTestRealFlow}
        onTest={onTestStape}
        realFlowError={realFlowError}
        realFlowResult={realFlowResult}
        result={stapeTestResult}
      />
    );
  }

  if (route === "settings" || route.startsWith("settings/")) {
    return (
      <IntegrationPanel
        badge="Sistema"
        rows={[
          ["Dentalink", "api"],
          ["Elevator", "api"],
          ["Stape", "stub"],
          ["Secret local", window.localStorage.getItem("trackingSecret") ? "configurado" : "pendiente"],
        ]}
        title="Configuracion"
      />
    );
  }

  if (route === "help" || route === "status") {
    return <SystemHealthPanel route={route} data={data} systemStatus={systemStatus} cronHeartbeatStatus={cronHeartbeatStatus} />;
  }

  if (route === "reporte-diario") {
    return <DailyReport secret={secret} />;
  }

  if (route === "esfuerzos") {
    return <EffortsPanel secret={secret} rangeDays={rangeDays} />;
  }

  return (
    <ControlRoom
      chartRows={chartRows}
      cronHeartbeatStatus={cronHeartbeatStatus}
      data={data}
      isDetectingWindsorAccounts={isDetectingWindsorAccounts}
      isLoading={isLoading}
      isSyncingToElevator={isSyncingToElevator}
      isTestingRealFlow={isTestingRealFlow}
      onDetectWindsorAccounts={onDetectWindsorAccounts}
      onRefresh={onRefresh}
      onSendToElevator={onSendToElevator}
      onTestRealFlow={onTestRealFlow}
      realFlowError={realFlowError}
      realFlowResult={realFlowResult}
      syncError={syncError}
      syncResult={syncResult}
      systemStatus={systemStatus}
      topPayments={topPayments}
      windsorAccounts={windsorAccounts}
    />
  );
}
