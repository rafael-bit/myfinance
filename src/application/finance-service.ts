import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import { supabase as sharedClient } from "@/infra/supabase/client";
import {
  adoptSession,
  currentEmail,
  currentSession,
  sessionReady,
  signInWithPassword,
  signOut,
  signUpWithPassword,
  subscribeAuthChange,
  watchAuth,
  type Session,
} from "@/application/auth-api";
import { createId } from "@/shared/ids";
import { jsonStringify } from "@/shared/json";
import { nowIso, todayIsoDate, monthKey, monthBounds, addDaysIso, addMonthsIso } from "@/shared/dates";
import { BACKUP_VERSION, DEFAULT_CURRENCY, STANDING_BUDGET_MONTH } from "@/shared/constants";
import { DEFAULT_WIDGETS } from "@/infra/db/seeds";
import {
  accountBalance,
  assertBalanced,
  buildCardPayment,
  buildExpense,
  buildIncome,
  buildTransfer,
} from "@/domain/ledger/postings";
import type { TransactionDraft } from "@/domain/ledger/types";
import { fromMajor, money } from "@/domain/money";
import { buildInstallmentPlan, generateRecurrenceDates, type RecurrenceFreq } from "@/domain/cashflow/recurrence";
import { availableLimit, invoicePeriodFor, invoiceStatus } from "@/domain/cards/invoice";
import { replayPosition, type InstrumentClass, type InvestmentEventType } from "@/domain/investments/position";
import { calculateNetWorth } from "@/domain/networth";
import {
  budgetPace,
  budgetUsage,
  effectiveBudgetLimit,
  goalProgress,
  monthElapsedPercent,
  monthsBetween,
  recommendedMonthlyContribution,
  shiftYearMonth,
} from "@/domain/budget";
import {
  computeInvestorProfile,
  INVESTOR_QUESTIONS,
  type InvestorAnswer,
  type InvestorBand,
} from "@/domain/investor/questionnaire";
import { analyzePortfolio } from "@/domain/analysis/portfolio";
import { recommendProducts } from "@/domain/recommendation/engine";
import {
  applyRules,
  detectDuplicates,
  detectImportSource,
  learnRule,
  parseCsv,
  parseOfx,
  parsePdfText,
} from "@/domain/import/parse";
import { explainFinances } from "@/domain/ai/explain";
import {
  BcbMarketDataProvider,
  BrapiMarketDataProvider,
  CompositeMarketDataProvider,
  ManualMarketDataProvider,
} from "@/infra/market/providers";
import { toReviewDraft } from "@/infra/openfinance/provider";

export type { Session };
export { subscribeAuthChange, subscribeAuthChange as subscribeSessionChange, DEFAULT_WIDGETS };

export function sysAccount(userId: string, kind: "income" | "expense" | "equity"): string {
  return `${userId}:sys-${kind}`;
}

type DbRow = Record<string, any>;

type QueryResult = { data: unknown; error: PostgrestError | null };

async function rows<T = DbRow>(query: PromiseLike<QueryResult>): Promise<T[]> {
  const result = await query;
  if (result.error) throw new Error(result.error.message);
  return (result.data ?? []) as T[];
}

async function firstRow<T = DbRow>(query: PromiseLike<QueryResult>): Promise<T | null> {
  const list = await rows<T>(query);
  return list[0] ?? null;
}

async function run(query: PromiseLike<{ error: PostgrestError | null }>): Promise<void> {
  const result = await query;
  if (result.error) throw new Error(result.error.message);
}

function toNumber(value: unknown, fallback = 0): number {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Aceita 100,50 ou 1.234,56 → string para fromMajor. */
function normalizeMajorInput(raw: string): string {
  const cleaned = raw.trim().replace(/\s/g, "");
  if (!cleaned) return "0";
  if (cleaned.includes(",")) {
    return cleaned.replace(/\./g, "").replace(",", ".");
  }
  return cleaned;
}

function stamp(userId: string) {
  const at = nowIso();
  return {
    id: createId(),
    user_id: userId,
    created_at: at,
    updated_at: at,
    deleted_at: null,
    version: 1,
    device_id: "cloud",
  };
}

export type AccountRow = {
  id: string;
  userId: string;
  institutionId: string | null;
  name: string;
  type: string;
  currency: string;
  initialBalanceMinor: number;
  statedBalanceMinor: number | null;
  includeInNetWorth: number;
  status: string;
  system: number;
  notes: string | null;
  externalId: string | null;
  createdAt: string;
  updatedAt: string;
};

function mapAccount(row: DbRow): AccountRow {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    institutionId: row.institution_id ?? null,
    name: String(row.name ?? ""),
    type: String(row.type ?? "other"),
    currency: String(row.currency ?? DEFAULT_CURRENCY),
    initialBalanceMinor: toNumber(row.initial_balance_minor),
    statedBalanceMinor: toNullableNumber(row.stated_balance_minor),
    includeInNetWorth: toNumber(row.include_in_net_worth, 1),
    status: String(row.status ?? "active"),
    system: toNumber(row.system),
    notes: row.notes ?? null,
    externalId: row.external_id ?? null,
    createdAt: String(row.created_at ?? nowIso()),
    updatedAt: String(row.updated_at ?? nowIso()),
  };
}

function mapCategory(row: DbRow) {
  return {
    id: String(row.id),
    name: String(row.name ?? ""),
    kind: String(row.kind ?? "expense"),
    parentId: (row.parent_id ?? null) as string | null,
    icon: (row.icon ?? null) as string | null,
    color: (row.color ?? null) as string | null,
    active: toNumber(row.active, 1),
    system: toNumber(row.system),
  };
}

function mapInstitution(row: DbRow) {
  return {
    id: String(row.id),
    name: String(row.name ?? ""),
    type: String(row.type ?? "bank"),
    country: String(row.country ?? "BR"),
    externalCode: (row.external_code ?? null) as string | null,
  };
}

function mapCard(row: DbRow) {
  return {
    id: String(row.id),
    accountId: String(row.account_id),
    name: String(row.name ?? ""),
    limitMinor: toNumber(row.limit_minor),
    closingDay: toNumber(row.closing_day, 1),
    dueDay: toNumber(row.due_day, 10),
    paymentAccountId: (row.payment_account_id ?? null) as string | null,
    currency: String(row.currency ?? DEFAULT_CURRENCY),
    status: String(row.status ?? "active"),
  };
}

function mapInvoice(row: DbRow) {
  return {
    id: String(row.id),
    cardId: String(row.card_id),
    periodStart: String(row.period_start),
    periodEnd: String(row.period_end),
    closingDate: String(row.closing_date),
    dueDate: String(row.due_date),
    status: String(row.status ?? "open"),
    paidMinor: toNumber(row.paid_minor),
  };
}

function mapInstrument(row: DbRow) {
  return {
    id: String(row.id),
    symbol: String(row.symbol ?? ""),
    name: String(row.name ?? ""),
    class: String(row.class ?? "other") as InstrumentClass,
    currency: String(row.currency ?? DEFAULT_CURRENCY),
    exchange: (row.exchange ?? null) as string | null,
  };
}

function mapNotification(row: DbRow) {
  return {
    id: String(row.id),
    type: String(row.type ?? ""),
    title: String(row.title ?? ""),
    body: String(row.body ?? ""),
    readAt: (row.read_at ?? null) as string | null,
    scheduledFor: String(row.scheduled_for ?? todayIsoDate()),
    createdAt: String(row.created_at ?? nowIso()),
  };
}

function mapSnapshot(row: DbRow) {
  return {
    id: String(row.id),
    yearMonth: String(row.year_month),
    grossMinor: toNumber(row.gross_minor),
    debtsMinor: toNumber(row.debts_minor),
    netMinor: toNumber(row.net_minor),
  };
}

type RecurrenceTemplate = {
  type: "expense" | "income" | "transfer";
  amountMajor: string;
  currency: string;
  accountId: string;
  toAccountId?: string;
  categoryId?: string;
  description: string;
};

function parseTemplate(raw: string): RecurrenceTemplate | null {
  try {
    const parsed = JSON.parse(raw) as Partial<RecurrenceTemplate>;
    if (!parsed || typeof parsed !== "object") return null;
    if (!parsed.amountMajor || !parsed.accountId) return null;
    return {
      type: parsed.type === "income" || parsed.type === "transfer" ? parsed.type : "expense",
      amountMajor: String(parsed.amountMajor),
      currency: parsed.currency ?? DEFAULT_CURRENCY,
      accountId: String(parsed.accountId),
      toAccountId: parsed.toAccountId,
      categoryId: parsed.categoryId,
      description: parsed.description ?? "Recorrência",
    };
  } catch {
    return null;
  }
}

function safeParseWidgets(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : DEFAULT_WIDGETS;
  } catch {
    return DEFAULT_WIDGETS;
  }
}

function toCsv(headers: string[], body: string[][]) {
  return [headers, ...body].map((r) => r.map((c) => `"${c.replaceAll('"', '""')}"`).join(";")).join("\n");
}

export class FinanceService {
  private readonly client: SupabaseClient;

  /** Accepts the Supabase client; a legacy local-database handle is ignored during the migration. */
  constructor(client?: SupabaseClient | unknown) {
    this.client = isSupabaseClient(client) ? client : sharedClient;
    void watchAuth(this.client);
  }

  get supabase() {
    return this.client;
  }

  get persisted() {
    return true;
  }

  get session(): Session | null {
    return currentSession();
  }

  touch() {
    currentSession();
  }

  async lock() {
    await signOut(this.client);
  }

  requireUser(): string {
    const session = currentSession();
    if (!session) throw new Error("Sessão expirada");
    return session.userId;
  }

  private async userId(): Promise<string> {
    const cached = currentSession();
    if (cached) return cached.userId;
    await sessionReady(this.client);
    const restored = currentSession();
    if (restored) return restored.userId;
    const { data } = await this.client.auth.getUser();
    if (data.user) return data.user.id;
    throw new Error("Sessão expirada");
  }

  async hasUser() {
    await sessionReady(this.client);
    return Boolean(currentSession());
  }

  async hasVault() {
    return this.hasUser();
  }

  async onboard(params: {
    email?: string;
    username?: string;
    password: string;
    displayName?: string;
    currency?: string;
  }) {
    const session = await signUpWithPassword(this.client, {
      email: params.email ?? params.username ?? "",
      password: params.password,
      displayName: params.displayName ?? params.username,
      currency: params.currency ?? DEFAULT_CURRENCY,
    });
    await this.waitForProfile(session.userId);
    return { userId: session.userId };
  }

  async unlock(params: { email?: string; username?: string; password: string }) {
    return signInWithPassword(this.client, {
      email: params.email ?? params.username ?? "",
      password: params.password,
    });
  }

  async getLoginUsername() {
    await sessionReady(this.client);
    return currentEmail();
  }

  /** The signup trigger seeds profile, categories and system accounts — give it a moment. */
  private async waitForProfile(userId: string) {
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const profile = await firstRow(this.client.from("users").select("id").eq("id", userId).limit(1));
      if (profile) return;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }

