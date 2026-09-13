export type InvestorBand =
  | "conservador"
  | "moderado_conservador"
  | "moderado"
  | "moderado_arrojado"
  | "arrojado";

export type QuestionKind = "single" | "scale";

export type InvestorQuestion = {
  id: string;
  dimension: string;
  text: string;
  weight: number;
  options: { value: number; label: string }[];
};

export const QUESTIONNAIRE_VERSION = 1;

export const INVESTOR_QUESTIONS: InvestorQuestion[] = [
  {
    id: "age",
    dimension: "idade",
    text: "Qual é a sua faixa etária?",
    weight: 8,
    options: [
      { value: 20, label: "Acima de 60 anos" },
      { value: 40, label: "46 a 60 anos" },
      { value: 60, label: "31 a 45 anos" },
      { value: 80, label: "18 a 30 anos" },
    ],
  },
  {
    id: "income_stability",
    dimension: "estabilidade",
    text: "Como você descreve a estabilidade da sua renda?",
    weight: 8,
    options: [
      { value: 20, label: "Irregular ou incerta" },
      { value: 50, label: "Razoavelmente estável" },
      { value: 80, label: "Estável e previsível" },
      { value: 100, label: "Muito estável, com folga" },
    ],
  },
  {
    id: "emergency",
    dimension: "reserva",
    text: "Sua reserva de emergência cobre quantos meses de despesas?",
    weight: 10,
    options: [
      { value: 10, label: "Nenhuma reserva" },
      { value: 40, label: "Até 3 meses" },
      { value: 70, label: "3 a 6 meses" },
      { value: 100, label: "Mais de 6 meses" },
    ],
  },
  {
    id: "horizon",
    dimension: "horizonte",
    text: "Qual o horizonte principal dos seus investimentos?",
    weight: 10,
    options: [
      { value: 15, label: "Até 1 ano" },
      { value: 40, label: "1 a 3 anos" },
      { value: 70, label: "3 a 7 anos" },
      { value: 100, label: "Mais de 7 anos" },
    ],
  },
  {
    id: "objective",
    dimension: "objetivos",
    text: "Qual o objetivo principal agora?",
    weight: 8,
    options: [
      { value: 20, label: "Preservar o capital" },
      { value: 50, label: "Renda e alguma valorização" },
      { value: 80, label: "Crescimento do patrimônio" },
      { value: 100, label: "Máxima valorização no longo prazo" },
    ],
  },
  {
    id: "knowledge",
    dimension: "conhecimento",
    text: "Como você avalia seu conhecimento financeiro?",
    weight: 7,
    options: [
      { value: 15, label: "Iniciante" },
      { value: 45, label: "Básico" },
      { value: 75, label: "Intermediário" },
      { value: 100, label: "Avançado" },
    ],
  },
  {
    id: "experience",
    dimension: "experiência",
    text: "Você já investiu em quais classes?",
    weight: 7,
    options: [
      { value: 15, label: "Apenas poupança ou conta" },
      { value: 45, label: "Renda fixa" },
      { value: 75, label: "Renda fixa e fundos/ações" },
      { value: 100, label: "Inclui ações, FIIs ou cripto" },
    ],
  },
  {
    id: "loss_tolerance",
    dimension: "tolerância",
    text: "Se sua carteira caísse 20% em um ano, o que você faria?",
    weight: 12,
    options: [
      { value: 10, label: "Resgataria quase tudo" },
      { value: 40, label: "Reduziria o risco" },
      { value: 70, label: "Manteria a estratégia" },
      { value: 100, label: "Aportaria mais" },
    ],
  },
  {
    id: "capacity",
    dimension: "capacidade",
    text: "Uma perda temporária afetaria suas contas do dia a dia?",
    weight: 10,
    options: [
      { value: 10, label: "Sim, de forma grave" },
      { value: 40, label: "Sim, com algum aperto" },
      { value: 70, label: "Pouco" },
      { value: 100, label: "Não afetaria" },
    ],
  },
  {
    id: "liquidity",
    dimension: "liquidez",
    text: "Quanto do patrimônio você pode deixar sem liquidez imediata?",
    weight: 8,
    options: [
      { value: 15, label: "Quase nada" },
      { value: 40, label: "Até 30%" },
      { value: 70, label: "Até 60%" },
      { value: 100, label: "A maior parte" },
    ],
  },
  {
    id: "income_need",
    dimension: "renda",
    text: "Você depende dos investimentos para despesas mensais?",
    weight: 6,
    options: [
      { value: 15, label: "Sim, totalmente" },
      { value: 40, label: "Parcialmente" },
      { value: 75, label: "Quase não" },
      { value: 100, label: "Não" },
    ],
  },
  {
    id: "short_term",
    dimension: "prazos",
    text: "Há algum objetivo relevante nos próximos 12 meses que use esses recursos?",
    weight: 6,
    options: [
      { value: 20, label: "Sim, valor alto" },
      { value: 50, label: "Sim, valor moderado" },
      { value: 80, label: "Pouca necessidade" },
      { value: 100, label: "Nenhuma" },
    ],
  },
];

export type InvestorAnswer = { questionId: string; value: number };

export type InvestorProfile = {
  score: number;
  band: InvestorBand;
  justification: string;
  questionnaireVersion: number;
};

const BANDS: { max: number; band: InvestorBand; label: string }[] = [
  { max: 30, band: "conservador", label: "Conservador" },
  { max: 45, band: "moderado_conservador", label: "Moderado-conservador" },
  { max: 60, band: "moderado", label: "Moderado" },
  { max: 78, band: "moderado_arrojado", label: "Moderado-arrojado" },
  { max: 100, band: "arrojado", label: "Arrojado" },
];

export function bandLabel(band: InvestorBand): string {
  return BANDS.find((b) => b.band === band)?.label ?? band;
}

export function computeInvestorProfile(answers: InvestorAnswer[]): InvestorProfile {
  const byId = new Map(answers.map((a) => [a.questionId, a.value]));
  let weighted = 0;
  let totalWeight = 0;
  const highlights: string[] = [];

  for (const question of INVESTOR_QUESTIONS) {
    const value = byId.get(question.id);
    if (value == null) throw new Error(`Resposta ausente: ${question.id}`);
    weighted += value * question.weight;
    totalWeight += 100 * question.weight;
    if (value <= 30) highlights.push(`${question.dimension} puxa para preservação`);
    if (value >= 80) highlights.push(`${question.dimension} permite mais risco`);
  }

  const score = Math.round((weighted / totalWeight) * 100);
  const match = BANDS.find((b) => score <= b.max) ?? BANDS[BANDS.length - 1];
  const justification = [
    `Score ${score}/100 a partir do questionário v${QUESTIONNAIRE_VERSION}.`,
    `Perfil ${match.label}: combinação de horizonte, reserva, tolerância e capacidade de perda.`,
    highlights.slice(0, 3).join(". ") + ".",
  ].join(" ");

  return {
    score,
    band: match.band,
    justification,
    questionnaireVersion: QUESTIONNAIRE_VERSION,
  };
}
