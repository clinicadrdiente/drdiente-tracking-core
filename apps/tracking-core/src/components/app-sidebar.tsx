"use client";

import { Button } from "@/components/ui/button";
import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarGroup,
	SidebarHeader,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
} from "@/components/ui/sidebar";
import { NavGroup } from "@/components/nav-group";
import { footerNavLinks, navGroups } from "@/components/app-shared";
import { LatestChange } from "@/components/latest-change";
import { RefreshCwIcon, SearchIcon } from "lucide-react";
import { useEffect, useState } from "react";
import elevatorMark from "@/ui/elevator-mark.png";

export function AppSidebar() {
	const [route, setRoute] = useState(() => normalizeRoute(window.location.hash));

	useEffect(() => {
		function handleHashChange() {
			setRoute(normalizeRoute(window.location.hash));
		}

		window.addEventListener("hashchange", handleHashChange);
		return () => window.removeEventListener("hashchange", handleHashChange);
	}, []);

	function refreshDashboard() {
		window.location.hash = "#/dashboard";
		window.dispatchEvent(new Event("drdiente:refresh-dashboard"));
	}

	return (
		<Sidebar collapsible="icon" variant="floating">
			<SidebarHeader className="h-14 justify-center">
				<SidebarMenuButton asChild>
					<a href="#/dashboard">
						<span className="grid size-7 place-items-center rounded-lg bg-[#1858fb] font-bold text-white text-xs">
							DD
						</span>
						<span className="font-medium">CLINICA DR DIENTE</span>
					</a>
				</SidebarMenuButton>
			</SidebarHeader>
			<SidebarContent>
				<SidebarGroup>
					<SidebarMenuItem className="flex items-center gap-2">
						<SidebarMenuButton
							className="min-w-8 bg-primary text-primary-foreground duration-200 ease-linear hover:bg-primary/90 hover:text-primary-foreground active:bg-primary/90 active:text-primary-foreground"
							onClick={refreshDashboard}
							tooltip="Actualizar Dentalink"
						>
							<RefreshCwIcon
							/>
							<span>Actualizar datos</span>
						</SidebarMenuButton>
						<Button
							aria-label="Buscar paciente"
							className="size-8 group-data-[collapsible=icon]:opacity-0"
							onClick={() => {
								window.location.hash = "#/patients";
							}}
							size="icon"
							variant="outline"
						>
							<SearchIcon
							/>
							<span className="sr-only">Buscar paciente</span>
						</Button>
					</SidebarMenuItem>
				</SidebarGroup>
				{navGroups.map((group, index) => (
					<NavGroup key={`sidebar-group-${index}`} {...group} />
				))}
			</SidebarContent>
			<SidebarFooter>
				<div className="flex items-center gap-2 px-2 pb-1 group-data-[collapsible=icon]:hidden">
					<img alt="Elevator" className="h-6 w-auto" src={elevatorMark} />
					<div className="leading-tight">
						<p className="text-muted-foreground text-[9px] uppercase tracking-[0.2em]">
							Plataforma por
						</p>
						<p className="font-semibold text-sm">Elevator</p>
					</div>
				</div>
				<LatestChange />
				<SidebarMenu className="mt-2">
					{footerNavLinks.map((item) => (
						<SidebarMenuItem key={item.title}>
							<SidebarMenuButton
								asChild
								className="text-muted-foreground"
								isActive={route === normalizeRoute(item.path)}
								size="sm"
							>
								<a href={item.path}>
									{item.icon}
									<span>{item.title}</span>
								</a>
							</SidebarMenuButton>
						</SidebarMenuItem>
					))}
				</SidebarMenu>
			</SidebarFooter>
		</Sidebar>
	);
}

function normalizeRoute(path = "") {
	return path.replace(/^#\/?/, "").split("?")[0] || "dashboard";
}
