import { allocateEvenly, type Money } from "../money";
import { addMonthsIso, clampDayOfMonth, monthKey } from "../../shared/dates";
import { buildExpense, type LedgerError } from "../ledger/postings";
import type { TransactionDraft } from "../ledger/types";

export type RecurrenceFreq = "weekly" | "monthly" | "yearly" | "custom";

export type RecurrenceRuleInput = {
  freq: RecurrenceFreq;
  interval: number;
  byMonthDay?: number;
  startDate: string;
  endDate?: string;
  generateDaysAhead: number;
};

export function nextRecurrenceDate(current: string, rule: RecurrenceRuleInput): string {
  const interval = Math.max(1, rule.interval);
  if (rule.freq === "weekly" || (rule.freq === "custom" && !rule.byMonthDay)) {
    const d = new Date(`${current}T00:00:00`);
    d.setDate(d.getDate() + 7 * interval);
    return d.toISOString().slice(0, 10);
  }
  if (rule.freq === "yearly") {
    const [y, m, day] = current.split("-").map(Number);
    return clampDayOfMonth(`${y + interval}-${String(m).padStart(2, "0")}-01`, rule.byMonthDay ?? day);
  }
  const day = rule.byMonthDay ?? Number(current.slice(8, 10));
  const next = addMonthsIso(current.slice(0, 8) + "01", interval);
  return clampDayOfMonth(next, day);
}

export function generateRecurrenceDates(rule: RecurrenceRuleInput, untilDate: string, existingDates: string[]): string[] {
  const dates: string[] = [];
  let cursor = rule.startDate;
  const existing = new Set(existingDates);
  while (cursor <= untilDate) {
    if (!existing.has(cursor) && (!rule.endDate || cursor <= rule.endDate)) {
      dates.push(cursor);
    }
    const next = nextRecurrenceDate(cursor, rule);
    if (next <= cursor) break;
    cursor = next;
  }
  return dates;
}

export type InstallmentPlanInput = {
  total: Money;
  installmentsCount: number;
  firstDate: string;
  assetAccountId: string;
  expenseAccountId: string;
  description: string;
  categoryId?: string;
  cardId?: string;
  payee?: string;
  idempotencyKeyPrefix: string;
};

export type InstallmentPlanResult = {
  totalMinor: bigint;
  installmentsCount: number;
  firstDate: string;
  lastDate: string;
  remainingMinor: bigint;
  paidCount: number;
  transactions: TransactionDraft[];
};

export function buildInstallmentPlan(input: InstallmentPlanInput): InstallmentPlanResult {
  if (input.installmentsCount < 2) {
    throw new Error("Parcelamento precisa de pelo menos 2 parcelas");
  }
  const parts = allocateEvenly(input.total, input.installmentsCount);
  const transactions = parts.map((part, index) => {
    const date = addMonthsIso(input.firstDate, index);
    return buildExpense({
      amount: part,
      assetAccountId: input.assetAccountId,
      expenseAccountId: input.expenseAccountId,
      description: `${input.description} (${index + 1}/${input.installmentsCount})`,
      date,
      categoryId: input.categoryId,
      cardId: input.cardId,
      installmentNumber: index + 1,
      payee: input.payee,
      idempotencyKey: `${input.idempotencyKeyPrefix}:${index + 1}`,
    });
  });
  return {
    totalMinor: input.total.amountMinor,
    installmentsCount: input.installmentsCount,
    firstDate: input.firstDate,
    lastDate: transactions[transactions.length - 1].date,
    remainingMinor: input.total.amountMinor,
    paidCount: 0,
    transactions,
  };
}

export function installmentProgress(params: {
  totalMinor: bigint;
  installments: { date: string; amountMinor: bigint; paid: boolean }[];
  asOf: string;
}): {
  currentNumber: number;
  paidCount: number;
  paidMinor: bigint;
  remainingMinor: bigint;
  futureCount: number;
} {
  let paidCount = 0;
  let paidMinor = 0n;
  let currentNumber = 1;
  for (let i = 0; i < params.installments.length; i++) {
    const item = params.installments[i];
    if (item.paid || item.date <= params.asOf) {
      paidCount += item.paid || item.date < params.asOf ? 1 : 0;
      if (item.paid) paidMinor += item.amountMinor;
    }
    if (item.date <= params.asOf) currentNumber = i + 1;
  }
  const remainingMinor = params.totalMinor - paidMinor;
  return {
    currentNumber,
    paidCount,
    paidMinor,
    remainingMinor,
    futureCount: params.installments.filter((i) => i.date > params.asOf).length,
  };
}

export { monthKey };
export type { LedgerError };
