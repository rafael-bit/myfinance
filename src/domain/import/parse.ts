export type ParsedMovement = {
  date: string;
  description: string;
  amountMinor: bigint;
  type: "income" | "expense" | "transfer" | "unknown";
  externalId?: string;
  institution?: string;
  recognized?: boolean;
};

export type PdfParseResult = {
  items: ParsedMovement[];
  unrecognized: string[];
};

export type ImportSource = "csv" | "ofx" | "pdf";

export type CategorizationRule = {
  pattern: string;
  matchType: "contains" | "exact" | "regex";
  categoryId: string;
  payee?: string;
};

export function normalizeDescription(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

export function applyRules(description: string, rules: CategorizationRule[]): CategorizationRule | undefined {
  const normalized = normalizeDescription(description);
  const sorted = [...rules].sort((a, b) => b.pattern.length - a.pattern.length);
  return sorted.find((rule) => {
    const pattern = normalizeDescription(rule.pattern);
    if (rule.matchType === "exact") return normalized === pattern;
    if (rule.matchType === "contains") return normalized.includes(pattern);
    try {
      return new RegExp(rule.pattern, "i").test(description);
    } catch {
      return false;
    }
  });
}

export function learnRule(description: string, categoryId: string): CategorizationRule {
  const token = normalizeDescription(description).split(" ")[0] ?? description;
  return { pattern: token, matchType: "contains", categoryId };
}

export function detectDuplicates(
  item: ParsedMovement,
  existing: ParsedMovement[],
): ParsedMovement[] {
  const desc = normalizeDescription(item.description);
  return existing.filter((candidate) => {
    if (item.externalId && candidate.externalId && item.externalId === candidate.externalId) return true;
    const sameAmount = candidate.amountMinor === item.amountMinor;
    const sameDesc = normalizeDescription(candidate.description) === desc;
    const dateDiff = Math.abs(Date.parse(candidate.date) - Date.parse(item.date)) / 86_400_000;
    return sameAmount && sameDesc && dateDiff <= 1;
  });
}

export function detectImportSource(fileName: string, text: string): ImportSource {
  const name = fileName.toLowerCase();
  if (name.endsWith(".ofx") || name.endsWith(".ofc") || text.includes("OFXHEADER")) return "ofx";
  if (name.endsWith(".pdf") || text.startsWith("%PDF")) return "pdf";
  return "csv";
}

export function looksLikeTransfer(description: string): boolean {
  return /\b(pix|ted|doc|transf|resgate|aplicac|aplicação|investimento)\b/i.test(normalizeDescription(description));
}

export function parseCsv(text: string): ParsedMovement[] {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((l) => l.trim());
  if (lines.length === 0) return [];
  const delimiter = detectDelimiter(lines[0]);
  const firstCells = splitCsvLine(lines[0], delimiter);
  const headerLike = firstCells.some((cell) => /data|date|desc|histor|valor|amount|credit|debit|entrada|saida|saída|credito|debito/i.test(normalizeDescription(cell)));
  const headerRow = headerLike ? firstCells.map((h) => normalizeDescription(h).toLowerCase()) : [];
  const body = headerLike ? lines.slice(1) : lines;
  const idx = findCsvColumns(headerRow);

  if (idx.date < 0 || idx.desc < 0 || (idx.amount < 0 && idx.credit < 0 && idx.debit < 0)) {
    throw new Error("CSV precisa das colunas data, descrição e valor (ou crédito/débito)");
  }

  return body.flatMap((line) => {
    const cols = splitCsvLine(line, delimiter);
    if (cols.every((c) => !c.trim())) return [];
    const date = normalizeDate(cols[idx.date] ?? "");
    const description = (cols[idx.desc] ?? "").trim();
    if (!date || !description) return [];

    let amount = 0n;
    if (idx.credit >= 0 || idx.debit >= 0) {
      const credit = idx.credit >= 0 ? parseAmount(cols[idx.credit] ?? "") : 0n;
      const debit = idx.debit >= 0 ? parseAmount(cols[idx.debit] ?? "") : 0n;
      if (credit === 0n && debit === 0n) return [];
      amount = credit !== 0n ? absAmount(credit) : -absAmount(debit);
    } else {
      amount = parseAmount(cols[idx.amount] ?? "0");
    }
    if (amount === 0n) return [];

    const typed = idx.type >= 0 ? parseTypeHint(cols[idx.type] ?? "") : undefined;
    const type = resolveType(description, amount, typed);
    const externalId = idx.id >= 0 ? (cols[idx.id]?.trim() || undefined) : undefined;

    return [{
      date,
      description,
      amountMinor: signedAmountForType(amount, type),
      type,
      externalId,
      recognized: true,
    }];
  });
}

function findCsvColumns(header: string[]) {
  const find = (re: RegExp, exclude?: RegExp) =>
    header.findIndex((h) => re.test(h) && !exclude?.test(h));
  return {
    date: find(/data|date|^dt$|dt_?lanc/),
    desc: find(/desc|histor|memo|titulo|título|lan[cç]amento|detalhe|estabelecimento|origem|destino/),
    amount: find(/valor|amount|value|quantia/, /credit|debit|entrada|sa[ií]da/),
    credit: find(/cr[eé]dito|^c$|entrada(?!s)/),
    debit: find(/d[eé]bito|^d$|sa[ií]da/),
    type: find(/^tipo$|natureza|operacao|operação|dc/),
    id: find(/fitid|documento|identificador|id_?trans|n[uú]mero|protocolo/),
  };
}

function parseTypeHint(raw: string): ParsedMovement["type"] | undefined {
  const value = normalizeDescription(raw);
  if (!value) return undefined;
  if (/^(C|CR|CREDITO|ENTRADA|INCOME|CREDIT)$/.test(value) || value.includes("CREDITO") || value.includes("ENTRADA")) return "income";
  if (/^(D|DB|DEBITO|SAIDA|EXPENSE|DEBIT)$/.test(value) || value.includes("DEBITO") || value.includes("SAIDA")) return "expense";
  if (/TRANSF|XFER|TED|DOC|PIX/.test(value)) return "transfer";
  return undefined;
}

function resolveType(_description: string, amount: bigint, hint?: ParsedMovement["type"]): ParsedMovement["type"] {
  // Explicit column hint wins (crédito/débito/tipo).
  if (hint) return hint;
  // Bank statements: minus = saída, no sign = entrada.
  return amount < 0n ? "expense" : "income";
}

function signedAmountForType(amount: bigint, type: ParsedMovement["type"]): bigint {
  const abs = absAmount(amount);
  if (type === "expense") return -abs;
  if (type === "income") return abs;
  return amount;
}

function absAmount(value: bigint): bigint {
  return value < 0n ? -value : value;
}

function detectDelimiter(header: string): string {
  if (header.includes(";")) return ";";
  if (header.includes("\t")) return "\t";
  return ",";
}

function splitCsvLine(line: string, delimiter = ","): string[] {
  const result: string[] = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      quoted = !quoted;
      continue;
    }
    if (ch === delimiter && !quoted) {
      result.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  result.push(current.trim());
  return result;
}

/** Unicode/ASCII minus signs used by PicPay, Mercado Pago, Nubank exports. */
const MINUS_SIGNS = /[\u2212\u2013\u2014−-]/;

function isNegativeAmount(raw: string): boolean {
  const trimmed = raw.trim();
  if (/^\+/.test(trimmed)) return false;
  if (MINUS_SIGNS.test(trimmed)) return true;
  if (/^\(.*\)$/.test(trimmed)) return true;
  if (/^(D|DB|DEBITO)\b/i.test(trimmed)) return true;
  if (/\b(D|DB|DEBITO)\s*$/i.test(trimmed)) return true;
  return false;
}

export function parseAmount(raw: string): bigint {
  const trimmed = raw.trim();
  if (!trimmed || trimmed === "-" || trimmed === "—" || trimmed === "−") return 0n;
  const negative = isNegativeAmount(trimmed);
  const cleaned = trimmed
    .replace(/[()\sR$r$A-Za-z]/g, "")
    .replace(/[\u2212\u2013\u2014−+\-]/g, "");
  if (!cleaned) return 0n;
  const normalized =
    cleaned.includes(",") && cleaned.includes(".")
      ? cleaned.replace(/\./g, "").replace(",", ".")
      : cleaned.includes(",") && !cleaned.includes(".")
        ? cleaned.replace(",", ".")
        : cleaned;
  const [whole, frac = "00"] = normalized.split(".");
  const digits = (whole || "0").replace(/[^\d]/g, "");
  if (!digits) return 0n;
  const minor = BigInt(digits) * 100n + BigInt((frac.replace(/\D/g, "") + "00").slice(0, 2));
  return negative ? -minor : minor;
}

export function normalizeDate(raw: string): string {
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const brDash = raw.match(/^(\d{2})-(\d{2})-(\d{4})/);
  if (brDash) return `${brDash[3]}-${brDash[2]}-${brDash[1]}`;
  const br = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  const brShort = raw.match(/^(\d{2})\/(\d{2})\/(\d{2})(?!\d)/);
  if (brShort) {
    const year = Number(brShort[3]) >= 70 ? `19${brShort[3]}` : `20${brShort[3]}`;
    return `${year}-${brShort[2]}-${brShort[1]}`;
  }
  return raw.slice(0, 10);
}

export function parseOfx(text: string): ParsedMovement[] {
  const sgml = text.replace(/<(TRNAMT|DTPOSTED|MEMO|FITID|TRNTYPE)>([^<\r\n]+)/gi, "<$1>$2</$1>");
  const blocks = sgml.split(/<STMTTRN>/i).slice(1);
  return blocks.map((block) => {
    const amountRaw = tag(block, "TRNAMT");
    const amount = parseAmount(amountRaw.replace(".", ","));
    const posted = tag(block, "DTPOSTED").slice(0, 8);
    const date = posted.length === 8 ? `${posted.slice(0, 4)}-${posted.slice(4, 6)}-${posted.slice(6, 8)}` : posted;
    const typeRaw = tag(block, "TRNTYPE").toUpperCase();
    const description = tag(block, "MEMO") || tag(block, "NAME");
    const hint = typeRaw.includes("XFER") || typeRaw.includes("TRANSFER")
      ? "transfer" as const
      : typeRaw.includes("CREDIT") || typeRaw.includes("DEP")
        ? "income" as const
        : typeRaw.includes("DEBIT") || typeRaw.includes("PAYMENT") || typeRaw.includes("ATM") || typeRaw.includes("POS") || typeRaw.includes("CHECK")
          ? "expense" as const
          : undefined;
    const type = resolveType(description, amount, hint);
    return {
      date,
      description,
      amountMinor: signedAmountForType(amount, type),
      type,
      externalId: tag(block, "FITID") || undefined,
      recognized: true,
    };
  });
}

export function parsePdfText(text: string): PdfParseResult {
  if (isMercadoPagoExtrato(text)) {
    return parseMercadoPagoExtrato(text);
  }

  const items: ParsedMovement[] = [];
  const unrecognized: string[] = [];
  const dateRe = /(\d{2}\/\d{2}\/\d{2,4}|\d{2}-\d{2}-\d{4}|\d{4}-\d{2}-\d{2})/;
  const amountRe = /([+-]?\(?\s*(?:R\$)?\s*-?[\d.]{1,3}(?:\.[\d]{3})*,\d{2}\s*\)?|[+-]?\d+[.,]\d{2})\s*$/;

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\s+/g, " ").trim();
    if (!line || line.length < 6) continue;
    const dateMatch = line.match(dateRe);
    const amountMatch = line.match(amountRe);
    if (dateMatch && amountMatch && dateMatch.index !== undefined) {
      const amountToken = amountMatch[1];
      const date = normalizeDate(dateMatch[1]);
      const start = dateMatch.index + dateMatch[0].length;
      const end = line.lastIndexOf(amountToken);
      const description = line.slice(start, end).replace(/^[\s\-–—.|]+|[\s\-–—.|]+$/g, "").trim();
      const amount = parseAmount(amountToken);
      if (!description || amount === 0n || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        unrecognized.push(line);
        continue;
      }
      const type = resolveType(description, amount);
      items.push({
        date,
        description,
        amountMinor: signedAmountForType(amount, type),
        type,
        recognized: true,
      });
      continue;
    }
    if (dateRe.test(line) && /[\d.,]{3,}/.test(line)) unrecognized.push(line);
  }

  return { items, unrecognized };
}

