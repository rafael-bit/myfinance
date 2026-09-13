import type { InvestorBand } from "../investor/questionnaire";
import type { InstrumentClass } from "../investments/position";

export type HoldingSlice = {
  id: string;
  name: string;
  class: InstrumentClass;
  institutionId: string;
  marketMinor: bigint;
  liquidity: "daily" | "term" | "low";
  risk: 1 | 2 | 3 | 4 | 5;
};

export type AnalysisInput = {
  holdings: HoldingSlice[];
  emergencyMonths: number;
  emergencyTargetMonths: number;
  profileBand: InvestorBand | null;
  netWorthMinor: bigint;
};

export type AnalysisAlert = {
  code: string;
  severity: "info" | "warning" | "critical";
  message: string;
};

export type PortfolioAnalysis = {
  totalMinor: bigint;
  byClass: { class: InstrumentClass; minor: bigint; percent: number }[];
  byInstitution: { institutionId: string; minor: bigint; percent: number }[];
  herfindahl: number;
  alerts: AnalysisAlert[];
};

const CLASS_RISK: Record<InstrumentClass, number> = {
  tesouro: 1,
  cdb: 2,
  lci: 2,
  lca: 2,
  rf: 2,
  pension: 2,
  fund: 3,
  fii: 3,
  etf: 3,
  stock: 4,
  crypto: 5,
  other: 3,
};

const PROFILE_MAX_RISK: Record<InvestorBand, number> = {
  conservador: 2,
  moderado_conservador: 3,
  moderado: 3.5,
  moderado_arrojado: 4,
  arrojado: 5,
};

function percent(part: bigint, total: bigint): number {
  if (total === 0n) return 0;
  return Number((part * 10_000n) / total) / 100;
}

export function analyzePortfolio(input: AnalysisInput): PortfolioAnalysis {
  const totalMinor = input.holdings.reduce((acc, h) => acc + h.marketMinor, 0n);
  const classMap = new Map<InstrumentClass, bigint>();
  const instMap = new Map<string, bigint>();
  for (const h of input.holdings) {
    classMap.set(h.class, (classMap.get(h.class) ?? 0n) + h.marketMinor);
    instMap.set(h.institutionId, (instMap.get(h.institutionId) ?? 0n) + h.marketMinor);
  }
  const byClass = [...classMap.entries()].map(([cls, minor]) => ({
    class: cls,
    minor,
    percent: percent(minor, totalMinor),
  }));
  const byInstitution = [...instMap.entries()].map(([institutionId, minor]) => ({
    institutionId,
    minor,
    percent: percent(minor, totalMinor),
  }));
  const herfindahl = byInstitution.reduce((acc, i) => acc + (i.percent / 100) ** 2, 0);

  const alerts: AnalysisAlert[] = [];
  if (input.emergencyMonths < input.emergencyTargetMonths) {
    alerts.push({
      code: "emergency_low",
      severity: "warning",
      message: `Reserva de emergência abaixo do objetivo (${input.emergencyMonths.toFixed(1)} de ${input.emergencyTargetMonths} meses).`,
    });
  }
  const concentrated = byInstitution.find((i) => i.percent >= 40);
  if (concentrated) {
    alerts.push({
      code: "institution_concentration",
      severity: "warning",
      message: "Concentração elevada em uma única instituição.",
    });
  }
  if (herfindahl > 0.35 && input.holdings.length > 1) {
    alerts.push({
      code: "low_diversification",
      severity: "info",
      message: "Diversificação limitada entre instituições e classes.",
    });
  }
  if (input.profileBand) {
    const avgRisk =
      totalMinor === 0n
        ? 0
        : input.holdings.reduce((acc, h) => acc + CLASS_RISK[h.class] * Number(h.marketMinor), 0) / Number(totalMinor);
    if (avgRisk > PROFILE_MAX_RISK[input.profileBand] + 0.3) {
      alerts.push({
        code: "risk_mismatch",
        severity: "warning",
        message: "Exposição a ativos de maior risco acima do esperado para seu perfil.",
      });
    }
  }
  const illiquid = input.holdings.filter((h) => h.liquidity !== "daily");
  const illiquidPct = percent(
    illiquid.reduce((acc, h) => acc + h.marketMinor, 0n),
    totalMinor,
  );
  if (illiquidPct > 70) {
    alerts.push({
      code: "liquidity",
      severity: "info",
      message: "Grande parte da carteira tem liquidez restrita.",
    });
  }

  return { totalMinor, byClass, byInstitution, herfindahl, alerts };
}
