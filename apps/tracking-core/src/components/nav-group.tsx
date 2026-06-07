import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
	SidebarGroup,
	SidebarGroupLabel,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarMenuSub,
	SidebarMenuSubButton,
	SidebarMenuSubItem,
} from "@/components/ui/sidebar";
import type { SidebarNavGroup } from "@/components/app-shared";
import { ChevronRightIcon } from "lucide-react";
import { useEffect, useState } from "react";

export function NavGroup({ label, items }: SidebarNavGroup) {
	const [route, setRoute] = useState(() => normalizeRoute(window.location.hash));

	useEffect(() => {
		function handleHashChange() {
			setRoute(normalizeRoute(window.location.hash));
		}

		window.addEventListener("hashchange", handleHashChange);
		return () => window.removeEventListener("hashchange", handleHashChange);
	}, []);

	return (
		<SidebarGroup>
			{label && <SidebarGroupLabel>{label}</SidebarGroupLabel>}
			<SidebarMenu>
				{items.map((item) => {
					const isActive = isNavItemActive(route, item.path, item.subItems);

					return (
						<Collapsible
							asChild
							className="group/collapsible"
							defaultOpen={isActive}
							key={item.title}
						>
							<SidebarMenuItem>
								{item.subItems?.length ? (
									<>
										<CollapsibleTrigger asChild>
											<SidebarMenuButton
												isActive={isActive}
												onClick={() => {
													if (item.path) {
														window.location.hash = item.path;
													}
												}}
											>
												{item.icon}
												<span>{item.title}</span>
												<ChevronRightIcon className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
											</SidebarMenuButton>
										</CollapsibleTrigger>
										<CollapsibleContent>
											<SidebarMenuSub>
												{item.subItems?.map((subItem) => (
													<SidebarMenuSubItem key={subItem.title}>
														<SidebarMenuSubButton
															asChild
															isActive={route === normalizeRoute(subItem.path)}
														>
															<a href={subItem.path}>
																{subItem.icon}
																<span>{subItem.title}</span>
															</a>
														</SidebarMenuSubButton>
													</SidebarMenuSubItem>
												))}
											</SidebarMenuSub>
										</CollapsibleContent>
									</>
								) : (
									<SidebarMenuButton asChild isActive={isActive}>
										<a href={item.path}>
											{item.icon}
											<span>{item.title}</span>
										</a>
									</SidebarMenuButton>
								)}
							</SidebarMenuItem>
						</Collapsible>
					);
				})}
			</SidebarMenu>
		</SidebarGroup>
	);
}

function normalizeRoute(path = "") {
	return path.replace(/^#\/?/, "").split("?")[0] || "dashboard";
}

function isNavItemActive(
	route: string,
	path?: string,
	subItems?: SidebarNavGroup["items"],
) {
	const itemRoute = normalizeRoute(path);

	return (
		route === itemRoute ||
		route.startsWith(`${itemRoute}/`) ||
		!!subItems?.some((subItem) => route === normalizeRoute(subItem.path))
	);
}
