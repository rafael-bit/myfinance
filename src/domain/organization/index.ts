/**
 * Organização doméstica da renda.
 * Salário = base. Seis fatias % + reserva por cobertura em meses.
 */

export type ConsumptionGroup = "fixed" | "comfort" | "pleasure" | "knowledge";
export type ConstructionGroup = "goals" | "invest" | "emergency";
export type AllocationGroup = ConsumptionGroup | ConstructionGroup;

export const REFERENCE_PERCENTS: Record<Exclude<AllocationGroup, "emergency">, number> = {
  fixed: 30,
  comfort: 15,
  goals: 15,
  pleasure: 10,
  knowledge: 5,
  invest: 25,
};

export const GROUP_LABEL: Record<AllocationGroup, string> = {
  fixed: "Custos fixos",
  comfort: "Conforto",
  goals: "Metas",
  pleasure: "Prazeres",
  knowledge: "Conhecimento",
  invest: "Investimentos",
  emergency: "Reserva de emergência",
};

export const CONSUMPTION_GROUPS: ConsumptionGroup[] = ["fixed", "comfort", "pleasure", "knowledge"];
export const DEFAULT_EMERGENCY_MONTHS = 6;

/** Default: nome de categoria (sem acento, lower) → grupo de consumo. */
const DEFAULT_CATEGORY_GROUP: Record<string, ConsumptionGroup> = {
  moradia: "fixed",
  mercado: "fixed",
  alimentacao: "fixed",
  transporte: "fixed",
  saude: "fixed",
  contas: "fixed",
  assinaturas: "comfort",
  "despesas pessoais": "comfort",
  lazer: "pleasure",
  educacao: "knowledge",
};

export function normalizeCategoryName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

export function defaultGroupForCategory(name: string): ConsumptionGroup | null {
  return DEFAULT_CATEGORY_GROUP[normalizeCategoryName(name)] ?? null;
}

export function resolveCategoryGroup(
  name: string,
  override?: ConsumptionGroup | null,
): ConsumptionGroup | null {
  if (override !== undefined) return override;
  return defaultGroupForCategory(name);
}

export type OrganizationSlice = {
  group: AllocationGroup;
  percent: number;
  amountMinor: number;
};

export type OrganizationRecommendation = {
  incomeMinor: number;
  slices: OrganizationSlice[];
  /** Soma das fatias (pode ser < 100 se renda insuficiente). */
  allocatedPercent: number;
  deficitMinor: number;
  diagnostics: string[];
  emergency: {
    targetMonths: number;
    monthlyFixedMinor: number;
    targetReserveMinor: number;
    currentReserveMinor: number;
    coverageMonths: number;
    monthlyContributionMinor: number;
  };
  insufficient: boolean;
};

function roundMinor(n: number): number {
  return Math.max(0, Math.round(n));
}

/**
 * Recomendação de organização a partir do salário (renda planejada).
 * Reserva: cobre `targetMonths` × custos fixos recomendados;
 * enquanto incompleta, desvia aporte de Investimentos (não inventa renda).
 */
