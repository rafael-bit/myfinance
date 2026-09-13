export type Money = {
  amountMinor: bigint;
  currencyCode: string;
};

export type CurrencyInfo = {
  code: string;
  decimalPlaces: number;
  symbol: string;
};

const DEFAULT_DECIMALS: Record<string, number> = {
  BRL: 2,
  USD: 2,
  EUR: 2,
  GBP: 2,
  BTC: 8,
};

export class MoneyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MoneyError";
  }
}

export function decimalPlacesFor(currencyCode: string): number {
  return DEFAULT_DECIMALS[currencyCode] ?? 2;
}

export function money(amountMinor: bigint | number | string, currencyCode: string): Money {
  return {
    amountMinor: typeof amountMinor === "bigint" ? amountMinor : BigInt(amountMinor),
    currencyCode,
  };
}

export function zero(currencyCode: string): Money {
  return money(0n, currencyCode);
}

export function fromMajor(major: string | number, currencyCode: string): Money {
  const decimals = decimalPlacesFor(currencyCode);
  const text = String(major).trim().replace(",", ".");
  if (!/^-?\d+(\.\d+)?$/.test(text)) {
    throw new MoneyError(`Valor inválido: ${major}`);
  }
  const negative = text.startsWith("-");
  const [wholeRaw, fracRaw = ""] = text.replace("-", "").split(".");
  const frac = (fracRaw + "0".repeat(decimals)).slice(0, decimals);
  const minor = BigInt(wholeRaw || "0") * 10n ** BigInt(decimals) + BigInt(frac || "0");
  return money(negative ? -minor : minor, currencyCode);
}

export function toMajorNumber(value: Money): number {
  const decimals = decimalPlacesFor(value.currencyCode);
  const factor = 10 ** decimals;
  return Number(value.amountMinor) / factor;
}

export function toMajorString(value: Money): string {
  const decimals = decimalPlacesFor(value.currencyCode);
  const negative = value.amountMinor < 0n;
  const abs = negative ? -value.amountMinor : value.amountMinor;
  const factor = 10n ** BigInt(decimals);
  const whole = abs / factor;
  const frac = (abs % factor).toString().padStart(decimals, "0");
  const body = decimals === 0 ? `${whole}` : `${whole}.${frac}`;
  return negative ? `-${body}` : body;
}

function assertSameCurrency(a: Money, b: Money): void {
  if (a.currencyCode !== b.currencyCode) {
    throw new MoneyError(`Moedas diferentes: ${a.currencyCode} vs ${b.currencyCode}`);
  }
}

export function add(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return money(a.amountMinor + b.amountMinor, a.currencyCode);
}

export function subtract(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return money(a.amountMinor - b.amountMinor, a.currencyCode);
}

export function negate(value: Money): Money {
  return money(-value.amountMinor, value.currencyCode);
}

export function isZero(value: Money): boolean {
  return value.amountMinor === 0n;
}

export function isNegative(value: Money): boolean {
  return value.amountMinor < 0n;
}

export function compare(a: Money, b: Money): number {
  assertSameCurrency(a, b);
  if (a.amountMinor < b.amountMinor) return -1;
  if (a.amountMinor > b.amountMinor) return 1;
  return 0;
}

export function sum(values: Money[], currencyCode: string): Money {
  return values.reduce((acc, value) => add(acc, value), zero(currencyCode));
}

export function abs(value: Money): Money {
  return value.amountMinor < 0n ? negate(value) : value;
}

export function percentageOf(part: Money, total: Money): number {
  if (total.amountMinor === 0n) return 0;
  assertSameCurrency(part, total);
  return Number((part.amountMinor * 10_000n) / total.amountMinor) / 100;
}

export function allocateEvenly(total: Money, parts: number): Money[] {
  if (parts <= 0) throw new MoneyError("Número de partes inválido");
  const n = BigInt(parts);
  const base = total.amountMinor / n;
  const remainder = total.amountMinor % n;
  return Array.from({ length: parts }, (_, i) =>
    money(base + (BigInt(i) < remainder ? (total.amountMinor < 0n ? -1n : 1n) : 0n), total.currencyCode),
  );
}

export type MoneyFormatOptions = {
  symbol?: string;
  decimalPlaces?: number;
  decimalSeparator?: string;
  thousandSeparator?: string;
  showSymbol?: boolean;
};

export function formatMoney(value: Money, options: MoneyFormatOptions = {}): string {
  const decimals = options.decimalPlaces ?? decimalPlacesFor(value.currencyCode);
  const decimalSeparator = options.decimalSeparator ?? ",";
  const thousandSeparator = options.thousandSeparator ?? ".";
  const showSymbol = options.showSymbol ?? true;
  const symbol = options.symbol ?? defaultSymbol(value.currencyCode);
  const negative = value.amountMinor < 0n;
  const absMinor = negative ? -value.amountMinor : value.amountMinor;
  const factor = 10n ** BigInt(decimals);
  const whole = absMinor / factor;
  const frac = (absMinor % factor).toString().padStart(decimals, "0");
  const wholeFormatted = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, thousandSeparator);
  const number = decimals === 0 ? wholeFormatted : `${wholeFormatted}${decimalSeparator}${frac}`;
  const signed = negative ? `-${number}` : number;
  return showSymbol ? `${symbol} ${signed}` : signed;
}

function defaultSymbol(code: string): string {
  const map: Record<string, string> = { BRL: "R$", USD: "US$", EUR: "€", GBP: "£", BTC: "₿" };
  return map[code] ?? code;
}

export function convertWithRate(
  value: Money,
  quoteCurrency: string,
  rateUnscaled: bigint,
  scale: number,
): Money {
  const quoteDecimals = decimalPlacesFor(quoteCurrency);
  const baseDecimals = decimalPlacesFor(value.currencyCode);
  const scaled = value.amountMinor * rateUnscaled;
  const scaleFactor = 10n ** BigInt(scale + baseDecimals - quoteDecimals);
  const rounded = scaleFactor === 0n ? scaled : (scaled + scaleFactor / 2n) / scaleFactor;
  return money(rounded, quoteCurrency);
}