  async getSettings() {
    const userId = await this.userId();
    const [user, settingRows] = await Promise.all([
      firstRow(this.client.from("users").select("*").eq("id", userId).limit(1)),
      rows(this.client.from("settings").select("key, value").eq("user_id", userId)),
    ]);
    const map = Object.fromEntries(settingRows.map((row) => [String(row.key), String(row.value ?? "")]));
    return {
      displayName: String(user?.display_name ?? ""),
      currency: String(user?.primary_currency ?? DEFAULT_CURRENCY),
      locale: String(user?.locale ?? "pt-BR"),
      timezone: String(user?.timezone ?? "America/Sao_Paulo"),
      theme: map.theme ?? "system",
      decimalSeparator: map.decimalSeparator ?? ",",
      thousandSeparator: map.thousandSeparator ?? ".",
      aiEndpoint: map.aiEndpoint ?? "",
      aiKey: map.aiKey ?? "",
      brapiToken: map.brapiToken ?? "",
    };
  }

  async saveSettings(patch: Record<string, string>) {
    const userId = await this.userId();
    const profilePatch: DbRow = {};
    if (patch.displayName) profilePatch.display_name = patch.displayName;
    if (patch.currency) profilePatch.primary_currency = patch.currency;
    if (Object.keys(profilePatch).length > 0) {
      profilePatch.updated_at = nowIso();
      await run(this.client.from("users").update(profilePatch).eq("id", userId));
    }
    const entries = Object.entries(patch).filter(([key]) => !["displayName", "currency"].includes(key));
    if (entries.length === 0) return;
    await run(
      this.client
        .from("settings")
        .upsert(
          entries.map(([key, value]) => ({ user_id: userId, key, value })),
          { onConflict: "user_id,key" },
        ),
    );
  }

  async listInstitutions() {
    const userId = await this.userId();
    const list = await rows(
      this.client.from("institutions").select("*").eq("user_id", userId).is("deleted_at", null),
    );
    return list.map(mapInstitution);
  }

  async createInstitution(input: { name: string; type: string }) {
    const userId = await this.userId();
    const row = {
      ...stamp(userId),
      name: input.name,
      type: input.type,
      country: "BR",
      external_code: null,
    };
    await run(this.client.from("institutions").insert(row));
    return mapInstitution(row);
  }

  async listCategories() {
    const userId = await this.userId();
    let list = await rows(
      this.client.from("categories").select("*").eq("user_id", userId).is("deleted_at", null).order("kind"),
    );
    const hasPersonal = list.some(
      (row) => String(row.kind) === "expense" && String(row.name).toLowerCase() === "despesas pessoais",
    );
    if (!hasPersonal) {
      const row = {
        ...stamp(userId),
        name: "Despesas pessoais",
        kind: "expense",
        parent_id: null,
        icon: "user",
        color: "#7c2d12",
        active: 1,
        system: 1,
      };
      await run(this.client.from("categories").insert(row));
      list = await rows(
        this.client.from("categories").select("*").eq("user_id", userId).is("deleted_at", null).order("kind"),
      );
    }
    list = await this.mergeAlimentacaoComprasIntoMercado(userId, list);
    return list.map(mapCategory);
  }

  /**
   * Une Alimentação + Compras em Mercado (legado → categoria única).
   * Reaponta lançamentos, regras e metas; remove as categorias antigas.
   */
  private async mergeAlimentacaoComprasIntoMercado(userId: string, list: DbRow[]) {
    const normalize = (name: string) =>
      name
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(/\p{M}/gu, "");

    const matchExpense = (...names: string[]) =>
      list.filter((row) => String(row.kind) === "expense" && names.includes(normalize(String(row.name ?? ""))));

    const food = matchExpense("alimentacao");
    const shopping = matchExpense("compras");
    if (food.length === 0 && shopping.length === 0) return list;

    const mercado = matchExpense("mercado");
    const at = nowIso();
    let targetId: string;

    if (mercado[0]) {
      targetId = String(mercado[0].id);
      await run(
        this.client
          .from("categories")
          .update({
            name: "Mercado",
            icon: "shopping-cart",
            color: "#c2410c",
            active: 1,
            updated_at: at,
          })
          .eq("id", targetId)
          .eq("user_id", userId),
      );
    } else if (food[0]) {
      targetId = String(food[0].id);
      await run(
        this.client
          .from("categories")
          .update({
            name: "Mercado",
            icon: "shopping-cart",
            color: "#c2410c",
            active: 1,
            updated_at: at,
          })
          .eq("id", targetId)
          .eq("user_id", userId),
      );
    } else {
      targetId = String(shopping[0].id);
      await run(
        this.client
          .from("categories")
          .update({
            name: "Mercado",
            icon: "shopping-cart",
            color: "#c2410c",
            active: 1,
            updated_at: at,
          })
          .eq("id", targetId)
          .eq("user_id", userId),
      );
    }

    const sourceIds = [...new Set([...food, ...shopping, ...mercado].map((row) => String(row.id)))].filter(
      (id) => id !== targetId,
    );

    for (const sourceId of sourceIds) {
      await run(
        this.client
          .from("transactions")
          .update({ category_id: targetId, updated_at: at })
          .eq("user_id", userId)
          .eq("category_id", sourceId)
          .is("deleted_at", null),
      );
      await run(
        this.client
          .from("categorization_rules")
          .update({ category_id: targetId, updated_at: at })
          .eq("user_id", userId)
          .eq("category_id", sourceId)
          .is("deleted_at", null),
      );
      await this.repointBudgetsToCategory(userId, sourceId, targetId, at);
      await run(
        this.client
          .from("categories")
          .update({ deleted_at: at, updated_at: at, active: 0 })
          .eq("id", sourceId)
          .eq("user_id", userId),
      );
    }

    return rows(
      this.client.from("categories").select("*").eq("user_id", userId).is("deleted_at", null).order("kind"),
    );
  }

  private async repointBudgetsToCategory(userId: string, sourceId: string, targetId: string, at: string) {
    const sourceBudgets = await rows(
      this.client.from("budgets").select("*").eq("user_id", userId).eq("category_id", sourceId),
    );
    for (const budget of sourceBudgets) {
      const yearMonth = String(budget.year_month);
      const existing = await firstRow(
        this.client
          .from("budgets")
          .select("*")
          .eq("user_id", userId)
          .eq("category_id", targetId)
          .eq("year_month", yearMonth),
      );
      if (existing) {
        await run(
          this.client
            .from("budgets")
            .update({
              limit_minor: toNumber(existing.limit_minor) + toNumber(budget.limit_minor),
              updated_at: at,
            })
            .eq("id", String(existing.id)),
        );
        await run(this.client.from("budgets").delete().eq("id", String(budget.id)).eq("user_id", userId));
      } else {
        await run(
          this.client
            .from("budgets")
            .update({ category_id: targetId, updated_at: at })
            .eq("id", String(budget.id))
            .eq("user_id", userId),
        );
      }
    }
  }

  async createCategory(input: { name: string; kind: string; parentId?: string; icon?: string; color?: string }) {
    const userId = await this.userId();
    const row = {
      ...stamp(userId),
      name: input.name,
      kind: input.kind,
      parent_id: input.parentId ?? null,
      icon: input.icon ?? null,
      color: input.color ?? null,
      active: 1,
      system: 0,
    };
    await run(this.client.from("categories").insert(row));
    return mapCategory(row);
  }

  async toggleCategory(id: string, active: boolean) {
    const userId = await this.userId();
    await run(
      this.client
        .from("categories")
        .update({ active: active ? 1 : 0, updated_at: nowIso() })
        .eq("id", id)
        .eq("user_id", userId),
    );
  }

  async listAccounts() {
    const userId = await this.userId();
    const [accountRows, postingRows] = await Promise.all([
      rows(this.client.from("accounts").select("*").eq("user_id", userId).is("deleted_at", null)),
      rows(
        this.client.from("postings").select("account_id, amount_minor").eq("user_id", userId).is("deleted_at", null),
      ),
    ]);
    return accountRows
      .filter((row) => toNumber(row.system) === 0)
      .map((row) => {
        const account = mapAccount(row);
        const legs = postingRows
          .filter((posting) => posting.account_id === account.id)
          .map((posting) => ({ amountMinor: BigInt(toNumber(posting.amount_minor)) }));
        const balance = accountBalance({
          initialBalanceMinor: BigInt(account.initialBalanceMinor),
          postings: legs,
        });
        return { ...account, balanceMinor: Number(balance) };
      });
  }

  async createAccount(input: {
    name: string;
    type: string;
    currency: string;
    initialBalanceMinor: number;
    institutionId?: string;
    notes?: string;
  }): Promise<AccountRow> {
    const userId = await this.userId();
    const row = {
      ...stamp(userId),
      institution_id: input.institutionId ?? null,
      name: input.name,
      type: input.type,
      currency: input.currency,
      // The opening balance lives in the ledger below — keep the column at 0 to avoid double-count.
      initial_balance_minor: 0,
      stated_balance_minor: null,
      include_in_net_worth: 1,
      status: "active",
      system: 0,
      notes: input.notes ?? null,
      external_id: null,
    };
    await run(this.client.from("accounts").insert(row));
    if (input.initialBalanceMinor !== 0) {
      const positive = input.initialBalanceMinor >= 0;
      const equity = sysAccount(userId, "equity");
      await this.commitDraft(
        buildTransfer({
          amount: money(Math.abs(input.initialBalanceMinor), input.currency),
          fromAccountId: positive ? equity : row.id,
          toAccountId: positive ? row.id : equity,
          description: "Saldo inicial",
          date: todayIsoDate(),
          origin: "system",
          idempotencyKey: `opening:${row.id}`,
        }),
        { forceType: "opening_balance", accountId: row.id },
      );
    }
    return mapAccount(row);
  }

  async reconcileAccount(accountId: string, statedBalanceMinor: number) {
    const userId = await this.userId();
    await run(
      this.client
        .from("accounts")
        .update({ stated_balance_minor: statedBalanceMinor, updated_at: nowIso() })
        .eq("id", accountId)
        .eq("user_id", userId),
    );
  }

  async updateAccount(
    accountId: string,
    input: {
      name?: string;
      type?: string;
      institutionId?: string | null;
      notes?: string | null;
      includeInNetWorth?: boolean;
    },
  ) {
    const userId = await this.userId();
    const account = await firstRow(
      this.client.from("accounts").select("*").eq("id", accountId).eq("user_id", userId).is("deleted_at", null),
    );
    if (!account) throw new Error("Conta não encontrada");
    if (toNumber(account.system) === 1) throw new Error("Contas do sistema não podem ser editadas");

    const patch: DbRow = { updated_at: nowIso() };
    if (input.name !== undefined) {
      const name = input.name.trim();
      if (!name) throw new Error("Informe um nome");
      patch.name = name;
    }
    if (input.type !== undefined) patch.type = input.type;
    if (input.institutionId !== undefined) patch.institution_id = input.institutionId;
    if (input.notes !== undefined) patch.notes = input.notes;
    if (input.includeInNetWorth !== undefined) patch.include_in_net_worth = input.includeInNetWorth ? 1 : 0;

    await run(this.client.from("accounts").update(patch).eq("id", accountId).eq("user_id", userId));
    return mapAccount({ ...account, ...patch });
  }

