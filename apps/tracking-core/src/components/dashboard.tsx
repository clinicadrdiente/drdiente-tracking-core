"use client";

import { type ReactNode, useEffect, useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, XAxis } from "recharts";
import {
  ActivityIcon,
  ArrowRightIcon,
  CalendarDaysIcon,
  CheckCircle2Icon,
  DatabaseIcon,
  DownloadIcon,
  RefreshCwIcon,
  SendIcon,
  ShieldCheckIcon,
  StethoscopeIcon,
  TargetIcon,
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
import { Projection } from "@/components/projection";

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
  branchShare: BranchSummary[];
  cache?: {
    hit: boolean;
    stale: boolean;
    cachedAt: string;
    ttlSeconds: number;
  };
}

interface SystemStatus {
  ok: boolean;
  service: string;
  generatedAt: string;
  config: {
    elevatorMode: string;
    dentalinkMode: string;
    stapeMode: string;
    stateStoreMode: string;
    defaultCurrency: string;
    highTicketThreshold: number;
    paymentsSyncLookbackMinutes: number;
    trackingSecretConfigured: boolean;
  };
  paymentSync: {
    lastCheckIso: string | null;
    processedPaymentCount: number;
  };
  integrations: {
    elevator: string;
    dentalink: string;
    stape: string;
  };
}

