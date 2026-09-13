export const APP_NAME = "Meu Financeiro";
export const BACKUP_VERSION = 1;
export const DEFAULT_CURRENCY = "BRL";
/** Limites de orçamento permanentes (não amarrados a um mês). */
export const STANDING_BUDGET_MONTH = "ongoing";
export const SESSION_IDLE_MS = 15 * 60 * 1000;
export const PBKDF2_ITERATIONS = 210_000;

export const CURRENCIES = [
  { code: "BRL", name: "Real brasileiro", symbol: "R$", decimalPlaces: 2 },
  { code: "USD", name: "Dólar americano", symbol: "US$", decimalPlaces: 2 },
  { code: "EUR", name: "Euro", symbol: "€", decimalPlaces: 2 },
  { code: "GBP", name: "Libra esterlina", symbol: "£", decimalPlaces: 2 },
  { code: "BTC", name: "Bitcoin", symbol: "₿", decimalPlaces: 8 },
] as const;

export type CurrencyCode = (typeof CURRENCIES)[number]["code"] | string;
