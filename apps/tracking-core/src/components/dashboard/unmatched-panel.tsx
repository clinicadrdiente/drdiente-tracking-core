import { useState } from "react";
import { RefreshCwIcon, UserXIcon, CheckCircleIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { MonthlyDashboard, PaymentBlock } from "@/types/dashboard";

function formatMoney(value: number) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  }).format(value);
}

function hasContact(p: PaymentBlock): boolean {
  return Boolean(p.patientPhone || p.patientEmail);
}

function dedupeByPatient(payments: PaymentBlock[]): PaymentBlock[] {
  const seen = new Set<number>();
  return payments.filter((p) => {
    if (seen.has(p.patientId)) return false;
    seen.add(p.patientId);
    return true;
  });
}

export function UnmatchedPanel({
  data,
  secret,
}: {
  data: MonthlyDashboard | null;
  secret: string;
}) {
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<{
    created: number;
    existing: number;
    skipped: number;
    failed: number;
  } | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const allPatients = data?.patients ?? [];

  // Dedupe by patientId — one row per patient
  const uniquePatients = dedupeByPatient(allPatients);
  const sinContacto = uniquePatients.filter((p) => !hasContact(p));
  const conContacto = uniquePatients.filter(hasContact);

  async function handleImport() {
    if (!secret.trim() || conContacto.length === 0) return;
    setIsImporting(true);
    setImportError(null);
    setImportResult(null);
    try {
      const res = await fetch("/api/dev/elevator-import-patients", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-tracking-secret": secret.trim(),
        },
        body: JSON.stringify({
          patients: conContacto.map((p) => ({
            paymentId: p.paymentId,
            patientId: p.patientId,
            patientName: p.patientName,
            patientEmail: p.patientEmail,
            patientPhone: p.patientPhone,
            patientReference: p.patientReference,
            treatmentName: p.treatmentName,
            branch: p.branch,
          })),
        }),
      });
      const body = (await res.json()) as {
        createdLeads?: number;
        existingLeads?: number;
        skipped?: number;
        failed?: number;
      };
      setImportResult({
        created: body.createdLeads ?? 0,
        existing: body.existingLeads ?? 0,
        skipped: body.skipped ?? 0,
        failed: body.failed ?? 0,
      });
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setIsImporting(false);
    }
  }

  if (!data) {
    return (
      <p className="text-sm text-muted-foreground">
        Carga los datos del dashboard primero.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Summary tiles */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-5">
            <p className="text-sm text-muted-foreground">Total pacientes</p>
            <p className="text-2xl font-bold">{uniquePatients.length}</p>
          </CardContent>
        </Card>
        <Card className="border-green-200 dark:border-green-900">
          <CardContent className="pt-5">
            <p className="text-sm text-muted-foreground">Con contacto</p>
            <p className="text-2xl font-bold text-green-600 dark:text-green-400">
              {conContacto.length}
            </p>
            <p className="text-xs text-muted-foreground">
              pueden importarse a Elevator
            </p>
          </CardContent>
        </Card>
        <Card className="border-destructive/30">
          <CardContent className="pt-5">
            <p className="text-sm text-muted-foreground">Sin contacto</p>
            <p className="text-2xl font-bold text-destructive">
              {sinContacto.length}
            </p>
            <p className="text-xs text-muted-foreground">
              sin telefono ni email
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Import action */}
      {conContacto.length > 0 ? (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="text-base">Importar a Elevator</CardTitle>
              <Button
                disabled={isImporting || !secret.trim()}
                onClick={() => void handleImport()}
                size="sm"
              >
                <RefreshCwIcon aria-hidden="true" data-icon="inline-start" />
                {isImporting
                  ? "Importando..."
                  : `Importar ${conContacto.length} pacientes`}
              </Button>
            </div>
          </CardHeader>
          {importResult ? (
            <CardContent>
              <div className="flex flex-wrap gap-2">
                <Badge variant="default">
                  <CheckCircleIcon className="mr-1 size-3" />
                  {importResult.created} creados
                </Badge>
                <Badge variant="secondary">
                  {importResult.existing} ya existían
                </Badge>
                {importResult.skipped > 0 && (
                  <Badge variant="outline">
                    {importResult.skipped} omitidos
                  </Badge>
                )}
                {importResult.failed > 0 && (
                  <Badge variant="destructive">
                    {importResult.failed} fallidos
                  </Badge>
                )}
              </div>
            </CardContent>
          ) : null}
          {importError ? (
            <CardContent>
              <p className="text-sm text-destructive">{importError}</p>
            </CardContent>
          ) : null}
        </Card>
      ) : null}

      {/* Patients without contact info */}
      {sinContacto.length > 0 ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <UserXIcon
                className="size-4 text-destructive"
                aria-hidden="true"
              />
              Sin contacto — {sinContacto.length} pacientes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground mb-3">
              Estos pacientes no tienen telefono ni email. La clinica debe
              actualizar su ficha en Dentalink para que puedan importarse a
              Elevator.
            </p>
            <div className="flex flex-col divide-y">
              {sinContacto.map((p) => (
                <div
                  key={p.patientId}
                  className="flex items-center justify-between gap-3 py-2"
                >
                  <div>
                    <p className="text-sm font-medium capitalize">
                      {p.patientName?.toLowerCase() ??
                        `Paciente #${p.patientId}`}
                    </p>
                    {p.patientReference ? (
                      <p className="text-xs text-muted-foreground">
                        {p.patientReference}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {p.branch ? (
                      <Badge variant="outline" className="text-xs">
                        {p.branch}
                      </Badge>
                    ) : null}
                    <span className="text-sm font-medium">
                      {formatMoney(p.amount)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {sinContacto.length === 0 && conContacto.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No hay pacientes en el periodo seleccionado.
        </p>
      ) : null}
    </div>
  );
}
