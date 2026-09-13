import type { InvestorBand } from "../investor/questionnaire";
import type { InstrumentClass } from "../investments/position";

export type Product = {
  id: string;
  name: string;
  class: InstrumentClass;
  risk: 1 | 2 | 3 | 4 | 5;
  liquidity: "daily" | "term" | "low";
  minHorizonMonths: number;
  description: string;
};

export type RecommendationContext = {
  profileBand: InvestorBand;
  goalMonths: number;
  emergencyOk: boolean;
  monthlySurplusMinor: bigint;
  hasInvestments: boolean;
};

export type Recommendation = {
  product: Product;
  score: number;
  reasons: string[];
};

export const CATALOG: Product[] = [
  {
    id: "tesouro-selic",
    name: "Tesouro Selic",
    class: "tesouro",
    risk: 1,
    liquidity: "daily",
    minHorizonMonths: 0,
    description: "Título público atrelado à Selic, adequado para reserva e liquidez.",
  },
  {
    id: "cdb-diario",
    name: "CDB com liquidez diária",
    class: "cdb",
    risk: 2,
    liquidity: "daily",
    minHorizonMonths: 0,
    description: "Renda fixa bancária com resgate rápido, até o limite do FGC.",
  },
  {
    id: "tesouro-ipca",
    name: "Tesouro IPCA+",
    class: "tesouro",
    risk: 2,
    liquidity: "term",
    minHorizonMonths: 24,
    description: "Proteção contra inflação para objetivos de médio e longo prazo.",
  },
  {
    id: "lci-lca",
    name: "LCI / LCA",
    class: "lci",
    risk: 2,
    liquidity: "term",
    minHorizonMonths: 9,
    description: "Renda fixa isenta de IR para quem pode carregar o prazo de carência.",
  },
  {
    id: "etf-ivvb",
    name: "ETF de ações globais",
    class: "etf",
    risk: 4,
    liquidity: "daily",
    minHorizonMonths: 60,
    description: "Exposição diversificada a ações, para quem tolera volatilidade.",
  },
  {
    id: "fii-diversificado",
    name: "FIIs diversificados",
    class: "fii",
    risk: 3,
    liquidity: "daily",
    minHorizonMonths: 36,
    description: "Renda com imóveis via fundo, com oscilação de cota.",
  },
  {
    id: "acoes-br",
    name: "Ações brasileiras",
    class: "stock",
    risk: 4,
    liquidity: "daily",
    minHorizonMonths: 60,
    description: "Participação em empresas, alta volatilidade e horizonte longo.",
  },
];

const BAND_MAX_RISK: Record<InvestorBand, number> = {
  conservador: 2,
  moderado_conservador: 3,
  moderado: 3,
  moderado_arrojado: 4,
  arrojado: 5,
};

export function recommendProducts(ctx: RecommendationContext): Recommendation[] {
  const maxRisk = BAND_MAX_RISK[ctx.profileBand];
  const results: Recommendation[] = [];

  for (const product of CATALOG) {
    const reasons: string[] = [];
    if (product.risk > maxRisk) continue;
    reasons.push(`Risco ${product.risk} compatível com o perfil ${ctx.profileBand.replaceAll("_", "-")}`);
    if (product.minHorizonMonths > ctx.goalMonths) continue;
    reasons.push("Prazo compatível com o objetivo informado");
    if (!ctx.emergencyOk && product.liquidity !== "daily") continue;
    if (!ctx.emergencyOk && product.liquidity === "daily") {
      reasons.push("Liquidez diária adequada enquanto a reserva ainda não está completa");
    } else {
      reasons.push(`Liquidez ${product.liquidity === "daily" ? "adequada" : "compatível com o horizonte"}`);
    }
    if (ctx.monthlySurplusMinor <= 0n && product.risk >= 4) continue;
    let score = 70 - Math.abs(maxRisk - product.risk) * 8;
    if (ctx.emergencyOk && product.class === "tesouro" && product.liquidity === "daily") score -= 5;
    if (!ctx.emergencyOk && product.id === "tesouro-selic") score += 15;
    if (ctx.goalMonths >= 60 && product.risk >= 3) score += 8;
    results.push({ product, score, reasons });
  }

  return results
    .filter((r) => r.reasons.length >= 2)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}
