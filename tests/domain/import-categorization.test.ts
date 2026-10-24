import { describe, expect, it } from "vitest";
import {
  applyRules,
  isGenericRulePattern,
  learnRule,
  suggestExpenseCategoryKind,
} from "@/domain/import/parse";

describe("import categorization", () => {
  it("treats short/generic patterns as unsafe to learn", () => {
    expect(isGenericRulePattern("MERCADO")).toBe(true);
    expect(isGenericRulePattern("PIX")).toBe(true);
    expect(isGenericRulePattern("COMPRA")).toBe(true);
    expect(isGenericRulePattern("CARREFOUR CENTRO")).toBe(false);
  });

  it("does not learn a rule from a generic first token alone", () => {
    expect(learnRule("Mercado Pago *Pagamento", "cat-contas")).toBeNull();
    expect(learnRule("PIX Transferencia João", "cat-x")).toBeNull();
    expect(isGenericRulePattern("MERCADO PAGO UBER")).toBe(true);
    const rule = learnRule("Carrefour Paulista 123", "cat-mercado");
    expect(rule?.pattern).toContain("CARREFOUR");
    expect(rule?.categoryId).toBe("cat-mercado");
  });

  it("suggests Mercado for grocery merchants and Contas for bills", () => {
    expect(suggestExpenseCategoryKind("SUPERMERCADO EXTRA LJ 12")).toBe("mercado");
    expect(suggestExpenseCategoryKind("MERCADO DO BAIRRO")).toBe("mercado");
    expect(suggestExpenseCategoryKind("COMPRA CARREFOUR")).toBe("mercado");
    expect(suggestExpenseCategoryKind("PADARIA SAO JOSE")).toBe("mercado");
    expect(suggestExpenseCategoryKind("PANIFICADORA CENTRAL")).toBe("mercado");
    expect(suggestExpenseCategoryKind("ENEL DISTRIBUICAO SP")).toBe("contas");
    expect(suggestExpenseCategoryKind("MERCADO PAGO *UBER")).toBeNull();
    expect(suggestExpenseCategoryKind("MERCADO LIVRE")).toBeNull();
  });

  it("ignores generic saved rules when applying", () => {
    const hit = applyRules("SUPERMERCADO BOM PRECO", [
      { pattern: "MERCADO", matchType: "contains", categoryId: "contas" },
      { pattern: "BOM PRECO", matchType: "contains", categoryId: "mercado" },
    ]);
    expect(hit?.categoryId).toBe("mercado");
  });
});
