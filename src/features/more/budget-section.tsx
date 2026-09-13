import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { useFinance, useFinanceOptional } from "@/app/providers";
import { Button } from "@/ui/button";
import { Card } from "@/ui/card";
import { Input } from "@/ui/input";
import { Label } from "@/ui/label";
import { MoneyText } from "@/ui/money-text";
import { Amount } from "@/ui/amount";
import { EmptyState } from "@/ui/empty-state";
import { Sheet } from "@/ui/sheet";
import { ConfirmDialog } from "@/ui/dialog";
import { addMonthsIso, monthKey, todayIsoDate } from "@/shared/dates";
import { STANDING_BUDGET_MONTH } from "@/shared/constants";
import type { BudgetAlert } from "@/domain/budget";
import { cn } from "@/lib/utils";

const MONTH_LABEL = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" });

function formatMonthTitle(yearMonth: string) {
  const label = MONTH_LABEL.format(new Date(`${yearMonth}-01T12:00:00`));
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function previousMonthKey() {
  return monthKey(addMonthsIso(todayIsoDate(), -1));
}

function alertLabel(alert: BudgetAlert) {
  if (alert === "over") return "Estourou a meta";
  if (alert === "reached") return "No teto da meta";
  if (alert === "near") return "Ficou perto do limite";
  return "Dentro da meta";
}

function alertTone(alert: BudgetAlert | null | undefined) {
  if (alert === "over" || alert === "reached") return "text-danger";
  if (alert === "near") return "text-warn";
  return "text-muted";
}

function barFill(alert: BudgetAlert | null | undefined, color: string | null) {
  if (alert === "over" || alert === "reached") return "var(--color-danger)";
  if (alert === "near") return "var(--color-warn)";
  return color || "var(--color-signal)";
}

export function BudgetSection() {
  const service = useFinance();
  const { bump } = useFinanceOptional();
  const [yearMonth, setYearMonth] = useState(previousMonthKey);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [categoryId, setCategoryId] = useState("");
  const [limit, setLimit] = useState("");
  const [editingBudgetId, setEditingBudgetId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const currentMonth = monthKey(todayIsoDate());
  const isClosedMonth = yearMonth < currentMonth;

  const spend = useQuery({
    queryKey: ["spend-by-category", yearMonth],
    queryFn: () => service.spendingByCategory(yearMonth),
  });
  const budgets = useQuery({
    queryKey: ["budgets", "standing", yearMonth],
    queryFn: () => service.listBudgets(yearMonth),
  });
  const cats = useQuery({ queryKey: ["categories"], queryFn: () => service.listCategories() });

  const expenseCats = useMemo(
    () => cats.data?.filter((c) => c.kind === "expense" && c.active) ?? [],
    [cats.data],
  );

  const budgetItems = budgets.data?.items ?? [];
  const envelope = budgets.data?.envelope ?? null;
  const budgetedIds = useMemo(() => new Set(budgetItems.map((b) => b.categoryId)), [budgetItems]);
  const maxSpent = Math.max(1, ...(spend.data?.categories.map((c) => c.spentMinor) ?? [1]));
  const top = spend.data?.categories[0];
  const standingTotal = envelope?.standingTotalMinor ?? budgetItems.reduce((a, b) => a + b.limitMinor, 0);
  const availableTotal = envelope?.availableTotalMinor ?? standingTotal;
  const debtTotal = envelope?.debtMinor ?? 0;
  const spentTotal = envelope?.spentTotalMinor ?? spend.data?.totalSpentMinor ?? 0;
  const overCount = budgetItems.filter((b) => b.alert === "over" || b.alert === "reached").length;
  const underCount = budgetItems.filter((b) => b.alert === "ok" && b.percent < 80).length;

  const shiftMonth = (delta: number) => {
    setYearMonth(monthKey(addMonthsIso(`${yearMonth}-01`, delta)));
  };

  const openCreate = (prefillCategoryId?: string) => {
    setEditingBudgetId(null);
    setCategoryId(prefillCategoryId ?? expenseCats.find((c) => !budgetedIds.has(c.id))?.id ?? expenseCats[0]?.id ?? "");
    const spent = spend.data?.categories.find((c) => c.categoryId === prefillCategoryId)?.spentMinor;
    setLimit(spent != null ? (spent / 100).toFixed(2).replace(".", ",") : "");
    setSheetOpen(true);
  };

  const openEdit = (budget: { id: string; categoryId: string; standingLimitMinor: number; limitMinor: number }) => {
    setEditingBudgetId(budget.id);
    setCategoryId(budget.categoryId);
    setLimit((budget.standingLimitMinor / 100).toFixed(2).replace(".", ","));
    setSheetOpen(true);
  };

  const save = useMutation({
    mutationFn: async () => {
      if (!categoryId) throw new Error("Escolha uma categoria");
      if (!limit.trim()) throw new Error("Informe o limite");
      await service.upsertBudget(categoryId, STANDING_BUDGET_MONTH, limit, "BRL");
    },
    onSuccess: () => {
      toast.success("Meta fixa atualizada — vale para todos os meses");
      bump();
      setSheetOpen(false);
    },
    onError: (err) => toast.error(err.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => service.deleteBudget(id),
    onSuccess: () => {
      toast.success("Meta removida");
      bump();
      setSheetOpen(false);
      setDeleteId(null);
    },
    onError: (err) => toast.error(err.message),
  });

  const insight = (() => {
    if (!spend.data?.totalSpentMinor) {
      return "Importe o extrato deste mês para comparar com suas metas fixas.";
    }
    if (envelope?.alert === "over") {
      return "O total de gastos passou do disponível deste mês — o excesso desconta do teto total no mês seguinte (as metas por categoria continuam iguais).";
    }
    if (debtTotal > 0) {
      return `Teto total reduzido em ${(debtTotal / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} por estouro anterior. Metas por categoria seguem fixas.`;
    }
    if (top) {
      const tip =
        top.share >= 40
          ? `${top.name} concentrou ${top.share.toFixed(0)}% — se for recorrente, ajuste a meta fixa ou o hábito.`
          : `Maior fatia: ${top.name} (${top.share.toFixed(0)}%).`;
      if (overCount > 0) return `${tip} ${overCount} categoria(s) passaram da meta (orientação); o desconto no mês seguinte vale só no total.`;
      if (underCount > 0 && budgetItems.length) {
        return `${tip} ${underCount} categoria(s) ficaram abaixo da meta.`;
      }
      return tip;
    }
    return "Metas por categoria são fixas. Se o total de gastos estourar o teto, o excesso desconta do disponível total no mês seguinte.";
  })();

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="kicker">Análise mensal · metas fixas</p>
          <h2 className="mt-1 text-3xl font-medium leading-none tracking-tight md:text-4xl">Orçamento</h2>
        </div>
        <div className="flex items-center gap-1 border border-border p-1">
          <Button size="sm" variant="ghost" className="min-h-9 px-3" onClick={() => shiftMonth(-1)} aria-label="Mês anterior">
            ←
          </Button>
          <span className="min-w-34 text-center text-sm font-medium">{formatMonthTitle(yearMonth)}</span>
          <Button size="sm" variant="ghost" className="min-h-9 px-3" onClick={() => shiftMonth(1)} aria-label="Próximo mês">
            →
          </Button>
        </div>
      </div>

      <div className="space-y-5 border-t border-border pt-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="kicker">
              {isClosedMonth ? "Análise · gasto no mês fechado" : "Análise · gasto deste mês"}
            </p>
            <p className="mt-2">
              <Amount amountMinor={spend.data?.totalSpentMinor ?? 0} size="hero" className="text-4xl md:text-5xl" />
            </p>
          </div>
          <div className="max-w-xs text-right text-sm">
            <p className="kicker">Metas</p>
            <p className="mt-1 font-medium">Fixas · teto total arrasta</p>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              Meta por categoria não muda. Se o total de gastos passar do teto, o excesso reduz o disponível total no mês
              seguinte.
            </p>
          </div>
        </div>

        {availableTotal > 0 ? (
          <div>
            <div className="mb-2 flex justify-between text-xs text-muted">
              <span>
                Total de gastos vs teto
                {debtTotal > 0 ? " · com desconto de estouro anterior" : ""}
              </span>
              <span className="tabular">
                <MoneyText amountMinor={spentTotal} className="text-sm" />
                <span className="text-muted"> / </span>
                <MoneyText amountMinor={availableTotal} className="text-sm text-muted" />
              </span>
            </div>
            <div className="h-1.5 overflow-hidden bg-foreground/[0.06]">
              <div
                className="h-full transition-[width] duration-[var(--dur-data)] ease-[var(--ease-out)]"
                style={{
                  width: `${Math.min(100, (spentTotal / Math.max(1, availableTotal)) * 100)}%`,
                  background: spentTotal > availableTotal ? "var(--color-danger)" : "var(--color-signal)",
                }}
              />
            </div>
            {debtTotal > 0 ? (
              <p className="mt-1.5 text-xs text-muted">
                Metas somam <MoneyText amountMinor={standingTotal} className="text-xs text-muted" /> · disponível este mês{" "}
                <MoneyText amountMinor={availableTotal} className="text-xs text-muted" /> (−
                <MoneyText amountMinor={debtTotal} className="text-xs text-muted" />)
              </p>
            ) : null}
          </div>
        ) : null}

        <p className="max-w-xl text-sm leading-relaxed text-muted">{insight}</p>
      </div>

      <section className="space-y-3">
        <div>
          <p className="kicker">Análise</p>
          <h3 className="mt-1 text-2xl font-medium leading-none tracking-tight">Onde foi o dinheiro</h3>
        </div>

        {!spend.data?.categories.length ? (
          <EmptyState
            title="Sem lançamentos neste mês"
            description="Importe o extrato do mês para ver o ranking e comparar com as metas fixas."
          />
        ) : (
          <ul className="divide-y divide-border border-t border-border">
            {spend.data.categories.map((row, index) => {
              const width = Math.max(6, (row.spentMinor / maxSpent) * 100);
              return (
                <li key={row.categoryId ?? `uncat-${index}`} className="py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{ background: row.color || "var(--color-signal)" }}
                        />
                        <span className="text-xs tabular text-muted">{String(index + 1).padStart(2, "0")}</span>
                        <p className="truncate font-medium">{row.name}</p>
                      </div>
                      <p className="mt-0.5 text-xs text-muted">
                        {row.share.toFixed(0)}% do total
                        {row.alert ? ` · ${alertLabel(row.alert)}` : ""}
                      </p>
                    </div>
                    <MoneyText amountMinor={row.spentMinor} className="shrink-0 text-xl" />
                  </div>
                  <div className="mt-2.5 h-1 overflow-hidden bg-foreground/[0.06]">
                    <div
                      className="h-full transition-[width] duration-[var(--dur-data)] ease-[var(--ease-out)]"
                      style={{ width: `${width}%`, background: barFill(row.alert, row.color) }}
                    />
                  </div>
                  {row.categoryId && !budgetedIds.has(row.categoryId) ? (
                    <button
                      type="button"
                      className="mt-2 text-xs text-signal underline-offset-2 hover:underline"
                      onClick={() => openCreate(row.categoryId!)}
                    >
                      Definir meta fixa (sugere o valor gasto)
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="kicker">Planejamento</p>
            <h3 className="mt-1 text-2xl font-medium leading-none tracking-tight">Metas fixas por categoria</h3>
          </div>
          <Button size="sm" onClick={() => openCreate(top?.categoryId ?? undefined)}>
            Nova meta
          </Button>
        </div>

        {!budgetItems.length ? (
          <div className="border-t border-border py-6">
            <p className="text-xl font-medium tracking-tight">Defina tetos que acompanham sua vida</p>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-muted">
              Mercado, moradia, lazer — metas fixas por categoria. O estouro do total de gastos desconta do teto no mês
              seguinte.
            </p>
            <Button className="mt-4" variant="secondary" onClick={() => openCreate(top?.categoryId ?? undefined)}>
              {top?.categoryId ? `Meta para ${top.name}` : "Definir primeira meta"}
            </Button>
          </div>
        ) : (
          <ul className="divide-y divide-border border-t border-border">
            {budgetItems
              .slice()
              .sort((a, b) => b.percent - a.percent)
              .map((b) => (
                <li key={b.id} className="py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ background: b.categoryColor || "var(--color-signal)" }}
                        />
                        <p className="truncate font-medium">{b.categoryName}</p>
                      </div>
                      <p className={cn("mt-1 text-xs", alertTone(b.alert))}>
                        Em {formatMonthTitle(yearMonth)}: {alertLabel(b.alert)} · {b.percent.toFixed(0)}%
                      </p>
                    </div>
                    <button type="button" className="text-right" onClick={() => openEdit(b)}>
                      <MoneyText amountMinor={b.spentMinor} className="block text-lg" />
                      <span className="text-xs text-muted">
                        meta <MoneyText amountMinor={b.limitMinor} className="text-xs text-muted" />
                      </span>
                    </button>
                  </div>
                  <div className="mt-2.5 h-1.5 overflow-hidden bg-foreground/[0.06]">
                    <div
                      className="h-full transition-[width] duration-[var(--dur-data)] ease-[var(--ease-out)]"
                      style={{
                        width: `${Math.min(100, b.percent)}%`,
                        background: barFill(b.alert, b.categoryColor),
                      }}
                    />
                  </div>
                  <div className="mt-2 flex justify-between text-xs text-muted">
                    <span>
                      {b.remainingMinor >= 0 ? "Sobrou" : "Passou"}{" "}
                      <MoneyText amountMinor={Math.abs(b.remainingMinor)} className="text-xs" />
                    </span>
                    <div className="flex gap-3">
                      <button type="button" className="text-signal hover:underline" onClick={() => openEdit(b)}>
                        Ajustar
                      </button>
                      <button type="button" className="hover:underline" onClick={() => setDeleteId(b.id)}>
                        Remover
                      </button>
                    </div>
                  </div>
                </li>
              ))}
          </ul>
        )}
      </section>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen} title={editingBudgetId ? "Ajustar meta fixa" : "Nova meta fixa"}>
        <div className="space-y-3 pb-4">
          <p className="text-sm leading-relaxed text-muted">
            Meta fixa por categoria para <strong>todos os meses</strong>. O que desconta no mês seguinte é o{" "}
            <strong>total de gastos</strong> acima do teto (soma das metas), não a meta desta categoria.
          </p>
          <Label>Categoria</Label>
          <select
            className="select-field"
            value={categoryId}
            disabled={Boolean(editingBudgetId)}
            onChange={(e) => setCategoryId(e.target.value)}
          >
            {expenseCats.map((c) => (
              <option key={c.id} value={c.id}>
                {c.parentId ? "— " : ""}
                {c.name}
              </option>
            ))}
          </select>
          <Label htmlFor="budget-limit">Limite mensal (R$)</Label>
          <Input
            id="budget-limit"
            inputMode="decimal"
            placeholder="800,00"
            value={limit}
            onChange={(e) => setLimit(e.target.value)}
            className="amount text-3xl"
          />
          <div className="flex gap-2 pt-2">
            <Button className="flex-1" disabled={save.isPending} onClick={() => save.mutate()}>
              Salvar
            </Button>
            {editingBudgetId ? (
              <Button variant="secondary" onClick={() => setDeleteId(editingBudgetId)}>
                Remover
              </Button>
            ) : null}
          </div>
        </div>
      </Sheet>

      <ConfirmDialog
        open={Boolean(deleteId)}
        onOpenChange={(open) => !open && setDeleteId(null)}
        title="Remover meta fixa?"
        description="Ela deixa de valer para todos os meses. Você pode criar de novo depois."
        confirmLabel="Remover"
        danger
        onConfirm={() => {
          if (deleteId) remove.mutate(deleteId);
        }}
      />
    </div>
  );
}