  async deleteAccount(accountId: string) {
    const userId = await this.userId();
    const account = await firstRow(
      this.client.from("accounts").select("*").eq("id", accountId).eq("user_id", userId).is("deleted_at", null),
    );
    if (!account) throw new Error("Conta não encontrada");
    if (toNumber(account.system) === 1) throw new Error("Contas do sistema não podem ser apagadas");

    const linkedCard = await firstRow(
      this.client.from("credit_cards").select("id, name").eq("account_id", accountId).is("deleted_at", null),
    );
    if (linkedCard) throw new Error("Esta conta pertence a um cartão. Apague o cartão primeiro.");

    const paymentCard = await firstRow(
      this.client.from("credit_cards").select("id, name").eq("payment_account_id", accountId).is("deleted_at", null),
    );
    if (paymentCard) {
      throw new Error(`Conta usada no pagamento do cartão ${String(paymentCard.name)}. Altere o cartão antes.`);
    }

    const used = await firstRow(
      this.client
        .from("transactions")
        .select("id")
        .eq("user_id", userId)
        .is("deleted_at", null)
        .or(`account_id.eq.${accountId},counterparty_account_id.eq.${accountId}`)
        .limit(1),
    );
    if (used) throw new Error("A conta tem lançamentos. Apague ou mova os lançamentos antes.");

    const at = nowIso();
    await run(
      this.client
        .from("accounts")
        .update({ deleted_at: at, updated_at: at, status: "closed" })
        .eq("id", accountId)
        .eq("user_id", userId),
    );
  }

  async listTransactions(params?: { from?: string; to?: string; limit?: number }) {
    const userId = await this.userId();
    const limit = params?.limit ?? 200;
    const base = this.client.from("transactions").select("*").eq("user_id", userId).is("deleted_at", null);
    const withFrom = params?.from ? base.gte("date", params.from) : base;
    const withTo = params?.to ? withFrom.lte("date", params.to) : withFrom;
    const txnRows = await rows(
      withTo.order("date", { ascending: false }).order("created_at", { ascending: false }).limit(limit),
    );
    const ids = txnRows.map((row) => String(row.id));
    const postingRows = await this.postingsFor(userId, ids);

    return txnRows.map((txn) => {
      const legs = postingRows
        .filter((posting) => posting.transaction_id === txn.id)
        .map((posting) => ({
          id: String(posting.id),
          transactionId: String(posting.transaction_id),
          accountId: String(posting.account_id),
          amountMinor: toNumber(posting.amount_minor),
          currency: String(posting.currency ?? DEFAULT_CURRENCY),
        }));
      const primary = legs.find((leg) => leg.accountId === txn.account_id);
      return {
        id: String(txn.id),
        type: String(txn.type),
        status: String(txn.status ?? "cleared"),
        description: String(txn.description ?? ""),
        date: String(txn.date),
        payee: (txn.payee ?? null) as string | null,
        account_id: String(txn.account_id),
        category_id: (txn.category_id ?? null) as string | null,
        counterparty_account_id: (txn.counterparty_account_id ?? null) as string | null,
        installment_number: toNullableNumber(txn.installment_number),
        installment_plan_id: (txn.installment_plan_id ?? null) as string | null,
        card_id: (txn.card_id ?? null) as string | null,
        invoice_id: (txn.invoice_id ?? null) as string | null,
        external_id: (txn.external_id ?? null) as string | null,
        accountId: String(txn.account_id),
        categoryId: (txn.category_id ?? null) as string | null,
        cardId: (txn.card_id ?? null) as string | null,
        invoiceId: (txn.invoice_id ?? null) as string | null,
        externalId: (txn.external_id ?? null) as string | null,
        amountMinor: primary ? Math.abs(primary.amountMinor) : 0,
        postings: legs,
      };
    });
  }

  /** PostgREST sends filters in the URL, so long id lists have to be chunked. */
  private async postingsFor(userId: string, transactionIds: string[]) {
    const chunks: string[][] = [];
    for (let index = 0; index < transactionIds.length; index += 150) {
      chunks.push(transactionIds.slice(index, index + 150));
    }
    const results = await Promise.all(
      chunks.map((chunk) =>
        rows(
          this.client
            .from("postings")
            .select("id, transaction_id, account_id, amount_minor, currency")
            .eq("user_id", userId)
            .is("deleted_at", null)
            .in("transaction_id", chunk),
        ),
      ),
    );
    return results.flat();
  }

  async deleteTransaction(transactionId: string) {
    const userId = await this.userId();
    const txn = await firstRow(
      this.client
        .from("transactions")
        .select("id")
        .eq("id", transactionId)
        .eq("user_id", userId)
        .is("deleted_at", null),
    );
    if (!txn) throw new Error("Lançamento não encontrado");

    const at = nowIso();
    await run(
      this.client
        .from("transactions")
        .update({ deleted_at: at, updated_at: at, status: "void" })
        .eq("id", transactionId)
        .eq("user_id", userId),
    );
    await run(
      this.client
        .from("postings")
        .update({ deleted_at: at, updated_at: at })
        .eq("transaction_id", transactionId)
        .eq("user_id", userId)
        .is("deleted_at", null),
    );
  }

