import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { useFinance, useFinanceOptional } from "@/app/providers";
import type { AccountRow } from "@/application/finance-service";
import { Button } from "@/ui/button";
import { Card } from "@/ui/card";
import { Input } from "@/ui/input";
import { Label } from "@/ui/label";
import { MoneyText } from "@/ui/money-text";
import { PageTitle } from "@/ui/page-title";
import { EmptyState } from "@/ui/empty-state";
import { Sheet } from "@/ui/sheet";

function parseBrlMajor(raw: string): number {
  const cleaned = raw.trim().replace(/\s/g, "");
  if (!cleaned) return 0;
  if (cleaned.includes(",")) {
    return Number(cleaned.replace(/\./g, "").replace(",", "."));
  }
  return Number(cleaned);
}

const ACCOUNT_TYPES: { value: string; label: string }[] = [
  { value: "checking", label: "Corrente" },
  { value: "savings", label: "Poupança" },
  { value: "cash", label: "Dinheiro" },
  { value: "investment", label: "Investimentos" },
  { value: "other", label: "Outra" },
];

function accountTypeLabel(type: string) {
  return ACCOUNT_TYPES.find((t) => t.value === type)?.label ?? type;
}

type AccountForm = {
  name: string;
  type: string;
  initial: string;
  institution: string;
  notes: string;
};

const emptyForm = (): AccountForm => ({
  name: "",
  type: "checking",
  initial: "0",
  institution: "",
  notes: "",
});

