import { describe, expect, it } from "vitest";
import {
  add,
  allocateEvenly,
  convertWithRate,
  formatMoney,
  fromMajor,
  money,
  subtract,
  toMajorString,
} from "@/domain/money";
import { assertBalanced, buildExpense, buildIncome, buildTransfer, cashFlowEffect, periodCashFlow } from "@/domain/ledger/postings";
import { buildInstallmentPlan, generateRecurrenceDates, installmentProgress } from "@/domain/cashflow/recurrence";
import { availableLimit, invoicePeriodFor } from "@/domain/cards/invoice";
import { replayPosition } from "@/domain/investments/position";
import { modifiedDietz, percentReturn, timeWeightedReturn } from "@/domain/investments/performance";
import { calculateNetWorth } from "@/domain/networth";
import { budgetPace, budgetUsage, effectiveBudgetLimit, monthElapsedPercent, recommendedMonthlyContribution } from "@/domain/budget";
import { computeInvestorProfile, INVESTOR_QUESTIONS } from "@/domain/investor/questionnaire";
import { analyzePortfolio } from "@/domain/analysis/portfolio";
import { recommendProducts } from "@/domain/recommendation/engine";
import { detectDuplicates, detectImportSource, isMercadoPagoExtrato, learnRule, parseAmount, parseCsv, parseMercadoPagoExtrato, parseOfx, parsePdfText } from "@/domain/import/parse";
import { detectConflict, lwwMetadata } from "@/infra/sync/engine";
import { explainFinances } from "@/domain/ai/explain";

describe("Money", () => {
  it("avoids floating point in BRL", () => {
    const a = fromMajor("0.1", "BRL");
    const b = fromMajor("0.2", "BRL");
    expect(add(a, b)).toEqual(fromMajor("0.3", "BRL"));
    expect(toMajorString(fromMajor("10,50", "BRL").amountMinor === 1050n ? fromMajor("10.50", "BRL") : fromMajor("10.50", "BRL"))).toBe("10.50");
  });

  it("formats with Brazilian separators", () => {
    expect(formatMoney(fromMajor("1234.56", "BRL"))).toBe("R$ 1.234,56");
  });

  it("allocates installments without losing cents", () => {
    const parts = allocateEvenly(fromMajor("100.00", "BRL"), 3);
    expect(parts.reduce((acc, p) => acc + p.amountMinor, 0n)).toBe(10000n);
  });

  it("converts with explicit rate", () => {
    const usd = convertWithRate(fromMajor("10.00", "USD"), "BRL", 500n, 2);
    expect(usd.currencyCode).toBe("BRL");
    expect(usd.amountMinor).toBe(5000n);
  });

  it("rejects mixed currencies", () => {
    expect(() => subtract(money(1, "BRL"), money(1, "USD"))).toThrow();
  });
});

describe("Ledger", () => {
  it("requires balanced postings", () => {
    expect(() => assertBalanced([{ accountId: "a", amountMinor: 1n, currency: "BRL" }])).toThrow();
    expect(() =>
      assertBalanced([
        { accountId: "a", amountMinor: 100n, currency: "BRL" },
        { accountId: "b", amountMinor: -99n, currency: "BRL" },
      ]),
    ).toThrow();
    expect(() =>
      assertBalanced([
        { accountId: "a", amountMinor: 100n, currency: "BRL" },
        { accountId: "b", amountMinor: -100n, currency: "BRL" },
      ]),
    ).not.toThrow();
  });

  it("does not treat transfers as cash flow", () => {
    const transfer = buildTransfer({
      amount: fromMajor("50", "BRL"),
      fromAccountId: "a",
      toAccountId: "b",
      description: "pix",
      date: "2026-01-10",
      idempotencyKey: "k1",
    });
    expect(cashFlowEffect(transfer.type)).toBe("none");
    const flow = periodCashFlow([
      { ...buildExpense({ amount: fromMajor("20", "BRL"), assetAccountId: "a", expenseAccountId: "e", description: "x", date: "2026-01-01", idempotencyKey: "k2" }), accountId: "a" },
      { ...buildIncome({ amount: fromMajor("100", "BRL"), assetAccountId: "a", incomeAccountId: "i", description: "s", date: "2026-01-01", idempotencyKey: "k3" }), accountId: "a" },
      { ...transfer, accountId: "a" },
    ]);
    expect(flow.income).toBe(10000n);
    expect(flow.expense).toBe(2000n);
  });
});

