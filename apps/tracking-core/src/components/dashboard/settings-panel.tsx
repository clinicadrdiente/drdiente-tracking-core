import { RefreshCwIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { IntegrationPanel } from "./elevator-panel";

export function SettingsPanel({
  secret,
  onSecretChange,
  onSave,
}: {
  secret: string;
  onSecretChange: (value: string) => void;
  onSave: () => void;
}) {
  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardHeader>
          <CardTitle>Acceso al sistema</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              className="flex-1"
              onChange={(e) => onSecretChange(e.target.value)}
              placeholder="TRACKING_API_SECRET"
              type="password"
              value={secret}
            />
            <Button onClick={onSave}>
              <RefreshCwIcon aria-hidden="true" data-icon="inline-start" />
              Guardar y cargar
            </Button>
          </div>
          <p className="text-muted-foreground text-xs">
            El secret se guarda localmente en tu navegador y carga los datos al guardar.
          </p>
        </CardContent>
      </Card>
      <IntegrationPanel
        badge="Sistema"
        rows={[
          ["Dentalink", "api"],
          ["Elevator", "api"],
          ["Stape", "stub"],
          [
            "Secret local",
            typeof window !== "undefined" &&
            window.localStorage.getItem("trackingSecret")
              ? "configurado"
              : "pendiente",
          ],
        ]}
        title="Integraciones"
      />
    </div>
  );
}
