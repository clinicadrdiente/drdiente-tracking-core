import { RefreshCwIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ModuleFrame } from "./module-frame";
import { SyncMetric } from "./actions";
import type {
  PaymentsSyncResult,
  ElevatorImportResult,
} from "@/types/dashboard";

function formatInteger(value: number) {
  return new Intl.NumberFormat("es-MX", {
    maximumFractionDigits: 0,
  }).format(value);
}

function StatusBadge({ status }: { status: ElevatorImportResult["status"] }) {
  const labelByStatus = {
    created: "Creado",
    existing: "Ya existia",
    failed: "Fallo",
    skipped_missing_contact: "Sin contacto",
  };

  const classNameByStatus = {
    created: "bg-brand/15 text-brand hover:bg-brand/15",
    existing: "bg-brand/15 text-brand hover:bg-brand/15",
    failed: "bg-danger/15 text-danger hover:bg-danger/15",
    skipped_missing_contact: "bg-warn/15 text-warn hover:bg-warn/15",
  };

  return (
    <Badge className={classNameByStatus[status]}>{labelByStatus[status]}</Badge>
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
        <Badge variant="secondary">
          {formatInteger(results.length)} registros
        </Badge>
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
              <th className="px-4 py-3 text-left font-medium">
                Listo para Stape
              </th>
              <th className="px-4 py-3 text-left font-medium">Motivo</th>
            </tr>
          </thead>
          <tbody>
            {results.map((result) => (
              <tr
                className="border-b last:border-b-0"
                key={`${result.paymentId}-${result.patientId}-${result.status}`}
              >
                <td className="px-4 py-3 font-medium">{result.patientName}</td>
                <td className="px-4 py-3 text-muted-foreground">
                  {result.contact}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {result.reference}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {result.branch}
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={result.status} />
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {result.elevatorId ?? "-"}
                </td>
                <td className="px-4 py-3">
                  {result.readyForStape ? (
                    <Badge className="bg-brand/15 text-brand hover:bg-brand/15">
                      Preparado
                    </Badge>
                  ) : (
                    <Badge variant="secondary">Pendiente</Badge>
                  )}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {result.reason}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function ElevatorSyncCard({
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
    <Card className="border-brand/30">
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
                <SyncMetric
                  label="Pagos encontrados"
                  value={result.paymentsFound}
                />
                <SyncMetric label="Leads creados" value={result.createdLeads} />
                <SyncMetric
                  label="Ya existian"
                  value={result.existingLeads ?? result.alreadyProcessed}
                />
                <SyncMetric
                  label="Sin match/contacto"
                  value={result.unmatchedLeads}
                />
                <SyncMetric
                  label="Eventos preparados"
                  value={result.dispatched}
                />
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

export function IntegrationPanel({
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

export function ElevatorPanel({
  data,
  isSyncing,
  onSend,
  result,
  syncError,
}: {
  data: { patients: unknown[] } | null;
  isSyncing: boolean;
  onSend: () => void;
  result: PaymentsSyncResult | null;
  syncError: string | null;
}) {
  return (
    <ModuleFrame accent="operations" title="Elevator CRM">
      <ElevatorSyncCard
        isSyncing={isSyncing}
        onSend={onSend}
        result={result}
        syncError={syncError}
      />
      <IntegrationPanel
        badge="API conectada"
        rows={[
          ["Modo", "api"],
          ["Leads demo", "creacion y deduplicacion activa"],
          [
            "Matching pagos",
            `${formatInteger(data?.patients.length ?? 0)} pagos disponibles`,
          ],
        ]}
        title="Elevator CRM"
      />
    </ModuleFrame>
  );
}
