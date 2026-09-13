export type InsightFacts = {
  incomeMinor: bigint;
  expenseMinor: bigint;
  previousExpenseMinor: bigint;
  topCategories: { name: string; minor: bigint }[];
  netWorthMinor: bigint;
  budgetAlerts: string[];
  portfolioAlerts: string[];
};

export function explainFinances(facts: InsightFacts, question: string): string {
  const q = question.toLowerCase();
  if (q.includes("mês passado") || q.includes("mais que")) {
    const delta = facts.expenseMinor - facts.previousExpenseMinor;
    if (delta > 0n) {
      const top = facts.topCategories[0];
      return `Você gastou mais que no mês anterior. A diferença foi de ${formatBrl(delta)}. A categoria que mais pesou foi ${top?.name ?? "despesas gerais"}.`;
    }
    return "Seus gastos deste mês estão iguais ou menores que os do mês anterior.";
  }
  if (q.includes("posso gastar") || q.includes("quanto posso")) {
    const surplus = facts.incomeMinor - facts.expenseMinor;
    if (surplus <= 0n) return "Neste mês as despesas já alcançaram ou superaram as receitas. Evite novos gastos discricionários.";
    return `Com base nas receitas e despesas já lançadas, há cerca de ${formatBrl(surplus)} de folga neste mês. Isso não é um cálculo de orçamento futuro — apenas o saldo de fluxo já registrado.`;
  }
  if (q.includes("carteira")) {
    const alerts = facts.portfolioAlerts.length ? facts.portfolioAlerts.join(" ") : "Nenhum alerta de carteira no momento.";
    return `Patrimônio líquido atual: ${formatBrl(facts.netWorthMinor)}. ${alerts}`;
  }
  if (q.includes("categoria")) {
    if (facts.topCategories.length === 0) return "Ainda não há despesas categorizadas neste período.";
    const list = facts.topCategories.map((c) => `${c.name} (${formatBrl(c.minor)})`).join(", ");
    return `As categorias com maior gasto no período: ${list}.`;
  }
  const surplus = facts.incomeMinor - facts.expenseMinor;
  const budgets = facts.budgetAlerts.length ? `Alertas de orçamento: ${facts.budgetAlerts.join(" ")}` : "Nenhum orçamento estourado.";
  return `Receitas ${formatBrl(facts.incomeMinor)}, despesas ${formatBrl(facts.expenseMinor)}, fluxo ${formatBrl(surplus)}. ${budgets}`;
}

function formatBrl(minor: bigint): string {
  const n = Number(minor) / 100;
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
