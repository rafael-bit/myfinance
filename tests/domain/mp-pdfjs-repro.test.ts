import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseMercadoPagoExtrato, parsePdfText } from "@/domain/import/parse";

/** Simulates pdf.js merging each Mercado Pago row into one physical line. */
function toSingleLinePdfText(raw: string): string {
  const lines = raw.split(/\r?\n/);
  const out: string[] = [];
  let buf = "";
  for (const rawLine of lines) {
    const line = rawLine.replace(/\s+/g, " ").trim();
    if (!line) continue;
    if (/^\d{2}-\d{2}-\d{4}/.test(line)) {
      if (buf) out.push(buf);
      buf = line;
      if (/\d{10,}\s+R\$/.test(line)) {
        out.push(buf);
        buf = "";
      }
      continue;
    }
    if (/^\d{10,}\s+R\$/.test(line) && buf) {
      buf += ` ${line}`;
      out.push(buf);
      buf = "";
      continue;
    }
    if (buf) buf += ` ${line}`;
  }
  if (buf) out.push(buf);
  const header = lines.filter((l) => /EXTRATO|DETALHE|^Data /i.test(l)).join("\n");
  return `${header}\n${out.join("\n")}`;
}

describe("Mercado Pago pdf.js single-line repro", () => {
  it("parses rows merged into one line (browser pdf.js layout)", () => {
    const raw = readFileSync(resolve("tests/fixtures/mercado-pago-extrato-raw.txt"), "utf8");
    const single = toSingleLinePdfText(raw);
    const pdf = parsePdfText(single);
    expect(pdf.unrecognized.length).toBe(0);
    expect(pdf.items.length).toBe(92);
  });

  it("parses exact user error lines", () => {
    const text = [
      "EXTRATO DE CONTA",
      "DETALHE DOS MOVIMENTOS",
      "Data Descrição ID da operação Valor Saldo",
      "01-08-2026 Pagamento GOOGLE BRASIL PAGAMENTOS LTDA. 170610456591 R$ -29,90 R$ 459,55",
      "01-08-2026 Pix recebido Gabrieli Vitoria Matias de Sousa 170632544309 R$ 1.991,14 R$ 2.450,69",
      "03-08-2026 Rendimentos 1747716311318 R$ 0,19 R$ 369,08",
    ].join("\n");
    const pdf = parseMercadoPagoExtrato(text);
    expect(pdf.unrecognized).toEqual([]);
    expect(pdf.items).toHaveLength(3);
  });

  it("parses pdf.js layout with id and amounts on separate lines", () => {
    const text = [
      "EXTRATO DE CONTA",
      "DETALHE DOS MOVIMENTOS",
      "Data Descrição ID da operação Valor Saldo",
      "01-08-2026",
      "Pagamento GOOGLE BRASIL",
      "PAGAMENTOS LTDA.",
      "170610456591",
      "R$ -29,90 R$ 459,55",
      "01-08-2026",
      "Pix recebido Gabrieli Vitoria",
      "Matias de Sousa",
      "170632544309",
      "R$ 1.991,14 R$ 2.450,69",
    ].join("\n");
    const pdf = parseMercadoPagoExtrato(text);
    expect(pdf.unrecognized).toEqual([]);
    expect(pdf.items).toHaveLength(2);
    expect(pdf.items[0].amountMinor).toBe(-2990n);
  });

  it("parses pdf.js layout with id, valor and saldo each on separate lines", () => {
    const text = [
      "EXTRATO DE CONTA",
      "DETALHE DOS MOVIMENTOS",
      "01-08-2026",
      "Pagamento GOOGLE BRASIL",
      "PAGAMENTOS LTDA.",
      "170610456591",
      "R$ -29,90",
      "R$ 459,55",
    ].join("\n");
    const pdf = parseMercadoPagoExtrato(text);
    expect(pdf.unrecognized).toEqual([]);
    expect(pdf.items).toHaveLength(1);
    expect(pdf.items[0].amountMinor).toBe(-2990n);
  });

  it("parses pdf.js column order with amounts before operation id", () => {
    const text = [
      "EXTRATO DE CONTA",
      "DETALHE DOS MOVIMENTOS",
      "01-08-2026",
      "Pagamento GOOGLE BRASIL",
      "PAGAMENTOS LTDA.",
      "R$ -29,90",
      "R$ 459,55",
      "170610456591",
    ].join("\n");
    const pdf = parseMercadoPagoExtrato(text);
    expect(pdf.unrecognized).toEqual([]);
    expect(pdf.items).toHaveLength(1);
    expect(pdf.items[0]).toMatchObject({
      description: "Pagamento GOOGLE BRASIL PAGAMENTOS LTDA.",
      amountMinor: -2990n,
      externalId: "170610456591",
    });
  });

  it("parses full fixture with valor/saldo split across lines", () => {
    const raw = readFileSync(resolve("tests/fixtures/mercado-pago-extrato-raw.txt"), "utf8");
    const split = raw.replace(/^(\d{10,}) (R\$ \S+(?: \S+)?) (R\$ \S+)$/gm, "$1\n$2\n$3");
    const pdf = parseMercadoPagoExtrato(split);
    expect(pdf.items.length).toBe(92);
    expect(pdf.unrecognized.length).toBe(0);
  });
});
