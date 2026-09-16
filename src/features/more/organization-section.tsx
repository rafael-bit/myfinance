import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { useFinance, useFinanceOptional } from "@/app/providers";
import { Button } from "@/ui/button";
import { Input } from "@/ui/input";
import { Label } from "@/ui/label";
import { MoneyText } from "@/ui/money-text";
import { Amount } from "@/ui/amount";
import {
  GROUP_LABEL,
  REFERENCE_PERCENTS,
  type AllocationGroup,
  type OrganizationSlice,
} from "@/domain/organization";
import { cn } from "@/lib/utils";

const GROUP_ORDER: AllocationGroup[] = [
  "fixed",
  "comfort",
  "goals",
  "pleasure",
  "knowledge",
  "invest",
  "emergency",
];

const SHORT_LABEL: Record<AllocationGroup, string> = {
  fixed: "Fixos",
  comfort: "Conforto",
  goals: "Metas",
  pleasure: "Prazeres",
  knowledge: "Saber",
  invest: "Investir",
  emergency: "Reserva",
};

type Step = "income" | "review" | "done";

function VolumeFader({
  group,
  percent,
  amountMinor,
  referenceLabel,
  currentPercent,
  onChange,
}: {
  group: AllocationGroup;
  percent: number;
  amountMinor: number;
  referenceLabel: string;
  currentPercent: number | null;
  onChange: (percent: number) => void;
}) {
  const clamped = Math.min(100, Math.max(0, Math.round(percent)));
  return (
    <div className="flex w-16 shrink-0 flex-col items-center gap-2 sm:w-[4.5rem]">
      <div className="text-center">
        <p className="font-mono text-lg font-medium tabular-nums leading-none tracking-tight">{clamped}%</p>
        <p className="mt-1 text-[10px] text-muted">ref. {referenceLabel}</p>
      </div>

      <div className="relative flex h-44 w-10 items-center justify-center">
        <div className="pointer-events-none absolute inset-y-0 left-1/2 w-2 -translate-x-1/2 rounded-full bg-foreground/[0.08]" />
        <div
          className="pointer-events-none absolute bottom-0 left-1/2 w-2 -translate-x-1/2 rounded-full bg-signal transition-[height] duration-150 ease-[var(--ease-out)]"
          style={{ height: `${clamped}%` }}
          aria-hidden
        />
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={clamped}
          aria-label={`${GROUP_LABEL[group]}: ${clamped}%`}
          aria-valuetext={`${clamped} por cento`}
          onChange={(e) => onChange(Number(e.target.value))}
          className="org-volume-fader absolute inset-0"
        />
      </div>

      <div className="text-center">
        <MoneyText amountMinor={amountMinor} className="text-[11px] text-muted" />
        {currentPercent != null ? (
          <p className="mt-0.5 text-[10px] text-muted">agora {currentPercent.toFixed(0)}%</p>
        ) : null}
        <p className="mt-1 text-xs font-medium leading-tight">{SHORT_LABEL[group]}</p>
      </div>
    </div>
  );
}

