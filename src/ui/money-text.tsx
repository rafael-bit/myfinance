import { formatMoney, money } from "@/domain/money";
import { Amount } from "./amount";
import { cn } from "@/lib/utils";

/**
 * Compat: reexporta Amount. Preferir import de `@/ui/amount`.
 */
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
  // Sem animação quando usado em contextos densos legados — Amount decide
  const value = money(amountMinor, currency);
  const negative = value.amountMinor < 0n;
  const positive = value.amountMinor > 0n;
  return (
    <span
      className={cn(
        "amount tabular",
        signed && negative && "text-out",
        signed && positive && "text-in",
        !signed && className,
        signed && className,
      )}
    >
      {formatMoney(value)}
    </span>
  );
}

export { Amount };