export function recommendOrganization(params: {
  incomeMinor: number;
  /** Gasto médio observado em custos fixos (opcional, ancora realidade). */
  observedFixedMinor?: number;
  currentReserveMinor?: number;
  targetMonths?: number;
}): OrganizationRecommendation {
  const income = Math.max(0, params.incomeMinor);
  const targetMonths = params.targetMonths ?? DEFAULT_EMERGENCY_MONTHS;
  const currentReserve = Math.max(0, params.currentReserveMinor ?? 0);
  const diagnostics: string[] = [];

  if (income <= 0) {
    return {
      incomeMinor: 0,
      slices: [],
      allocatedPercent: 0,
      deficitMinor: 0,
      diagnostics: ["Informe a renda planejada (salário) para organizar."],
      emergency: {
        targetMonths,
        monthlyFixedMinor: 0,
        targetReserveMinor: 0,
        currentReserveMinor: currentReserve,
        coverageMonths: 0,
        monthlyContributionMinor: 0,
      },
      insufficient: true,
    };
  }

  const idealFixed = roundMinor((income * REFERENCE_PERCENTS.fixed) / 100);
  const observedFixed = Math.max(0, params.observedFixedMinor ?? 0);
  // Âncora: se o essencial real for maior que 30%, respeita a realidade até o teto da renda
  let fixedMinor = idealFixed;
  if (observedFixed > idealFixed) {
    fixedMinor = Math.min(observedFixed, income);
    diagnostics.push(
      `Custos fixos observados (${formatBrl(observedFixed)}) passam dos 30% de referência — a proposta usa a realidade.`,
    );
  }

  if (observedFixed > income) {
    diagnostics.push("A renda não cobre os custos fixos. Há déficit — ajuste gastos essenciais antes de investir.");
    return {
      incomeMinor: income,
      slices: [
        { group: "fixed", percent: 100, amountMinor: income },
        { group: "comfort", percent: 0, amountMinor: 0 },
        { group: "goals", percent: 0, amountMinor: 0 },
        { group: "pleasure", percent: 0, amountMinor: 0 },
        { group: "knowledge", percent: 0, amountMinor: 0 },
        { group: "invest", percent: 0, amountMinor: 0 },
        { group: "emergency", percent: 0, amountMinor: 0 },
      ],
      allocatedPercent: 100,
      deficitMinor: observedFixed - income,
      diagnostics,
      emergency: {
        targetMonths,
        monthlyFixedMinor: observedFixed,
        targetReserveMinor: observedFixed * targetMonths,
        currentReserveMinor: currentReserve,
        coverageMonths: observedFixed > 0 ? currentReserve / observedFixed : 0,
        monthlyContributionMinor: 0,
      },
      insufficient: true,
    };
  }

  let remaining = income - fixedMinor;

  const targetReserve = fixedMinor * targetMonths;
  const reserveGap = Math.max(0, targetReserve - currentReserve);
  const coverageMonths = fixedMinor > 0 ? currentReserve / fixedMinor : 0;

  // Fatias relativas de referência sobre o que sobra após fixos (exceto invest/emergency tratados à parte)
  const otherIdealShare =
    REFERENCE_PERCENTS.comfort +
    REFERENCE_PERCENTS.goals +
    REFERENCE_PERCENTS.pleasure +
    REFERENCE_PERCENTS.knowledge +
    REFERENCE_PERCENTS.invest;

  const scale = remaining / Math.max(1, (income * otherIdealShare) / 100);

  let comfort = roundMinor(((income * REFERENCE_PERCENTS.comfort) / 100) * scale);
  let goals = roundMinor(((income * REFERENCE_PERCENTS.goals) / 100) * scale);
  let pleasure = roundMinor(((income * REFERENCE_PERCENTS.pleasure) / 100) * scale);
  let knowledge = roundMinor(((income * REFERENCE_PERCENTS.knowledge) / 100) * scale);
  let invest = roundMinor(((income * REFERENCE_PERCENTS.invest) / 100) * scale);

  // Corrige arredondamento para caber em remaining
  let sumOthers = comfort + goals + pleasure + knowledge + invest;
  if (sumOthers > remaining) {
    const factor = remaining / sumOthers;
    comfort = roundMinor(comfort * factor);
    goals = roundMinor(goals * factor);
    pleasure = roundMinor(pleasure * factor);
    knowledge = roundMinor(knowledge * factor);
    invest = remaining - comfort - goals - pleasure - knowledge;
  } else if (sumOthers < remaining) {
    invest += remaining - sumOthers;
  }

  let emergencyMonthly = 0;
  if (reserveGap > 0 && invest > 0) {
    // Prioriza reserva tirando de investimentos (liquidez antes de expandir risco)
    emergencyMonthly = Math.min(invest, reserveGap);
    invest -= emergencyMonthly;
    diagnostics.push(
      `Reserva cobre ~${coverageMonths.toFixed(1)} mês(es); alvo ${targetMonths}. Parte dos investimentos vai para a reserva até completar.`,
    );
  } else if (coverageMonths >= targetMonths) {
    diagnostics.push(`Reserva de emergência em dia (~${coverageMonths.toFixed(1)} meses de custos fixos).`);
  }

  if (fixedMinor / income > 0.5) {
    diagnostics.push("Custos fixos comprometem mais da metade da renda — revise o essencial.");
  }
  if (invest / income >= 0.2) {
    diagnostics.push("Boa capacidade de investimento em relação ao salário.");
  }
  if (goals / income < 0.1 && goals > 0) {
    diagnostics.push("Parcela de metas abaixo dos 15% de referência por causa do ajuste à sua realidade.");
  }

  const slices: OrganizationSlice[] = [
    { group: "fixed", percent: (fixedMinor / income) * 100, amountMinor: fixedMinor },
    { group: "comfort", percent: (comfort / income) * 100, amountMinor: comfort },
    { group: "goals", percent: (goals / income) * 100, amountMinor: goals },
    { group: "pleasure", percent: (pleasure / income) * 100, amountMinor: pleasure },
    { group: "knowledge", percent: (knowledge / income) * 100, amountMinor: knowledge },
    { group: "invest", percent: (invest / income) * 100, amountMinor: invest },
    { group: "emergency", percent: (emergencyMonthly / income) * 100, amountMinor: emergencyMonthly },
  ];

  const allocated = slices.reduce((a, s) => a + s.amountMinor, 0);

  return {
    incomeMinor: income,
    slices,
    allocatedPercent: (allocated / income) * 100,
    deficitMinor: 0,
    diagnostics,
    emergency: {
      targetMonths,
      monthlyFixedMinor: fixedMinor,
      targetReserveMinor: targetReserve,
      currentReserveMinor: currentReserve,
      coverageMonths,
      monthlyContributionMinor: emergencyMonthly,
    },
    insufficient: false,
  };
}

