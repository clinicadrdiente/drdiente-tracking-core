import type { ReactNode } from "react";

export type ModuleAccent =
  | "attribution"   // revenue/atribución
  | "operations"    // Elevator / acciones
  | "marketing"     // Windsor / esfuerzos
  | "health"        // estado del sistema
  | "reports";      // formularios/reportes

export function ModuleFrame({
  accent,
  title,
  description,
  children,
}: {
  accent: ModuleAccent;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section
      data-module={accent}
      className="rounded-xl border-2 p-4 md:p-6 space-y-4"
      style={{
        borderColor: `var(--module-${accent})`,
        background: `color-mix(in oklab, var(--module-${accent}) 6%, var(--background))`,
      }}
    >
      <header className="flex items-center gap-2">
        <span
          className="h-3 w-3 rounded-full"
          style={{ background: `var(--module-${accent})` }}
        />
        <h2 className="font-semibold text-lg tracking-tight">{title}</h2>
        {description ? (
          <p className="text-muted-foreground text-sm">{description}</p>
        ) : null}
      </header>
      {children}
    </section>
  );
}