export function AccountsPage() {
  const service = useFinance();
  const { bump } = useFinanceOptional();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<AccountForm>(emptyForm());

  const accounts = useQuery({ queryKey: ["accounts"], queryFn: () => service.listAccounts() });
  const institutions = useQuery({ queryKey: ["institutions"], queryFn: () => service.listInstitutions() });
  const categories = useQuery({ queryKey: ["categories"], queryFn: () => service.listCategories() });

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm());
    setSheetOpen(true);
  };

  const openEdit = (account: AccountRow & { balanceMinor: number }) => {
    const inst = institutions.data?.find((i) => i.id === account.institutionId);
    setEditingId(account.id);
    setForm({
      name: account.name,
      type: account.type,
      initial: "",
      institution: inst?.name ?? "",
      notes: account.notes ?? "",
    });
    setSheetOpen(true);
  };

  const resolveInstitutionId = async (raw: string): Promise<string | undefined> => {
    const name = raw.trim();
    if (!name) return undefined;
    const existing = institutions.data?.find((i) => i.name.toLowerCase() === name.toLowerCase());
    if (existing) return existing.id;
    const inst = await service.createInstitution({ name, type: "bank" });
    return inst.id;
  };

  const save = useMutation({
    mutationFn: async () => {
      const institutionId = await resolveInstitutionId(form.institution);
      if (editingId) {
        return service.updateAccount(editingId, {
          name: form.name,
          type: form.type,
          institutionId: institutionId ?? null,
          notes: form.notes.trim() || null,
        });
      }
      return service.createAccount({
        name: form.name,
        type: form.type,
        currency: "BRL",
        initialBalanceMinor: Math.round(parseBrlMajor(form.initial) * 100),
        institutionId,
        notes: form.notes.trim() || undefined,
      });
    },
    onSuccess: () => {
      toast.success(editingId ? "Conta atualizada" : "Conta criada");
      bump();
      setSheetOpen(false);
      setEditingId(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const toggleCat = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => service.toggleCategory(id, active),
    onSuccess: bump,
  });

  const addCat = useMutation({
    mutationFn: () =>
      service.createCategory({
        name: "Nova categoria",
        kind: "expense",
        parentId: categories.data?.find((c) => c.kind === "expense" && !c.parentId)?.id,
      }),
    onSuccess: bump,
  });

  const remove = useMutation({
    mutationFn: (id: string) => service.deleteAccount(id),
    onSuccess: () => {
      toast.success("Conta apagada");
      bump();
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="space-y-5 pb-8">
      <PageTitle
        kicker="Onde o dinheiro está"
        action={
          <Button size="sm" onClick={openCreate}>
            Nova
          </Button>
        }
      >
        Contas
      </PageTitle>
      {accounts.data?.length === 0 ? (
        <EmptyState
          title="Nenhuma conta ainda"
          description="Cadastre banco, dinheiro ou custódia para começar a lançar."
          action="Criar conta"
          onAction={openCreate}
        />
      ) : (
        accounts.data?.map((account) => (
          <Card key={account.id} className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="font-medium">{account.name}</p>
              <p className="text-xs text-muted">
                {accountTypeLabel(account.type)}
                {account.statedBalanceMinor != null
                  ? ` · saldo informado ${(account.statedBalanceMinor / 100).toFixed(2)}`
                  : ""}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                className="text-right"
                onClick={() => {
                  const stated = prompt(
                    "Saldo informado para conciliação",
                    String((account.balanceMinor / 100).toFixed(2)),
                  );
                  if (stated) {
                    void service
                      .reconcileAccount(account.id, Math.round(Number(stated.replace(",", ".")) * 100))
                      .then(bump);
                  }
                }}
              >
                <MoneyText amountMinor={account.balanceMinor} className="text-lg font-semibold" />
                {account.statedBalanceMinor != null && account.statedBalanceMinor !== account.balanceMinor ? (
                  <p className="text-xs text-danger">Divergência</p>
                ) : (
                  <p className="text-xs text-muted">Calculado</p>
                )}
              </button>
              <Button size="sm" variant="secondary" onClick={() => openEdit(account)}>
                Editar
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-danger"
                disabled={remove.isPending}
                onClick={() => {
                  if (!confirm(`Apagar a conta "${account.name}"?`)) return;
                  remove.mutate(account.id);
                }}
              >
                Apagar
              </Button>
            </div>
          </Card>
        ))
      )}
      <h2 className="text-sm font-medium">Categorias</h2>
      {categories.data?.map((category) => (
        <div key={category.id} className="flex items-center justify-between text-sm">
          <span className={category.active ? "" : "text-muted line-through"}>
            {category.parentId ? "—" : ""} {category.name}
          </span>
          <Button size="sm" variant="ghost" onClick={() => toggleCat.mutate({ id: category.id, active: !category.active })}>
            {category.active ? "Desativar" : "Ativar"}
          </Button>
        </div>
      ))}
      <Button variant="secondary" onClick={() => addCat.mutate()}>
        Nova subcategoria
      </Button>
      <Sheet
        open={sheetOpen}
        onOpenChange={(open) => {
          setSheetOpen(open);
          if (!open) setEditingId(null);
        }}
        title={editingId ? "Editar conta" : "Nova conta"}
      >
        <Label>Nome</Label>
        <Input className="mb-3" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <Label>Tipo</Label>
        <select
          className="mb-3 h-12 w-full rounded-2xl border border-border bg-card px-3"
          value={form.type}
          onChange={(e) => setForm({ ...form, type: e.target.value })}
        >
          {ACCOUNT_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
        {!editingId ? (
          <>
            <Label>Saldo inicial</Label>
            <Input
              className="mb-3"
              inputMode="decimal"
              value={form.initial}
              onChange={(e) => setForm({ ...form, initial: e.target.value })}
            />
          </>
        ) : null}
        <Label>Instituição</Label>
        <Input
          className="mb-3"
          placeholder="Nubank, Itaú…"
          value={form.institution}
          onChange={(e) => setForm({ ...form, institution: e.target.value })}
        />
        <Label>Observações</Label>
        <Input
          className="mb-4"
          placeholder="Opcional"
          value={form.notes}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
        />
        <Button className="mb-4 w-full" onClick={() => save.mutate()} disabled={!form.name.trim() || save.isPending}>
          {save.isPending ? "Salvando…" : "Salvar"}
        </Button>
      </Sheet>
    </div>
  );
}
