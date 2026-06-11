import type { ReactNode } from "react";
import {
  CheckCircle2Icon,
  RefreshCwIcon,
  SendIcon,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ModuleFrame } from "./module-frame";
import type { MonthlyDashboard, PaymentsSyncResult } from "@/types/dashboard";

function formatInteger(value: number) {
  return new Intl.NumberFormat("es-MX", {
    maximumFractionDigits: 0,
  }).format(value);
}

export function SyncMetric({ label, value }: { label: string; value: number }) {
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

export function RealFlowResult({ result }: { result: PaymentsSyncResult }) {
  const status =
    result.dispatched > 0
      ? "Stape recibio conversiones reales."
      : result.matchedLeads > 0
        ? "Hubo match en Elevator, pero no se envio a Stape."
        : "No hubo pagos con match listo para Stape.";

  return (
    <div className="rounded-xl border border-brand/30 bg-background/50 p-4">
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
      ? "border-brand/30 bg-brand/5"
      : tone === "next"
        ? "border-brand/30 bg-brand/5"
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
                    ? "bg-brand/15 text-brand hover:bg-brand/15"
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

export function GuidedActionsCard({
  data,
  isLoading,
  isSyncingToElevator,
  onRefresh,
  onSendToElevator,
  syncResult,
}: {
  data: MonthlyDashboard | null;
  isLoading: boolean;
  isSyncingToElevator: boolean;
  onRefresh: () => void;
  onSendToElevator: () => void;
  syncResult: PaymentsSyncResult | null;
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
      </CardContent>
    </Card>
  );
}

export function OperationsResultCard({
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

export function ActionsPanel({
  data,
  isLoading,
  isSyncingToElevator,
  onRefresh,
  onSendToElevator,
  realFlowError,
  realFlowResult,
  syncError,
  syncResult,
}: {
  data: MonthlyDashboard | null;
  isLoading: boolean;
  isSyncingToElevator: boolean;
  onRefresh: () => void;
  onSendToElevator: () => void;
  realFlowError: string | null;
  realFlowResult: PaymentsSyncResult | null;
  syncError: string | null;
  syncResult: PaymentsSyncResult | null;
}) {
  return (
    <ModuleFrame accent="operations" title="Acciones">
      <GuidedActionsCard
        data={data}
        isLoading={isLoading}
        isSyncingToElevator={isSyncingToElevator}
        onRefresh={onRefresh}
        onSendToElevator={onSendToElevator}
        syncResult={syncResult}
      />
      {(syncError || realFlowError || syncResult || realFlowResult) ? (
        <OperationsResultCard
          realFlowError={realFlowError}
          realFlowResult={realFlowResult}
          syncError={syncError}
          syncResult={syncResult}
        />
      ) : null}
    </ModuleFrame>
  );
}