/** Mercado Pago / similar "EXTRATO DE CONTA" with columns Data, Descrição, ID, Valor, Saldo. */
export function isMercadoPagoExtrato(text: string): boolean {
  const normalized = text.normalize("NFD").replace(/\p{M}/gu, "").toUpperCase();
  if (normalized.includes("EXTRATO DE CONTA")) {
    return (
      normalized.includes("ID DA OPERACAO") ||
      /ID DA OPERA/i.test(normalized) ||
      normalized.includes("DETALHE DOS MOVIMENTOS")
    );
  }
  const blocks = groupMercadoPagoBlocks(text);
  if (blocks.length < 5) return false;
  const parsed = blocks.filter((block) => parseMercadoPagoBlock(block));
  return parsed.length >= Math.min(blocks.length, 5);
}

const MP_BLOCK_DATE = /^(\d{2}-\d{2}-\d{4})\b/;
/** R$ amounts in Mercado Pago PDFs (ASCII or unicode minus, optional +). */
const MP_MONEY = /R\$\s*(?:\+|[\u2212\u2013\u2014−-])?\s*[\d.]+,\d{2}/;

function normalizeMercadoPagoLine(line: string): string {
  return line
    .replace(/[\u2013\u2014\u2212]/g, "-")
    .replace(/([^\d\s])(\d{10,})/g, "$1 $2");
}

