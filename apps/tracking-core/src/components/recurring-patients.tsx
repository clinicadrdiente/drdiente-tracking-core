"use client";

import { useEffect, useState } from "react";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  RefreshCwIcon,
  RepeatIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

interface TreatmentRecord {
  treatmentId: number;
  treatmentName: string | null;
  budgetTotal: number;
  currency: string;
  firstPaymentAt: string;
  lastPaymentAt: string;
}

interface PatientSummary {
  patientId: number;
  patientName: string | null;
  branch: string | null;
  treatments: TreatmentRecord[];
  treatmentCount: number;
  totalBudget: number;
  firstPaymentAt: string;
  lastPaymentAt: string;
}

interface RecurringPatientsResponse {
  ok: boolean;
  minTreatments: number;
  count: number;
  patients: PatientSummary[];
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(iso: string) {
  return new Intl.DateTimeFormat("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(iso));
}

function PatientRow({ patient }: { patient: PatientSummary }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border rounded-lg overflow-hidden">
      <button
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors text-left"
        onClick={() => setExpanded(!expanded)}
        type="button"
      >
        <span className="text-muted-foreground shrink-0">
          {expanded ? (
            <ChevronDownIcon className="size-4" />
          ) : (
            <ChevronRightIcon className="size-4" />
          )}
        </span>
        <span className="font-medium flex-1 truncate">
          {patient.patientName ?? `Paciente #${patient.patientId}`}
        </span>
        <span className="text-muted-foreground text-sm hidden sm:block shrink-0">
          {patient.branch ?? "—"}
        </span>
        <Badge
          variant={patient.treatmentCount >= 3 ? "default" : "secondary"}
          className="shrink-0"
        >
          {patient.treatmentCount}{" "}
          {patient.treatmentCount === 1 ? "tratamiento" : "tratamientos"}
        </Badge>
        <span className="font-semibold text-sm shrink-0">
          {formatMoney(patient.totalBudget)}
        </span>
      </button>

      {expanded && (
        <div className="border-t bg-muted/20 px-4 py-3 space-y-2">
          <div className="text-xs text-muted-foreground mb-3">
            Primer pago: {formatDate(patient.firstPaymentAt)} · Último:{" "}
            {formatDate(patient.lastPaymentAt)}
          </div>
          {patient.treatments.map((t) => (
            <div
              key={t.treatmentId}
              className="flex items-center gap-3 text-sm"
            >
              <span className="size-2 rounded-full bg-primary/60 shrink-0" />
              <span className="flex-1 truncate">
                {t.treatmentName ?? `Tratamiento #${t.treatmentId}`}
              </span>
              <span className="text-muted-foreground text-xs hidden sm:block shrink-0">
                {formatDate(t.firstPaymentAt)}
              </span>
              <span className="font-medium shrink-0">
                {formatMoney(t.budgetTotal)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function RecurringPatients({ secret }: { secret: string }) {
  const [minTreatments, setMinTreatments] = useState<"1" | "2" | "3">("2");
  const [data, setData] = useState<RecurringPatientsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadData(min = minTreatments) {
    if (!secret.trim()) {
      setError("Configura el TRACKING_API_SECRET en Configuración.");
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/reports/patient-treatments?min_treatments=${min}`,
        {
          headers: { "x-tracking-secret": secret.trim() },
        },
      );
      const body = (await res.json()) as
        | RecurringPatientsResponse
        | { error?: string };
      if (!res.ok || !("patients" in body)) {
        throw new Error(
          "error" in body ? body.error : "Error al cargar pacientes.",
        );
      }
      setData(body);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleMinChange(value: "1" | "2" | "3") {
    setMinTreatments(value);
    void loadData(value);
  }

  const totalBudget =
    data?.patients.reduce((sum, p) => sum + p.totalBudget, 0) ?? 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <RepeatIcon className="size-6 text-primary" />
            Pacientes Recurrentes
          </h2>
          <p className="text-muted-foreground text-sm mt-0.5">
            Pacientes que han pagado más de un tratamiento
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={minTreatments}
            onValueChange={(v) => handleMinChange(v as "1" | "2" | "3")}
          >
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">Todos los pacientes</SelectItem>
              <SelectItem value="2">≥ 2 tratamientos</SelectItem>
              <SelectItem value="3">≥ 3 tratamientos</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="icon"
            onClick={() => void loadData()}
            disabled={isLoading}
            aria-label="Actualizar"
          >
            <RefreshCwIcon className={isLoading ? "animate-spin" : ""} />
          </Button>
        </div>
      </div>

      {error && (
        <Card className="border-destructive/40">
          <CardContent className="py-4 text-destructive text-sm">
            {error}
          </CardContent>
        </Card>
      )}

      {data && !isLoading && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Pacientes
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{data.count}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Tratamientos totales
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">
                {data.patients.reduce((sum, p) => sum + p.treatmentCount, 0)}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Presupuesto total
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{formatMoney(totalBudget)}</p>
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {isLoading
              ? "Cargando..."
              : data
                ? `${data.count} pacientes encontrados`
                : "Pacientes"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {isLoading && (
            <>
              <Skeleton className="h-12 w-full rounded-lg" />
              <Skeleton className="h-12 w-full rounded-lg" />
              <Skeleton className="h-12 w-full rounded-lg" />
            </>
          )}
          {!isLoading && data?.patients.length === 0 && (
            <p className="text-muted-foreground text-sm py-4 text-center">
              Aún no hay datos. Los tratamientos se acumulan automáticamente con
              cada sync de pagos.
            </p>
          )}
          {!isLoading &&
            data?.patients.map((patient) => (
              <PatientRow key={patient.patientId} patient={patient} />
            ))}
        </CardContent>
      </Card>
    </div>
  );
}