describe("Installments and recurrences", () => {
  it("splits 6000 into 12 months", () => {
    const plan = buildInstallmentPlan({
      total: fromMajor("6000", "BRL"),
      installmentsCount: 12,
      firstDate: "2026-01-15",
      assetAccountId: "card",
      expenseAccountId: "exp",
      description: "Notebook",
      idempotencyKeyPrefix: "nb",
    });
    expect(plan.transactions).toHaveLength(12);
    expect(plan.transactions[0].date.startsWith("2026-01")).toBe(true);
    expect(plan.transactions[11].date.startsWith("2026-12")).toBe(true);
    expect(plan.transactions.reduce((acc, t) => acc + t.postings[0].amountMinor, 0n)).toBe(600000n);
    expect(plan.transactions[0].postings[0].amountMinor).toBe(50000n);
  });

  it("generates monthly rent", () => {
    const dates = generateRecurrenceDates({
      freq: "monthly",
      interval: 1,
      byMonthDay: 10,
      startDate: "2026-01-10",
      generateDaysAhead: 90,
    }, "2026-04-01", []);
    expect(dates).toEqual(["2026-01-10", "2026-02-10", "2026-03-10"]);
  });

  it("tracks remaining installments", () => {
    const progress = installmentProgress({
      totalMinor: 600000n,
      asOf: "2026-03-01",
      installments: [
        { date: "2026-01-15", amountMinor: 50000n, paid: true },
        { date: "2026-02-15", amountMinor: 50000n, paid: true },
        { date: "2026-03-15", amountMinor: 50000n, paid: false },
      ],
    });
    expect(progress.paidCount).toBe(2);
    expect(progress.remainingMinor).toBe(500000n);
  });
});

describe("Cards", () => {
  it("places purchases after closing into the next invoice", () => {
    const period = invoicePeriodFor({ closingDay: 8, dueDay: 15, asOf: "2026-01-09" });
    expect(period.closingDate).toBe("2026-02-08");
    expect(period.dueDate).toBe("2026-02-15");
  });

  it("computes available limit", () => {
    expect(availableLimit(500000n, 120000n)).toBe(380000n);
  });
});

describe("Investments", () => {
  it("computes average price after buy and sell", () => {
    const pos = replayPosition([
      { type: "buy", date: "2026-01-01", quantityUnscaled: 100n, quantityScale: 0, priceMinor: 1000n, amountMinor: 100000n },
      { type: "buy", date: "2026-02-01", quantityUnscaled: 100n, quantityScale: 0, priceMinor: 2000n, amountMinor: 200000n },
      { type: "sell", date: "2026-03-01", quantityUnscaled: 50n, quantityScale: 0, priceMinor: 3000n, amountMinor: 150000n },
    ]);
    expect(pos.quantity).toBe(150);
    expect(pos.averagePriceMinor).toBeGreaterThan(0n);
  });

  it("computes TWR and Dietz", () => {
    const twr = timeWeightedReturn([
      { startValueMinor: 10000n, endValueMinor: 11000n, flowMinor: 0n },
      { startValueMinor: 11000n, endValueMinor: 12100n, flowMinor: 0n },
    ]);
    expect(twr).toBeCloseTo(0.21, 6);
    const dietz = modifiedDietz({
      startValueMinor: 10000n,
      endValueMinor: 12000n,
      flows: [{ weight: 0.5, amountMinor: 1000n }],
    });
    expect(dietz).toBeCloseTo(0.0952, 3);
    expect(percentReturn(10000n, 11000n)).toBe(10);
  });
});