export function OrganizationSection() {
  const service = useFinance();
  const { bump } = useFinanceOptional();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("income");
  const [incomeInput, setIncomeInput] = useState("");
  const [slices, setSlices] = useState<OrganizationSlice[]>([]);
  const [hydrated, setHydrated] = useState(false);

  const plan = useQuery({
    queryKey: ["organization-plan"],
    queryFn: () => service.getOrganizationPlan(),
  });

  useEffect(() => {
    if (!plan.data || hydrated) return;
    const suggested =
      plan.data.plannedIncomeMinor && plan.data.plannedIncomeMinor > 0
        ? plan.data.plannedIncomeMinor
        : plan.data.salarySuggestion.suggestedMinor;
    if (suggested > 0) {
      setIncomeInput((suggested / 100).toFixed(2).replace(".", ","));
    }
    if (plan.data.recommendation.slices.length) {
      setSlices(plan.data.recommendation.slices);
    }
    if (plan.data.plannedIncomeMinor && plan.data.plannedIncomeMinor > 0) {
      setStep("review");
    }
    setHydrated(true);
  }, [plan.data, hydrated]);

  const incomeMinor = useMemo(() => {
    const n = Number(incomeInput.replace(/\./g, "").replace(",", "."));
    return Number.isFinite(n) ? Math.round(n * 100) : 0;
  }, [incomeInput]);

  const saveIncome = useMutation({
    mutationFn: async () => {
      await service.setPlannedIncome(incomeInput);
      const refreshed = await service.getOrganizationPlan();
      setSlices(refreshed.recommendation.slices);
      return refreshed;
    },
    onSuccess: () => {
      toast.success("Renda planejada salva");
      void plan.refetch();
      setStep("review");
      bump();
    },
    onError: (e) => toast.error(e.message),
  });

  const apply = useMutation({
    mutationFn: () =>
      service.applyOrganizationPlan({
        incomeMinor,
        slices,
      }),
    onSuccess: () => {
      toast.success("Organização aplicada ao orçamento e à reserva");
      setStep("done");
      bump();
      void plan.refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  const updatePercent = (group: AllocationGroup, percent: number) => {
    const p = Math.min(100, Math.max(0, percent));
    const amountMinor = incomeMinor > 0 ? Math.round((incomeMinor * p) / 100) : 0;
    setSlices((prev) => {
      const next = prev.map((s) => (s.group === group ? { ...s, percent: p, amountMinor } : s));
      if (next.some((s) => s.group === group)) return next;
      return [...next, { group, percent: p, amountMinor }];
    });
  };

  const totalAllocated = slices.reduce((a, s) => a + s.amountMinor, 0);
  const totalPercent = slices.reduce((a, s) => a + s.percent, 0);
  const overBudget = totalPercent > 100.5 || totalAllocated > incomeMinor;
  const rec = plan.data?.recommendation;

  if (!open) {
    return (
      <div className="border-t border-border pt-5">
        <p className="kicker">Organização da renda</p>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted">
          Com base no seu salário, organize a renda em custos fixos, conforto, metas, prazeres, conhecimento,
          investimentos e reserva — e aplique nos limites do orçamento.
        </p>
        <Button
          className="mt-4"
          variant="secondary"
          onClick={() => {
            setOpen(true);
            setHydrated(false);
          }}
        >
          Organizar minha renda
        </Button>
        {plan.data?.plannedIncomeMinor ? (
          <p className="mt-2 text-xs text-muted">
            Renda planejada:{" "}
            <MoneyText amountMinor={plan.data.plannedIncomeMinor} className="text-xs" />
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-5 border-t border-border pt-5">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="kicker">Organização da renda</p>
          <h3 className="mt-1 text-2xl font-medium tracking-tight">
            {step === "income" ? "Renda planejada" : step === "review" ? "Distribuição" : "Aplicado"}
          </h3>
        </div>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Fechar
        </Button>
      </div>

      {step === "income" ? (
        <div className="max-w-md space-y-3">
          <p className="text-sm text-muted">
            O salário é a base de todo o cálculo. Usamos o último salário registrado como sugestão; você confirma e ele
            fica fixo até você alterar.
          </p>
          {plan.data?.salarySuggestion.suggestedMinor ? (
            <p className="text-xs text-muted">
              Sugestão ({plan.data.salarySuggestion.sourceLabel}
              {plan.data.salarySuggestion.sourceDate ? ` · ${plan.data.salarySuggestion.sourceDate}` : ""}
              ):{" "}
              <button
                type="button"
                className="text-signal underline"
                onClick={() =>
                  setIncomeInput((plan.data!.salarySuggestion.suggestedMinor / 100).toFixed(2).replace(".", ","))
                }
              >
                <MoneyText amountMinor={plan.data.salarySuggestion.suggestedMinor} className="text-xs text-signal" />
              </button>
            </p>
          ) : (
            <p className="text-xs text-warn">Nenhum salário encontrado — informe o valor manualmente.</p>
          )}
          <Label htmlFor="planned-income">Renda planejada (R$)</Label>
          <Input
            id="planned-income"
            inputMode="decimal"
            className="amount text-3xl"
            value={incomeInput}
            onChange={(e) => setIncomeInput(e.target.value)}
            placeholder="10.000,00"
          />
          <Button disabled={saveIncome.isPending || incomeMinor <= 0} onClick={() => saveIncome.mutate()}>
            Continuar
          </Button>
        </div>
      ) : null}

      {step === "review" && rec ? (
        <div className="space-y-5">
          {rec.insufficient ? (
            <p className="text-sm text-danger">
              Renda insuficiente para a organização ideal
              {rec.deficitMinor > 0 ? (
                <>
                  {" "}
                  — faltam <MoneyText amountMinor={rec.deficitMinor} className="text-sm text-danger" />
                </>
              ) : null}
              . Ajuste as porcentagens abaixo; não inventamos capacidade de investir.
            </p>
          ) : null}

          {rec.diagnostics.length ? (
            <ul className="space-y-1 text-sm text-muted">
              {rec.diagnostics.map((d) => (
                <li key={d}>· {d}</li>
              ))}
            </ul>
          ) : null}

          <div className="-mx-1 overflow-x-auto px-1 pb-1">
            <div className="flex min-w-max gap-3 border border-border bg-foreground/[0.02] px-4 py-5 sm:gap-4">
              {GROUP_ORDER.map((group) => {
                const slice = slices.find((s) => s.group === group);
                const current = plan.data?.current.find((c) => c.group === group);
                const ref =
                  group === "emergency"
                    ? "cobertura"
                    : `${REFERENCE_PERCENTS[group as keyof typeof REFERENCE_PERCENTS]}%`;
                return (
                  <VolumeFader
                    key={group}
                    group={group}
                    percent={slice?.percent ?? 0}
                    amountMinor={slice?.amountMinor ?? 0}
                    referenceLabel={ref}
                    currentPercent={current?.actualPercent ?? null}
                    onChange={(p) => updatePercent(group, p)}
                  />
                );
              })}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4 text-sm">
            <span className={cn(overBudget ? "text-danger" : "text-muted")}>
              Total {totalPercent.toFixed(0)}%
            </span>
            <span>
              <Amount amountMinor={totalAllocated} size="sm" className="inline text-base" />
              <span className="text-muted"> de </span>
              <MoneyText amountMinor={incomeMinor} className="text-sm" />
            </span>
            {overBudget ? <span className="text-xs text-danger">Soma acima de 100% — baixe algum fader.</span> : null}
          </div>

          {rec.emergency.targetReserveMinor > 0 ? (
            <p className="text-sm text-muted">
              Reserva: cobre ~{rec.emergency.coverageMonths.toFixed(1)} mês(es) de custos fixos · alvo{" "}
              {rec.emergency.targetMonths} meses (
              <MoneyText amountMinor={rec.emergency.targetReserveMinor} className="text-sm" />)
            </p>
          ) : null}

          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setStep("income")}>
              Voltar
            </Button>
            <Button
              disabled={apply.isPending || overBudget || incomeMinor <= 0}
              onClick={() => apply.mutate()}
            >
              Aplicar ao orçamento
            </Button>
          </div>
        </div>
      ) : null}

      {step === "done" ? (
        <div className="space-y-3">
          <p className="text-sm text-muted">
            Limites de consumo atualizados. Metas pessoais e investimentos continuam nos respectivos módulos — a fatia de
            Metas/Investimentos/Reserva ficou registrada no plano.
          </p>
          <Button
            variant="secondary"
            onClick={() => {
              setStep("review");
              void plan.refetch().then((r) => {
                if (r.data?.recommendation.slices.length) setSlices(r.data.recommendation.slices);
              });
            }}
          >
            Revisar de novo
          </Button>
        </div>
      ) : null}
    </div>
  );
}
