import { RefreshCwIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ModuleFrame } from "./module-frame";
import { RealFlowResult } from "./actions";
import { IntegrationPanel } from "./elevator-panel";
import type {
  ReferenceDiagnostic,
  PaymentsSyncResult,
  StapeTestResult,
} from "@/types/dashboard";

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
        <span className="flex size-8 items-center justify-center rounded-full bg-brand font-semibold text-background">
          {label}
        </span>
        <p className="font-semibold">{title}</p>
      </div>
    </div>
  );
}

export function ReferenceDiagnosticCard({
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

export function StapeTestCard({
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
          <FlowStep label="1" title="Dentalink" />
          <FlowStep label="2" title="Elevator" />
          <FlowStep label="3" title="Stape" />
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
                <p className="mt-2 font-semibold text-brand">
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

export function DiagnosticsPanel({
  diagnostic,
  diagnosticError,
  isDiagnosing,
  isTesting,
  isTestingRealFlow,
  onDiagnose,
  onTest,
  onTestRealFlow,
  realFlowError,
  realFlowResult,
  stapeTestError,
  stapeTestResult,
}: {
  diagnostic: ReferenceDiagnostic | null;
  diagnosticError: string | null;
  isDiagnosing: boolean;
  isTesting: boolean;
  isTestingRealFlow: boolean;
  onDiagnose: () => void;
  onTest: () => void;
  onTestRealFlow: () => void;
  realFlowError: string | null;
  realFlowResult: PaymentsSyncResult | null;
  stapeTestError: string | null;
  stapeTestResult: StapeTestResult | null;
}) {
  return (
    <ModuleFrame accent="health" title="Diagnostico y configuracion">
      <IntegrationPanel
        badge="Sistema"
        rows={[
          ["Dentalink", "api"],
          ["Elevator", "api"],
          ["Stape", "stub"],
          ["Secret local", typeof window !== "undefined" && window.localStorage.getItem("trackingSecret") ? "configurado" : "pendiente"],
        ]}
        title="Configuracion"
      />
      <ReferenceDiagnosticCard
        diagnostic={diagnostic}
        error={diagnosticError}
        isLoading={isDiagnosing}
        onDiagnose={onDiagnose}
      />
      <StapeTestCard
        error={stapeTestError}
        isTesting={isTesting}
        isTestingRealFlow={isTestingRealFlow}
        onTest={onTest}
        onTestRealFlow={onTestRealFlow}
        realFlowError={realFlowError}
        realFlowResult={realFlowResult}
        result={stapeTestResult}
      />
    </ModuleFrame>
  );
}
