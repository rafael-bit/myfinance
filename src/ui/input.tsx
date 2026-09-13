import { cn } from "@/lib/utils";
import type { InputHTMLAttributes } from "react";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "flex h-11 w-full rounded-[var(--radius-control)] border border-border bg-card px-3.5 text-base outline-none transition-[box-shadow,border-color] duration-[var(--dur-base)] ease-[var(--ease-out)] placeholder:text-muted/70 focus:border-signal/50 focus:ring-2 focus:ring-signal/25",
        className,
      )}
      {...props}
    />
  );
}
