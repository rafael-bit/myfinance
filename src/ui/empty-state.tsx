import { Button } from "./button";

export function EmptyState({
  title,
  description,
  action,
  onAction,
}: {
  title: string;
  description: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <div className="flex flex-col items-start gap-3 border-t border-border py-10">
      <div className="h-8 w-0.5 bg-signal" aria-hidden />
      <h2 className="max-w-md text-2xl font-medium leading-tight tracking-tight">{title}</h2>
      <p className="max-w-md text-sm leading-7 text-muted">{description}</p>
      {action && onAction ? (
        <Button className="mt-2" onClick={onAction}>
          {action}
        </Button>
      ) : null}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded-[var(--radius-panel)] bg-foreground/[0.06] ${className ?? "h-24"}`} />;
}

export function OfflineBanner() {
  const offline = typeof navigator !== "undefined" && !navigator.onLine;
  if (!offline) return null;
  return (
    <p className="border-b border-border px-5 py-2.5 text-xs text-muted md:px-8 lg:px-10">
      Sem internet · reconecte para sincronizar
    </p>
  );
}

export function BrandMark({ className = "h-10 w-10" }: { className?: string }) {
  return (
    <div className={`relative flex items-center justify-center bg-foreground text-background ${className}`}>
      <span className="absolute left-0 top-2 bottom-2 w-0.5 bg-signal" aria-hidden />
      <span className="text-lg font-medium leading-none tracking-tight">M</span>
    </div>
  );
}

export function Splash() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-5">
      <BrandMark className="h-14 w-14" />
      <p className="text-2xl font-medium tracking-tight">Meu Financeiro</p>
      <div className="h-0.5 w-10 bg-signal" />
    </div>
  );
}