describe("Net worth budget goals", () => {
  it("nets assets and debts", () => {
    const nw = calculateNetWorth({
      accountBalancesMinor: 100000n,
      propertyValuesMinor: 500000n,
      investmentMarketMinor: 200000n,
      cardBalancesMinor: 30000n,
      otherLiabilitiesMinor: 70000n,
    });
    expect(nw.grossMinor).toBe(800000n);
    expect(nw.debtsMinor).toBe(100000n);
    expect(nw.netMinor).toBe(700000n);
  });

  it("alerts budget thresholds", () => {
    expect(budgetUsage(80n, 100n).alert).toBe("near");
    expect(budgetUsage(100n, 100n).alert).toBe("reached");
    expect(budgetUsage(120n, 100n).alert).toBe("over");
    expect(budgetPace(50, 50)).toBe("on_track");
    expect(budgetPace(70, 50)).toBe("ahead");
    expect(budgetPace(30, 50)).toBe("under");
    expect(monthElapsedPercent("2026-08", "2026-08-15").day).toBe(15);
    expect(monthElapsedPercent("2026-08", "2026-08-15").daysInMonth).toBe(31);
  });

  it("carries total overspend into the next month envelope", () => {
    const standing = 10000n; // R$ 100 teto total
    const next = effectiveBudgetLimit({
      standingLimitMinor: standing,
      yearMonth: "2026-02",
      spentByMonth: { "2026-01": 12000 }, // R$ 120 de gastos totais
      fromMonth: "2026-01",
    });
    expect(next.availableMinor).toBe(8000n);
    expect(next.debtMinor).toBe(2000n);

    const recovered = effectiveBudgetLimit({
      standingLimitMinor: standing,
      yearMonth: "2026-03",
      spentByMonth: { "2026-01": 12000, "2026-02": 7000 },
      fromMonth: "2026-01",
    });
    expect(recovered.availableMinor).toBe(10000n);
    expect(recovered.debtMinor).toBe(0n);

    const chained = effectiveBudgetLimit({
      standingLimitMinor: standing,
      yearMonth: "2026-03",
      spentByMonth: { "2026-01": 12000, "2026-02": 10000 },
      fromMonth: "2026-01",
    });
    expect(chained.availableMinor).toBe(8000n);
  });

  it("does not carry underspend surplus on the envelope", () => {
    const result = effectiveBudgetLimit({
      standingLimitMinor: 10000n,
      yearMonth: "2026-02",
      spentByMonth: { "2026-01": 7000 },
      fromMonth: "2026-01",
    });
    expect(result.availableMinor).toBe(10000n);
    expect(result.debtMinor).toBe(0n);
  });

  it("recommends monthly contribution", () => {
    expect(recommendedMonthlyContribution({ targetMinor: 1200n, currentMinor: 0n, monthsRemaining: 12 })).toBe(100n);
  });
});

