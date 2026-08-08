"use client";

import { useEffect, useMemo, useState } from "react";
import { RefreshCwIcon } from "lucide-react";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type {
  MonthlyDashboard,
  SystemStatus,
  PaymentsSyncResult,
  ReferenceDiagnostic,
  StapeTestResult,
  WindsorMarketingSummary,
  WindsorAccountsResult,
  WindsorTestResult,
} from "@/types/dashboard";
import { DashboardRoute } from "@/components/dashboard/dashboard-route";
import { type ChartRow } from "@/components/dashboard/attribution-panel";


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
  const [cronHeartbeatStatus, setCronHeartbeatStatus] = useState<"ok" | "stale" | "unknown" | null>(null);
  const [rangeDays, setRangeDays] = useState<7 | 30 | 180 | null>(null);

  async function loadDashboard(
    nextSecret = secret,
    options: { skipBrowserCache?: boolean; rangeDaysOverride?: 7 | 30 | 180 | null } = {},
  ) {
    if (!nextSecret.trim()) {
      setError("Pega el TRACKING_API_SECRET para cargar datos reales.");
      return;
    }

    const activeRange: 7 | 30 | 180 | null =
      "rangeDaysOverride" in options ? (options.rangeDaysOverride ?? null) : rangeDays;

    const cachedDashboard = options.skipBrowserCache
      ? null
      : readBrowserDashboardCache(activeRange);
    if (cachedDashboard) {
      setData(cachedDashboard);
      setError(null);
      void loadSystemStatus(nextSecret);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const url = activeRange
        ? `/api/dev/dentalink-monthly-dashboard?rangeDays=${activeRange}&compare=previous`
        : "/api/dev/dentalink-monthly-dashboard";
      const response = await fetch(url, {
        headers: {
          "x-tracking-secret": nextSecret.trim(),
        },
      });
      const body = (await response.json()) as MonthlyDashboard | { error?: string };

      if (!response.ok || !("days" in body)) {
        throw new Error("error" in body ? body.error : "No se pudo cargar Dentalink.");
      }

      window.localStorage.setItem("trackingSecret", nextSecret.trim());
      writeBrowserDashboardCache(body, activeRange);
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

  useEffect(() => {
    fetch("/api/health/cron-heartbeat")
      .then((res) => res.json())
      .then((body) => {
        const status = (body as { status?: string }).status;
        if (status === "ok" || status === "stale" || status === "unknown") {
          setCronHeartbeatStatus(status);
        }
      })
      .catch(() => {
        // Non-critical — leave status as null (not shown)
      });
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

  // La vista de Reunión carga sola desde datos estáticos: sin secret ni chrome de datos en vivo.
  const esReunion =
    route === "reunion" ||
    route === "reunion-nueva" ||
    route === "reunion-lab" ||
    route === "reunion-experimental";

  return (
    <div className="flex flex-col gap-4">
      {!esReunion && (
        <>
          <section className="flex items-center justify-between gap-4">
            <h1 className="text-balance font-semibold text-4xl tracking-tight md:text-5xl">
              Dr Diente Core
            </h1>
            <Button
              disabled={isLoading}
              onClick={() => void loadDashboard(secret, { skipBrowserCache: true })}
              variant={secret ? "default" : "outline"}
            >
              <RefreshCwIcon aria-hidden="true" data-icon="inline-start" />
              {isLoading ? "Cargando" : "Actualizar"}
            </Button>
          </section>

          {!secret && (
            <Card className="border-muted">
              <CardContent className="py-4 text-muted-foreground text-sm">
                Configura el{" "}
                <code className="font-mono text-xs">TRACKING_API_SECRET</code> en{" "}
                <a className="text-brand underline-offset-4 hover:underline" href="#/settings">
                  Configuración
                </a>{" "}
                para cargar datos.
              </CardContent>
            </Card>
          )}

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
            <Card className="border-warn/40">
              <CardContent className="py-4 text-warn text-sm">
                Estado del sistema no disponible: {statusError}
              </CardContent>
            </Card>
          ) : null}
        </>
      )}

      <DashboardRoute
        chartRows={chartRows}
        cronHeartbeatStatus={cronHeartbeatStatus}
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
        onRangeChange={(days) => {
          setRangeDays(days);
          void loadDashboard(secret, { skipBrowserCache: true, rangeDaysOverride: days });
        }}
        onSaveSecret={() => void loadDashboard(secret, { skipBrowserCache: true })}
        onSecretChange={(value) => setSecret(value)}
        onSendToElevator={() => void sendMonthToElevator()}
        onTestRealFlow={() => void testRealConversionFlow()}
        onTestStape={() => void testStape()}
        onTestWindsor={() => void testWindsor()}
        rangeDays={rangeDays}
        referenceDiagnostic={referenceDiagnostic}
        referenceDiagnosticError={referenceDiagnosticError}
        realFlowError={realFlowError}
        realFlowResult={realFlowResult}
        route={route}
        secret={secret}
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
  return path.replace(/^#\/?/, "").split("?")[0] || "duenos";
}

function rangeCacheKey(range: 7 | 30 | 180 | null): string {
  return range !== null ? `${DASHBOARD_BROWSER_CACHE_KEY}:range${range}` : DASHBOARD_BROWSER_CACHE_KEY;
}

function readBrowserDashboardCache(range: 7 | 30 | 180 | null = null): MonthlyDashboard | null {
  const key = rangeCacheKey(range);
  try {
    const rawCache = window.localStorage.getItem(key);
    if (!rawCache) {
      return null;
    }

    const parsed = JSON.parse(rawCache) as {
      cachedAt: number;
      data: MonthlyDashboard;
    };

    if (Date.now() - parsed.cachedAt > DASHBOARD_BROWSER_CACHE_TTL_MS) {
      window.localStorage.removeItem(key);
      return null;
    }

    return parsed.data;
  } catch {
    window.localStorage.removeItem(key);
    return null;
  }
}

function writeBrowserDashboardCache(data: MonthlyDashboard, range: 7 | 30 | 180 | null = null) {
  window.localStorage.setItem(
    rangeCacheKey(range),
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
