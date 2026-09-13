import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { useFinance, useFinanceOptional } from "@/app/providers";
import { Button } from "@/ui/button";
import { Card } from "@/ui/card";
import { Input } from "@/ui/input";
import { Label } from "@/ui/label";
import { MoneyText } from "@/ui/money-text";
import { EmptyState, Skeleton } from "@/ui/empty-state";
import { PageTitle } from "@/ui/page-title";
import { Sheet } from "@/ui/sheet";

const TYPE_LABEL: Record<string, string> = {
  expense: "Despesa",
  income: "Receita",
  transfer: "Transferência",
  card_payment: "Fatura",
  investment: "Investimento",
  opening_balance: "Saldo inicial",
};

type TxnRow = {
  id: string;
  type: string;
  description: string;
  date: string;
  amountMinor: number;
  accountId: string;
  categoryId: string | null;
  counterparty_account_id: string | null;
  installment_number: number | null;
  notes?: string | null;
};

type EditForm = {
  description: string;
  date: string;
  amount: string;
  accountId: string;
  toAccountId: string;
  categoryId: string;
};

function formatMinorBrl(minor: number) {
  return (Math.abs(minor) / 100).toFixed(2).replace(".", ",");
}

export function ActivityPage() {
  const service = useFinance();
  const { bump } = useFinanceOptional();
  const txns = useQuery({ queryKey: ["txns"], queryFn: () => service.listTransactions({ limit: 80 }) });
  const accounts = useQuery({ queryKey: ["accounts"], queryFn: () => service.listAccounts() });
  const categories = useQuery({ queryKey: ["categories"], queryFn: () => service.listCategories() });
  const cards = useQuery({ queryKey: ["cards"], queryFn: () => service.listCards() });

  const [editing, setEditing] = useState<TxnRow | null>(null);
  const [form, setForm] = useState<EditForm>({
    description: "",
    date: "",
    amount: "",
    accountId: "",
    toAccountId: "",
    categoryId: "",
  });

  const assets = useMemo(
    () => accounts.data?.filter((a) => a.type !== "credit") ?? [],
    [accounts.data],
  );

  const openEdit = (txn: TxnRow) => {
    setEditing(txn);
    setForm({
      description: txn.description,
      date: txn.date,
      amount: formatMinorBrl(txn.amountMinor),
      accountId: txn.accountId,
      toAccountId: txn.counterparty_account_id ?? "",
      categoryId: txn.categoryId ?? "",
    });
  };

  const save = useMutation({
    mutationFn: async () => {
      if (!editing) throw new Error("Nada para editar");
      return service.updateTransaction(editing.id, {
        description: form.description,
        date: form.date,
        amountMajor: form.amount,
        currency: "BRL",
        categoryId: form.categoryId || null,
        accountId: form.accountId || undefined,
        toAccountId: editing.type === "transfer" ? form.toAccountId || null : undefined,
      });
    },
    onSuccess: () => {
      toast.success("Movimentação atualizada");
      bump();
      setEditing(null);
    },
    onError: (err) => toast.error(err.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => service.deleteTransaction(id),
    onSuccess: () => {
      toast.success("Movimentação apagada");
      bump();
      if (editing) setEditing(null);
    },
    onError: (err) => toast.error(err.message),
  });

  if (txns.isLoading) return <Skeleton className="h-96" />;

  return (
    <div className="space-y-6 pb-8">
      <PageTitle
        kicker="Extrato"
        action={
          <Button asChild variant="secondary" size="sm">
            <Link to="/accounts">Contas</Link>
          </Button>
        }
      >
        Finanças
      </PageTitle>

      <div className="flex flex-wrap gap-2">
        <Button asChild size="sm">
          <Link to="/import">Importar extrato</Link>
        </Button>
        <Button asChild size="sm" variant="secondary">
          <Link to="/cards">Cartões</Link>
        </Button>
        <Button asChild size="sm" variant="secondary">
          <Link to="/more">Orçamento</Link>
        </Button>
      </div>

      <div className="grid min-w-0 gap-8 lg:grid-cols-[minmax(0,320px)_1fr] lg:items-start">
        <aside className="min-w-0 space-y-3">
          <h2 className="font-display text-xl">Contas</h2>
          {accounts.data?.length === 0 ? (
            <EmptyState
              title="Nenhuma conta"
              description="Cadastre banco, dinheiro ou corretora para começar."
              action="Criar conta"
              onAction={() => {
                window.location.href = "/accounts";
              }}
            />
          ) : (
            accounts.data?.map((account) => (
              <Card key={account.id} className="flex min-w-0 items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{account.name}</p>
                  <p className="text-xs text-muted">{account.type}</p>
                </div>
                <MoneyText
                  amountMinor={account.type === "credit" ? Math.abs(account.balanceMinor) : account.balanceMinor}
                  className="shrink-0 text-xl"
                />
              </Card>
            ))
          )}
          {cards.data?.length ? (
            <p className="text-sm text-muted">{cards.data.length} cartão(ões) · veja limite em Cartões</p>
          ) : null}
        </aside>

        <section className="min-w-0 space-y-3">
          <h2 className="font-display text-xl">Movimentações</h2>
          {txns.data?.length === 0 ? (
            <EmptyState
              title="Nada lançado ainda"
              description="Adicione a primeira despesa, receita ou transferência pelo botão +."
            />
          ) : (
            <ul className="space-y-2">
              {txns.data?.map((txn) => (
                <li key={txn.id} className="min-w-0">
                  <Card className="flex min-w-0 flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{txn.description}</p>
                      <p className="truncate text-xs text-muted">
                        {TYPE_LABEL[txn.type] ?? txn.type} · {txn.date}
                        {txn.installment_number ? ` · ${txn.installment_number}x` : ""}
                      </p>
                    </div>
                    <div className="flex min-w-0 items-center justify-between gap-2 sm:shrink-0 sm:justify-end">
                      <MoneyText
                        amountMinor={txn.type === "expense" ? -txn.amountMinor : txn.amountMinor}
                        signed={txn.type !== "transfer"}
                        className="text-base"
                      />
                      <div className="flex shrink-0 gap-2">
                        <Button size="sm" variant="secondary" onClick={() => openEdit(txn as TxnRow)}>
                          Editar
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={remove.isPending}
                          onClick={() => {
                            if (!confirm(`Apagar "${txn.description}"?`)) return;
                            remove.mutate(txn.id);
                          }}
                        >
                          Apagar
                        </Button>
                      </div>
                    </div>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <Sheet open={Boolean(editing)} onOpenChange={(open) => !open && setEditing(null)} title="Editar lançamento">
        {editing ? (
          <div className="space-y-3 pb-4">
            <p className="text-xs text-muted">{TYPE_LABEL[editing.type] ?? editing.type}</p>

            <Label htmlFor="edit-amount">Valor</Label>
            <Input
              id="edit-amount"
              inputMode="decimal"
              value={form.amount}
              onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
              className="font-display text-2xl"
            />

            <Label htmlFor="edit-desc">Descrição</Label>
            <Input
              id="edit-desc"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />

            <Label htmlFor="edit-date">Data</Label>
            <Input
              id="edit-date"
              type="date"
              value={form.date}
              onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
            />

            {(editing.type === "expense" || editing.type === "income" || editing.type === "opening_balance") && (
              <>
                <Label>Conta</Label>
                <select
                  className="select-field"
                  value={form.accountId}
                  onChange={(e) => setForm((f) => ({ ...f, accountId: e.target.value }))}
                >
                  {assets.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name}
                    </option>
                  ))}
                </select>
              </>
            )}

            {editing.type === "transfer" ? (
              <>
                <Label>De</Label>
                <select
                  className="select-field"
                  value={form.accountId}
                  onChange={(e) => setForm((f) => ({ ...f, accountId: e.target.value }))}
                >
                  {assets.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name}
                    </option>
                  ))}
                </select>
                <Label>Para</Label>
                <select
                  className="select-field"
                  value={form.toAccountId}
                  onChange={(e) => setForm((f) => ({ ...f, toAccountId: e.target.value }))}
                >
                  <option value="">Selecione</option>
                  {assets.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name}
                    </option>
                  ))}
                </select>
              </>
            ) : null}

            {(editing.type === "expense" || editing.type === "income") && (
              <>
                <Label>Categoria</Label>
                <select
                  className="select-field"
                  value={form.categoryId}
                  onChange={(e) => setForm((f) => ({ ...f, categoryId: e.target.value }))}
                >
                  <option value="">Sem categoria</option>
                  {categories.data
                    ?.filter((c) => c.kind === editing.type && c.active)
                    .map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.parentId ? "— " : ""}
                        {category.name}
                      </option>
                    ))}
                </select>
              </>
            )}

            <div className="flex gap-2 pt-2">
              <Button className="flex-1" onClick={() => save.mutate()} disabled={save.isPending || !form.amount}>
                Salvar
              </Button>
              <Button
                variant="secondary"
                disabled={remove.isPending}
                onClick={() => {
                  if (!editing) return;
                  if (!confirm(`Apagar "${editing.description}"?`)) return;
                  remove.mutate(editing.id);
                }}
              >
                Apagar
              </Button>
            </div>
          </div>
        ) : null}
      </Sheet>
    </div>
  );
}
