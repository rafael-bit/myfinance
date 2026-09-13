import { MoneyError, money, sum, isZero, type Money } from "../money";
import type { PostingInput, TransactionDraft, TransactionType } from "./types";

export class LedgerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LedgerError";
  }
}

export function assertBalanced(postings: PostingInput[]): void {
  if (postings.length < 2) {
    throw new LedgerError("Uma transação precisa de pelo menos duas postagens");
  }
  const byCurrency = new Map<string, Money>();
  for (const posting of postings) {
    const current = byCurrency.get(posting.currency) ?? money(0n, posting.currency);
    byCurrency.set(posting.currency, money(current.amountMinor + posting.amountMinor, posting.currency));
  }
  for (const [currency, total] of byCurrency) {
    if (!isZero(total)) {
      throw new LedgerError(`Postagens desbalanceadas em ${currency}: ${total.amountMinor.toString()}`);
    }
  }
}

export function cashFlowEffect(type: TransactionType): "income" | "expense" | "none" {
  if (type === "income") return "income";
  if (type === "expense") return "expense";
  return "none";
}

export function buildExpense(params: {
  amount: Money;
  assetAccountId: string;
  expenseAccountId: string;
  description: string;
  date: string;
  categoryId?: string;
  cardId?: string;
  invoiceId?: string;
  installmentPlanId?: string;
  installmentNumber?: number;
  payee?: string;
  notes?: string;
  origin?: TransactionDraft["origin"];
  externalId?: string;
  idempotencyKey: string;
}): TransactionDraft {
  if (params.amount.amountMinor <= 0n) {
    throw new LedgerError("Despesa precisa de valor positivo");
  }
  return {
    type: "expense",
    description: params.description,
    date: params.date,
    competencyDate: params.date,
    accountId: params.assetAccountId,
    categoryId: params.categoryId,
    cardId: params.cardId,
    invoiceId: params.invoiceId,
    installmentPlanId: params.installmentPlanId,
    installmentNumber: params.installmentNumber,
    payee: params.payee,
    notes: params.notes,
    origin: params.origin ?? "manual",
    externalId: params.externalId,
    status: "cleared",
    idempotencyKey: params.idempotencyKey,
    postings: [
      { accountId: params.expenseAccountId, amountMinor: params.amount.amountMinor, currency: params.amount.currencyCode },
      { accountId: params.assetAccountId, amountMinor: -params.amount.amountMinor, currency: params.amount.currencyCode },
    ],
  };
}

export function buildIncome(params: {
  amount: Money;
  assetAccountId: string;
  incomeAccountId: string;
  description: string;
  date: string;
  categoryId?: string;
  notes?: string;
  origin?: TransactionDraft["origin"];
  externalId?: string;
  idempotencyKey: string;
}): TransactionDraft {
  if (params.amount.amountMinor <= 0n) {
    throw new LedgerError("Receita precisa de valor positivo");
  }
  return {
    type: "income",
    description: params.description,
    date: params.date,
    competencyDate: params.date,
    accountId: params.assetAccountId,
    categoryId: params.categoryId,
    notes: params.notes,
    origin: params.origin ?? "manual",
    externalId: params.externalId,
    status: "cleared",
    idempotencyKey: params.idempotencyKey,
    postings: [
      { accountId: params.assetAccountId, amountMinor: params.amount.amountMinor, currency: params.amount.currencyCode },
      { accountId: params.incomeAccountId, amountMinor: -params.amount.amountMinor, currency: params.amount.currencyCode },
    ],
  };
}

export function buildTransfer(params: {
  amount: Money;
  fromAccountId: string;
  toAccountId: string;
  description: string;
  date: string;
  notes?: string;
  origin?: TransactionDraft["origin"];
  externalId?: string;
  idempotencyKey: string;
}): TransactionDraft {
  if (params.fromAccountId === params.toAccountId) {
    throw new LedgerError("Transferência precisa de contas diferentes");
  }
  if (params.amount.amountMinor <= 0n) {
    throw new LedgerError("Transferência precisa de valor positivo");
  }
  return {
    type: "transfer",
    description: params.description,
    date: params.date,
    competencyDate: params.date,
    accountId: params.fromAccountId,
    counterpartyAccountId: params.toAccountId,
    notes: params.notes,
    origin: params.origin ?? "manual",
    externalId: params.externalId,
    status: "cleared",
    idempotencyKey: params.idempotencyKey,
    postings: [
      { accountId: params.fromAccountId, amountMinor: -params.amount.amountMinor, currency: params.amount.currencyCode },
      { accountId: params.toAccountId, amountMinor: params.amount.amountMinor, currency: params.amount.currencyCode },
    ],
  };
}

export function buildCardPayment(params: {
  amount: Money;
  paymentAccountId: string;
  cardLiabilityAccountId: string;
  description: string;
  date: string;
  cardId: string;
  invoiceId?: string;
  idempotencyKey: string;
}): TransactionDraft {
  const transfer = buildTransfer({
    amount: params.amount,
    fromAccountId: params.paymentAccountId,
    toAccountId: params.cardLiabilityAccountId,
    description: params.description,
    date: params.date,
    idempotencyKey: params.idempotencyKey,
  });
  return {
    ...transfer,
    type: "card_payment",
    cardId: params.cardId,
    invoiceId: params.invoiceId,
  };
}

export function accountBalance(params: {
  initialBalanceMinor: bigint;
  postings: { amountMinor: bigint }[];
}): bigint {
  // Opening balance is booked as a ledger posting (sys-equity). Summing the
  // initialBalanceMinor column again would double-count.
  const fromPostings = params.postings.reduce((acc, posting) => acc + posting.amountMinor, 0n);
  if (params.postings.length > 0) return fromPostings;
  return params.initialBalanceMinor;
}

export function periodCashFlow(transactions: { type: TransactionType; postings: PostingInput[]; accountId: string }[]): {
  income: bigint;
  expense: bigint;
} {
  let income = 0n;
  let expense = 0n;
  for (const txn of transactions) {
    const primary = txn.postings.find((p) => p.accountId === txn.accountId);
    if (!primary) continue;
    if (txn.type === "income") income += primary.amountMinor;
    if (txn.type === "expense") expense += -primary.amountMinor;
  }
  return { income, expense };
}

export { MoneyError, sum };