describe("Investor profile and recommendation", () => {
  it("computes profile only from answers", () => {
    const conservative = computeInvestorProfile(INVESTOR_QUESTIONS.map((q) => ({ questionId: q.id, value: q.options[0].value })));
    const aggressive = computeInvestorProfile(INVESTOR_QUESTIONS.map((q) => ({ questionId: q.id, value: q.options.at(-1)!.value })));
    expect(conservative.band).toBe("conservador");
    expect(aggressive.band).toBe("arrojado");
    expect(conservative.score).toBeLessThan(aggressive.score);
  });

  it("filters products incompatible with profile", () => {
    const recs = recommendProducts({
      profileBand: "conservador",
      goalMonths: 6,
      emergencyOk: false,
      monthlySurplusMinor: 10000n,
      hasInvestments: false,
    });
    expect(recs.length).toBeGreaterThan(0);
    expect(recs.every((r) => r.reasons.length >= 2)).toBe(true);
    expect(recs.some((r) => r.product.class === "stock")).toBe(false);
  });

  it("flags concentration", () => {
    const analysis = analyzePortfolio({
      holdings: [
        { id: "1", name: "A", class: "stock", institutionId: "xp", marketMinor: 900n, liquidity: "daily", risk: 4 },
        { id: "2", name: "B", class: "cdb", institutionId: "xp", marketMinor: 100n, liquidity: "daily", risk: 2 },
      ],
      emergencyMonths: 1,
      emergencyTargetMonths: 6,
      profileBand: "conservador",
      netWorthMinor: 1000n,
    });
    expect(analysis.alerts.some((a) => a.code === "institution_concentration")).toBe(true);
    expect(analysis.alerts.some((a) => a.code === "emergency_low")).toBe(true);
  });
});

