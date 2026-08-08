"use client";

/**
 * Armazón alterno para la Reunión de Status, con la estructura del dashboard
 * Agndex (Watermelon UI) y la marca de DrDiente.
 *
 * Qué toma de Agndex, y por qué:
 *  · El contenido flota como tarjeta redondeada sobre el color del sidebar
 *    (`bg-sidebar p-2` + `rounded-xl bg-background`). Da profundidad sin
 *    bordes duros y hace que el panel se lea como un lienzo, no como una
 *    página con marco.
 *  · Barra superior tipo ruta: Marca | Producto | Página, en vez del
 *    breadcrumb genérico con separadores.
 *  · Sidebar sin borde, con grupos etiquetados y el usuario abajo.
 *
 * Qué NO toma: su paleta ni su tipografía. El dorado, el carbón y las
 * serifas siguen siendo los de DrDiente — la identidad no se negocia.
 *
 * Vive aparte de AppShell a propósito: se monta solo en #/reunion-nueva para
 * poder compararlo contra el actual sin dejar a medias el panel que usan los
 * dueños. Cuando se apruebe, esto reemplaza a AppShell en esa ruta.
 */

import type { CSSProperties, ReactNode } from "react";
import { useEffect, useState } from "react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ThemeToggle } from "@/components/theme-toggle";
import { navGroups, type SidebarNavItem } from "@/components/app-shared";
import { RefreshCwIcon } from "lucide-react";

/* ── ruta por hash, igual que el resto de la app ─────────────────────────── */
function normalizar(hash: string) {
  return hash.replace(/^#\/?/, "").split("?")[0] || "dashboard";
}

function useRutaHash() {
  const [ruta, setRuta] = useState(() => normalizar(window.location.hash));
  useEffect(() => {
    const alCambiar = () => setRuta(normalizar(window.location.hash));
    window.addEventListener("hashchange", alCambiar);
    return () => window.removeEventListener("hashchange", alCambiar);
  }, []);
  return ruta;
}

/* ── sidebar ─────────────────────────────────────────────────────────────── */
const CLASE_ITEM =
  "h-auto gap-2.5 rounded-lg px-3 py-2 text-sm tracking-tight opacity-80 " +
  "aria-[current=page]:bg-sidebar-accent aria-[current=page]:font-medium " +
  "aria-[current=page]:text-sidebar-accent-foreground aria-[current=page]:opacity-100";

function ItemNav({ item, ruta }: { item: SidebarNavItem; ruta: string }) {
  const { isMobile, setOpenMobile } = useSidebar();
  // Los items que solo agrupan subItems no traen path; se muestran inertes.
  const destino = item.path;
  const activo = destino ? normalizar(destino) === ruta : false;
  return (
    <SidebarMenuButton asChild className="h-auto p-0">
      <a
        href={destino ?? "#"}
        aria-current={activo ? "page" : undefined}
        onClick={() => isMobile && setOpenMobile(false)}
        className={CLASE_ITEM}
      >
        {item.icon}
        <span>{item.title}</span>
      </a>
    </SidebarMenuButton>
  );
}

function SidebarAgndex({ ruta }: { ruta: string }) {
  return (
    <Sidebar className="border-none h-full">
      <SidebarHeader className="flex-row items-center justify-between gap-2 px-4 pt-6 pb-0">
        <a href="#/reunion-nueva" className="flex items-center gap-2.5">
          <span className="grid size-7 place-items-center rounded-lg bg-[#C5A55A] font-bold text-[#141414] text-xs">
            DD
          </span>
          <span className="font-serif text-lg tracking-tight">DrDiente</span>
        </a>
        <span className="rounded-md bg-sidebar-accent px-2 py-1 text-[10px] uppercase tracking-wider text-sidebar-foreground/60">
          Tracking
        </span>
      </SidebarHeader>

      <SidebarContent className="mt-7 gap-7 px-4">
        <SidebarGroup className="p-0">
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  className="h-auto gap-2.5 rounded-lg bg-[#C5A55A] px-3 py-2 text-sm text-[#141414] hover:bg-[#C5A55A]/90 hover:text-[#141414]"
                  onClick={() => {
                    window.location.hash = "#/dashboard";
                    window.dispatchEvent(new Event("drdiente:refresh-dashboard"));
                  }}
                >
                  <RefreshCwIcon />
                  <span>Actualizar datos</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {navGroups.map((grupo) => (
          <SidebarGroup key={grupo.label} className="p-0">
            <SidebarGroupLabel className="mb-1.5 h-auto px-0 py-1 text-[11px] uppercase tracking-wider text-sidebar-foreground/40">
              {grupo.label}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="gap-1">
                {grupo.items.map((item) => (
                  <SidebarMenuItem key={item.path ?? item.title}>
                    <ItemNav item={item} ruta={ruta} />
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="px-4 pb-6">
        <SidebarMenu>
          <SidebarMenuItem>
            <div className="flex items-center gap-2.5 rounded-lg px-3 py-2">
              <Avatar className="size-7">
                <AvatarFallback className="bg-sidebar-accent text-[11px]">CA</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1 leading-tight">
                <p className="truncate text-sm font-medium">Clínica DrDiente</p>
                <p className="truncate text-[11px] text-sidebar-foreground/50">
                  Polanco · Roma Norte
                </p>
              </div>
            </div>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}

/* ── barra superior ──────────────────────────────────────────────────────── */
const TODOS_LOS_ITEMS = navGroups.flatMap((g) => g.items);

/**
 * Agndex pone aquí un selector de proyecto. El equivalente natural sería el de
 * sucursal, pero ese filtro vive dentro del panel (con su propio estado) y
 * duplicarlo arriba daría dos controles para lo mismo donde solo uno funciona.
 * Se deja la ruta informativa; subir el selector es el paso siguiente si el
 * diseño se aprueba, y requiere levantar el estado de ReunionPanel.
 */
function TopbarAgndex({ ruta }: { ruta: string }) {
  const actual = TODOS_LOS_ITEMS.find((i) => i.path && normalizar(i.path) === ruta);

  return (
    <header className="sticky top-0 z-50 flex h-14 items-center justify-between gap-2 px-4 md:h-16 md:px-6">
      <div className="flex items-center gap-1">
        <SidebarTrigger className="size-9 md:hidden" />
        <nav className="hidden items-center gap-2 text-sm text-muted-foreground md:flex">
          <span>DrDiente</span>
          <span className="text-border">|</span>
          <span>Tracking Core</span>
          <span className="text-border">|</span>
          <span className="font-medium text-foreground/80">
            {actual?.title ?? "Reunión de Status"}
          </span>
        </nav>
      </div>

      <div className="flex items-center gap-3 md:gap-4">
        <ThemeToggle />
      </div>
    </header>
  );
}

/* ── armazón ─────────────────────────────────────────────────────────────── */
export function AgndexShell({ children }: { children: ReactNode }) {
  const ruta = useRutaHash();
  return (
    <SidebarProvider
      open
      className="h-svh overflow-hidden"
      style={{ "--sidebar-width": "17.25rem" } as CSSProperties}
    >
      <SidebarAgndex ruta={ruta} />
      <main className="flex-1 overflow-y-auto md:bg-sidebar md:p-2">
        <div className="flex h-full flex-col overflow-hidden rounded-xl bg-background">
          <TopbarAgndex ruta={ruta} />
          <div className="flex-1 overflow-y-auto px-4 pb-6 md:px-6">{children}</div>
        </div>
      </main>
    </SidebarProvider>
  );
}
