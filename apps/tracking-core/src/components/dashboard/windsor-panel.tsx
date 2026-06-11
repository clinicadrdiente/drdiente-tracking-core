import { RefreshCwIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ModuleFrame } from "./module-frame";
import type {
  WindsorAccountsResult,
  WindsorTestResult,
} from "@/types/dashboard";

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

function WindsorAccountsCard({ accounts }: { accounts: WindsorAccountsResult }) {
  const rows = accounts.accounts ?? [];

  return (
    <div className="overflow-hidden rounded-xl border border-brand/30">
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
                  <td className="px-4 py-3 text-right text-brand">
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

export function WindsorMarketingCard({
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
    <Card className="border-brand/30">
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
          <div className="rounded-xl border border-warn/40 bg-warn/10 p-4 text-warn text-sm">
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
                <p className="mt-2 font-semibold text-brand">
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
                          <td className="px-4 py-3 text-right text-brand">
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

export function WindsorPanel({
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
  return (
    <ModuleFrame accent="marketing" title="Windsor AI marketing data">
      <WindsorMarketingCard
        accounts={accounts}
        accountsError={accountsError}
        error={error}
        isDetectingAccounts={isDetectingAccounts}
        isLoading={isLoading}
        onDetectAccounts={onDetectAccounts}
        onTest={onTest}
        result={result}
      />
    </ModuleFrame>
  );
}