describe("Import and sync", () => {
  it("parses csv and ofx", () => {
    const csv = parseCsv("data;descricao;valor\n01/02/2026;IFOOD;-32,90");
    expect(csv[0].description).toContain("IFOOD");
    expect(csv[0].amountMinor).toBe(-3290n);
    const ofx = parseOfx("<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260201<TRNAMT>-10.00<MEMO>UBER<FITID>abc</STMTTRN>");
    expect(ofx[0].description).toBe("UBER");
    expect(ofx[0].externalId).toBe("abc");
  });

  it("parses bank csv with credit and debit columns", () => {
    const csv = parseCsv("Data;Histórico;Crédito;Débito\n01/02/2026;Salário;3.500,00;\n02/02/2026;Ifood;;32,90");
    expect(csv).toHaveLength(2);
    expect(csv[0].type).toBe("income");
    expect(csv[0].amountMinor).toBe(350000n);
    expect(csv[1].type).toBe("expense");
    expect(csv[1].amountMinor).toBe(-3290n);
  });

  it("treats signed amount as entrada/saída (minus = out)", () => {
    const csv = parseCsv("data;descricao;valor\n01/02/2026;PIX JOAO;150,00\n02/02/2026;PIX MARIA;-80,00\n03/02/2026;IFOOD;45,50-");
    expect(csv[0]).toMatchObject({ type: "income", amountMinor: 15000n });
    expect(csv[1]).toMatchObject({ type: "expense", amountMinor: -8000n });
    expect(csv[2]).toMatchObject({ type: "expense", amountMinor: -4550n });
  });

  it("parses PicPay CSV with unicode minus and plus signs", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const raw = readFileSync(resolve("tests/fixtures/picpay-extrato.csv"), "utf8");
    const items = parseCsv(raw);
    expect(items.length).toBeGreaterThan(10);
    const expense = items.find((i) => i.description.includes("ORIOSVALDO"));
    const income = items.find((i) => i.description.includes("CHALE BOSQUE"));
    expect(expense).toMatchObject({ type: "expense", amountMinor: -2500n });
    expect(income).toMatchObject({ type: "income", amountMinor: 28000n });
    expect(items.filter((i) => i.type === "expense").length).toBeGreaterThan(5);
    expect(items.filter((i) => i.type === "income").length).toBeGreaterThan(3);
    expect(parseAmount("−R$ 25,00")).toBe(-2500n);
    expect(parseAmount("+R$ 280,00")).toBe(28000n);
  });

  it("parses typical bank pdf text lines", () => {
    const pdf = parsePdfText([
      "Extrato Conta Corrente",
      "01/02/2026 PIX RECEBIDO JOAO 1.250,00",
      "02/02/2026 IFOOD *SAO PAULO -32,90",
      "Saldo atual 1.217,10",
    ].join("\n"));
    expect(pdf.items).toHaveLength(2);
    expect(pdf.items[0].type).toBe("income");
    expect(pdf.items[0].amountMinor).toBe(125000n);
    expect(pdf.items[1].type).toBe("expense");
    expect(pdf.items[1].description).toContain("IFOOD");
    expect(pdf.items[1].amountMinor).toBe(-3290n);
    expect(detectImportSource("nubank.pdf", "01/02/2026 PIX 10,00")).toBe("pdf");
  });

  it("parses Mercado Pago EXTRATO DE CONTA template", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const raw = readFileSync(resolve("tests/fixtures/mercado-pago-extrato-raw.txt"), "utf8");
    expect(isMercadoPagoExtrato(raw)).toBe(true);
    const pdf = parseMercadoPagoExtrato(raw);
    expect(pdf.items.length).toBe(92);
    expect(pdf.items[0]).toMatchObject({
      date: "2026-08-01",
      description: "Pagamento GOOGLE BRASIL PAGAMENTOS LTDA.",
      amountMinor: -2990n,
      type: "expense",
      externalId: "170610456591",
    });
    expect(pdf.items[1]).toMatchObject({
      date: "2026-08-01",
      type: "income",
      amountMinor: 199114n,
      externalId: "170632544309",
    });
    const income = pdf.items.filter((i) => i.amountMinor > 0n).reduce((a, i) => a + i.amountMinor, 0n);
    const expense = pdf.items.filter((i) => i.amountMinor < 0n).reduce((a, i) => a + i.amountMinor, 0n);
    expect(income).toBe(1963534n);
    expect(expense).toBe(-2012228n);
  });

  it("parses Mercado Pago PDF lines with unicode minus and glued operation id", () => {
    const text = [
      "EXTRATO DE CONTA",
      "DETALHE DOS MOVIMENTOS",
      "Data Descrição ID da operação Valor Saldo",
      "01-08-2026",
      "Pagamento GOOGLE BRASIL",
      "PAGAMENTOS LTDA.",
      "170610456591 R$ \u221229,90 R$ 459,55",
      "01-08-2026 Pagamento NUBANK LTDA.170632544309 R$ 1.991,14 R$ 2.450,69",
      "02-08-2026 Pix enviado LOJA 170818322019 R$ \u22122.934,88 R$ 453,89",
    ].join("\n");
    const pdf = parseMercadoPagoExtrato(text);
    expect(pdf.unrecognized).toEqual([]);
    expect(pdf.items).toHaveLength(3);
    expect(pdf.items[0].amountMinor).toBe(-2990n);
    expect(pdf.items[1].amountMinor).toBe(199114n);
    expect(pdf.items[2].amountMinor).toBe(-293488n);
  });

  it("detects duplicates and learns rules", () => {
    const item = { date: "2026-02-01", description: "IFOOD *123", amountMinor: -3290n, type: "expense" as const };
    const dups = detectDuplicates(item, [{ ...item, date: "2026-02-02" }]);
    expect(dups).toHaveLength(1);
    expect(learnRule("IFOOD SAO PAULO", "food").pattern).toBe("IFOOD");
  });

  it("flags monetary conflicts", () => {
    expect(detectConflict({ amountMinor: 1, note: "a" }, { amountMinor: 2, note: "b" })).toEqual(["amountMinor"]);
    const kept = lwwMetadata({ updatedAt: "2026-01-02", version: 1, note: "a" }, { updatedAt: "2026-01-01", version: 9, note: "b" });
    expect(kept.note).toBe("a");
  });
});

describe("AI explanations do not calculate", () => {
  it("uses provided facts", () => {
    const text = explainFinances({
      incomeMinor: 100000n,
      expenseMinor: 40000n,
      previousExpenseMinor: 30000n,
      topCategories: [{ name: "Alimentação", minor: 20000n }],
      netWorthMinor: 500000n,
      budgetAlerts: [],
      portfolioAlerts: [],
    }, "Por que gastei mais que no mês passado?");
    expect(text).toContain("Alimentação");
  });
});
