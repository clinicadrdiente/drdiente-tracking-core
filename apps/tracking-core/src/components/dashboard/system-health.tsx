import type { ReactNode } from "react";
import {
  ClockIcon,
  DatabaseIcon,
  SendIcon,
  ShieldCheckIcon,
  WebhookIcon,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ModuleFrame } from "./module-frame";
import type { SystemStatus, MonthlyDashboard } from "@/types/dashboard";

function modeLabel(value: string | undefined) {
  if (value === "api") return "API";
  if (value === "redis") return "Redis";
  if (value === "stub") return "Stub";
  if (value === "file") return "Temporal";
  return value ?? "Sin validar";
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
              ? "grid size-9 place-items-center rounded-lg bg-brand/15 text-brand"
              : "grid size-9 place-items-center rounded-lg bg-warn/15 text-warn"
          }
        >
          {icon}
        </span>
        <div className="min-w-0">
          <p className="font-medium">{label}</p>
        </div>
      </div>
      <Badge variant={tone === "good" ? "default" : "secondary"}>
        {status}
      </Badge>
    </div>
  );
}

export function SystemHealthCard({
  systemStatus,
  cronHeartbeatStatus,
}: {
  systemStatus: SystemStatus | null;
  cronHeartbeatStatus: "ok" | "stale" | "unknown" | null;
}) {
  return (
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
          status={
            systemStatus?.config.stateStoreMode === "redis"
              ? "Redis"
              : "Temporal"
          }
          tone={
            systemStatus?.config.stateStoreMode === "redis" ? "good" : "warn"
          }
        />
        {cronHeartbeatStatus !== null && (
          <ReadinessRow
            icon={<ClockIcon aria-hidden="true" />}
            label="Cron pagos"
            status={
              cronHeartbeatStatus === "ok"
                ? "Al dia"
                : cronHeartbeatStatus === "stale"
                  ? "Sin ejecutar (+30h)"
                  : "Sin registro"
            }
            tone={cronHeartbeatStatus === "ok" ? "good" : "warn"}
          />
        )}
      </CardContent>
    </Card>
  );
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

export function SystemHealthPanel({
  route,
  data,
  systemStatus,
  cronHeartbeatStatus,
}: {
  route: string;
  data: MonthlyDashboard | null;
  systemStatus: SystemStatus | null;
  cronHeartbeatStatus: "ok" | "stale" | "unknown" | null;
}) {
  return (
    <ModuleFrame
      accent="health"
      title={route === "status" ? "Estado del sistema" : "Ayuda interna"}
    >
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle>
              {route === "status" ? "Estado del sistema" : "Ayuda interna"}
            </CardTitle>
          </div>
          <Badge variant="secondary">
            {route === "status" ? "Healthy" : "Interno"}
          </Badge>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {[
              ["Revenue", formatMoney(data?.revenueTotal ?? 0)],
              ["Pagos", formatInteger(data?.paymentsTotal ?? 0)],
              ["Pacientes", formatInteger(data?.uniquePatientsTotal ?? 0)],
            ].map(([label, value]) => (
              <div
                className="rounded-xl border bg-background/50 p-4"
                key={label}
              >
                <p className="text-muted-foreground text-xs uppercase tracking-[0.2em]">
                  {label}
                </p>
                <p className="mt-2 font-semibold text-xl">{value}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
      <SystemHealthCard
        systemStatus={systemStatus}
        cronHeartbeatStatus={cronHeartbeatStatus}
      />
    </ModuleFrame>
  );
}