  async updateTransaction(
    transactionId: string,
    input: {
      description?: string;
      date?: string;
      categoryId?: string | null;
      notes?: string | null;
      amountMajor?: string;
      currency?: string;
      accountId?: string;
      toAccountId?: string | null;
    },
  ) {
    const userId = await this.userId();
    const txn = await firstRow(
      this.client
        .from("transactions")
        .select("*")
        .eq("id", transactionId)
        .eq("user_id", userId)
        .is("deleted_at", null),
    );
    if (!txn) throw new Error("Lançamento não encontrado");

    const type = String(txn.type);
    const postingRows = await this.postingsFor(userId, [transactionId]);
    if (postingRows.length < 2) throw new Error("Lançamento sem partidas no ledger");

    const at = nowIso();
    const patch: DbRow = { updated_at: at };

    if (input.description !== undefined) {
      const description = input.description.trim();
      if (!description) throw new Error("Informe uma descrição");
      patch.description = description;
    }
    if (input.date !== undefined) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) throw new Error("Data inválida");
      patch.date = input.date;
      patch.competency_date = input.date;
    }
    if (input.categoryId !== undefined) patch.category_id = input.categoryId;
    if (input.notes !== undefined) patch.notes = input.notes;

    let accountId = String(txn.account_id);
    let counterpartyId = (txn.counterparty_account_id as string | null) ?? null;

    if (input.accountId !== undefined && input.accountId !== accountId) {
      if (type === "transfer" || type === "card_payment") {
        // transfers keep both legs explicit below
      } else if (type === "expense" || type === "income" || type === "opening_balance") {
        const oldAccountId = accountId;
        accountId = input.accountId;
        patch.account_id = accountId;
        const assetLeg = postingRows.find((p) => String(p.account_id) === oldAccountId);
        if (assetLeg) {
          await run(
            this.client
              .from("postings")
              .update({ account_id: accountId, updated_at: at })
              .eq("id", String(assetLeg.id))
              .eq("user_id", userId),
          );
          assetLeg.account_id = accountId;
        }
      }
    }

    if (type === "transfer" && (input.accountId !== undefined || input.toAccountId !== undefined)) {
      const fromId = input.accountId ?? accountId;
      const toId = input.toAccountId !== undefined ? input.toAccountId : counterpartyId;
      if (!toId) throw new Error("Informe a conta de destino");
      if (fromId === toId) throw new Error("Transferência precisa de contas diferentes");

      const fromLeg = postingRows.find((p) => toNumber(p.amount_minor) < 0);
      const toLeg = postingRows.find((p) => toNumber(p.amount_minor) > 0);
      if (!fromLeg || !toLeg) throw new Error("Partidas da transferência inválidas");

      await run(
        this.client
          .from("postings")
          .update({ account_id: fromId, updated_at: at })
          .eq("id", String(fromLeg.id))
          .eq("user_id", userId),
      );
      await run(
        this.client
          .from("postings")
          .update({ account_id: toId, updated_at: at })
          .eq("id", String(toLeg.id))
          .eq("user_id", userId),
      );
      fromLeg.account_id = fromId;
      toLeg.account_id = toId;
      accountId = fromId;
      counterpartyId = toId;
      patch.account_id = fromId;
      patch.counterparty_account_id = toId;
    }

    if (input.amountMajor !== undefined) {
      const currency = input.currency ?? String(postingRows[0]?.currency ?? DEFAULT_CURRENCY);
      const amount = fromMajor(input.amountMajor, currency);
      if (amount.amountMinor <= 0n) throw new Error("Valor precisa ser maior que zero");
      const abs = Number(amount.amountMinor);

      const updated = postingRows.map((posting) => {
        const signed = toNumber(posting.amount_minor);
        const next = signed < 0 ? -abs : abs;
        return {
          id: String(posting.id),
          account_id: String(posting.account_id),
          amount_minor: next,
          currency: String(posting.currency ?? currency),
        };
      });
      assertBalanced(
        updated.map((posting) => ({
          accountId: posting.account_id,
          amountMinor: BigInt(posting.amount_minor),
          currency: posting.currency,
        })),
      );

      for (const posting of updated) {
        await run(
          this.client
            .from("postings")
            .update({ amount_minor: posting.amount_minor, updated_at: at })
            .eq("id", posting.id)
            .eq("user_id", userId),
        );
      }
    }

    await run(this.client.from("transactions").update(patch).eq("id", transactionId).eq("user_id", userId));
  }

  async registerExpense(input: {
    amountMajor: string;
    currency: string;
    accountId: string;
    categoryId?: string;
    description: string;
    date: string;
    payee?: string;
    notes?: string;
    cardId?: string;
    installments?: number;
    origin?: "manual" | "import";
    externalId?: string;
    idempotencyKey?: string;
  }) {
    const userId = await this.userId();
    const amount = fromMajor(input.amountMajor, input.currency);
    if (input.installments && input.installments > 1) {
      return this.createInstallments({ ...input, amount, installments: input.installments });
    }
    const invoiceId = input.cardId ? await this.ensureInvoice(input.cardId, input.date) : undefined;
    return this.commitDraft(
      buildExpense({
        amount,
        assetAccountId: input.accountId,
        expenseAccountId: sysAccount(userId, "expense"),
        description: input.description,
        date: input.date,
        categoryId: input.categoryId,
        cardId: input.cardId,
        invoiceId,
        payee: input.payee,
        notes: input.notes,
        origin: input.origin,
        externalId: input.externalId,
        idempotencyKey: input.idempotencyKey ?? createId(),
      }),
    );
  }

  async registerIncome(input: {
    amountMajor: string;
    currency: string;
    accountId: string;
    categoryId?: string;
    description: string;
    date: string;
    notes?: string;
    origin?: "manual" | "import";
    externalId?: string;
    idempotencyKey?: string;
  }) {
    const userId = await this.userId();
    return this.commitDraft(
      buildIncome({
        amount: fromMajor(input.amountMajor, input.currency),
        assetAccountId: input.accountId,
        incomeAccountId: sysAccount(userId, "income"),
        description: input.description,
        date: input.date,
        categoryId: input.categoryId,
        notes: input.notes,
        origin: input.origin,
        externalId: input.externalId,
        idempotencyKey: input.idempotencyKey ?? createId(),
      }),
    );
  }

  async registerTransfer(input: {
    amountMajor: string;
    currency: string;
    fromAccountId: string;
    toAccountId: string;
    description: string;
    date: string;
    notes?: string;
    origin?: "manual" | "import";
    externalId?: string;
    idempotencyKey?: string;
  }) {
    return this.commitDraft(
      buildTransfer({
        amount: fromMajor(input.amountMajor, input.currency),
        fromAccountId: input.fromAccountId,
        toAccountId: input.toAccountId,
        description: input.description || "Transferência",
        date: input.date,
        notes: input.notes,
        origin: input.origin,
        externalId: input.externalId,
        idempotencyKey: input.idempotencyKey ?? createId(),
      }),
    );
  }

  private async createInstallments(input: {
    amount: ReturnType<typeof fromMajor>;
    accountId: string;
    categoryId?: string;
    description: string;
    date: string;
    payee?: string;
    cardId?: string;
    installments: number;
  }) {
    const userId = await this.userId();
    const plan = buildInstallmentPlan({
      total: input.amount,
      installmentsCount: input.installments,
      firstDate: input.date,
      assetAccountId: input.accountId,
      expenseAccountId: sysAccount(userId, "expense"),
      description: input.description,
      categoryId: input.categoryId,
      cardId: input.cardId,
      payee: input.payee,
      idempotencyKeyPrefix: createId(),
    });
    const planRow = {
      ...stamp(userId),
      total_minor: Number(plan.totalMinor),
      installments_count: plan.installmentsCount,
      first_date: plan.firstDate,
      last_date: plan.lastDate,
      description: input.description,
      card_id: input.cardId ?? null,
    };
    await run(this.client.from("installment_plans").insert(planRow));
    for (const draft of plan.transactions) {
      const invoiceId = input.cardId ? await this.ensureInvoice(input.cardId, draft.date) : undefined;
      await this.commitDraft(draft, { installmentPlanId: planRow.id, invoiceId, cardId: input.cardId });
    }
    return { planId: planRow.id, count: plan.installmentsCount };
  }

  async createRecurrence(input: {
    freq: RecurrenceFreq;
    interval: number;
    startDate: string;
    byMonthDay?: number;
    template: Record<string, unknown>;
  }) {
    const userId = await this.userId();
    const row = {
      ...stamp(userId),
      template_json: jsonStringify(input.template),
      freq: input.freq,
      interval: input.interval,
      by_month_day: input.byMonthDay ?? null,
      start_date: input.startDate,
      end_date: null,
      auto_generate: 1,
      generate_days_ahead: 60,
      last_generated_date: null,
    };
    await run(this.client.from("recurrence_rules").insert(row));
    await this.generateRecurrences();
    return { id: row.id, freq: input.freq, interval: input.interval, startDate: input.startDate };
  }

  async listRecurrences() {
    const userId = await this.userId();
    const list = await rows(
      this.client.from("recurrence_rules").select("*").eq("user_id", userId).is("deleted_at", null),
    );
    return list.map((row) => ({
      id: String(row.id),
      templateJson: String(row.template_json ?? "{}"),
      freq: String(row.freq ?? "monthly") as RecurrenceFreq,
      interval: toNumber(row.interval, 1),
      byMonthDay: toNullableNumber(row.by_month_day),
      startDate: String(row.start_date),
      endDate: (row.end_date ?? null) as string | null,
      autoGenerate: toNumber(row.auto_generate, 1),
      generateDaysAhead: toNumber(row.generate_days_ahead, 60),
      lastGeneratedDate: (row.last_generated_date ?? null) as string | null,
    }));
  }

  async generateRecurrences() {
    const userId = await this.userId();
    const rules = await this.listRecurrences();
    if (rules.length === 0) return;
    const existing = await rows(
      this.client.from("transactions").select("date, recurrence_id").eq("user_id", userId).not("recurrence_id", "is", null),
    );
    for (const rule of rules) {
      const template = parseTemplate(rule.templateJson);
      if (!template) continue;
      const already = existing.filter((row) => row.recurrence_id === rule.id).map((row) => String(row.date));
      const dates = generateRecurrenceDates(
        {
          freq: rule.freq,
          interval: rule.interval,
          byMonthDay: rule.byMonthDay ?? undefined,
          startDate: rule.startDate,
          endDate: rule.endDate ?? undefined,
          generateDaysAhead: rule.generateDaysAhead,
        },
        addDaysIso(todayIsoDate(), rule.generateDaysAhead),
        already,
      );
      for (const date of dates) {
        const idempotencyKey = `recurrence:${rule.id}:${date}`;
        const common = {
          amountMajor: template.amountMajor,
          currency: template.currency,
          description: template.description,
          date,
          idempotencyKey,
        };
        if (template.type === "income") {
          await this.registerIncome({ ...common, accountId: template.accountId, categoryId: template.categoryId });
        } else if (template.type === "transfer" && template.toAccountId) {
          await this.registerTransfer({
            ...common,
            fromAccountId: template.accountId,
            toAccountId: template.toAccountId,
          });
        } else {
          await this.registerExpense({ ...common, accountId: template.accountId, categoryId: template.categoryId });
        }
        await run(
          this.client
            .from("transactions")
            .update({ recurrence_id: rule.id })
            .eq("user_id", userId)
            .eq("idempotency_key", idempotencyKey),
        );
      }
      if (dates.length > 0) {
        await run(
          this.client
            .from("recurrence_rules")
            .update({ last_generated_date: dates[dates.length - 1], updated_at: nowIso() })
            .eq("id", rule.id),
        );
      }
    }
  }

  async createCard(input: {
    name: string;
    limitMajor: string;
    currency: string;
    closingDay: number;
    dueDay: number;
    paymentAccountId?: string;
    institutionId?: string;
  }) {
    const userId = await this.userId();
    const account = await this.createAccount({
      name: `${input.name} (cartão)`,
      type: "credit",
      currency: input.currency,
      initialBalanceMinor: 0,
      institutionId: input.institutionId,
    });
    const row = {
      ...stamp(userId),
      account_id: account.id,
      name: input.name,
      limit_minor: Number(fromMajor(input.limitMajor, input.currency).amountMinor),
      closing_day: input.closingDay,
      due_day: input.dueDay,
      payment_account_id: input.paymentAccountId ?? null,
      currency: input.currency,
      status: "active",
    };
    await run(this.client.from("credit_cards").insert(row));
    await this.ensureInvoice(row.id, todayIsoDate());
    return mapCard(row);
  }

  async listCards() {
    const userId = await this.userId();
    const [cardRows, invoiceRows, accounts] = await Promise.all([
      rows(this.client.from("credit_cards").select("*").eq("user_id", userId).is("deleted_at", null)),
      rows(this.client.from("credit_card_invoices").select("*").eq("user_id", userId)),
      this.listAccounts(),
    ]);
    const invoices = invoiceRows.map(mapInvoice);
    return cardRows.map((row) => {
      const card = mapCard(row);
      const account = accounts.find((item) => item.id === card.accountId);
      const usedMinor = Math.abs(account?.balanceMinor ?? 0);
      const openInvoice = invoices.find((invoice) => invoice.cardId === card.id && invoice.status === "open") ?? null;
      return {
        ...card,
        usedMinor,
        availableMinor: Number(availableLimit(BigInt(card.limitMinor), BigInt(usedMinor))),
        openInvoice,
      };
    });
  }

  async listInvoices(cardId: string) {
    const userId = await this.userId();
    const list = await rows(
      this.client.from("credit_card_invoices").select("*").eq("user_id", userId).eq("card_id", cardId),
    );
    return list.map(mapInvoice);
  }

  async payInvoice(invoiceId: string, paymentAccountId: string, amountMajor: string) {
    const userId = await this.userId();
    const invoiceRow = await firstRow(
      this.client.from("credit_card_invoices").select("*").eq("id", invoiceId).eq("user_id", userId),
    );
    if (!invoiceRow) throw new Error("Fatura não encontrada");
    const invoice = mapInvoice(invoiceRow);
    const cardRow = await firstRow(
      this.client.from("credit_cards").select("*").eq("id", invoice.cardId).eq("user_id", userId),
    );
    if (!cardRow) throw new Error("Cartão não encontrado");
    const card = mapCard(cardRow);
    const amount = fromMajor(amountMajor, card.currency);
    await this.commitDraft(
      buildCardPayment({
        amount,
        paymentAccountId,
        cardLiabilityAccountId: card.accountId,
        description: `Pagamento fatura ${card.name}`,
        date: todayIsoDate(),
        cardId: card.id,
        invoiceId,
        idempotencyKey: createId(),
      }),
    );

    const expenses = await rows(
      this.client
        .from("transactions")
        .select("id")
        .eq("user_id", userId)
        .eq("invoice_id", invoiceId)
        .eq("type", "expense"),
    );
    const expenseIds = expenses.map((row) => String(row.id));
    const legs = expenseIds.length
      ? await rows(
          this.client
            .from("postings")
            .select("amount_minor")
            .eq("user_id", userId)
            .eq("account_id", sysAccount(userId, "expense"))
            .in("transaction_id", expenseIds),
        )
      : [];
    const totalMinor = legs.reduce((acc, leg) => acc + toNumber(leg.amount_minor), 0);
    const paidMinor = invoice.paidMinor + Number(amount.amountMinor);
    await run(
      this.client
        .from("credit_card_invoices")
        .update({
          paid_minor: paidMinor,
          status: invoiceStatus({
            closed: invoice.status !== "open",
            totalMinor: BigInt(totalMinor),
            paidMinor: BigInt(paidMinor),
          }),
          updated_at: nowIso(),
        })
        .eq("id", invoiceId),
    );
  }

  private async ensureInvoice(cardId: string, date: string) {
    const userId = await this.userId();
    const cardRow = await firstRow(
      this.client.from("credit_cards").select("*").eq("id", cardId).eq("user_id", userId),
    );
    if (!cardRow) throw new Error("Cartão não encontrado");
    const card = mapCard(cardRow);
    const period = invoicePeriodFor({ closingDay: card.closingDay, dueDay: card.dueDay, asOf: date });
    const existing = await firstRow(
      this.client
        .from("credit_card_invoices")
        .select("id")
        .eq("user_id", userId)
        .eq("card_id", cardId)
        .eq("closing_date", period.closingDate),
    );
    if (existing) return String(existing.id);
    const row = {
      ...stamp(userId),
      card_id: cardId,
      period_start: period.periodStart,
      period_end: period.periodEnd,
      closing_date: period.closingDate,
      due_date: period.dueDate,
      status: "open",
      paid_minor: 0,
    };
    await run(this.client.from("credit_card_invoices").insert(row));
    return row.id;
  }

  async dashboard() {
    const userId = await this.userId();
    const month = monthKey(todayIsoDate());
    const { start, end } = monthBounds(month);
    const previous = monthKey(addDaysIso(start, -1));
    const previousBounds = monthBounds(previous);

    const [accounts, txns, previousTxns, propertyRows, liabilityRows, layout] = await Promise.all([
      this.listAccounts(),
      this.listTransactions({ from: start, to: end, limit: 500 }),
      this.listTransactions({ from: previousBounds.start, to: previousBounds.end, limit: 500 }),
      rows(this.client.from("properties").select("current_value_minor").eq("user_id", userId).is("deleted_at", null)),
      rows(this.client.from("liabilities").select("principal_minor").eq("user_id", userId).is("deleted_at", null)),
      firstRow(this.client.from("dashboard_layouts").select("widgets_json").eq("user_id", userId)),
    ]);
    const holdings = await this.portfolio();

    const incomeMinor = txns.filter((t) => t.type === "income").reduce((acc, t) => acc + t.amountMinor, 0);
    const expenseMinor = txns.filter((t) => t.type === "expense").reduce((acc, t) => acc + t.amountMinor, 0);
    const previousExpenseMinor = previousTxns
      .filter((t) => t.type === "expense")
      .reduce((acc, t) => acc + t.amountMinor, 0);
    const assets = accounts
      .filter((account) => account.includeInNetWorth === 1 && account.type !== "credit")
      .reduce((acc, account) => acc + account.balanceMinor, 0);
    const cards = accounts
      .filter((account) => account.type === "credit")
      .reduce((acc, account) => acc + Math.abs(account.balanceMinor), 0);

    const netWorth = calculateNetWorth({
      accountBalancesMinor: BigInt(assets),
      propertyValuesMinor: BigInt(propertyRows.reduce((acc, row) => acc + toNumber(row.current_value_minor), 0)),
      investmentMarketMinor: BigInt(holdings.totalMarketMinor),
      cardBalancesMinor: BigInt(cards),
      otherLiabilitiesMinor: BigInt(liabilityRows.reduce((acc, row) => acc + toNumber(row.principal_minor), 0)),
    });

    await this.saveSnapshot(userId, month, netWorth);
    const snapshots = (
      await rows(this.client.from("net_worth_snapshots").select("*").eq("user_id", userId).order("year_month"))
    ).map(mapSnapshot);

    let alerts: Awaited<ReturnType<FinanceService["refreshNotifications"]>> = [];
    try {
      alerts = await this.refreshNotifications();
    } catch {
      alerts = [];
    }

    return {
      month,
      incomeMinor,
      expenseMinor,
      previousExpenseMinor,
      netWorth,
      snapshots,
      widgets: layout?.widgets_json ? safeParseWidgets(String(layout.widgets_json)) : DEFAULT_WIDGETS,
      alerts: alerts.filter((alert) => !alert.readAt).slice(0, 5),
      topCategories: this.topCategories(txns),
    };
  }

  private async saveSnapshot(
    userId: string,
    month: string,
    netWorth: { grossMinor: bigint; debtsMinor: bigint; netMinor: bigint },
  ) {
    const at = nowIso();
    const patch = {
      gross_minor: Number(netWorth.grossMinor),
      debts_minor: Number(netWorth.debtsMinor),
      net_minor: Number(netWorth.netMinor),
      updated_at: at,
    };
    const existing = await firstRow(
      this.client.from("net_worth_snapshots").select("id").eq("user_id", userId).eq("year_month", month),
    );
    if (existing) {
      await run(this.client.from("net_worth_snapshots").update(patch).eq("id", String(existing.id)));
      return;
    }
    await run(this.client.from("net_worth_snapshots").insert({ ...stamp(userId), year_month: month, ...patch }));
  }

  async saveWidgets(widgets: string[]) {
    const userId = await this.userId();
    await run(
      this.client
        .from("dashboard_layouts")
        .upsert({ user_id: userId, widgets_json: JSON.stringify(widgets), updated_at: nowIso() }),
    );
  }

  private topCategories(txns: { type: string; category_id: string | null; amountMinor: number }[]) {
    const map = new Map<string, number>();
    for (const txn of txns.filter((item) => item.type === "expense")) {
      const key = txn.category_id ?? "outros";
      map.set(key, (map.get(key) ?? 0) + txn.amountMinor);
    }
    return [...map.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([id, minor]) => ({ id, minor }));
  }

  async spendingByCategory(yearMonth: string) {
    if (!yearMonth) {
      return {
        yearMonth,
        totalSpentMinor: 0,
        categories: [] as {
          categoryId: string | null;
          name: string;
          color: string | null;
          spentMinor: number;
          share: number;
          standingLimitMinor: number | null;
          limitMinor: number | null;
          remainingMinor: number | null;
          percent: number | null;
          alert: "ok" | "near" | "reached" | "over" | null;
          pace: "under" | "on_track" | "ahead" | null;
        }[],
        pace: monthElapsedPercent(yearMonth),
      };
    }
    const userId = await this.userId();
    const { start, end } = monthBounds(yearMonth);
    const [txns, categories, budgetRows] = await Promise.all([
      this.listTransactions({ from: start, to: end, limit: 500 }),
      this.listCategories(),
      this.loadStandingBudgetRows(userId),
    ]);
    const catMap = new Map(categories.map((c) => [c.id, c]));
    const standingByCat = new Map(budgetRows.map((row) => [String(row.category_id), toNumber(row.limit_minor)]));
    const spentMap = new Map<string, number>();
    for (const txn of txns.filter((item) => item.type === "expense")) {
      const key = txn.categoryId ?? txn.category_id ?? "uncategorized";
      spentMap.set(key, (spentMap.get(key) ?? 0) + txn.amountMinor);
    }
    const totalSpentMinor = [...spentMap.values()].reduce((a, b) => a + b, 0);
    const pace = monthElapsedPercent(yearMonth);
    const ranked = [...spentMap.entries()]
      .map(([categoryId, spentMinor]) => {
        const uncategorized = categoryId === "uncategorized" || categoryId === "outros";
        const cat = uncategorized ? null : catMap.get(categoryId);
        const standingLimitMinor = uncategorized ? null : (standingByCat.get(categoryId) ?? null);
        const limitMinor = standingLimitMinor;
        const usage =
          limitMinor != null && limitMinor > 0
            ? budgetUsage(BigInt(spentMinor), BigInt(limitMinor))
            : null;
        return {
          categoryId: uncategorized ? null : categoryId,
          name: cat?.name ?? "Sem categoria",
          color: cat?.color ?? null,
          spentMinor,
          share: totalSpentMinor > 0 ? (spentMinor / totalSpentMinor) * 100 : 0,
          standingLimitMinor,
          limitMinor,
          remainingMinor: usage ? Number(usage.remainingMinor) : null,
          percent: usage?.percent ?? null,
          alert: usage?.alert ?? null,
          pace: usage ? budgetPace(usage.percent, pace.elapsedPercent) : null,
        };
      })
      .sort((a, b) => b.spentMinor - a.spentMinor);

    return { yearMonth, totalSpentMinor, categories: ranked, pace };
  }

  /**
   * Limites fixos por categoria (valem para todos os meses).
   * O parâmetro yearMonth é ignorado na gravação — mantido por compatibilidade da API.
   */
  async upsertBudget(categoryId: string, _yearMonth: string, limitMajor: string, currency: string) {
    const userId = await this.userId();
    const limitMinor = Number(fromMajor(normalizeMajorInput(limitMajor), currency).amountMinor);
    if (limitMinor <= 0) throw new Error("Informe um limite maior que zero");
    const existing = await firstRow(
      this.client
        .from("budgets")
        .select("id")
        .eq("user_id", userId)
        .eq("category_id", categoryId)
        .eq("year_month", STANDING_BUDGET_MONTH),
    );
    if (existing) {
      await run(
        this.client
          .from("budgets")
          .update({ limit_minor: limitMinor, updated_at: nowIso() })
          .eq("id", String(existing.id)),
      );
      return;
    }
    await run(
      this.client.from("budgets").insert({
        ...stamp(userId),
        category_id: categoryId,
        year_month: STANDING_BUDGET_MONTH,
        limit_minor: limitMinor,
      }),
    );
  }

  async deleteBudget(budgetId: string) {
    const userId = await this.userId();
    await run(this.client.from("budgets").delete().eq("id", budgetId).eq("user_id", userId));
  }

  /** @deprecated Limites são permanentes — mantido por compatibilidade. */
  async copyBudgetsToMonth(_fromYearMonth: string, _toYearMonth: string) {
    return { copied: 0, toYearMonth: STANDING_BUDGET_MONTH };
  }

  /** Carrega limites permanentes; migra automaticamente limites antigos por mês, se existirem. */
  private async loadStandingBudgetRows(userId: string) {
    let standing = await rows(
      this.client.from("budgets").select("*").eq("user_id", userId).eq("year_month", STANDING_BUDGET_MONTH),
    );
    if (standing.length > 0) return standing;

    const legacy = await rows(this.client.from("budgets").select("*").eq("user_id", userId));
    if (!legacy.length) return [];

    const byCat = new Map<string, { limit_minor: unknown; year_month: string }>();
    for (const row of legacy) {
      const catId = String(row.category_id);
      const ym = String(row.year_month);
      const prev = byCat.get(catId);
      if (!prev || ym > prev.year_month) {
        byCat.set(catId, { limit_minor: row.limit_minor, year_month: ym });
      }
    }

    for (const [categoryId, row] of byCat) {
      await run(
        this.client.from("budgets").insert({
          ...stamp(userId),
          category_id: categoryId,
          year_month: STANDING_BUDGET_MONTH,
          limit_minor: toNumber(row.limit_minor),
        }),
      );
    }

    standing = await rows(
      this.client.from("budgets").select("*").eq("user_id", userId).eq("year_month", STANDING_BUDGET_MONTH),
    );
    return standing;
  }

  /**
   * Gasto total (todas as despesas) por mês, nos 36 meses anteriores a `yearMonth`.
   * Usado para arrastar estouro do teto total no mês seguinte.
   */
  private async loadTotalSpendByMonth(yearMonth: string) {
    const historyFrom = shiftYearMonth(yearMonth, -36);
    const { start: from } = monthBounds(historyFrom);
    const prevEnd = monthBounds(shiftYearMonth(yearMonth, -1)).end;
    const spentByMonth = new Map<string, bigint>();
    if (from > prevEnd) return spentByMonth;

    const txns = await this.listTransactions({ from, to: prevEnd, limit: 5000 });
    for (const txn of txns) {
      if (txn.type !== "expense") continue;
      const ym = monthKey(txn.date);
      if (ym >= yearMonth) continue;
      spentByMonth.set(ym, (spentByMonth.get(ym) ?? 0n) + BigInt(txn.amountMinor));
    }
    return spentByMonth;
  }

  /**
   * Metas por categoria (fixas) + teto total efetivo do mês
   * (soma das metas − dívida de estouro do total de gastos anteriores).
   */
  async listBudgets(yearMonth: string) {
    if (!yearMonth) {
      return {
        items: [] as {
          id: string;
          categoryId: string;
          categoryName: string;
          categoryColor: string | null;
          yearMonth: string;
          standingLimitMinor: number;
          limitMinor: number;
          spentMinor: number;
          remainingMinor: number;
          percent: number;
          alert: "ok" | "near" | "reached" | "over";
          pace: "under" | "on_track" | "ahead";
        }[],
        envelope: null as null | {
          standingTotalMinor: number;
          availableTotalMinor: number;
          debtMinor: number;
          spentTotalMinor: number;
          remainingMinor: number;
          percent: number;
          alert: "ok" | "near" | "reached" | "over";
        },
      };
    }
    const userId = await this.userId();
    const [budgetRows, categories, historySpend] = await Promise.all([
      this.loadStandingBudgetRows(userId),
      this.listCategories(),
      this.loadTotalSpendByMonth(yearMonth),
    ]);
    const catMap = new Map(categories.map((c) => [c.id, c]));
    const { start, end } = monthBounds(yearMonth);
    const txns = await this.listTransactions({ from: start, to: end, limit: 500 });
    const pace = monthElapsedPercent(yearMonth);
    const historyFrom = shiftYearMonth(yearMonth, -36);

    const standingTotalMinor = budgetRows.reduce((acc, row) => acc + toNumber(row.limit_minor), 0);
    const spentTotalMinor = txns
      .filter((txn) => txn.type === "expense")
      .reduce((acc, txn) => acc + txn.amountMinor, 0);

    const envelopeEffective =
      standingTotalMinor > 0
        ? effectiveBudgetLimit({
            standingLimitMinor: BigInt(standingTotalMinor),
            yearMonth,
            spentByMonth: historySpend,
            fromMonth: historyFrom,
          })
        : null;
    const availableTotalMinor = envelopeEffective ? Number(envelopeEffective.availableMinor) : 0;
    const envelopeUsage =
      standingTotalMinor > 0
        ? budgetUsage(BigInt(spentTotalMinor), BigInt(availableTotalMinor))
        : null;

    const items = budgetRows.map((row) => {
      const categoryId = String(row.category_id);
      const cat = catMap.get(categoryId);
      const standingLimitMinor = toNumber(row.limit_minor);
      const spentMinor = txns
        .filter((txn) => txn.type === "expense" && (txn.categoryId ?? txn.category_id) === categoryId)
        .reduce((acc, txn) => acc + txn.amountMinor, 0);
      const usage = budgetUsage(BigInt(spentMinor), BigInt(standingLimitMinor));
      return {
        id: String(row.id),
        categoryId,
        categoryName: cat?.name ?? "Categoria",
        categoryColor: cat?.color ?? null,
        yearMonth: STANDING_BUDGET_MONTH,
        standingLimitMinor,
        limitMinor: standingLimitMinor,
        spentMinor,
        ...usage,
        pace: budgetPace(usage.percent, pace.elapsedPercent),
        remainingMinor: Number(usage.remainingMinor),
      };
    });

    return {
      items,
      envelope:
        envelopeUsage && envelopeEffective
          ? {
              standingTotalMinor,
              availableTotalMinor,
              debtMinor: Number(envelopeEffective.debtMinor),
              spentTotalMinor,
              remainingMinor: Number(envelopeUsage.remainingMinor),
              percent: envelopeUsage.percent,
              alert: envelopeUsage.alert,
            }
          : null,
    };
  }

  async createGoal(input: { name: string; kind: string; targetMajor: string; currency: string; targetDate: string }) {
    const userId = await this.userId();
    const row = {
      ...stamp(userId),
      name: input.name,
      kind: input.kind,
      target_minor: Number(fromMajor(input.targetMajor, input.currency).amountMinor),
      current_minor: 0,
      target_date: input.targetDate,
      linked_account_id: null,
      status: "active",
    };
    await run(this.client.from("goals").insert(row));
    return { id: row.id, name: input.name, targetDate: input.targetDate };
  }

  async contributeGoal(goalId: string, amountMajor: string, currency: string) {
    const userId = await this.userId();
    const goal = await firstRow(
      this.client.from("goals").select("current_minor").eq("id", goalId).eq("user_id", userId).is("deleted_at", null),
    );
    if (!goal) throw new Error("Meta não encontrada");
    const normalized = normalizeMajorInput(amountMajor);
    const amount = fromMajor(normalized, currency);
    if (amount.amountMinor <= 0n) throw new Error("Informe um valor maior que zero");
    const amountMinor = Number(amount.amountMinor);
    await run(
      this.client.from("goal_contributions").insert({
        ...stamp(userId),
        goal_id: goalId,
        amount_minor: amountMinor,
        date: todayIsoDate(),
        transaction_id: null,
      }),
    );
    await run(
      this.client
        .from("goals")
        .update({ current_minor: toNumber(goal.current_minor) + amountMinor, updated_at: nowIso() })
        .eq("id", goalId),
    );
  }

  async deleteGoal(goalId: string) {
    const userId = await this.userId();
    const goal = await firstRow(
      this.client.from("goals").select("id").eq("id", goalId).eq("user_id", userId).is("deleted_at", null),
    );
    if (!goal) throw new Error("Meta não encontrada");
    const at = nowIso();
    await run(
      this.client
        .from("goals")
        .update({ deleted_at: at, updated_at: at, status: "cancelled" })
        .eq("id", goalId)
        .eq("user_id", userId),
    );
  }

  async listGoals() {
    const userId = await this.userId();
    const goalRows = await rows(
      this.client.from("goals").select("*").eq("user_id", userId).is("deleted_at", null),
    );
    return goalRows.map((row) => {
      const currentMinor = toNumber(row.current_minor);
      const targetMinor = toNumber(row.target_minor);
      const targetDate = String(row.target_date);
      return {
        id: String(row.id),
        name: String(row.name ?? ""),
        kind: String(row.kind ?? "other"),
        currentMinor,
        targetMinor,
        targetDate,
        status: String(row.status ?? "active"),
        progress: goalProgress(BigInt(currentMinor), BigInt(targetMinor)),
        recommendedMinor: Number(
          recommendedMonthlyContribution({
            targetMinor: BigInt(targetMinor),
            currentMinor: BigInt(currentMinor),
            monthsRemaining: monthsBetween(todayIsoDate(), targetDate),
          }),
        ),
      };
    });
  }

  async createProperty(input: { kind: string; name: string; valueMajor: string; currency: string }) {
    const userId = await this.userId();
    const row = {
      ...stamp(userId),
      kind: input.kind,
      name: input.name,
      currency: input.currency,
      current_value_minor: Number(fromMajor(input.valueMajor, input.currency).amountMinor),
      valuation_date: todayIsoDate(),
      linked_liability_id: null,
    };
    await run(this.client.from("properties").insert(row));
    return { id: row.id, name: input.name };
  }

  async createLiability(input: {
    kind: string;
    name: string;
    principalMajor: string;
    currency: string;
    dueDate?: string;
  }) {
    const userId = await this.userId();
    const principalMinor = Number(fromMajor(input.principalMajor, input.currency).amountMinor);
    const account = await this.createAccount({
      name: input.name,
      type: "other",
      currency: input.currency,
      initialBalanceMinor: -principalMinor,
    });
    const row = {
      ...stamp(userId),
      kind: input.kind,
      account_id: account.id,
      name: input.name,
      principal_minor: principalMinor,
      rate: null,
      indexer: null,
      due_date: input.dueDate ?? null,
    };
    await run(this.client.from("liabilities").insert(row));
    return { id: row.id, name: input.name, accountId: account.id };
  }

  async listNetWorthItems() {
    const userId = await this.userId();
    const [propertyRows, liabilityRows, snapshotRows] = await Promise.all([
      rows(this.client.from("properties").select("*").eq("user_id", userId).is("deleted_at", null)),
      rows(this.client.from("liabilities").select("*").eq("user_id", userId).is("deleted_at", null)),
      rows(this.client.from("net_worth_snapshots").select("*").eq("user_id", userId).order("year_month")),
    ]);
    return {
      properties: propertyRows.map((row) => ({
        id: String(row.id),
        kind: String(row.kind ?? "other"),
        name: String(row.name ?? ""),
        currency: String(row.currency ?? DEFAULT_CURRENCY),
        currentValueMinor: toNumber(row.current_value_minor),
        valuationDate: String(row.valuation_date ?? todayIsoDate()),
      })),
      liabilities: liabilityRows.map((row) => ({
        id: String(row.id),
        kind: String(row.kind ?? "other"),
        name: String(row.name ?? ""),
        accountId: String(row.account_id),
        principalMinor: toNumber(row.principal_minor),
        dueDate: (row.due_date ?? null) as string | null,
      })),
      snapshots: snapshotRows.map(mapSnapshot),
    };
  }

  async upsertInstrument(input: { symbol: string; name: string; class: InstrumentClass; currency: string }) {
    const userId = await this.userId();
    const existing = await firstRow(
      this.client
        .from("instruments")
        .select("*")
        .eq("user_id", userId)
        .eq("symbol", input.symbol)
        .is("deleted_at", null),
    );
    if (existing) return mapInstrument(existing);
    const row = {
      ...stamp(userId),
      symbol: input.symbol,
      name: input.name,
      class: input.class,
      currency: input.currency,
      exchange: null,
      metadata: null,
    };
    await run(this.client.from("instruments").insert(row));
    return mapInstrument(row);
  }

  async listInstruments() {
    const userId = await this.userId();
    const list = await rows(
      this.client.from("instruments").select("*").eq("user_id", userId).is("deleted_at", null),
    );
    return list.map(mapInstrument);
  }

  async recordInvestment(input: {
    custodyAccountId: string;
    instrumentId: string;
    type: InvestmentEventType;
    date: string;
    quantity: number;
    priceMajor?: string;
    amountMajor: string;
    currency: string;
    cashAccountId?: string;
  }) {
    const userId = await this.userId();
    const amount = fromMajor(input.amountMajor, input.currency);
    const quantityScale = 6;
    const inflow = input.type === "buy" || input.type === "contribution";
    const outflow =
      input.type === "sell" ||
      input.type === "dividend" ||
      input.type === "interest" ||
      input.type === "withdrawal";

    let linkedTransactionId: string | null = null;
    if (input.cashAccountId && input.cashAccountId !== input.custodyAccountId && (inflow || outflow)) {
      const transfer = await this.registerTransfer({
        amountMajor: input.amountMajor,
        currency: input.currency,
        fromAccountId: inflow ? input.cashAccountId : input.custodyAccountId,
        toAccountId: inflow ? input.custodyAccountId : input.cashAccountId,
        description: `${input.type} investimento`,
        date: input.date,
      });
      linkedTransactionId = transfer.id;
    }

    const row = {
      ...stamp(userId),
      custody_account_id: input.custodyAccountId,
      instrument_id: input.instrumentId,
      type: input.type,
      date: input.date,
      quantity_unscaled: Math.round(input.quantity * 10 ** quantityScale),
      quantity_scale: quantityScale,
      price_minor: input.priceMajor ? Number(fromMajor(input.priceMajor, input.currency).amountMinor) : 0,
      amount_minor: Number(amount.amountMinor),
      linked_transaction_id: linkedTransactionId,
    };
    await run(this.client.from("investment_events").insert(row));
    return { id: row.id, linkedTransactionId };
  }

  async portfolio() {
    const userId = await this.userId();
    const [eventRows, instruments, quoteRows] = await Promise.all([
      rows(this.client.from("investment_events").select("*").eq("user_id", userId).is("deleted_at", null)),
      this.listInstruments(),
      rows(this.client.from("market_quotes").select("code, price, as_of").order("as_of")),
    ]);

    const grouped = new Map<string, DbRow[]>();
    for (const event of eventRows) {
      const key = String(event.instrument_id);
      const list = grouped.get(key) ?? [];
      list.push(event);
      grouped.set(key, list);
    }

    const holdings = [...grouped.entries()].map(([instrumentId, events]) => {
      const position = replayPosition(
        events.map((event) => ({
          type: String(event.type) as InvestmentEventType,
          date: String(event.date),
          quantityUnscaled: BigInt(toNumber(event.quantity_unscaled)),
          quantityScale: toNumber(event.quantity_scale),
          priceMinor: BigInt(toNumber(event.price_minor)),
          amountMinor: BigInt(toNumber(event.amount_minor)),
        })),
      );
      const instrument = instruments.find((item) => item.id === instrumentId);
      const quote = quoteRows.filter((row) => row.code === instrument?.symbol).at(-1);
      const priceMinor = quote ? BigInt(Math.round(toNumber(quote.price) * 100)) : position.averagePriceMinor;
      const marketMinor = (priceMinor * BigInt(Math.round(position.quantity * 1_000_000))) / 1_000_000n;
      return {
        instrument,
        position,
        marketMinor: Number(marketMinor),
        pnlMinor: Number(marketMinor - position.costMinor),
      };
    });

    return {
      holdings,
      totalMarketMinor: holdings.reduce((acc, holding) => acc + holding.marketMinor, 0),
      totalCostMinor: holdings.reduce((acc, holding) => acc + Number(holding.position.costMinor), 0),
    };
  }

  async analyze() {
    const [portfolio, profile, dash] = await Promise.all([this.portfolio(), this.latestProfile(), this.dashboard()]);
    const emergencyMonths = dash.incomeMinor > 0 ? Number(dash.netWorth.netMinor) / Math.max(dash.expenseMinor, 1) : 0;
    return analyzePortfolio({
      holdings: portfolio.holdings
        .filter((holding) => holding.instrument)
        .map((holding) => ({
          id: holding.instrument!.id,
          name: holding.instrument!.name,
          class: holding.instrument!.class,
          institutionId: holding.instrument!.id,
          marketMinor: BigInt(holding.marketMinor),
          liquidity: "daily" as const,
          risk: 3 as const,
        })),
      emergencyMonths,
      emergencyTargetMonths: 6,
      profileBand: profile ? (profile.band as InvestorBand) : null,
      netWorthMinor: dash.netWorth.netMinor,
    });
  }

  async latestProfile() {
    const userId = await this.userId();
    const row = await firstRow(
      this.client
        .from("investor_profiles")
        .select("*")
        .eq("user_id", userId)
        .order("computed_at", { ascending: false })
        .limit(1),
    );
    if (!row) return null;
    return {
      id: String(row.id),
      questionnaireId: String(row.questionnaire_id),
      band: String(row.band),
      score: toNumber(row.score),
      justification: String(row.justification ?? ""),
      computedAt: String(row.computed_at),
    };
  }

  async submitQuestionnaire(answers: InvestorAnswer[]) {
    const userId = await this.userId();
    const profile = computeInvestorProfile(answers);
    const at = nowIso();
    const questionnaire = {
      ...stamp(userId),
      questionnaire_version: profile.questionnaireVersion,
      completed_at: at,
    };
    await run(this.client.from("investor_questionnaires").insert(questionnaire));
    await run(
      this.client.from("investor_answers").insert(
        answers.map((answer) => ({
          id: createId(),
          questionnaire_id: questionnaire.id,
          question_id: answer.questionId,
          value: answer.value,
        })),
      ),
    );
    const snapshot = {
      ...stamp(userId),
      questionnaire_id: questionnaire.id,
      band: profile.band,
      score: profile.score,
      justification: profile.justification,
      computed_at: at,
    };
    await run(this.client.from("investor_profiles").insert(snapshot));
    return {
      id: snapshot.id,
      questionnaireId: questionnaire.id,
      band: profile.band,
      score: profile.score,
      justification: profile.justification,
      computedAt: at,
    };
  }

  async recommend() {
    const profile = await this.latestProfile();
    if (!profile) return [];
    const userId = await this.userId();
    const [dash, goals, portfolio] = await Promise.all([this.dashboard(), this.listGoals(), this.portfolio()]);
    const goalMonths = goals[0] ? monthsBetween(todayIsoDate(), goals[0].targetDate) : 36;
    const results = recommendProducts({
      profileBand: profile.band as InvestorBand,
      goalMonths,
      emergencyOk: Number(dash.netWorth.netMinor) > dash.expenseMinor * 6,
      monthlySurplusMinor: BigInt(dash.incomeMinor - dash.expenseMinor),
      hasInvestments: portfolio.holdings.length > 0,
    });
    await run(
      this.client.from("recommendations").insert({
        ...stamp(userId),
        input_hash: createId(),
        result_json: jsonStringify(results),
      }),
    );
    return results;
  }

  async previewImport(fileName: string, text: string) {
    const userId = await this.userId();
    const source = detectImportSource(fileName, text);
    let unrecognized: string[] = [];
    const parsed =
      source === "ofx"
        ? parseOfx(text)
        : source === "pdf"
          ? (() => {
              const result = parsePdfText(text);
              unrecognized = result.unrecognized;
              return result.items;
            })()
          : parseCsv(text);

    const [existing, ruleRows] = await Promise.all([
      this.listTransactions({ limit: 2000 }),
      rows(this.client.from("categorization_rules").select("*").eq("user_id", userId).is("deleted_at", null)),
    ]);
    const existingMovements = existing.map((txn) => ({
      date: txn.date,
      description: txn.description,
      amountMinor: BigInt(txn.type === "expense" ? -txn.amountMinor : txn.amountMinor),
      type: txn.type as "income" | "expense" | "transfer",
      externalId: txn.externalId ?? undefined,
    }));
    const rules = ruleRows.map((row) => ({
      pattern: String(row.pattern),
      matchType: String(row.match_type ?? "contains") as "contains",
      categoryId: String(row.category_id),
    }));

    const items = parsed.map((item, index) => {
      const duplicates = detectDuplicates(item, existingMovements);
      const rule = applyRules(item.description, rules);
      return {
        id: item.externalId ?? `row-${index}`,
        date: item.date,
        description: item.description,
        amountMinor: Number(item.amountMinor),
        type: item.type,
        externalId: item.externalId,
        duplicate: Boolean(duplicates[0]),
        categoryId: rule?.categoryId,
        decision: duplicates[0] ? ("skip" as const) : ("accept" as const),
        toAccountId: undefined as string | undefined,
      };
    });
    return { source, items, unrecognized };
  }

  async commitImport(
    items: {
      description: string;
      date: string;
      amountMinor: number | bigint;
      type: string;
      categoryId?: string;
      decision: string;
      externalId?: string;
      toAccountId?: string;
    }[],
    accountId: string,
    currency: string,
    meta?: { source?: string; fileName?: string; fileHash?: string },
  ) {
    const userId = await this.userId();
    const job = {
      ...stamp(userId),
      source: meta?.source ?? "csv",
      status: "committed",
      file_hash: meta?.fileHash ?? createId(),
      file_name: meta?.fileName ?? "import",
    };
    await run(this.client.from("import_jobs").insert(job));

    let accepted = 0;
    let skipped = 0;
    for (const [index, item] of items.entries()) {
      await run(
        this.client.from("import_items").insert({
          id: createId(),
          job_id: job.id,
          raw_json: jsonStringify({
            date: item.date,
            description: item.description,
            amountMinor: Number(item.amountMinor),
            type: item.type,
            externalId: item.externalId,
          }),
          suggested_json: jsonStringify({ categoryId: item.categoryId, toAccountId: item.toAccountId }),
          duplicate_of: item.decision === "skip" ? "duplicate" : null,
          decision: item.decision,
        }),
      );
      if (item.decision !== "accept") {
        skipped += 1;
        continue;
      }

      const signed = typeof item.amountMinor === "bigint" ? item.amountMinor : BigInt(item.amountMinor);
      const amountMajor = (Number(signed < 0n ? -signed : signed) / 100).toFixed(2);
      const idempotencyKey = item.externalId
        ? `import:${accountId}:${item.externalId}`
        : `import:${job.id}:${item.date}:${item.description}:${signed.toString()}:${index}`;
      const common = {
        amountMajor,
        currency,
        description: item.description,
        date: item.date,
        origin: "import" as const,
        externalId: item.externalId,
        idempotencyKey,
      };

      if (item.type === "transfer") {
        if (!item.toAccountId) throw new Error(`Informe a outra conta da transferência: ${item.description}`);
        if (signed < 0n) {
          await this.registerTransfer({ ...common, fromAccountId: accountId, toAccountId: item.toAccountId });
        } else {
          await this.registerTransfer({ ...common, fromAccountId: item.toAccountId, toAccountId: accountId });
        }
      } else if (item.type === "income" || (item.type !== "expense" && signed > 0n)) {
        await this.registerIncome({ ...common, accountId, categoryId: item.categoryId });
      } else {
        await this.registerExpense({ ...common, accountId, categoryId: item.categoryId });
      }
      accepted += 1;

      if (item.categoryId) {
        const rule = learnRule(item.description, item.categoryId);
        await run(
          this.client.from("categorization_rules").insert({
            ...stamp(userId),
            pattern: rule.pattern,
            match_type: rule.matchType,
            category_id: rule.categoryId,
            priority: 0,
            learned_from: "import",
          }),
        );
      }
    }
    return { jobId: job.id, accepted, skipped };
  }

  /** Plain JSON snapshot of the main tables. Point-in-time restore lives in the Supabase dashboard. */
  async exportBackup(_password?: string) {
    const userId = await this.userId();
    const tables = [
      "users",
      "settings",
      "institutions",
      "accounts",
      "categories",
      "transactions",
      "postings",
      "recurrence_rules",
      "installment_plans",
      "credit_cards",
      "credit_card_invoices",
      "instruments",
      "investment_events",
      "properties",
      "liabilities",
      "goals",
      "goal_contributions",
      "budgets",
      "net_worth_snapshots",
      "investor_questionnaires",
      "investor_profiles",
      "categorization_rules",
      "dashboard_layouts",
    ];
    const dump: Record<string, unknown[]> = {};
    for (const table of tables) {
      const column = table === "users" ? "id" : "user_id";
      dump[table] = await rows(this.client.from(table).select("*").eq(column, userId));
    }
    return jsonStringify({ backup_version: BACKUP_VERSION, exported_at: nowIso(), dump });
  }

  async importBackup(_fileText: string, _password?: string): Promise<never> {
    throw new Error("Use o painel Supabase para restaurar backups.");
  }

  async refreshMarket() {
    const settings = await this.getSettings();
    const provider = new CompositeMarketDataProvider([
      new BcbMarketDataProvider(),
      new BrapiMarketDataProvider(settings.brapiToken || undefined),
      new ManualMarketDataProvider([]),
    ]);
    try {
      const quotes = await provider.getQuotes(["SELIC", "CDI", "IPCA", "USD"]);
      if (quotes.length > 0) {
        await run(
          this.client.from("market_quotes").upsert(
            quotes.map((quote) => ({
              id: createId(),
              code: quote.code,
              price: String(quote.price),
              as_of: quote.asOf,
              source: quote.source,
            })),
            { onConflict: "code,as_of,source", ignoreDuplicates: true },
          ),
        );
      }
      return quotes;
    } catch {
      return [];
    }
  }

  async listQuotes() {
    const list = await rows(this.client.from("market_quotes").select("*").order("as_of"));
    return list.map((row) => ({
      id: String(row.id),
      code: String(row.code),
      price: String(row.price),
      asOf: String(row.as_of),
      source: String(row.source ?? "manual"),
    }));
  }

  async refreshNotifications() {
    const userId = await this.userId();
    const today = todayIsoDate();
    const reviewMonth = monthKey(addMonthsIso(today, -1));
    const [cards, budgets, existingRows] = await Promise.all([
      this.listCards(),
      this.listBudgets(reviewMonth),
      rows(
        this.client
          .from("notifications")
          .select("type, title, body")
          .eq("user_id", userId)
          .eq("scheduled_for", today),
      ),
    ]);

    const candidates: { type: string; title: string; body: string }[] = [];
    for (const card of cards) {
      const invoice = card.openInvoice;
      if (!invoice) continue;
      if (invoice.dueDate <= addDaysIso(today, 5) && invoice.dueDate >= today) {
        candidates.push({
          type: "card_due",
          title: "Fatura próxima",
          body: `${card.name} vence em ${invoice.dueDate}`,
        });
      }
      if (invoice.closingDate === today) {
        candidates.push({ type: "card_close", title: "Cartão fechando", body: `${card.name} fecha hoje` });
      }
    }
    for (const budget of budgets.items) {
      const name = budget.categoryName ?? "Categoria";
      if (budget.alert === "near") {
        candidates.push({
          type: "budget_near",
          title: "Meta quase no teto no mês fechado",
          body: `${name} ficou em ${budget.percent.toFixed(0)}% da meta — revise o hábito`,
        });
      }
      if (budget.alert === "over") {
        candidates.push({
          type: "budget_over",
          title: "Meta estourada no mês fechado",
          body: `${name} passou da meta da categoria`,
        });
      }
    }
    if (budgets.envelope?.alert === "over") {
      candidates.push({
        type: "budget_envelope_over",
        title: "Teto total estourado",
        body: "O total de gastos passou do disponível — o excesso desconta do teto no mês seguinte",
      });
    }

    const seen = new Set(existingRows.map((row) => `${row.type}|${row.title}|${row.body}`));
    const fresh = candidates.filter((item) => !seen.has(`${item.type}|${item.title}|${item.body}`));
    if (fresh.length > 0) {
      await run(
        this.client.from("notifications").insert(
          fresh.map((item) => ({
            ...stamp(userId),
            type: item.type,
            title: item.title,
            body: item.body,
            payload: null,
            read_at: null,
            scheduled_for: today,
          })),
        ),
      );
    }

    const list = await rows(
      this.client
        .from("notifications")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(50),
    );
    return list.map(mapNotification);
  }

  async explain(question: string) {
    const [dash, categories, settings] = await Promise.all([
      this.dashboard(),
      this.listCategories(),
      this.getSettings(),
    ]);
    const facts = {
      incomeMinor: BigInt(dash.incomeMinor),
      expenseMinor: BigInt(dash.expenseMinor),
      previousExpenseMinor: BigInt(dash.previousExpenseMinor),
      topCategories: dash.topCategories.map((item) => ({
        name: categories.find((category) => category.id === item.id)?.name ?? "Outros",
        minor: BigInt(item.minor),
      })),
      netWorthMinor: dash.netWorth.netMinor,
      budgetAlerts: dash.alerts.filter((alert) => alert.type.startsWith("budget")).map((alert) => alert.body),
      portfolioAlerts: [] as string[],
    };
    const local = explainFinances(facts, question);
    if (!settings.aiEndpoint || !settings.aiKey) return { source: "local" as const, text: local };
    try {
      const response = await fetch(settings.aiEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${settings.aiKey}` },
        body: JSON.stringify({
          model: "local",
          messages: [
            { role: "system", content: "Explique apenas os fatos fornecidos. Não calcule saldos." },
            { role: "user", content: `${question}\nFatos: ${local}` },
          ],
        }),
      });
      const json = (await response.json()) as { choices?: { message?: { content?: string } }[] };
      return { source: "remote" as const, text: json.choices?.[0]?.message?.content ?? local };
    } catch {
      return { source: "local" as const, text: local };
    }
  }

  async exportReport(kind: "cashflow" | "networth" | "investments") {
    if (kind === "cashflow") {
      const txns = await this.listTransactions({ limit: 2000 });
      return toCsv(
        ["data", "tipo", "descricao", "valor"],
        txns.map((txn) => [txn.date, txn.type, txn.description, (txn.amountMinor / 100).toFixed(2)]),
      );
    }
    if (kind === "networth") {
      const items = await this.listNetWorthItems();
      return toCsv(
        ["mes", "bruto", "dividas", "liquido"],
        items.snapshots.map((snapshot) => [
          snapshot.yearMonth,
          (snapshot.grossMinor / 100).toFixed(2),
          (snapshot.debtsMinor / 100).toFixed(2),
          (snapshot.netMinor / 100).toFixed(2),
        ]),
      );
    }
    const portfolio = await this.portfolio();
    return toCsv(
      ["ativo", "quantidade", "custo", "mercado"],
      portfolio.holdings.map((holding) => [
        holding.instrument?.symbol ?? "",
        String(holding.position.quantity),
        (Number(holding.position.costMinor) / 100).toFixed(2),
        (holding.marketMinor / 100).toFixed(2),
      ]),
    );
  }

  async listConflicts() {
    const userId = await this.userId();
    const list = await rows(
      this.client.from("sync_conflicts").select("*").eq("user_id", userId).is("resolved_at", null),
    );
    return list.map((row) => ({
      id: String(row.id),
      entity: String(row.entity),
      entityId: String(row.entity_id),
      createdAt: String(row.created_at),
    }));
  }

  /** Supabase is the single source of truth, so remote operations always apply. */
  async applyRemoteOp(_remote: { entity: string; entityId: string; payload: Record<string, unknown> }) {
    return "applied" as const;
  }

  async resolveConflict(id: string, choice: "local" | "remote") {
    const userId = await this.userId();
    await run(
      this.client
        .from("sync_conflicts")
        .update({ resolved_at: nowIso() })
        .eq("id", id)
        .eq("user_id", userId),
    );
    return { choice, id };
  }

  async connectExternal(provider = "manual-open-finance") {
    const userId = await this.userId();
    const row = {
      ...stamp(userId),
      provider,
      status: "active",
      consent_expires_at: null,
      last_sync_at: nowIso(),
    };
    await run(this.client.from("external_connections").insert(row));
    return { id: row.id, provider, status: "active" };
  }

  async importExternalDrafts(
    drafts: { externalId: string; date: string; description: string; amountMinor: number }[],
  ) {
    const userId = await this.userId();
    const connection = await firstRow(
      this.client.from("external_connections").select("id").eq("user_id", userId).is("deleted_at", null),
    );
    if (!connection) throw new Error("Conecte uma instituição primeiro");
    if (drafts.length === 0) return;
    await run(
      this.client.from("external_transactions").insert(
        drafts.map((draft) => {
          const review = toReviewDraft({
            externalId: draft.externalId,
            accountExternalId: "ext",
            date: draft.date,
            description: draft.description,
            amountMinor: BigInt(draft.amountMinor),
            raw: draft,
          });
          return {
            ...stamp(userId),
            connection_id: String(connection.id),
            external_id: review.externalId,
            date: review.date,
            description: review.description,
            amount_minor: Number(review.amountMinor),
            accepted_at: null,
          };
        }),
      ),
    );
  }

  async listExternalDrafts() {
    const userId = await this.userId();
    const list = await rows(
      this.client.from("external_transactions").select("*").eq("user_id", userId).is("deleted_at", null),
    );
    return list.map((row) => ({
      id: String(row.id),
      externalId: String(row.external_id),
      date: String(row.date),
      description: String(row.description ?? ""),
      amountMinor: toNumber(row.amount_minor),
      acceptedAt: (row.accepted_at ?? null) as string | null,
    }));
  }

  async acceptExternal(id: string, accountId: string, currency: string) {
    const userId = await this.userId();
    const row = await firstRow(
      this.client.from("external_transactions").select("*").eq("id", id).eq("user_id", userId),
    );
    if (!row || row.accepted_at) throw new Error("Rascunho inválido");
    const amountMinor = toNumber(row.amount_minor);
    const common = {
      amountMajor: (Math.abs(amountMinor) / 100).toFixed(2),
      currency,
      accountId,
      description: String(row.description ?? "Lançamento externo"),
      date: String(row.date),
      idempotencyKey: `external:${id}`,
    };
    if (amountMinor >= 0) await this.registerIncome(common);
    else await this.registerExpense(common);
    await run(this.client.from("external_transactions").update({ accepted_at: nowIso() }).eq("id", id));
  }

  async getSyncState() {
    return { outbox: [] as DbRow[], state: null as DbRow | null, pending: 0 };
  }

  questions() {
    return INVESTOR_QUESTIONS;
  }

  private async commitDraft(
    draft: TransactionDraft,
    extra?: {
      forceType?: string;
      accountId?: string;
      cardId?: string;
      invoiceId?: string;
      recurrenceId?: string;
      installmentPlanId?: string;
    },
  ): Promise<{ id: string; duplicate: boolean }> {
    assertBalanced(draft.postings);
    const id = createId();
    const payload = {
      p_id: id,
      p_type: extra?.forceType ?? draft.type,
      p_status: draft.status ?? "cleared",
      p_description: draft.description,
      p_payee: draft.payee ?? null,
      p_date: draft.date,
      p_competency_date: draft.competencyDate ?? draft.date,
      p_account_id: extra?.accountId ?? draft.accountId,
      p_counterparty_account_id: draft.counterpartyAccountId ?? null,
      p_category_id: draft.categoryId ?? null,
      p_card_id: extra?.cardId ?? draft.cardId ?? null,
      p_invoice_id: extra?.invoiceId ?? draft.invoiceId ?? null,
      p_recurrence_id: extra?.recurrenceId ?? draft.recurrenceId ?? null,
      p_installment_plan_id: extra?.installmentPlanId ?? draft.installmentPlanId ?? null,
      p_installment_number: draft.installmentNumber ?? null,
      p_notes: draft.notes ?? null,
      p_origin: draft.origin ?? "manual",
      p_external_id: draft.externalId ?? null,
      p_idempotency_key: draft.idempotencyKey,
      p_postings: draft.postings.map((posting) => ({
        id: createId(),
        accountId: posting.accountId,
        amountMinor: Number(posting.amountMinor),
        currency: posting.currency,
      })) as unknown as Record<string, unknown>[],
    };
    const { data, error } = await this.client.rpc("create_transaction", payload);
    if (error) throw new Error(error.message);
    const result = (data ?? {}) as { id?: string; duplicate?: boolean };
    return { id: result.id ?? id, duplicate: Boolean(result.duplicate) };
  }
}

function isSupabaseClient(value: unknown): value is SupabaseClient {
  if (!value || typeof value !== "object") return false;
  const candidate = value as { from?: unknown; auth?: unknown; rpc?: unknown };
  return typeof candidate.from === "function" && typeof candidate.rpc === "function" && Boolean(candidate.auth);
}

export function createFinanceService(client: SupabaseClient = sharedClient) {
  return new FinanceService(client);
}

export { adoptSession };
