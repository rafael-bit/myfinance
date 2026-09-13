import { cn } from "@/lib/utils";
import type { HTMLAttributes, ReactNode } from "react";

/**
 * Card NÃO é o agrupamento padrão.
 * Use só quando for container de interação isolada ou elevação necessária.
 */
export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-[var(--radius-panel)] bg-card p-5 hairline", className)} {...props} />;
}

export function Section({
  kicker,
  title,
  action,
  children,
  className,
}: {
  kicker?: string;
  title?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("space-y-4", className)}>
      {(kicker || title || action) && (
        <div className="flex items-end justify-between gap-3">
          <div>
            {kicker ? <p className="kicker">{kicker}</p> : null}
            {title ? <h2 className="mt-1 text-2xl font-medium tracking-tight md:text-[1.75rem]">{title}</h2> : null}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}