interface BranchSummary {
  branch: string;
  revenue: number;
  payments: number;
  uniquePatients: number;
  averagePaymentValue: number;
  share: number;
  topPatients: PaymentBlock[];
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
  patientReference: string | null;
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

interface PaymentsSyncResult {
  processed: number;
  skipped: number;
  sinceIso: string | null;
  paymentsFound: number;
  alreadyProcessed: number;
  newPayments: number;
  maxPayments: number | null;
  matchedLeads: number;
  unmatchedLeads: number;
  createdLeads: number;
  existingLeads?: number;
  failed?: number;
  rateLimitedPatients: number;
  dispatched: number;
  results?: ElevatorImportResult[];
}

interface ElevatorImportResult {
  paymentId: number | null;
  patientId: number | null;
  patientName: string;
  contact: string;
  reference: string;
  branch: string;
  status: "created" | "existing" | "skipped_missing_contact" | "failed";
  elevatorId: string | null;
  readyForStape: boolean;
  reason: string;
}

interface ReferenceDiagnostic {
  ok: boolean;
  configuredPatientReferenceField: string;
  recommendation: string;
  catalogProbes: Array<{
    path: string;
    ok: boolean;
    status: number;
    returnedCount: number | null;
    sample: Array<{
      id: string | null;
      label: string | null;
      keys: string[];
    }>;
  }>;
  patientProbes: Array<{
    patientId: number;
    patientName: string | null;
    fields: Array<{
      key: string;
      value: string;
    }>;
    checkedPaths?: Array<{
      path: string;
      status: number;
      fields: Array<{
        key: string;
        value: string;
      }>;
    }>;
  }>;
}

interface StapeTestResult {
  ping: unknown;
  event: unknown;
}

interface WindsorMarketingSummary {
  ok?: boolean;
  configured?: boolean;
  connector?: string;
  datePreset?: string;
  filters?: {
    includeText: string[];
    excludeText: string[];
  };
  rawRowCount?: number;
  filteredRowCount?: number;
  message?: string;
  rows?: WindsorMarketingRow[];
  totals?: {
    spend: number;
    clicks: number;
    impressions: number;
    reach?: number;
    videoTrueviewViews?: number;
  };
  bySource?: WindsorSourceSummary[];
}

interface WindsorMarketingRow {
  date?: string | null;
  datasource?: string | null;
  source?: string | null;
  campaign?: string | null;
  campaignId?: string | null;
  campaignName?: string | null;
  accountName?: string | null;
  accountId?: string | null;
  adAccountName?: string | null;
  adAccountId?: string | null;
  businessManager?: string | null;
  spend?: number;
  clicks?: number;
  impressions?: number;
  reach?: number;
  videoTrueviewViews?: number;
  currency?: string | null;
  accountCurrency?: string | null;
}

interface WindsorSourceSummary {
  source: string;
  spend: number;
  clicks: number;
  impressions: number;
  reach?: number;
  videoTrueviewViews?: number;
  campaigns: number;
}

interface WindsorAccountSummary {
  key: string;
  accountName: string | null;
  accountId: string | null;
  adAccountName: string | null;
  adAccountId: string | null;
  businessManager: string | null;
  sources: string[];
  campaigns: string[];
  rows: number;
  spend: number;
  clicks: number;
  impressions: number;
  reach: number;
  videoTrueviewViews: number;
}

interface WindsorAccountsResult {
  ok?: boolean;
  configured?: boolean;
  connector?: string;
  datePreset?: string;
  rowCount?: number;
  accounts?: WindsorAccountSummary[];
  message?: string;
}

interface WindsorTestResult {
  ping: unknown;
  summary: WindsorMarketingSummary;
}

const chartConfig = {
  revenue: {
    label: "Revenue",
    color: "var(--chart-1)",
  },
} satisfies ChartConfig;

const DASHBOARD_BROWSER_CACHE_KEY = "drdienteMonthlyDashboardCache";
const DASHBOARD_BROWSER_CACHE_TTL_MS = 5 * 60 * 1000;

export function Dashboard() {
  const [secret, setSecret] = useState(() =>
    window.localStorage.getItem("trackingSecret") ?? "",
  );
  const [data, setData] = useState<MonthlyDashboard | null>(null);
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [route, setRoute] = useState(() => normalizeRoute(window.location.hash));
  const [isSyncingToElevator, setIsSyncingToElevator] = useState(false);
  const [syncResult, setSyncResult] = useState<PaymentsSyncResult | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [isDiagnosingReferences, setIsDiagnosingReferences] = useState(false);
  const [referenceDiagnostic, setReferenceDiagnostic] =
    useState<ReferenceDiagnostic | null>(null);
  const [referenceDiagnosticError, setReferenceDiagnosticError] = useState<
    string | null
  >(null);
  const [isTestingStape, setIsTestingStape] = useState(false);
  const [stapeTestResult, setStapeTestResult] = useState<StapeTestResult | null>(null);
  const [stapeTestError, setStapeTestError] = useState<string | null>(null);
  const [isTestingRealFlow, setIsTestingRealFlow] = useState(false);
  const [realFlowResult, setRealFlowResult] = useState<PaymentsSyncResult | null>(null);
  const [realFlowError, setRealFlowError] = useState<string | null>(null);
  const [isTestingWindsor, setIsTestingWindsor] = useState(false);
  const [windsorResult, setWindsorResult] = useState<WindsorTestResult | null>(null);
  const [windsorError, setWindsorError] = useState<string | null>(null);
  const [isDetectingWindsorAccounts, setIsDetectingWindsorAccounts] = useState(false);
  const [windsorAccounts, setWindsorAccounts] =
    useState<WindsorAccountsResult | null>(null);
  const [windsorAccountsError, setWindsorAccountsError] = useState<string | null>(
    null,
  );

  async function loadDashboard(
    nextSecret = secret,
    options: { skipBrowserCache?: boolean } = {},
  ) {
    if (!nextSecret.trim()) {
      setError("Pega el TRACKING_API_SECRET para cargar datos reales.");
      return;
    }

    const cachedDashboard = options.skipBrowserCache
      ? null
      : readBrowserDashboardCache();
    if (cachedDashboard) {
      setData(cachedDashboard);
      setError(null);
      void loadSystemStatus(nextSecret);
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
      writeBrowserDashboardCache(body);
      setData(body);
      void loadSystemStatus(nextSecret);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Error desconocido.");
    } finally {
      setIsLoading(false);
    }
  }

  async function loadSystemStatus(nextSecret = secret) {
    if (!nextSecret.trim()) {
      return;
    }

    setStatusError(null);

    try {
      const response = await fetch("/api/status", {
        headers: {
          "x-tracking-secret": nextSecret.trim(),
        },
      });
      const body = (await response.json()) as SystemStatus | { error?: string };

      if (!response.ok || !("config" in body)) {
        throw new Error("error" in body ? body.error : "No se pudo cargar estado.");
      }

      setSystemStatus(body);
    } catch (requestError) {
      setStatusError(
        requestError instanceof Error ? requestError.message : "Error desconocido.",
      );
    }
  }

  async function sendMonthToElevator() {
    if (!secret.trim()) {
      setSyncError("Pega el TRACKING_API_SECRET antes de enviar a Elevator.");
      return;
    }

    if (!data?.patients.length) {
      setSyncError("Primero presiona Actualizar para cargar pacientes de Dentalink.");
      return;
    }

    setIsSyncingToElevator(true);
    setSyncError(null);
    setSyncResult(null);

    try {
      const response = await fetch("/api/dev/elevator-import-patients", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-tracking-secret": secret.trim(),
        },
        body: JSON.stringify({
          patients: data.patients.slice(0, 50),
        }),
      });
      const body = (await response.json()) as
        | PaymentsSyncResult
        | { error?: string; details?: { message?: string } };

      if ((!response.ok && response.status !== 207) || !("processed" in body)) {
        throw new Error(
          "details" in body && body.details?.message
            ? body.details.message
            : "No se pudo enviar a Elevator.",
        );
      }

      setSyncResult(body);
      window.localStorage.setItem("trackingSecret", secret.trim());
    } catch (requestError) {
      setSyncError(
        requestError instanceof Error ? requestError.message : "Error desconocido.",
      );
    } finally {
      setIsSyncingToElevator(false);
    }
  }

  async function diagnoseReferences() {
    if (!secret.trim()) {
      setReferenceDiagnosticError("Pega el TRACKING_API_SECRET antes de diagnosticar.");
      return;
    }

    setIsDiagnosingReferences(true);
    setReferenceDiagnosticError(null);

    try {
      const response = await fetch("/api/dev/dentalink-reference-diagnostic", {
        headers: {
          "x-tracking-secret": secret.trim(),
        },
      });
      const body = (await response.json()) as ReferenceDiagnostic | { error?: string };

      if (!response.ok || !("catalogProbes" in body)) {
        throw new Error("error" in body ? body.error : "No se pudo diagnosticar referencias.");
      }

      setReferenceDiagnostic(body);
      window.localStorage.setItem("trackingSecret", secret.trim());
    } catch (requestError) {
      setReferenceDiagnosticError(
        requestError instanceof Error ? requestError.message : "Error desconocido.",
      );
    } finally {
      setIsDiagnosingReferences(false);
    }
  }

  async function testStape() {
    if (!secret.trim()) {
      setStapeTestError("Pega el TRACKING_API_SECRET antes de probar Stape.");
      return;
    }

    setIsTestingStape(true);
    setStapeTestError(null);
    setStapeTestResult(null);

    try {
      const headers = {
        "x-tracking-secret": secret.trim(),
      };
      const pingResponse = await fetch("/api/dev/stape-ping", { headers });
      const pingBody = (await pingResponse.json()) as unknown;

      if (!pingResponse.ok) {
        throw new Error(readErrorMessage(pingBody, "No se pudo validar Stape."));
      }

      const eventResponse = await fetch("/api/dev/test-stape", {
        method: "POST",
        headers,
      });
      const eventBody = (await eventResponse.json()) as unknown;

      if (!eventResponse.ok) {
        throw new Error(readErrorMessage(eventBody, "No se pudo enviar evento demo."));
      }

      setStapeTestResult({
        ping: pingBody,
        event: eventBody,
      });
      window.localStorage.setItem("trackingSecret", secret.trim());
    } catch (requestError) {
      setStapeTestError(
        requestError instanceof Error ? requestError.message : "Error desconocido.",
      );
    } finally {
      setIsTestingStape(false);
    }
  }

  async function testRealConversionFlow() {
    if (!secret.trim()) {
      setRealFlowError("Pega el TRACKING_API_SECRET antes de probar el flujo real.");
      return;
    }

    setIsTestingRealFlow(true);
    setRealFlowError(null);
    setRealFlowResult(null);

    try {
      const response = await fetch("/api/dev/test-payment-sync", {
        method: "POST",
        headers: {
          "x-tracking-secret": secret.trim(),
        },
      });
      const body = (await response.json()) as
        | PaymentsSyncResult
        | { error?: string; details?: { message?: string } };

      if (!response.ok || !("processed" in body)) {
        throw new Error(readErrorMessage(body, "No se pudo probar el flujo real."));
      }

      setRealFlowResult(body);
      window.localStorage.setItem("trackingSecret", secret.trim());
    } catch (requestError) {
      setRealFlowError(
        requestError instanceof Error ? requestError.message : "Error desconocido.",
      );
    } finally {
      setIsTestingRealFlow(false);
    }
  }

  async function testWindsor() {
    if (!secret.trim()) {
      setWindsorError("Pega el TRACKING_API_SECRET antes de probar Windsor.");
      return;
    }

    setIsTestingWindsor(true);
    setWindsorError(null);
    setWindsorResult(null);

    try {
      const headers = {
        "x-tracking-secret": secret.trim(),
      };
      const pingResponse = await fetch("/api/dev/windsor-ping", { headers });
      const pingBody = (await pingResponse.json()) as unknown;

      if (!pingResponse.ok) {
        throw new Error(readErrorMessage(pingBody, "No se pudo validar Windsor."));
      }

      const summaryResponse = await fetch("/api/dev/windsor-marketing-summary", {
        headers,
      });
      const summaryBody = (await summaryResponse.json()) as WindsorMarketingSummary;

      if (!summaryResponse.ok) {
        throw new Error(
          readErrorMessage(summaryBody, "No se pudo leer el resumen de Windsor."),
        );
      }

      setWindsorResult({
        ping: pingBody,
        summary: summaryBody,
      });
      window.localStorage.setItem("trackingSecret", secret.trim());
    } catch (requestError) {
      setWindsorError(
        requestError instanceof Error ? requestError.message : "Error desconocido.",
      );
    } finally {
      setIsTestingWindsor(false);
    }
  }

  async function detectWindsorAccounts() {
    if (!secret.trim()) {
      setWindsorAccountsError(
        "Pega el TRACKING_API_SECRET antes de detectar cuentas Windsor.",
      );
      return;
    }

    setIsDetectingWindsorAccounts(true);
    setWindsorAccountsError(null);
    setWindsorAccounts(null);

    try {
      const response = await fetch("/api/dev/windsor-accounts", {
        headers: {
          "x-tracking-secret": secret.trim(),
        },
      });
      const body = (await response.json()) as WindsorAccountsResult;

      if (!response.ok) {
        throw new Error(
          readErrorMessage(body, "No se pudieron detectar cuentas Windsor."),
        );
      }

      setWindsorAccounts(body);
      window.localStorage.setItem("trackingSecret", secret.trim());
    } catch (requestError) {
      setWindsorAccountsError(
        requestError instanceof Error ? requestError.message : "Error desconocido.",
      );
    } finally {
      setIsDetectingWindsorAccounts(false);
    }
  }

  useEffect(() => {
    if (secret) {
      void loadDashboard(secret);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    function handleHashChange() {
      setRoute(normalizeRoute(window.location.hash));
    }

    function handleRefreshRequest() {
      setRoute("dashboard");
      void loadDashboard(secret, { skipBrowserCache: true });
    }

    window.addEventListener("hashchange", handleHashChange);
    window.addEventListener("drdiente:refresh-dashboard", handleRefreshRequest);

    return () => {
      window.removeEventListener("hashchange", handleHashChange);
      window.removeEventListener("drdiente:refresh-dashboard", handleRefreshRequest);
    };
  }, [secret]);

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
          <h1 className="text-balance font-semibold text-4xl tracking-tight md:text-5xl">
            Dr Diente Core
          </h1>
        </div>
        <div className="flex w-full gap-2 md:w-auto">
          <Input
            className="min-w-0 md:w-80"
            onChange={(event) => setSecret(event.target.value)}
            placeholder="TRACKING_API_SECRET"
            type="password"
            value={secret}
          />
          <Button
            disabled={isLoading}
            onClick={() => void loadDashboard(secret, { skipBrowserCache: true })}
          >
            <RefreshCwIcon aria-hidden="true" data-icon="inline-start" />
            {isLoading ? "Cargando" : "Actualizar"}
          </Button>
        </div>
      </section>

      {data?.cache ? (
        <div className="flex">
          <Badge variant="secondary">
            {data.cache.hit ? "Cache" : "Actualizado"} · {formatCacheTime(data.cache.cachedAt)}
          </Badge>
        </div>
      ) : null}

      {error ? (
        <Card className="border-destructive/40">
          <CardContent className="py-4 text-destructive text-sm">{error}</CardContent>
        </Card>
      ) : null}

      {statusError ? (
        <Card className="border-amber-300/40">
          <CardContent className="py-4 text-amber-200 text-sm">
            Estado del sistema no disponible: {statusError}
          </CardContent>
        </Card>
      ) : null}

      <DashboardRoute
        chartRows={chartRows}
        data={data}
        systemStatus={systemStatus}
        isLoading={isLoading}
        isDiagnosingReferences={isDiagnosingReferences}
        isSyncingToElevator={isSyncingToElevator}
        isDetectingWindsorAccounts={isDetectingWindsorAccounts}
        isTestingRealFlow={isTestingRealFlow}
        isTestingStape={isTestingStape}
        isTestingWindsor={isTestingWindsor}
        onDetectWindsorAccounts={() => void detectWindsorAccounts()}
        onDiagnoseReferences={() => void diagnoseReferences()}
        onRefresh={() => void loadDashboard(secret, { skipBrowserCache: true })}
        onSendToElevator={() => void sendMonthToElevator()}
        onTestRealFlow={() => void testRealConversionFlow()}
        onTestStape={() => void testStape()}
        onTestWindsor={() => void testWindsor()}
        referenceDiagnostic={referenceDiagnostic}
        referenceDiagnosticError={referenceDiagnosticError}
        realFlowError={realFlowError}
        realFlowResult={realFlowResult}
        route={route}
        stapeTestError={stapeTestError}
        stapeTestResult={stapeTestResult}
        syncError={syncError}
        syncResult={syncResult}
        topPayments={topPayments}
        windsorAccounts={windsorAccounts}
        windsorAccountsError={windsorAccountsError}
        windsorError={windsorError}
        windsorResult={windsorResult}
      />
    </div>
  );
}

