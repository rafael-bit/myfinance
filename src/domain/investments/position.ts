export type InstrumentClass =
  | "tesouro"
  | "cdb"
  | "lci"
  | "lca"
  | "rf"
  | "stock"
  | "fii"
  | "etf"
  | "fund"
  | "crypto"
  | "pension"
  | "other";

export type InvestmentEventType =
  | "buy"
  | "sell"
  | "contribution"
  | "withdrawal"
  | "dividend"
  | "interest"
  | "fee"
  | "tax"
  | "bonus"
  | "split"
  | "reverse_split"
  | "transfer_in"
  | "transfer_out"
  | "other";

export type InvestmentEvent = {
  type: InvestmentEventType;
  date: string;
  quantityUnscaled: bigint;
  quantityScale: number;
  priceMinor: bigint;
  amountMinor: bigint;
};

export type Position = {
  quantity: number;
  costMinor: bigint;
  averagePriceMinor: bigint;
  dividendsMinor: bigint;
  interestMinor: bigint;
  feesMinor: bigint;
  taxesMinor: bigint;
};

function qty(event: InvestmentEvent): number {
  return Number(event.quantityUnscaled) / 10 ** event.quantityScale;
}

export function replayPosition(events: InvestmentEvent[]): Position {
  const sorted = [...events].sort((a, b) => a.date.localeCompare(b.date));
  let quantity = 0;
  let costMinor = 0n;
  let dividendsMinor = 0n;
  let interestMinor = 0n;
  let feesMinor = 0n;
  let taxesMinor = 0n;

  for (const event of sorted) {
    switch (event.type) {
      case "buy":
      case "contribution":
      case "transfer_in":
      case "bonus": {
        const q = qty(event);
        quantity += q;
        costMinor += event.amountMinor > 0n ? event.amountMinor : event.priceMinor * BigInt(Math.round(q * 1000)) / 1000n;
        break;
      }
      case "sell":
      case "withdrawal":
      case "transfer_out": {
        const q = qty(event);
        if (quantity > 0) {
          const avg = costMinor / BigInt(Math.round(quantity * 1_000_000) || 1);
          const soldUnits = BigInt(Math.round(q * 1_000_000));
          costMinor -= (avg * soldUnits) / 1_000_000n;
        }
        quantity -= q;
        break;
      }
      case "split": {
        const factor = qty(event) || 1;
        quantity *= factor;
        break;
      }
      case "reverse_split": {
        const factor = qty(event) || 1;
        quantity /= factor || 1;
        break;
      }
      case "dividend":
        dividendsMinor += event.amountMinor;
        break;
      case "interest":
        interestMinor += event.amountMinor;
        break;
      case "fee":
        feesMinor += event.amountMinor;
        costMinor += event.amountMinor;
        break;
      case "tax":
        taxesMinor += event.amountMinor;
        break;
      default:
        break;
    }
  }

  const units = BigInt(Math.round(quantity * 1_000_000));
  const averagePriceMinor = units === 0n ? 0n : (costMinor * 1_000_000n) / units;
  return {
    quantity,
    costMinor: costMinor < 0n ? 0n : costMinor,
    averagePriceMinor,
    dividendsMinor,
    interestMinor,
    feesMinor,
    taxesMinor,
  };
}

export function marketValue(quantity: number, priceMinor: bigint): bigint {
  return (priceMinor * BigInt(Math.round(quantity * 1_000_000))) / 1_000_000n;
}

export function unrealizedPnl(position: Position, priceMinor: bigint): bigint {
  return marketValue(position.quantity, priceMinor) - position.costMinor;
}
