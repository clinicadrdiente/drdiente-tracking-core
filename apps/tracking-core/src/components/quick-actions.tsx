import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
import {
  CalendarDaysIcon,
  ChevronRightIcon,
  DownloadIcon,
  RefreshCwIcon,
  SendIcon,
} from "lucide-react";

const actions = [
  {
    title: "Actualizar Dentalink",
    description: "Traer pagos y pacientes recientes.",
    href: "#/dentalink",
    icon: <RefreshCwIcon aria-hidden="true" />,
  },
  {
    title: "Revisar matching",
    description: "Cruzar pagos contra Elevator.",
    href: "#/elevator/matching",
    icon: <SendIcon aria-hidden="true" />,
  },
  {
    title: "Bloques del mes",
    description: "Dia 1 al ultimo dia.",
    href: "#/dentalink/payments",
    icon: <CalendarDaysIcon aria-hidden="true" />,
  },
  {
    title: "Exportar reporte",
    description: "Revenue y pacientes del mes.",
    href: "#/reports",
    icon: <DownloadIcon aria-hidden="true" />,
  },
] as const;

export function QuickActions() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Acciones rapidas</CardTitle>
        <CardDescription>Atajos operativos de la clinica.</CardDescription>
      </CardHeader>
      <CardContent>
        <ItemGroup className="gap-0">
          {actions.map((a) => (
            <Item asChild key={a.title} size="sm">
              <a href={a.href}>
                <ItemMedia variant="icon">{a.icon}</ItemMedia>
                <ItemContent>
                  <ItemTitle>{a.title}</ItemTitle>
                  <ItemDescription className="line-clamp-1">
                    {a.description}
                  </ItemDescription>
                </ItemContent>
                <ItemActions>
                  <ChevronRightIcon
                    aria-hidden="true"
                    className="size-4 shrink-0 text-muted-foreground"
                  />
                </ItemActions>
              </a>
            </Item>
          ))}
        </ItemGroup>
      </CardContent>
    </Card>
  );
}