type ChartRow = {
  date: string;
  revenue: number;
};

function DashboardRoute({
  route,
  data,
  systemStatus,
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
  if (route === "proyeccion" || route === "projection") {
    return <Projection data={data} />;
  }

  if (route === "revenue") {
    return (
      <>
        <StatsGrid data={data} />
        <RevenueChart chartRows={chartRows} data={data} />
        <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <BranchRevenueCard data={data} />
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
    return (
      <IntegrationPanel
        badge={route === "status" ? "Healthy" : "Interno"}
        rows={[
          ["Revenue", formatMoney(data?.revenueTotal ?? 0)],
          ["Pagos", formatInteger(data?.paymentsTotal ?? 0)],
          ["Pacientes", formatInteger(data?.uniquePatientsTotal ?? 0)],
        ]}
        title={route === "status" ? "Estado del sistema" : "Ayuda interna"}
      />
    );
  }

  return (
    <ControlRoom
      chartRows={chartRows}
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

function ControlRoom({
  chartRows,
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
        <Card className="overflow-hidden border-emerald-300/30 bg-[radial-gradient(circle_at_top_left,rgba(110,231,183,0.18),transparent_36%),linear-gradient(135deg,rgba(16,185,129,0.08),transparent_48%)]">
          <CardHeader>
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <CardTitle className="text-3xl md:text-4xl">
                  Operacion
                </CardTitle>
              </div>
              <Badge className="w-fit bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/15">
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

        <Card>
          <CardHeader>
            <CardTitle>Estado</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <ReadinessRow
              icon={<DatabaseIcon aria-hidden="true" />}
              label="Dentalink"
              status={modeLabel(systemStatus?.config.dentalinkMode)}
              tone={systemStatus?.config.dentalinkMode === "api" ? "good" : "warn"}
            />
            <ReadinessRow
              icon={<SendIcon aria-hidden="true" />}
              label="Elevator"
              status={modeLabel(systemStatus?.config.elevatorMode)}
              tone={systemStatus?.config.elevatorMode === "api" ? "good" : "warn"}
            />
            <ReadinessRow
              icon={<WebhookIcon aria-hidden="true" />}
              label="Stape"
              status={modeLabel(systemStatus?.config.stapeMode)}
              tone={systemStatus?.config.stapeMode === "api" ? "good" : "warn"}
            />
            <ReadinessRow
              icon={<ShieldCheckIcon aria-hidden="true" />}
              label="Persistencia"
              status={systemStatus?.config.stateStoreMode === "redis" ? "Redis" : "Temporal"}
              tone={systemStatus?.config.stateStoreMode === "redis" ? "good" : "warn"}
            />
          </CardContent>
        </Card>
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

function HeroMetric({
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

function ReadinessRow({
  icon,
  label,
  status,
  tone,
}: {
  icon: ReactNode;
  label: string;
  status: string;
  tone: "good" | "warn";
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border bg-background/50 p-3">
      <div className="flex min-w-0 items-center gap-3">
        <span
          className={
            tone === "good"
              ? "grid size-9 place-items-center rounded-lg bg-emerald-500/15 text-emerald-300"
              : "grid size-9 place-items-center rounded-lg bg-amber-500/15 text-amber-200"
          }
        >
          {icon}
        </span>
        <div className="min-w-0">
          <p className="font-medium">{label}</p>
        </div>
      </div>
      <Badge variant={tone === "good" ? "default" : "secondary"}>{status}</Badge>
    </div>
  );
}

function GuidedActionsCard({
  data,
  isDetectingWindsorAccounts,
  isLoading,
  isSyncingToElevator,
  isTestingRealFlow,
  onDetectWindsorAccounts,
  onRefresh,
  onSendToElevator,
  onTestRealFlow,
  realFlowResult,
  syncResult,
  windsorAccounts,
}: {
  data: MonthlyDashboard | null;
  isDetectingWindsorAccounts: boolean;
  isLoading: boolean;
  isSyncingToElevator: boolean;
  isTestingRealFlow: boolean;
  onDetectWindsorAccounts: () => void;
  onRefresh: () => void;
  onSendToElevator: () => void;
  onTestRealFlow: () => void;
  realFlowResult: PaymentsSyncResult | null;
  syncResult: PaymentsSyncResult | null;
  windsorAccounts: WindsorAccountsResult | null;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Acciones</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <GuidedAction
          actionLabel={isLoading ? "Actualizando" : "Actualizar"}
          disabled={isLoading}
          icon={<RefreshCwIcon aria-hidden="true" />}
          onClick={onRefresh}
          status={
            data
              ? `${formatInteger(data.paymentsTotal)} pagos cargados`
              : "pendiente de cargar"
          }
          step="1"
          title="Traer datos reales de Dentalink"
          tone={data ? "done" : "next"}
        />
        <GuidedAction
          actionLabel={isSyncingToElevator ? "Enviando" : "Enviar"}
          disabled={isSyncingToElevator || !data}
          icon={<SendIcon aria-hidden="true" />}
          onClick={onSendToElevator}
          status={
            syncResult
              ? `${formatInteger(syncResult.createdLeads)} creados, ${formatInteger(syncResult.existingLeads ?? syncResult.alreadyProcessed)} existentes`
              : data
                ? "listo para enviar"
                : "necesita Dentalink"
          }
          step="2"
          title="Sincronizar pacientes con Elevator"
          tone={syncResult ? "done" : data ? "next" : "idle"}
        />
        <GuidedAction
          actionLabel={isTestingRealFlow ? "Probando" : "Probar"}
          disabled={isTestingRealFlow}
          icon={<WebhookIcon aria-hidden="true" />}
          onClick={onTestRealFlow}
          status={
            realFlowResult
              ? `${formatInteger(realFlowResult.dispatched)} conversiones enviadas`
              : "prueba server-side"
          }
          step="3"
          title="Probar conversiones reales"
          tone={realFlowResult?.dispatched ? "done" : "next"}
        />
        <GuidedAction
          actionLabel={isDetectingWindsorAccounts ? "Detectando" : "Detectar"}
          disabled={isDetectingWindsorAccounts}
          icon={<TargetIcon aria-hidden="true" />}
          onClick={onDetectWindsorAccounts}
          status={
            windsorAccounts
              ? `${formatInteger(windsorAccounts.accounts?.length ?? 0)} fuentes detectadas`
              : "opcional marketing"
          }
          step="4"
          title="Revisar cuentas Windsor"
          tone={windsorAccounts ? "done" : "idle"}
        />
      </CardContent>
    </Card>
  );
}

function GuidedAction({
  actionLabel,
  disabled,
  icon,
  onClick,
  status,
  step,
  title,
  tone,
}: {
  actionLabel: string;
  disabled: boolean;
  icon: ReactNode;
  onClick: () => void;
  status: string;
  step: string;
  title: string;
  tone: "done" | "next" | "idle";
}) {
  const toneClass =
    tone === "done"
      ? "border-emerald-300/30 bg-emerald-500/5"
      : tone === "next"
        ? "border-sky-300/30 bg-sky-500/5"
        : "border-border bg-background/45";

  return (
    <div className={`rounded-2xl border p-4 ${toneClass}`}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-background text-muted-foreground">
            {tone === "done" ? <CheckCircle2Icon aria-hidden="true" /> : icon}
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">Paso {step}</Badge>
              <Badge
                className={
                  tone === "done"
                    ? "bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/15"
                    : "bg-muted text-muted-foreground hover:bg-muted"
                }
              >
                {status}
              </Badge>
            </div>
            <p className="mt-2 font-semibold">{title}</p>
          </div>
        </div>
        <Button disabled={disabled} onClick={onClick} variant={tone === "done" ? "secondary" : "default"}>
          {actionLabel}
        </Button>
      </div>
    </div>
  );
}

function OperationsResultCard({
  realFlowError,
  realFlowResult,
  syncError,
  syncResult,
}: {
  realFlowError: string | null;
  realFlowResult: PaymentsSyncResult | null;
  syncError: string | null;
  syncResult: PaymentsSyncResult | null;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Ultima accion ejecutada</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {syncError || realFlowError ? (
          <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-destructive text-sm">
            {syncError ?? realFlowError}
          </div>
        ) : null}
        {syncResult ? (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <SyncMetric label="Pagos" value={syncResult.paymentsFound} />
            <SyncMetric label="Creados" value={syncResult.createdLeads} />
            <SyncMetric label="Existentes" value={syncResult.existingLeads ?? syncResult.alreadyProcessed} />
            <SyncMetric label="Listos Stape" value={syncResult.dispatched} />
          </div>
        ) : null}
        {realFlowResult ? <RealFlowResult result={realFlowResult} /> : null}
      </CardContent>
    </Card>
  );
}

function StatsGrid({ data }: { data: MonthlyDashboard | null }) {
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

function RevenueChart({
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

function RecentPatientsCard({ payments }: { payments: PaymentBlock[] }) {
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

function TreatmentListCard({ data }: { data: MonthlyDashboard | null }) {
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
                  <span className="font-semibold text-emerald-400">
                    {formatMoney(treatment.revenue)}
                  </span>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-emerald-300"
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

function BranchRevenueCard({ data }: { data: MonthlyDashboard | null }) {
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
                    <p className="font-semibold text-emerald-400 text-xl">
                      {formatMoney(branch.revenue)}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {formatPercent(branch.share)} del revenue
                    </p>
                  </div>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-emerald-300"
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

function DayBlocksCard({ data }: { data: MonthlyDashboard | null }) {
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

function ReferenceDiagnosticCard({
  diagnostic,
  error,
  isLoading,
  onDiagnose,
}: {
  diagnostic: ReferenceDiagnostic | null;
  error: string | null;
  isLoading: boolean;
  onDiagnose: () => void;
}) {
  const workingCatalog = diagnostic?.catalogProbes.find(
    (probe) => probe.ok && (probe.returnedCount ?? 0) > 0,
  );
  const detectedFields =
    diagnostic?.patientProbes.flatMap((probe) =>
      probe.fields.map((field) => `${field.key}: ${field.value}`),
    ) ?? [];
  const checkedPaths =
    diagnostic?.patientProbes.flatMap((probe) =>
      (probe.checkedPaths ?? []).map((path) => {
        const fields = path.fields
          .map((field) => `${field.key}=${field.value}`)
          .join(", ");
        return `Paciente ${probe.patientId} · ${path.path} · status ${path.status}${fields ? ` · ${fields}` : ""}`;
      }),
    ) ?? [];

  return (
    <Card>
      <CardHeader className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <CardTitle>Diagnostico de referencias Dentalink</CardTitle>
        </div>
        <Button disabled={isLoading} onClick={onDiagnose} variant="secondary">
          <RefreshCwIcon aria-hidden="true" data-icon="inline-start" />
          {isLoading ? "Diagnosticando" : "Diagnosticar referencias"}
        </Button>
      </CardHeader>
      {(diagnostic || error) && (
        <CardContent className="space-y-4">
          {error ? (
            <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-destructive text-sm">
              {error}
            </div>
          ) : null}

          {diagnostic ? (
            <>
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
                <div className="rounded-xl border bg-background/50 p-4">
                  <p className="text-muted-foreground text-xs uppercase tracking-[0.2em]">
                    Campo configurado
                  </p>
                  <p className="mt-2 font-semibold">{diagnostic.configuredPatientReferenceField}</p>
                </div>
                <div className="rounded-xl border bg-background/50 p-4">
                  <p className="text-muted-foreground text-xs uppercase tracking-[0.2em]">
                    Catalogo
                  </p>
                  <p className="mt-2 font-semibold">
                    {workingCatalog
                      ? `${workingCatalog.path} (${workingCatalog.returnedCount})`
                      : "No encontrado"}
                  </p>
                </div>
                <div className="rounded-xl border bg-background/50 p-4">
                  <p className="text-muted-foreground text-xs uppercase tracking-[0.2em]">
                    Recomendacion
                  </p>
                  <p className="mt-2 font-semibold">{diagnostic.recommendation}</p>
                </div>
              </div>

              <div className="rounded-xl border bg-background/50 p-4">
                <p className="mb-3 text-muted-foreground text-xs uppercase tracking-[0.2em]">
                  Campos detectados
                </p>
                {detectedFields.length > 0 ? (
                  <pre className="max-h-56 overflow-auto whitespace-pre-wrap text-xs">
                    {detectedFields.join("\n")}
                  </pre>
                ) : (
                  <p className="text-muted-foreground text-sm">Sin candidatos.</p>
                )}
              </div>

              {checkedPaths.length > 0 ? (
                <div className="rounded-xl border bg-background/50 p-4">
                  <p className="mb-3 text-muted-foreground text-xs uppercase tracking-[0.2em]">
                    Rutas alternativas probadas
                  </p>
                  <pre className="max-h-56 overflow-auto whitespace-pre-wrap text-xs">
                    {checkedPaths.join("\n")}
                  </pre>
                </div>
              ) : null}
            </>
          ) : null}
        </CardContent>
      )}
    </Card>
  );
}

function IntegrationPanel({
  title,
  badge,
  rows,
}: {
  title: string;
  badge: string;
  rows: Array<[string, string]>;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>{title}</CardTitle>
        </div>
        <Badge variant="secondary">{badge}</Badge>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {rows.map(([label, value]) => (
            <div className="rounded-xl border bg-background/50 p-4" key={label}>
              <p className="text-muted-foreground text-xs uppercase tracking-[0.2em]">
                {label}
              </p>
              <p className="mt-2 font-semibold text-xl">{value}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function WindsorMarketingCard({
  accounts,
  accountsError,
  error,
  isDetectingAccounts,
  isLoading,
  onDetectAccounts,
  onTest,
  result,
}: {
  accounts: WindsorAccountsResult | null;
  accountsError: string | null;
  error: string | null;
  isDetectingAccounts: boolean;
  isLoading: boolean;
  onDetectAccounts: () => void;
  onTest: () => void;
  result: WindsorTestResult | null;
}) {
  const summary = result?.summary;
  const totals = summary?.totals ?? {
    spend: 0,
    clicks: 0,
    impressions: 0,
    reach: 0,
    videoTrueviewViews: 0,
  };
  const bySource = summary?.bySource ?? [];

  return (
    <Card className="border-sky-300/30">
      <CardHeader className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <CardTitle>Windsor AI marketing data</CardTitle>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            disabled={isDetectingAccounts}
            onClick={onDetectAccounts}
            variant="secondary"
          >
            <RefreshCwIcon aria-hidden="true" data-icon="inline-start" />
            {isDetectingAccounts ? "Detectando" : "Detectar cuentas"}
          </Button>
          <Button disabled={isLoading} onClick={onTest} variant="secondary">
            <RefreshCwIcon aria-hidden="true" data-icon="inline-start" />
            {isLoading ? "Probando" : "Probar Windsor"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {error ? (
          <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-destructive text-sm">
            {error}
          </div>
        ) : null}

        {accountsError ? (
          <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-destructive text-sm">
            {accountsError}
          </div>
        ) : null}

        {summary?.configured === false ? (
          <div className="rounded-xl border border-amber-300/40 bg-amber-300/10 p-4 text-amber-200 text-sm">
            Falta configurar WINDSOR_API_KEY en Vercel y redeployar.
          </div>
        ) : null}

        {accounts ? <WindsorAccountsCard accounts={accounts} /> : null}

        {result ? (
          <>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3 xl:grid-cols-6">
              <div className="rounded-xl border bg-background/50 p-4">
                <p className="text-muted-foreground text-xs uppercase tracking-[0.2em]">
                  Estado
                </p>
                <p className="mt-2 font-semibold text-emerald-400">
                  {summary?.configured === false ? "Pendiente" : "Conectado"}
                </p>
                <p className="mt-1 text-muted-foreground text-xs">
                  {formatInteger(summary?.filteredRowCount ?? summary?.rows?.length ?? 0)} de{" "}
                  {formatInteger(summary?.rawRowCount ?? summary?.rows?.length ?? 0)} filas
                </p>
              </div>
              <div className="rounded-xl border bg-background/50 p-4">
                <p className="text-muted-foreground text-xs uppercase tracking-[0.2em]">
                  Spend
                </p>
                <p className="mt-2 font-semibold text-2xl">
                  {formatMoney(totals.spend)}
                </p>
              </div>
              <div className="rounded-xl border bg-background/50 p-4">
                <p className="text-muted-foreground text-xs uppercase tracking-[0.2em]">
                  Clicks
                </p>
                <p className="mt-2 font-semibold text-2xl">
                  {formatInteger(totals.clicks)}
                </p>
              </div>
              <div className="rounded-xl border bg-background/50 p-4">
                <p className="text-muted-foreground text-xs uppercase tracking-[0.2em]">
                  Impresiones
                </p>
                <p className="mt-2 font-semibold text-2xl">
                  {formatInteger(totals.impressions ?? 0)}
                </p>
              </div>
              <div className="rounded-xl border bg-background/50 p-4">
                <p className="text-muted-foreground text-xs uppercase tracking-[0.2em]">
                  Reach
                </p>
                <p className="mt-2 font-semibold text-2xl">
                  {formatInteger(totals.reach ?? 0)}
                </p>
              </div>
              <div className="rounded-xl border bg-background/50 p-4">
                <p className="text-muted-foreground text-xs uppercase tracking-[0.2em]">
                  Video views
                </p>
                <p className="mt-2 font-semibold text-2xl">
                  {formatInteger(totals.videoTrueviewViews ?? 0)}
                </p>
              </div>
            </div>

            <div className="overflow-hidden rounded-xl border">
              <div className="flex items-center justify-between border-b bg-background/50 px-4 py-3">
                <div>
                  <p className="font-medium">Performance por fuente</p>
                  <p className="text-muted-foreground text-xs">
                    Conector {summary?.connector ?? "sin definir"} ·{" "}
                    {summary?.datePreset ?? "last_180d"}
                  </p>
                </div>
                <Badge variant="secondary">
                  {formatInteger(summary?.rows?.length ?? 0)} filas
                </Badge>
              </div>
              {bySource.length > 0 ? (
                <div className="max-h-80 overflow-auto">
                  <table className="w-full min-w-[860px] text-sm">
                    <thead className="sticky top-0 bg-card text-muted-foreground">
                      <tr className="border-b">
                        <th className="px-4 py-3 text-left font-medium">Fuente</th>
                        <th className="px-4 py-3 text-right font-medium">Spend</th>
                        <th className="px-4 py-3 text-right font-medium">Clicks</th>
                        <th className="px-4 py-3 text-right font-medium">Impresiones</th>
                        <th className="px-4 py-3 text-right font-medium">Reach</th>
                        <th className="px-4 py-3 text-right font-medium">Video views</th>
                        <th className="px-4 py-3 text-right font-medium">Campanas</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bySource.map((source) => (
                        <tr className="border-b last:border-b-0" key={source.source}>
                          <td className="px-4 py-3 font-medium">{source.source}</td>
                          <td className="px-4 py-3 text-right text-emerald-400">
                            {formatMoney(source.spend)}
                          </td>
                          <td className="px-4 py-3 text-right">
                            {formatInteger(source.clicks)}
                          </td>
                          <td className="px-4 py-3 text-right">
                            {formatInteger(source.impressions ?? 0)}
                          </td>
                          <td className="px-4 py-3 text-right">
                            {formatInteger(source.reach ?? 0)}
                          </td>
                          <td className="px-4 py-3 text-right">
                            {formatInteger(source.videoTrueviewViews ?? 0)}
                          </td>
                          <td className="px-4 py-3 text-right">
                            {formatInteger(source.campaigns)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="p-4 text-muted-foreground text-sm">Sin filas.</p>
              )}
            </div>

            <details className="rounded-xl border bg-background/50 p-4">
              <summary className="cursor-pointer font-medium text-sm">
                Ver respuesta tecnica
              </summary>
              <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap text-xs">
                {JSON.stringify(result, null, 2)}
              </pre>
            </details>
          </>
        ) : (
          <p className="text-muted-foreground text-sm">Sin prueba ejecutada.</p>
        )}
      </CardContent>
    </Card>
  );
}

function WindsorAccountsCard({ accounts }: { accounts: WindsorAccountsResult }) {
  const rows = accounts.accounts ?? [];

  return (
    <div className="overflow-hidden rounded-xl border border-sky-300/30">
      <div className="flex items-center justify-between border-b bg-background/50 px-4 py-3">
        <div>
          <p className="font-medium">Cuentas detectadas por Windsor</p>
        </div>
        <Badge variant="secondary">
          {formatInteger(rows.length)} cuentas · {formatInteger(accounts.rowCount ?? 0)} filas
        </Badge>
      </div>
      {rows.length > 0 ? (
        <div className="max-h-96 overflow-auto">
          <table className="w-full min-w-[1100px] text-sm">
            <thead className="sticky top-0 bg-card text-muted-foreground">
              <tr className="border-b">
                <th className="px-4 py-3 text-left font-medium">Cuenta</th>
                <th className="px-4 py-3 text-left font-medium">Account ID</th>
                <th className="px-4 py-3 text-left font-medium">Ad Account</th>
                <th className="px-4 py-3 text-left font-medium">Ad Account ID</th>
                <th className="px-4 py-3 text-left font-medium">Business manager</th>
                <th className="px-4 py-3 text-right font-medium">Spend</th>
                <th className="px-4 py-3 text-right font-medium">Filas</th>
                <th className="px-4 py-3 text-left font-medium">Campanas muestra</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((account) => (
                <tr className="border-b last:border-b-0" key={account.key}>
                  <td className="px-4 py-3 font-medium">
                    {account.accountName ?? account.key}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {account.accountId ?? "-"}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {account.adAccountName ?? "-"}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {account.adAccountId ?? "-"}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {account.businessManager ?? "-"}
                  </td>
                  <td className="px-4 py-3 text-right text-emerald-400">
                    {formatMoney(account.spend)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {formatInteger(account.rows)}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {account.campaigns.slice(0, 3).join(", ") || "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="p-4 text-muted-foreground text-sm">
          Windsor respondio, pero no devolvio campos de cuenta. Necesitamos ajustar
          WINDSOR_DEFAULT_FIELDS segun el nombre real del campo.
        </p>
      )}
    </div>
  );
}

function StapeTestCard({
  error,
  isTesting,
  isTestingRealFlow,
  onTest,
  onTestRealFlow,
  realFlowError,
  realFlowResult,
  result,
}: {
  error: string | null;
  isTesting: boolean;
  isTestingRealFlow: boolean;
  onTest: () => void;
  onTestRealFlow: () => void;
  realFlowError: string | null;
  realFlowResult: PaymentsSyncResult | null;
  result: StapeTestResult | null;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <CardTitle>Flujo de conversiones</CardTitle>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button disabled={isTesting} onClick={onTest} variant="secondary">
            <RefreshCwIcon aria-hidden="true" data-icon="inline-start" />
            {isTesting ? "Probando demo" : "Probar Stape demo"}
          </Button>
          <Button disabled={isTestingRealFlow} onClick={onTestRealFlow}>
            <RefreshCwIcon aria-hidden="true" data-icon="inline-start" />
            {isTestingRealFlow ? "Probando flujo" : "Probar flujo real"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <FlowStep
            label="1"
            title="Dentalink"
          />
          <FlowStep
            label="2"
            title="Elevator"
          />
          <FlowStep
            label="3"
            title="Stape"
          />
        </div>

        {error || result || realFlowError || realFlowResult ? (
          <div className="space-y-4">
          {error ? (
            <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-destructive text-sm">
              {error}
            </div>
          ) : null}

          {realFlowError ? (
            <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-destructive text-sm">
              {realFlowError}
            </div>
          ) : null}

          {realFlowResult ? <RealFlowResult result={realFlowResult} /> : null}

          {result ? (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="rounded-xl border bg-background/50 p-4">
                <p className="text-muted-foreground text-xs uppercase tracking-[0.2em]">
                  Stape demo
                </p>
                <p className="mt-2 font-semibold text-emerald-400">
                  Conexion activa
                </p>
                <details className="mt-3">
                  <summary className="cursor-pointer text-sm">JSON</summary>
                  <pre className="mt-3 max-h-44 overflow-auto whitespace-pre-wrap text-xs">
                    {JSON.stringify(result.event, null, 2)}
                  </pre>
                </details>
              </div>
              <div className="rounded-xl border bg-background/50 p-4">
                <p className="text-muted-foreground text-xs uppercase tracking-[0.2em]">
                  Configuracion
                </p>
                <details className="mt-3">
                  <summary className="cursor-pointer text-sm">JSON</summary>
                  <pre className="mt-3 max-h-44 overflow-auto whitespace-pre-wrap text-xs">
                    {JSON.stringify(result.ping, null, 2)}
                  </pre>
                </details>
              </div>
            </div>
          ) : null}
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">Sin prueba ejecutada.</p>
        )}
      </CardContent>
    </Card>
  );
}

function FlowStep({
  label,
  title,
}: {
  label: string;
  title: string;
}) {
  return (
    <div className="rounded-xl border bg-background/50 p-4">
      <div className="flex items-center gap-3">
        <span className="flex size-8 items-center justify-center rounded-full bg-emerald-300 font-semibold text-background">
          {label}
        </span>
        <p className="font-semibold">{title}</p>
      </div>
    </div>
  );
}

function RealFlowResult({ result }: { result: PaymentsSyncResult }) {
  const status =
    result.dispatched > 0
      ? "Stape recibio conversiones reales."
      : result.matchedLeads > 0
        ? "Hubo match en Elevator, pero no se envio a Stape."
        : "No hubo pagos con match listo para Stape.";

  return (
    <div className="rounded-xl border border-emerald-300/30 bg-background/50 p-4">
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="font-semibold text-lg">Resultado del flujo real</p>
          <p className="text-muted-foreground text-sm">{status}</p>
        </div>
        <Badge variant={result.dispatched > 0 ? "default" : "secondary"}>
          {result.dispatched > 0 ? "Enviado a Stape" : "Sin envio real"}
        </Badge>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <SyncMetric label="Pagos revisados" value={result.paymentsFound} />
        <SyncMetric label="Nuevos pagos" value={result.newPayments} />
        <SyncMetric label="Match Elevator" value={result.matchedLeads} />
        <SyncMetric label="Enviados Stape" value={result.dispatched} />
      </div>
      <details className="mt-4 rounded-xl border bg-background/70 p-3">
        <summary className="cursor-pointer font-medium text-sm">JSON</summary>
        <pre className="mt-3 max-h-48 overflow-auto whitespace-pre-wrap text-xs">
          {JSON.stringify(result, null, 2)}
        </pre>
      </details>
    </div>
  );
}

function ElevatorSyncCard({
  isSyncing,
  onSend,
  result,
  syncError,
}: {
  isSyncing: boolean;
  onSend: () => void;
  result: PaymentsSyncResult | null;
  syncError: string | null;
}) {
  return (
    <Card className="border-emerald-300/30">
      <CardHeader className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <CardTitle>Enviar pacientes recientes a Elevator</CardTitle>
        </div>
        <Button disabled={isSyncing} onClick={onSend}>
          <RefreshCwIcon aria-hidden="true" data-icon="inline-start" />
          {isSyncing ? "Enviando" : "Enviar a Elevator"}
        </Button>
      </CardHeader>
      {(result || syncError) && (
        <CardContent>
          {syncError ? (
            <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-destructive text-sm">
              {syncError}
            </div>
          ) : null}
          {result ? (
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <SyncMetric label="Pagos encontrados" value={result.paymentsFound} />
                <SyncMetric label="Leads creados" value={result.createdLeads} />
                <SyncMetric label="Ya existian" value={result.existingLeads ?? result.alreadyProcessed} />
                <SyncMetric label="Sin match/contacto" value={result.unmatchedLeads} />
                <SyncMetric label="Eventos preparados" value={result.dispatched} />
                <SyncMetric label="Fallidos" value={result.failed ?? 0} />
              </div>
              <ElevatorImportResultsTable results={result.results ?? []} />
            </div>
          ) : null}
        </CardContent>
      )}
    </Card>
  );
}

function ElevatorImportResultsTable({
  results,
}: {
  results: ElevatorImportResult[];
}) {
  if (results.length === 0) {
    return null;
  }

  return (
    <div className="overflow-hidden rounded-xl border">
      <div className="flex items-center justify-between border-b bg-background/50 px-4 py-3">
        <div>
          <p className="font-medium">Detalle de envio a Elevator</p>
        </div>
        <Badge variant="secondary">{formatInteger(results.length)} registros</Badge>
      </div>
      <div className="max-h-96 overflow-auto">
        <table className="w-full min-w-[960px] text-sm">
          <thead className="sticky top-0 bg-card text-muted-foreground">
            <tr className="border-b">
              <th className="px-4 py-3 text-left font-medium">Paciente</th>
              <th className="px-4 py-3 text-left font-medium">Contacto</th>
              <th className="px-4 py-3 text-left font-medium">Referencia</th>
              <th className="px-4 py-3 text-left font-medium">Sucursal</th>
              <th className="px-4 py-3 text-left font-medium">Estado</th>
              <th className="px-4 py-3 text-left font-medium">Elevator ID</th>
              <th className="px-4 py-3 text-left font-medium">Listo para Stape</th>
              <th className="px-4 py-3 text-left font-medium">Motivo</th>
            </tr>
          </thead>
          <tbody>
            {results.map((result) => (
              <tr className="border-b last:border-b-0" key={`${result.paymentId}-${result.patientId}-${result.status}`}>
                <td className="px-4 py-3 font-medium">{result.patientName}</td>
                <td className="px-4 py-3 text-muted-foreground">{result.contact}</td>
                <td className="px-4 py-3 text-muted-foreground">{result.reference}</td>
                <td className="px-4 py-3 text-muted-foreground">{result.branch}</td>
                <td className="px-4 py-3">
                  <StatusBadge status={result.status} />
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {result.elevatorId ?? "-"}
                </td>
                <td className="px-4 py-3">
                  {result.readyForStape ? (
                    <Badge className="bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/15">
                      Preparado
                    </Badge>
                  ) : (
                    <Badge variant="secondary">Pendiente</Badge>
                  )}
                </td>
                <td className="px-4 py-3 text-muted-foreground">{result.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: ElevatorImportResult["status"] }) {
  const labelByStatus = {
    created: "Creado",
    existing: "Ya existia",
    failed: "Fallo",
    skipped_missing_contact: "Sin contacto",
  };

  const classNameByStatus = {
    created: "bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/15",
    existing: "bg-sky-500/15 text-sky-300 hover:bg-sky-500/15",
    failed: "bg-red-500/15 text-red-300 hover:bg-red-500/15",
    skipped_missing_contact: "bg-amber-500/15 text-amber-300 hover:bg-amber-500/15",
  };

  return (
    <Badge className={classNameByStatus[status]}>
      {labelByStatus[status]}
    </Badge>
  );
}

function SyncMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border bg-background/50 p-4">
      <p className="text-muted-foreground text-xs uppercase tracking-[0.2em]">
        {label}
      </p>
      <p className="mt-2 font-semibold text-2xl tabular-nums">
        {formatInteger(value)}
      </p>
    </div>
  );
}

function EmptyState({
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
          {payment.patientReference ?? "Sin referencia"} ·{" "}
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

function modeLabel(value: string | undefined) {
  if (value === "api") {
    return "API";
  }

  if (value === "redis") {
    return "Redis";
  }

  if (value === "stub") {
    return "Stub";
  }

  if (value === "file") {
    return "Temporal";
  }

  return value ?? "Sin validar";
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

function formatPercent(value: number) {
  return new Intl.NumberFormat("es-MX", {
    maximumFractionDigits: 1,
  }).format(value) + "%";
}

function readErrorMessage(value: unknown, fallback: string): string {
  if (typeof value !== "object" || value === null) {
    return fallback;
  }

  const record = value as {
    error?: unknown;
    details?: {
      message?: unknown;
    };
  };

  if (typeof record.details?.message === "string") {
    return record.details.message;
  }

  if (typeof record.error === "string") {
    return record.error;
  }

  return fallback;
}

function normalizeRoute(path = "") {
  return path.replace(/^#\/?/, "").split("?")[0] || "dashboard";
}

function readBrowserDashboardCache(): MonthlyDashboard | null {
  try {
    const rawCache = window.localStorage.getItem(DASHBOARD_BROWSER_CACHE_KEY);
    if (!rawCache) {
      return null;
    }

    const parsed = JSON.parse(rawCache) as {
      cachedAt: number;
      data: MonthlyDashboard;
    };

    if (Date.now() - parsed.cachedAt > DASHBOARD_BROWSER_CACHE_TTL_MS) {
      window.localStorage.removeItem(DASHBOARD_BROWSER_CACHE_KEY);
      return null;
    }

    return parsed.data;
  } catch {
    window.localStorage.removeItem(DASHBOARD_BROWSER_CACHE_KEY);
    return null;
  }
}

function writeBrowserDashboardCache(data: MonthlyDashboard) {
  window.localStorage.setItem(
    DASHBOARD_BROWSER_CACHE_KEY,
    JSON.stringify({
      cachedAt: Date.now(),
      data,
    }),
  );
}

function formatCacheTime(value: string) {
  return new Intl.DateTimeFormat("es-MX", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
