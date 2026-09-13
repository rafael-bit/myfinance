import { useQuery, useMutation } from "@tanstack/react-query";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { Link } from "@tanstack/react-router";
import { useFinance, useFinanceOptional } from "@/app/providers";
import { Section } from "@/ui/card";
import { Amount } from "@/ui/amount";
import { EmptyState, Skeleton } from "@/ui/empty-state";
import { Button } from "@/ui/button";
import { useState } from "react";
import { cn } from "@/lib/utils";

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Bom dia";
  if (hour < 18) return "Boa tarde";
  return "Boa noite";
}

const WIDGET_LABEL: Record<string, string> = {
  networth: "Patrimônio",
  cashflow: "Fluxo",
  budget: "Orçamento",
  goals: "Metas",
  alerts: "Alertas",
  investments: "Investimentos",
};

const TYPE_LABEL: Record<string, string> = {
  expense: "Despesa",
  income: "Receita",
  transfer: "Transferência",
  card_payment: "Fatura",
  investment: "Investimento",
  opening_balance: "Saldo inicial",
};

export function DashboardPage() {
  const service = useFinance();
  const { bump, sessionEpoch, isUnlocked } = useFinanceOptional();
  const [customize, setCustomize] = useState(false);

  const dash = useQuery({
    queryKey: ["dashboard", sessionEpoch],
    queryFn: () => service.dashboard(),
    enabled: isUnlocked,
  });
  const goals = useQuery({
    queryKey: ["goals", sessionEpoch],
    queryFn: () => service.listGoals(),
    enabled: isUnlocked,
  });
  const settings = useQuery({
    queryKey: ["settings", sessionEpoch],
    queryFn: () => service.getSettings(),
    enabled: isUnlocked,
  });
  const budgets = useQuery({
    queryKey: ["budgets", dash.data?.month],
    queryFn: () => service.listBudgets(dash.data?.month ?? ""),
    enabled: Boolean(dash.data?.month),
  });
  const recent = useQuery({
    queryKey: ["txns", "recent", sessionEpoch],
    queryFn: () => service.listTransactions({ limit: 8 }),
    enabled: isUnlocked,
  });

  const mutation = useMutation({
    mutationFn: (widgets: string[]) => service.saveWidgets(widgets),
    onSuccess: bump,
  });

  if (!isUnlocked || dash.isLoading) return <Skeleton className="h-64" />;
  if (dash.error) {
    const message = dash.error instanceof Error ? dash.error.message : "Erro desconhecido";
    return (
      <div className="space-y-4 motion-fade-in">
        <p className="text-danger">Não foi possível carregar o início.</p>
        <p className="text-sm text-muted">{message}</p>
        <Button variant="secondary" onClick={() => void dash.refetch()}>
          Tentar de novo
        </Button>
      </div>
    );
  }

  const data = dash.data!;
  const widgets = data.widgets;
  const firstName = settings.data?.displayName?.split(" ")[0];

  const toggle = (id: string) => {
    const next = widgets.includes(id) ? widgets.filter((w) => w !== id) : [...widgets, id];
    mutation.mutate(next);
  };

  return (
    <div className="mt-10 space-y-10 pb-8 motion-fade-in">
      <header className="lg:max-w-3xl">
        <p className="kicker">
          {greeting()}
          {firstName ? `, ${firstName}` : ""}
        </p>

        {widgets.includes("networth") ? (
          <>
            <div className="mt-4">
              <Amount amountMinor={data.netWorth.netMinor} size="hero" />
            </div>
            <p className="mt-3 text-sm text-muted">Patrimônio líquido</p>
            <div className="mt-6 flex flex-wrap gap-10 text-sm">
              <div>
                <p className="kicker">Bruto</p>
                <Amount amountMinor={data.netWorth.grossMinor} size="lg" className="mt-1 block" />
              </div>
              <div>
                <p className="kicker">Dívidas</p>
                <Amount amountMinor={data.netWorth.debtsMinor} size="lg" className="mt-1 block" />
              </div>
            </div>
          </>
        ) : null}
      </header>

      <div className="grid min-w-0 gap-10 lg:grid-cols-[minmax(0,1fr)_280px] lg:items-start">
        <div className="min-w-0 space-y-10">
          {data.snapshots.length > 1 && widgets.includes("networth") ? (
            <div className="h-36 border-t border-border pt-4 md:h-44">
              <p className="kicker mb-3">Evolução</p>
              <ResponsiveContainer width="100%" height="85%">
                <AreaChart data={data.snapshots.map((s) => ({ m: s.yearMonth, v: s.netMinor / 100 }))}>
                  <XAxis dataKey="m" hide />
                  <Tooltip formatter={(v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} />
                  <Area
                    type="monotone"
                    dataKey="v"
                    stroke="var(--color-signal)"
                    fill="color-mix(in oklab, var(--color-signal) 14%, transparent)"
                    strokeWidth={1.5}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : null}

          {widgets.includes("cashflow") ? (
            <div className="grid grid-cols-2 gap-4 border-t border-border pt-6 sm:gap-8">
              <div className="min-w-0">
                <p className="kicker">Receitas</p>
                <Amount amountMinor={data.incomeMinor} size="xl" signed className="mt-2 block text-in" />
              </div>
              <div className="min-w-0">
                <p className="kicker">Despesas</p>
                <Amount amountMinor={-Math.abs(data.expenseMinor)} size="xl" signed className="mt-2 block" />
              </div>
            </div>
          ) : null}

          <Section kicker="Movimentações" title="Recentes" action={
            <Link to="/activity" className="text-xs font-medium text-signal hover:underline">
              Ver todas
            </Link>
          }>
            {recent.isLoading ? (
              <Skeleton className="h-32" />
            ) : !recent.data?.length ? (
              <p className="text-sm text-muted">Nenhum lançamento ainda.</p>
            ) : (
              <ul className="min-w-0 divide-y divide-border overflow-hidden border-t border-border">
                {recent.data.map((txn) => (
                  <li key={txn.id} className="flex min-w-0 items-center justify-between gap-3 py-3.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{txn.description}</p>
                      <p className="mt-0.5 truncate text-xs text-muted">
                        {TYPE_LABEL[txn.type] ?? txn.type} · {txn.date}
                      </p>
                    </div>
                    <Amount
                      amountMinor={txn.type === "expense" ? -txn.amountMinor : txn.amountMinor}
                      signed={txn.type !== "transfer"}
                      size="sm"
                      className="shrink-0 text-base"
                      animate={false}
                    />
                  </li>
                ))}
              </ul>
            )}
          </Section>

          {widgets.includes("budget") && budgets.data?.items.length ? (
            <Section kicker="Sinal" title="Orçamento">
              {budgets.data.envelope && budgets.data.envelope.debtMinor > 0 ? (
                <p className="mb-3 text-xs text-muted">
                  Teto total reduzido · disponível{" "}
                  <Amount
                    amountMinor={budgets.data.envelope.availableTotalMinor}
                    size="sm"
                    className="inline text-xs"
                    animate={false}
                  />
                </p>
              ) : null}
              <ul className="divide-y divide-border border-t border-border">
                {budgets.data.items.slice(0, 4).map((b) => (
                  <li key={b.id} className="py-3.5">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{b.categoryName}</p>
                        <p className="text-xs text-muted">
                          {b.percent.toFixed(0)}% ·{" "}
                          {b.alert === "ok"
                            ? "dentro"
                            : b.alert === "near"
                              ? "quase no limite"
                              : b.alert === "over"
                                ? "estourou"
                                : "no teto"}
                        </p>
                      </div>
                      <Amount amountMinor={b.spentMinor} size="sm" className="text-base" animate={false} />
                    </div>
                    <div className="mt-2.5 h-1 overflow-hidden bg-foreground/[0.06]">
                      <div
                        className="h-full transition-[width] duration-[var(--dur-data)] ease-[var(--ease-out)]"
                        style={{
                          width: `${Math.min(100, b.percent)}%`,
                          background:
                            b.alert === "over" || b.alert === "reached"
                              ? "var(--color-danger)"
                              : "var(--color-signal)",
                        }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
              <Link to="/more" className="mt-3 inline-block text-xs font-medium text-signal hover:underline">
                Abrir análise do mês
              </Link>
            </Section>
          ) : null}

          {!data.incomeMinor && !data.expenseMinor ? (
            <EmptyState
              title="O início é um lançamento"
              description="Crie uma conta e use Adicionar para a primeira despesa ou receita."
            />
          ) : null}
        </div>

        <aside className="space-y-8 border-t border-border pt-6 lg:border-t-0 lg:border-l lg:pl-8 lg:pt-0">
          {widgets.includes("alerts") && data.alerts.length > 0 ? (
            <Section kicker="Atenção">
              <ul className="space-y-4">
                {data.alerts.map((alert) => (
                  <li key={alert.id} className="border-l-2 border-signal pl-3">
                    <p className="text-sm font-medium">{alert.title}</p>
                    <p className="mt-1 text-sm leading-6 text-muted">{alert.body}</p>
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}

          {widgets.includes("goals") ? (
            <Section kicker="Metas">
              {goals.data?.length ? (
                <ul className="space-y-5">
                  {goals.data.slice(0, 3).map((goal) => (
                    <li key={goal.id}>
                      <div className="flex justify-between text-sm">
                        <span className="font-medium">{goal.name}</span>
                        <span className="tabular text-muted">{goal.progress.toFixed(0)}%</span>
                      </div>
                      <div className="mt-2 h-1 bg-foreground/[0.06]">
                        <div
                          className="h-full bg-signal transition-[width] duration-[var(--dur-data)] ease-[var(--ease-out)]"
                          style={{ width: `${Math.min(100, goal.progress)}%` }}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState title="Ainda sem metas" description="Uma reserva de emergência é um bom primeiro objetivo." />
              )}
            </Section>
          ) : null}

          {widgets.includes("investments") ? (
            <Section kicker="Carteira">
              <Link to="/investments" className="text-sm font-medium text-signal hover:underline">
                Ver investimentos
              </Link>
            </Section>
          ) : null}
        </aside>
      </div>

      <button
        type="button"
        className={cn("text-xs tracking-wide text-muted hover:text-foreground")}
        onClick={() => setCustomize((v) => !v)}
      >
        {customize ? "Fechar ajuste" : "Ajustar o início"}
      </button>
      {customize ? (
        <div className="flex flex-wrap gap-2">
          {Object.entries(WIDGET_LABEL).map(([id, label]) => (
            <Button key={id} size="sm" variant={widgets.includes(id) ? "default" : "secondary"} onClick={() => toggle(id)}>
              {label}
            </Button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
