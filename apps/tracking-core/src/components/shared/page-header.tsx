import type { ReactNode } from "react";

export function PageHeader({
  title,
  badge,
  actions,
}: {
  title: string;
  badge?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex items-center gap-2">
        <h2 className="font-semibold text-xl tracking-tight">{title}</h2>
        {badge}
      </div>
      {actions}
    </div>
  );
}
