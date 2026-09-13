import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { useFinance, useFinanceOptional } from "@/app/providers";
import { Button } from "@/ui/button";
import { Card } from "@/ui/card";
import { Input } from "@/ui/input";
import { Label } from "@/ui/label";
import { MoneyText } from "@/ui/money-text";
import { PageTitle } from "@/ui/page-title";
import { Sheet } from "@/ui/sheet";
import { todayIsoDate } from "@/shared/dates";
import { useGuide } from "@/features/onboarding/tour";
import { BudgetSection } from "@/features/more/budget-section";
import { ConfirmDialog } from "@/ui/dialog";
import { Amount } from "@/ui/amount";

const SECTIONS = [
  ["plan", "Orçamento"],
  ["goals", "Metas"],
  ["wealth", "Patrimônio"],
  ["profile", "Perfil"],
  ["data", "Dados"],
  ["system", "Sistema"],
] as const;

export function MorePage() {
  const service = useFinance();
  const { bump } = useFinanceOptional();
  const { theme, setTheme } = useTheme();
  const [section, setSection] = useState<(typeof SECTIONS)[number][0]>("plan");
  const goals = useQuery({ queryKey: ["goals"], queryFn: () => service.listGoals() });
  const nw = useQuery({ queryKey: ["nw"], queryFn: () => service.listNetWorthItems() });
  const profile = useQuery({ queryKey: ["profile"], queryFn: () => service.latestProfile() });
  const questions = service.questions();
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [aiQ, setAiQ] = useState("Como está minha carteira?");
  const [aiA, setAiA] = useState("");
  const drafts = useQuery({ queryKey: ["ext"], queryFn: () => service.listExternalDrafts() });
  const conflicts = useQuery({ queryKey: ["conflicts"], queryFn: () => service.listConflicts() });
  const sync = useQuery({ queryKey: ["sync"], queryFn: () => service.getSyncState() });
  const notifs = useQuery({ queryKey: ["notifs"], queryFn: () => service.refreshNotifications() });
  const settings = useQuery({ queryKey: ["settings"], queryFn: () => service.getSettings() });

  const [goalSheet, setGoalSheet] = useState(false);
  const [goalForm, setGoalForm] = useState({ name: "Reserva de emergência", target: "10000", date: "2027-12-31" });
  const [contributeGoal, setContributeGoal] = useState<{ id: string; name: string; suggested: string } | null>(null);
  const [contributeAmount, setContributeAmount] = useState("");
  const [deleteGoalId, setDeleteGoalId] = useState<{ id: string; name: string } | null>(null);

  const { start } = useGuide();
  const contribute = useMutation({
    mutationFn: ({ id, amount }: { id: string; amount: string }) => service.contributeGoal(id, amount, "BRL"),
    onSuccess: () => {
      toast.success("Aporte registrado");
      bump();
      setContributeGoal(null);
      setContributeAmount("");
    },
    onError: (e) => toast.error(e.message),
  });

  const removeGoal = useMutation({
    mutationFn: (id: string) => service.deleteGoal(id),
    onSuccess: () => {
      toast.success("Meta apagada");
      bump();
      setDeleteGoalId(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const createGoal = useMutation({
    mutationFn: () =>
      service.createGoal({
        name: goalForm.name,
        kind: "emergency",
        targetMajor: goalForm.target,
        currency: "BRL",
        targetDate: goalForm.date,
      }),
    onSuccess: () => {
      toast.success("Meta criada");
      bump();
      setGoalSheet(false);
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="space-y-6 pb-10">
      <PageTitle kicker="Espaço pessoal">Mais</PageTitle>

      <div className="flex flex-col gap-6 md:flex-row md:items-start md:gap-10">
        <nav className="flex gap-2 overflow-x-auto pb-1 md:w-44 md:shrink-0 md:flex-col md:overflow-visible md:pb-0">
          {SECTIONS.map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setSection(id)}
                  className={`relative min-h-11 shrink-0 rounded-[var(--radius-control)] px-4 text-left text-sm transition-colors md:w-full ${
                section === id
                  ? "pl-4 font-medium text-foreground"
                  : "text-muted hover:text-foreground"
              }`}
            >
              {section === id ? <span className="absolute left-0 top-2.5 bottom-2.5 w-0.5 bg-signal" aria-hidden /> : null}
              {label}
            </button>
          ))}
        </nav>

        <div className="min-w-0 flex-1">
          {section === "plan" ? <BudgetSection /> : null}

          {section === "goals" ? (
            <div className="space-y-5">
              <div className="flex items-end justify-between gap-3">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.2em] text-muted">Longo prazo</p>
                  <h2 className="font-display mt-1 text-3xl leading-none">Metas</h2>
                </div>
                <Button size="sm" onClick={() => setGoalSheet(true)}>
                  Nova meta
                </Button>
              </div>

              {!goals.data?.length ? (
                <Card className="p-5">
                  <p className="font-display text-2xl leading-snug">Um alvo concreto muda o mês</p>
                  <p className="mt-2 text-sm leading-relaxed text-muted">
                    Emergência, viagem ou quitação — defina o valor e o prazo; o app sugere o aporte mensal.
                  </p>
                  <Button className="mt-4" variant="secondary" onClick={() => setGoalSheet(true)}>
                    Criar primeira meta
                  </Button>
                </Card>
              ) : (
                <ul className="space-y-3">
                  {goals.data.map((goal) => (
                    <li key={goal.id}>
                      <Card className="p-5">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-medium">{goal.name}</p>
                            <p className="mt-1 text-xs text-muted">
                              {goal.progress.toFixed(0)}% · aporte sugerido{" "}
                              <MoneyText amountMinor={goal.recommendedMinor} className="text-xs" />
                            </p>
                          </div>
                          <Amount amountMinor={goal.currentMinor} size="lg" animate={false} />
                        </div>
                        <div className="mt-3 h-1 overflow-hidden bg-foreground/[0.06]">
                          <div
                            className="h-full bg-signal transition-[width] duration-[var(--dur-data)] ease-[var(--ease-out)]"
                            style={{ width: `${Math.min(100, goal.progress)}%` }}
                          />
                        </div>
                        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
                          <span>
                            Meta <MoneyText amountMinor={goal.targetMinor} className="text-xs text-muted" />
                          </span>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => {
                                const suggested =
                                  goal.recommendedMinor > 0
                                    ? (goal.recommendedMinor / 100).toFixed(2).replace(".", ",")
                                    : "";
                                setContributeGoal({ id: goal.id, name: goal.name, suggested });
                                setContributeAmount(suggested);
                              }}
                            >
                              Aportar
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setDeleteGoalId({ id: goal.id, name: goal.name })}
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

              <Button
                variant="ghost"
                className="w-full"
                onClick={() =>
                  void service
                    .createRecurrence({
                      freq: "monthly",
                      interval: 1,
                      startDate: todayIsoDate(),
                      byMonthDay: Number(todayIsoDate().slice(8, 10)),
                      template: {
                        type: "expense",
                        amountMajor: "100",
                        currency: "BRL",
                        accountId: "",
                        description: "Recorrente",
                      },
                    })
                    .then(() => toast.message("Recorrência criada — ajuste a conta depois."))
                }
              >
                Nova recorrência mensal
              </Button>
            </div>
          ) : null}

          {section === "wealth" && (
            <div className="space-y-4">
              <div>
                <p className="text-[11px] uppercase tracking-[0.2em] text-muted">Balanço</p>
                <h2 className="font-display mt-1 text-3xl leading-none">Patrimônio</h2>
              </div>
              {nw.data?.properties.map((p) => (
                <Card key={p.id} className="flex justify-between gap-3 p-4">
                  <span className="font-medium">{p.name}</span>
                  <MoneyText amountMinor={p.currentValueMinor} className="text-xl" />
                </Card>
              ))}
              {nw.data?.liabilities.map((l) => (
                <Card key={l.id} className="flex justify-between gap-3 p-4">
                  <span className="font-medium">{l.name}</span>
                  <MoneyText amountMinor={l.principalMinor} signed className="text-xl" />
                </Card>
              ))}
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  onClick={() => {
                    const name = prompt("Bem", "Apartamento");
                    const value = prompt("Valor", "400000");
                    if (name && value) void service.createProperty({ kind: "real_estate", name, valueMajor: value, currency: "BRL" }).then(bump);
                  }}
                >
                  Adicionar bem
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => {
                    const name = prompt("Dívida", "Financiamento");
                    const value = prompt("Saldo", "200000");
                    if (name && value) {
                      void service.createLiability({ kind: "financing", name, principalMajor: value, currency: "BRL" }).then(bump);
                    }
                  }}
                >
                  Adicionar dívida
                </Button>
              </div>
            </div>
          )}

          {section === "profile" && (
            <div className="space-y-4">
              <div>
                <p className="text-[11px] uppercase tracking-[0.2em] text-muted">Investidor</p>
                <h2 className="font-display mt-1 text-3xl leading-none">Perfil</h2>
              </div>
              {profile.data ? (
                <Card className="p-5">
                  <p className="font-display text-2xl capitalize">{profile.data.band.replaceAll("_", " ")}</p>
                  <p className="mt-1 text-sm text-muted">Score {profile.data.score}</p>
                  <p className="mt-3 text-sm leading-6 text-muted">{profile.data.justification}</p>
                </Card>
              ) : (
                <p className="text-sm text-muted">O perfil só nasce do questionário. Não há escolha manual.</p>
              )}
              {questions.map((q) => (
                <div key={q.id}>
                  <p className="mb-2 text-sm">{q.text}</p>
                  <select
                    className="select-field"
                    value={answers[q.id] ?? ""}
                    onChange={(e) => setAnswers({ ...answers, [q.id]: Number(e.target.value) })}
                  >
                    <option value="">Selecione</option>
                    {q.options.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
              <Button
                onClick={() => {
                  const payload = questions.map((q) => ({ questionId: q.id, value: answers[q.id] }));
                  if (payload.some((a) => a.value == null)) {
                    toast.error("Responda todas as perguntas");
                    return;
                  }
                  void service.submitQuestionnaire(payload).then(() => {
                    toast.success("Perfil calculado");
                    bump();
                  });
                }}
              >
                Calcular perfil
              </Button>
              <div>
                <Label>Pergunte (IA opcional)</Label>
                <Input value={aiQ} onChange={(e) => setAiQ(e.target.value)} />
                <Button className="mt-2" variant="secondary" onClick={() => void service.explain(aiQ).then((r) => setAiA(`${r.source}: ${r.text}`))}>
                  Explicar
                </Button>
                {aiA ? <p className="mt-2 text-sm leading-6 text-muted">{aiA}</p> : null}
              </div>
            </div>
          )}

          {section === "data" && (
            <div className="space-y-4">
              <div>
                <p className="text-[11px] uppercase tracking-[0.2em] text-muted">Arquivos</p>
                <h2 className="font-display mt-1 text-3xl leading-none">Dados</h2>
              </div>
              <Card className="space-y-3 p-5">
                <Button
                  onClick={async () => {
                    const blob = new Blob([await service.exportBackup()], { type: "application/json" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `meu-financeiro-backup.json`;
                    a.click();
                  }}
                >
                  Exportar backup (JSON)
                </Button>
                <p className="text-sm text-muted">Os dados principais ficam no Supabase. O backup local é só uma cópia de leitura.</p>
                <Label>Importar backup antigo</Label>
                <Input
                  type="file"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    try {
                      await service.importBackup(await file.text());
                      toast.success("Backup processado");
                      bump();
                    } catch (err) {
                      toast.error(err instanceof Error ? err.message : "Falha no import");
                    }
                  }}
                />
              </Card>
              <Button asChild>
                <Link to="/import">Importar extrato (CSV, PDF ou OFX)</Link>
              </Button>
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" onClick={async () => download("fluxo.csv", await service.exportReport("cashflow"))}>
                  CSV fluxo
                </Button>
                <Button variant="secondary" onClick={async () => download("patrimonio.csv", await service.exportReport("networth"))}>
                  CSV patrimônio
                </Button>
                <Button variant="secondary" onClick={async () => download("carteira.csv", await service.exportReport("investments"))}>
                  CSV carteira
                </Button>
                <Button variant="secondary" onClick={() => window.print()}>
                  PDF (imprimir)
                </Button>
              </div>
              <Button variant="ghost" onClick={() => void service.refreshMarket().then(() => toast.success("Cotações atualizadas (ou cache)"))}>
                Atualizar mercado
              </Button>
            </div>
          )}

          {section === "system" && (
            <div className="space-y-4">
              <div>
                <p className="text-[11px] uppercase tracking-[0.2em] text-muted">Preferências</p>
                <h2 className="font-display mt-1 text-3xl leading-none">Sistema</h2>
              </div>
              <Button variant="secondary" onClick={start}>
                Rever o guia
              </Button>
              <div className="flex gap-2">
                {([["light", "Claro"], ["dark", "Escuro"], ["system", "Sistema"]] as const).map(([t, label]) => (
                  <Button
                    key={t}
                    size="sm"
                    variant={theme === t ? "default" : "secondary"}
                    onClick={() => {
                      setTheme(t);
                      void service.saveSettings({ theme: t });
                    }}
                  >
                    {label}
                  </Button>
                ))}
              </div>
              <p className="text-sm text-muted">Pendentes de sync: {sync.data?.pending ?? 0}</p>
              {conflicts.data?.map((c) => (
                <Card key={c.id} className="p-4">
                  <p className="text-sm">Conflito em {c.entity}</p>
                  <Button size="sm" className="mt-2" onClick={() => void service.resolveConflict(c.id, "local").then(bump)}>
                    Manter local
                  </Button>
                </Card>
              ))}
              <h3 className="font-display text-xl">Notificações</h3>
              {notifs.data?.slice(0, 5).map((n) => (
                <p key={n.id} className="text-sm text-muted">
                  {n.title}: {n.body}
                </p>
              ))}
              <Button variant="secondary" onClick={() => void service.connectExternal().then(() => toast.success("Conexão Open Finance (rascunho) criada"))}>
                Conectar instituição (stub)
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  void service
                    .importExternalDrafts([{ externalId: "pix-1", date: todayIsoDate(), description: "Pix recebido", amountMinor: 15000 }])
                    .then(bump);
                }}
              >
                Trazer rascunhos externos
              </Button>
              {drafts.data
                ?.filter((d) => !d.acceptedAt)
                .map((d) => (
                  <Card key={d.id} className="flex items-center justify-between gap-3 p-4">
                    <span className="text-sm">{d.description}</span>
                    <Button
                      size="sm"
                      onClick={async () => {
                        const accounts = await service.listAccounts();
                        const acc = accounts.find((a) => a.type !== "credit");
                        if (acc) await service.acceptExternal(d.id, acc.id, "BRL");
                        bump();
                      }}
                    >
                      Aceitar
                    </Button>
                  </Card>
                ))}
              <Label>Moeda principal</Label>
              <select
                className="select-field"
                defaultValue={settings.data?.currency}
                onChange={(e) => void service.saveSettings({ currency: e.target.value })}
              >
                <option>BRL</option>
                <option>USD</option>
                <option>EUR</option>
                <option>GBP</option>
              </select>
              <Button
                variant="danger"
                onClick={() => {
                  service.lock();
                  bump();
                  location.reload();
                }}
              >
                Sair
              </Button>
            </div>
          )}
        </div>
      </div>

      <Sheet open={goalSheet} onOpenChange={setGoalSheet} title="Nova meta">
        <div className="space-y-3 pb-4">
          <Label>Nome</Label>
          <Input value={goalForm.name} onChange={(e) => setGoalForm((f) => ({ ...f, name: e.target.value }))} />
          <Label>Valor alvo</Label>
          <Input
            inputMode="decimal"
            value={goalForm.target}
            onChange={(e) => setGoalForm((f) => ({ ...f, target: e.target.value }))}
            className="amount text-2xl"
          />
          <Label>Prazo</Label>
          <Input type="date" value={goalForm.date} onChange={(e) => setGoalForm((f) => ({ ...f, date: e.target.value }))} />
          <Button className="w-full" disabled={createGoal.isPending} onClick={() => createGoal.mutate()}>
            Criar meta
          </Button>
        </div>
      </Sheet>

      <Sheet
        open={Boolean(contributeGoal)}
        onOpenChange={(open) => {
          if (!open) {
            setContributeGoal(null);
            setContributeAmount("");
          }
        }}
        title="Aportar na meta"
      >
        {contributeGoal ? (
          <div className="space-y-3 pb-4">
            <p className="text-sm text-muted">{contributeGoal.name}</p>
            <Label htmlFor="contribute-amount">Valor (R$)</Label>
            <Input
              id="contribute-amount"
              inputMode="decimal"
              placeholder="0,00"
              value={contributeAmount}
              onChange={(e) => setContributeAmount(e.target.value)}
              className="amount text-3xl"
            />
            {contributeGoal.suggested ? (
              <button
                type="button"
                className="text-xs text-signal hover:underline"
                onClick={() => setContributeAmount(contributeGoal.suggested)}
              >
                Usar aporte sugerido ({contributeGoal.suggested})
              </button>
            ) : null}
            <Button
              className="w-full"
              disabled={contribute.isPending || !contributeAmount.trim()}
              onClick={() => contribute.mutate({ id: contributeGoal.id, amount: contributeAmount })}
            >
              Confirmar aporte
            </Button>
          </div>
        ) : null}
      </Sheet>

      <ConfirmDialog
        open={Boolean(deleteGoalId)}
        onOpenChange={(open) => !open && setDeleteGoalId(null)}
        title="Apagar meta?"
        description={
          deleteGoalId
            ? `A meta "${deleteGoalId.name}" será removida. Os aportes registrados deixam de aparecer no progresso.`
            : undefined
        }
        confirmLabel="Apagar"
        danger
        onConfirm={() => {
          if (deleteGoalId) removeGoal.mutate(deleteGoalId.id);
        }}
      />
    </div>
  );
}

function download(name: string, content: string) {
  const blob = new Blob([content], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
}
