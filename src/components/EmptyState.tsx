import { ReactNode } from "react";
import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type EmptyStateProps = {
  title: string;
  description: string;
  icon?: LucideIcon;
  actions?: ReactNode;
  className?: string;
  compact?: boolean;
};

export function EmptyState({
  title,
  description,
  icon: Icon,
  actions,
  className,
  compact = false,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex h-full flex-col items-center justify-center gap-3 text-center",
        compact ? "p-4" : "p-3 sm:p-4 lg:p-5",
        className,
      )}
    >
      {Icon ? (
        <div className="rounded-full bg-primary/10 p-4 text-primary">
          <Icon className="h-8 w-8" />
        </div>
      ) : null}
      <div>
        <h2 className="mb-2 text-2xl font-bold">{title}</h2>
        <p className="text-muted-foreground">{description}</p>
      </div>
      {actions}
    </div>
  );
}