import type { ReactNode } from "react";
import {
  ActivityIcon,
  BarChart3Icon,
  CalendarDaysIcon,
  HelpCircleIcon,
  LayoutGridIcon,
  MegaphoneIcon,
  SendIcon,
  SettingsIcon,
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
    label: "Operacion",
    items: [
      {
        title: "Dashboard",
        path: "#/dashboard",
        icon: <LayoutGridIcon />,
        isActive: true,
      },
      {
        title: "Revenue",
        path: "#/revenue",
        icon: <BarChart3Icon />,
      },
      {
        title: "Pacientes",
        path: "#/patients",
        icon: <UsersIcon />,
      },
    ],
  },
  {
    label: "Integraciones",
    items: [
      {
        title: "Dentalink",
        path: "#/dentalink",
        icon: <CalendarDaysIcon />,
        subItems: [
          { title: "Pagos del mes", path: "#/dentalink/payments" },
          { title: "Pacientes recientes", path: "#/dentalink/patients" },
          { title: "Tratamientos", path: "#/dentalink/treatments" },
        ],
      },
      {
        title: "Elevator",
        path: "#/elevator",
        icon: <SendIcon />,
        subItems: [
          { title: "Leads creados", path: "#/elevator/leads" },
          { title: "Matching", path: "#/elevator/matching" },
        ],
      },
      {
        title: "Stape",
        path: "#/stape",
        icon: <WebhookIcon />,
        subItems: [
          { title: "Eventos", path: "#/stape/events" },
          { title: "Conversion API", path: "#/stape/capi" },
        ],
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
        subItems: [
          { title: "Variables", path: "#/settings/env" },
          { title: "Secret interno", path: "#/settings/secret" },
          { title: "Logs", path: "#/settings/logs" },
        ],
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
  {
    title: "Estado del sistema",
    path: "#/status",
    icon: <ActivityIcon />,
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