function isMercadoPagoSkipLine(line: string): boolean {
  if (/^\d+\/\d+$/.test(line)) return true;
  if (/^Data\b/i.test(line) && /Valor/i.test(line)) return true;
  if (/^(EXTRATO DE CONTA|DETALHE DOS MOVIMENTOS|Saldo inicial|Saldo final|Entradas|Saidas|Saídas|Periodo|Período|CPF|Ag[eê]ncia|Titular)/i.test(line)) {
    return true;
  }
  return false;
}

function groupMercadoPagoBlocks(text: string): string[] {
  const blocks: string[] = [];
  let current: string[] = [];

  for (const raw of text.split(/\r?\n/)) {
    const line = normalizeMercadoPagoLine(raw.replace(/\s+/g, " ").trim());
    if (!line || isMercadoPagoSkipLine(line)) continue;

    if (MP_BLOCK_DATE.test(line)) {
      if (current.length) blocks.push(current.join(" "));
      current = [line];
      continue;
    }
    if (current.length) current.push(line);
  }
  if (current.length) blocks.push(current.join(" "));
  return blocks;
}

function parseMercadoPagoBlock(block: string): ParsedMovement | null {
  const dateMatch = block.match(/^(\d{2}-\d{2}-\d{4})\s*(.*)$/);
  if (!dateMatch) return null;

  const dateRaw = dateMatch[1];
  const rest = dateMatch[2].trim();
  if (!rest) return null;

  const moneyRe = new RegExp(MP_MONEY.source, "g");
  const monies = [...rest.matchAll(moneyRe)];
  if (!monies.length) return null;

  const valorMatch = monies.length >= 2 ? monies[monies.length - 2] : monies[monies.length - 1];
  const valorRaw = valorMatch[0];
  const valorStart = valorMatch.index ?? rest.length;

  const ids = [...rest.matchAll(/\d{10,}/g)];
  if (!ids.length) return null;

  let externalId = "";
  for (const match of ids) {
    if ((match.index ?? 0) < valorStart) externalId = match[0];
  }
  if (!externalId) externalId = ids[ids.length - 1][0];

  const idBeforeValor = [...ids].reverse().find((match) => (match.index ?? 0) < valorStart);
  let description = idBeforeValor
    ? rest.slice(0, idBeforeValor.index).trim()
    : rest.slice(0, monies[0].index ?? rest.length).trim();
  description = description.replace(/\s*\d{10,}\s*$/, "").trim();

  const date = normalizeDate(dateRaw);
  const amount = parseAmount(valorRaw);
  if (!description || amount === 0n || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;

  const type = resolveType(description, amount);
  return {
    date,
    description,
    amountMinor: signedAmountForType(amount, type),
    type,
    externalId,
    institution: "Mercado Pago",
    recognized: true,
  };
}

export function parseMercadoPagoExtrato(text: string): PdfParseResult {
  const items: ParsedMovement[] = [];
  const unrecognized: string[] = [];

  for (const block of groupMercadoPagoBlocks(text)) {
    const parsed = parseMercadoPagoBlock(block);
    if (parsed) {
      items.push(parsed);
      continue;
    }
    unrecognized.push(block);
  }

  return { items, unrecognized };
}

function tag(block: string, name: string): string {
  const match = block.match(new RegExp(`<${name}>([^<]*)`, "i"));
  return match?.[1]?.trim() ?? "";
}
