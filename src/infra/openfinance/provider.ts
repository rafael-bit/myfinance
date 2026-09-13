export type ExternalTransactionDraft = {
  externalId: string;
  accountExternalId: string;
  date: string;
  description: string;
  amountMinor: bigint;
  raw: unknown;
};

export type ExternalConnectionStatus = "disconnected" | "pending_consent" | "active" | "error" | "expired";

export type ExternalInstitutionProvider = {
  id: string;
  connect(): Promise<{ connectionId: string; status: ExternalConnectionStatus }>;
  listTransactions(connectionId: string): Promise<ExternalTransactionDraft[]>;
};

export class ManualOpenFinanceProvider implements ExternalInstitutionProvider {
  id = "manual-open-finance";

  async connect(): Promise<{ connectionId: string; status: ExternalConnectionStatus }> {
    return { connectionId: "manual", status: "active" };
  }

  async listTransactions(): Promise<ExternalTransactionDraft[]> {
    return [];
  }
}

export function toReviewDraft(tx: ExternalTransactionDraft): {
  origin: "open_finance";
  externalId: string;
  date: string;
  description: string;
  amountMinor: bigint;
  requiresAcceptance: true;
} {
  return {
    origin: "open_finance",
    externalId: tx.externalId,
    date: tx.date,
    description: tx.description,
    amountMinor: tx.amountMinor,
    requiresAcceptance: true,
  };
}
