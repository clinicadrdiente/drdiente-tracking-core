import type { ReactNode } from "react";
import {
  ActivityIcon,
  BarChart3Icon,
  CalendarDaysIcon,
  ClipboardListIcon,
  GaugeIcon,
  HelpCircleIcon,
  LayoutGridIcon,
  MegaphoneIcon,
  SendIcon,
  SettingsIcon,
  TrendingUpIcon,
  UsersIcon,
  WebhookIcon,
} from "lucide-react";

export type SidebarNavItem = {
  title: string;
  path?: string;
  icon?: ReactNode;
  isActive?: boolean;
  subItems?: SidebarNavItem[];
};

export type SidebarNavGroup = {
  label: string;
  items: SidebarNavItem[];
};

export const navGroups: SidebarNavGroup[] = [
  {
    label: "Operar",
    items: [
      {
        title: "Resumen",
        path: "#/resumen",
        icon: <GaugeIcon />,
        isActive: true,
      },
      {
        title: "Control",
        path: "#/dashboard",
        icon: <LayoutGridIcon />,
      },
      {
        title: "Revenue",
        path: "#/revenue",
        icon: <BarChart3Icon />,
      },
      {
        title: "Proyeccion",
        path: "#/proyeccion",
        icon: <TrendingUpIcon />,
      },
      {
        title: "Pacientes",
        path: "#/patients",
        icon: <UsersIcon />,
      },
      {
        title: "Reporte diario",
        path: "#/reporte-diario",
        icon: <ClipboardListIcon />,
      },
    ],
  },
  {
    label: "Conectar",
    items: [
      {
        title: "Dentalink",
        path: "#/dentalink",
        icon: <CalendarDaysIcon />,
      },
      {
        title: "Elevator",
        path: "#/elevator",
        icon: <SendIcon />,
      },
      {
        title: "Stape",
        path: "#/stape",
        icon: <WebhookIcon />,
      },
      {
        title: "Marketing",
        path: "#/marketing",
        icon: <MegaphoneIcon />,
      },
    ],
  },
  {
    label: "Sistema",
    items: [
      {
        title: "Configuracion",
        path: "#/settings",
        icon: <SettingsIcon />,
      },
      {
        title: "Estado",
        path: "#/status",
        icon: <ActivityIcon />,
      },
    ],
  },
];

export const footerNavLinks: SidebarNavItem[] = [
  {
    title: "Ayuda interna",
    path: "#/help",
    icon: <HelpCircleIcon />,
  },
];

export const navLinks: SidebarNavItem[] = [
  ...navGroups.flatMap((group) =>
    group.items.flatMap((item) =>
      item.subItems?.length ? [item, ...item.subItems] : [item],
    ),
  ),
  ...footerNavLinks,
];