/** Rateia o valor de um grupo entre categorias (pesos = gasto histórico; equal se zero). */
export function allocateToCategories(
  totalMinor: number,
  categories: { id: string; weightMinor: number }[],
): { categoryId: string; limitMinor: number }[] {
  if (categories.length === 0 || totalMinor <= 0) return [];
  const weights = categories.map((c) => Math.max(0, c.weightMinor));
  const sumW = weights.reduce((a, b) => a + b, 0);
  const useEqual = sumW <= 0;
  const result: { categoryId: string; limitMinor: number }[] = [];
  let assigned = 0;
  for (let i = 0; i < categories.length; i++) {
    const share = useEqual ? 1 / categories.length : weights[i]! / sumW;
    const limit = i === categories.length - 1 ? totalMinor - assigned : roundMinor(totalMinor * share);
    assigned += limit;
    result.push({ categoryId: categories[i]!.id, limitMinor: Math.max(0, limit) });
  }
  return result;
}

export function diagnoseCurrentDistribution(params: {
  incomeMinor: number;
  spentByGroup: Partial<Record<ConsumptionGroup, number>>;
  goalsContributedMinor: number;
  investedMinor: number;
  emergencyContributedMinor: number;
}): { group: AllocationGroup; actualPercent: number; referencePercent: number; actualMinor: number }[] {
  const income = Math.max(1, params.incomeMinor);
  const rows: { group: AllocationGroup; actualMinor: number; referencePercent: number }[] = [
    { group: "fixed", actualMinor: params.spentByGroup.fixed ?? 0, referencePercent: REFERENCE_PERCENTS.fixed },
    { group: "comfort", actualMinor: params.spentByGroup.comfort ?? 0, referencePercent: REFERENCE_PERCENTS.comfort },
    { group: "goals", actualMinor: params.goalsContributedMinor, referencePercent: REFERENCE_PERCENTS.goals },
    { group: "pleasure", actualMinor: params.spentByGroup.pleasure ?? 0, referencePercent: REFERENCE_PERCENTS.pleasure },
    { group: "knowledge", actualMinor: params.spentByGroup.knowledge ?? 0, referencePercent: REFERENCE_PERCENTS.knowledge },
    { group: "invest", actualMinor: params.investedMinor, referencePercent: REFERENCE_PERCENTS.invest },
    { group: "emergency", actualMinor: params.emergencyContributedMinor, referencePercent: 0 },
  ];
  return rows.map((r) => ({
    group: r.group,
    actualMinor: r.actualMinor,
    actualPercent: (r.actualMinor / income) * 100,
    referencePercent: r.referencePercent,
  }));
}

function formatBrl(minor: number): string {
  return (minor / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
