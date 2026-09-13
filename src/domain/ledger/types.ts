export type TransactionType =
  | "income"
  | "expense"
  | "transfer"
  | "card_payment"
  | "investment"
  | "opening_balance"
  | "adjustment"
  | "fx_conversion";

export type TransactionStatus = "pending" | "cleared" | "reconciled" | "void";

export type TransactionOrigin = "manual" | "import" | "recurrence" | "open_finance" | "system";

export type AccountType = "checking" | "savings" | "cash" | "investment" | "credit" | "other";

export type PostingInput = {
  accountId: string;
  amountMinor: bigint;
  currency: string;
};

export type TransactionDraft = {
  type: TransactionType;
  description: string;
  date: string;
  competencyDate?: string;
  accountId: string;
  counterpartyAccountId?: string;
  categoryId?: string;
  cardId?: string;
  invoiceId?: string;
  recurrenceId?: string;
  installmentPlanId?: string;
  installmentNumber?: number;
  payee?: string;
  notes?: string;
  origin?: TransactionOrigin;
  externalId?: string;
  status?: TransactionStatus;
  idempotencyKey: string;
  postings: PostingInput[];
};

export type LedgerTransaction = TransactionDraft & {
  id: string;
  userId: string;
  createdAt: string;
};

export const CASH_FLOW_TYPES: TransactionType[] = ["income", "expense"];
export const TRANSFER_LIKE_TYPES: TransactionType[] = [
  "transfer",
  "card_payment",
  "fx_conversion",
];
