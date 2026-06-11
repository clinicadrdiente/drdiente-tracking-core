import { useState } from "react";
import { SearchIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ItemGroup } from "@/components/ui/item";
import { PatientItem, EmptyState } from "./attribution-panel";
import type { MonthlyDashboard } from "@/types/dashboard";

const INITIAL_VISIBLE = 20;

export function PatientsPanel({
  data,
  isLoading,
  onRefresh,
}: {
  data: MonthlyDashboard | null;
  isLoading: boolean;
  onRefresh: () => void;
}) {
  const [search, setSearch] = useState("");
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE);

  const allPatients = data?.patients ?? [];
  const filtered = search.trim()
    ? allPatients.filter((p) =>
        (p.patientName ?? "").toLowerCase().includes(search.toLowerCase()),
      )
    : allPatients;
  const visible = filtered.slice(0, visibleCount);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pacientes del mes</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {allPatients.length > 0 && (
          <div className="relative">
            <SearchIcon
              aria-hidden="true"
              className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              className="pl-9"
              onChange={(e) => {
                setSearch(e.target.value);
                setVisibleCount(INITIAL_VISIBLE);
              }}
              placeholder="Buscar por nombre"
              value={search}
            />
          </div>
        )}
        <ItemGroup className="gap-2">
          {visible.length > 0 ? (
            visible.map((payment) => (
              <PatientItem key={payment.paymentId} payment={payment} />
            ))
          ) : allPatients.length === 0 ? (
            <EmptyState
              cta="Actualizar Dentalink"
              isLoading={isLoading}
              message="No hay pacientes cargados todavía."
              onClick={onRefresh}
            />
          ) : (
            <p className="py-8 text-center text-muted-foreground text-sm">
              Sin resultados para &ldquo;{search}&rdquo;.
            </p>
          )}
        </ItemGroup>
        {visible.length < filtered.length && (
          <div className="flex items-center justify-between text-muted-foreground text-sm">
            <span>
              {visible.length} de {filtered.length}
            </span>
            <Button
              onClick={() => setVisibleCount((n) => n + INITIAL_VISIBLE)}
              size="sm"
              variant="outline"
            >
              Ver más
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
