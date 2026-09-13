import { useEffect, useRef, useState } from "react";
import { formatMoney, money } from "@/domain/money";
import { cn } from "@/lib/utils";

function prefersReducedMotion() {
  if (typeof window === "undefined") return true;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function easeOutCubic(t: number) {
  return 1 - (1 - t) ** 3;
}

/**
 * Valor financeiro com tipografia tabular (sans, não mono).
 * Interpola quando o valor muda — consequência dos dados, não decoração.
 */
export function Amount({
  amountMinor,
  currency = "BRL",
  className,
  signed,
  animate = true,
  size = "md",
}: {
  amountMinor: number | bigint;
  currency?: string;
  className?: string;
  /** Aplica cor in/out conforme sinal */
  signed?: boolean;
  animate?: boolean;
  size?: "sm" | "md" | "lg" | "xl" | "hero";
}) {
  const target = typeof amountMinor === "bigint" ? Number(amountMinor) : amountMinor;
  const [display, setDisplay] = useState(target);
  const fromRef = useRef(target);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!animate || prefersReducedMotion() || fromRef.current === target) {
      fromRef.current = target;
      setDisplay(target);
      return;
    }

    const from = fromRef.current;
    const start = performance.now();
    const duration = 380;

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const value = Math.round(from + (target - from) * easeOutCubic(t));
      setDisplay(value);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = target;
      }
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [target, animate]);

  const value = money(display, currency);
  const negative = value.amountMinor < 0n;
  const positive = value.amountMinor > 0n;

  return (
    <span
      className={cn(
        "amount tabular whitespace-nowrap",
        size === "sm" && "text-sm",
        size === "md" && "text-base",
        size === "lg" && "text-xl md:text-2xl",
        size === "xl" && "text-2xl md:text-4xl",
        size === "hero" && "text-[2.75rem] leading-none tracking-tight md:text-6xl lg:text-7xl",
        signed && negative && "text-out",
        signed && positive && "text-in",
        className,
      )}
    >
      {formatMoney(value)}
    </span>
  );
}

/** @deprecated Prefer Amount — mantido para compatibilidade durante a migração */
export function MoneyText({
  amountMinor,
  currency = "BRL",
  className,
  signed,
}: {
  amountMinor: number | bigint;
  currency?: string;
  className?: string;
  signed?: boolean;
}) {
  return <Amount amountMinor={amountMinor} currency={currency} className={className} signed={signed} size="md" />;
}
