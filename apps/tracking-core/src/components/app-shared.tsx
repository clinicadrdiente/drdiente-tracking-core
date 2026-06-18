import type { ReactNode } from "react";
import {
  ActivityIcon,
  BarChart3Icon,
  BookOpenIcon,
  BriefcaseIcon,
  CalendarDaysIcon,
  ClipboardListIcon,
  CoinsIcon,
  GaugeIcon,
  HelpCircleIcon,
  LayoutGridIcon,
  MegaphoneIcon,
  RepeatIcon,
  Scale3dIcon,
  SendIcon,
  SettingsIcon,
  TrendingUpIcon,
  UserXIcon,
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
        title: "Dueños",
        path: "#/duenos",
        icon: <BriefcaseIcon />,
        isActive: true,
      },
      {
        title: "Resumen",
        path: "#/resumen",
        icon: <GaugeIcon />,
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
        title: "Comparativas",
        path: "#/comparativas",
        icon: <Scale3dIcon />,
      },
      {
        title: "Contenido",
        path: "#/contenido",
        icon: <BookOpenIcon />,
      },
      {
        title: "Pacientes",
        path: "#/patients",
        icon: <UsersIcon />,
        subItems: [
          { title: "Todos", path: "#/patients" },
          { title: "Recurrentes", path: "#/pacientes-recurrentes", icon: <RepeatIcon /> },
        ],
      },
      {
        title: "ROAS por canal",
        path: "#/roas",
        icon: <CoinsIcon />,
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
        subItems: [
          { title: "Pagos", path: "#/dentalink" },
          { title: "Sin match", path: "#/dentalink/sin-match", icon: <UserXIcon /> },
        ],
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
