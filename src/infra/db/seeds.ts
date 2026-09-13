import { CURRENCIES } from "@/shared/constants";
import { INVESTOR_QUESTIONS } from "@/domain/investor/questionnaire";

export const CATEGORY_SEEDS = [
  { name: "Salário", kind: "income", icon: "wallet", color: "#0f766e" },
  { name: "Freelance", kind: "income", icon: "briefcase", color: "#0369a1" },
  { name: "Rendimentos", kind: "income", icon: "trending-up", color: "#4f46e5" },
  { name: "Outras receitas", kind: "income", icon: "plus", color: "#64748b" },
  { name: "Moradia", kind: "expense", icon: "home", color: "#b45309" },
  { name: "Mercado", kind: "expense", icon: "shopping-cart", color: "#c2410c" },
  { name: "Transporte", kind: "expense", icon: "car", color: "#0369a1" },
  { name: "Saúde", kind: "expense", icon: "heart", color: "#be123c" },
  { name: "Educação", kind: "expense", icon: "book", color: "#7c3aed" },
  { name: "Lazer", kind: "expense", icon: "sparkles", color: "#0f766e" },
  { name: "Assinaturas", kind: "expense", icon: "repeat", color: "#334155" },
  { name: "Contas", kind: "expense", icon: "file-text", color: "#57534e" },
  { name: "Despesas pessoais", kind: "expense", icon: "user", color: "#7c2d12" },
  { name: "Outras despesas", kind: "expense", icon: "more-horizontal", color: "#64748b" },
];

export { CURRENCIES, INVESTOR_QUESTIONS };

export const DEFAULT_WIDGETS = [
  "networth",
  "cashflow",
  "budget",
  "goals",
  "alerts",
  "investments",
];
