export type BudgetAlert = "ok" | "near" | "reached" | "over";
export type PaceStatus = "under" | "on_track" | "ahead";

export function budgetUsage(spentMinor: bigint, limitMinor: bigint): {
  remainingMinor: bigint;
  percent: number;
  alert: BudgetAlert;
} {
  if (limitMinor <= 0n) {
    if (spentMinor > 0n) {
      return { remainingMinor: -spentMinor, percent: 100, alert: "over" };
    }
    return { remainingMinor: 0n, percent: 0, alert: "ok" };
  }
  const remainingMinor = limitMinor - spentMinor;
  const percent = Number((spentMinor * 10_000n) / limitMinor) / 100;
  let alert: BudgetAlert = "ok";
  if (percent >= 100 && spentMinor > limitMinor) alert = "over";
  else if (percent >= 100) alert = "reached";
  else if (percent >= 80) alert = "near";
  return { remainingMinor, percent, alert };
}

/** Shift a `yyyy-MM` key by `delta` calendar months. */
export function shiftYearMonth(yearMonth: string, delta: number): string {
  const [year, month] = yearMonth.split("-").map(Number);
  const d = new Date(year, month - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Estouro do teto desconta no mês seguinte; sobra não acumula.
 * Ex.: teto total 100, gastou 120 → próximo disponível total = 80.
 * Usado no envelope global (soma das metas), não por categoria.
 */
export function nextMonthAvailable(
  standingLimitMinor: bigint,
  availableMinor: bigint,
  spentMinor: bigint,
): bigint {
  const balance = availableMinor - spentMinor;
  const debtMinor = balance < 0n ? -balance : 0n;
  const next = standingLimitMinor - debtMinor;
  return next < 0n ? 0n : next;
}

/**
 * Teto total efetivo em `yearMonth` após arrastar dívidas de meses anteriores.
 * `spentByMonth` = gasto total do mês (todas as despesas).
 */
export function effectiveBudgetLimit(params: {
  standingLimitMinor: bigint;
  yearMonth: string;
  spentByMonth: Map<string, bigint> | Record<string, number | bigint>;
  /** Primeiro mês a simular (inclusive). Default: mais antigo em spentByMonth, ou o próprio yearMonth. */
  fromMonth?: string;
}): { availableMinor: bigint; debtMinor: bigint; standingLimitMinor: bigint } {
  const standing = params.standingLimitMinor;
  if (standing <= 0n) {
    return { availableMinor: 0n, debtMinor: 0n, standingLimitMinor: standing };
  }

  const getSpent = (ym: string): bigint => {
    if (params.spentByMonth instanceof Map) return params.spentByMonth.get(ym) ?? 0n;
    const raw = params.spentByMonth[ym];
    if (raw == null) return 0n;
    return typeof raw === "bigint" ? raw : BigInt(raw);
  };

  let from = params.fromMonth;
  if (!from) {
    const keys = (
      params.spentByMonth instanceof Map ? [...params.spentByMonth.keys()] : Object.keys(params.spentByMonth)
    )
      .filter((ym) => ym < params.yearMonth)
      .sort();
    from = keys[0] ?? params.yearMonth;
  }

  let available = standing;
  for (let ym = from; ym < params.yearMonth; ym = shiftYearMonth(ym, 1)) {
    available = nextMonthAvailable(standing, available, getSpent(ym));
  }

  const debtMinor = standing > available ? standing - available : 0n;
  return { availableMinor: available, debtMinor, standingLimitMinor: standing };
}

/** How far we are through the month (1–100), for comparing spend pace vs calendar. */
export function monthElapsedPercent(yearMonth: string, todayIso = new Date().toISOString().slice(0, 10)): {
  day: number;
  daysInMonth: number;
  elapsedPercent: number;
  daysLeft: number;
} {
  const [year, month] = yearMonth.split("-").map(Number);
  const daysInMonth = new Date(year, month, 0).getDate();
  const inMonth = todayIso.startsWith(yearMonth);
  const day = inMonth ? Number(todayIso.slice(8, 10)) : todayIso < `${yearMonth}-01` ? 0 : daysInMonth;
  const elapsedPercent = daysInMonth === 0 ? 0 : Math.min(100, (day / daysInMonth) * 100);
  return { day, daysInMonth, elapsedPercent, daysLeft: Math.max(0, daysInMonth - day) };
}

/** Compare budget usage % with calendar elapsed % (±10pp = on track). */
export function budgetPace(spentPercent: number, elapsedPercent: number): PaceStatus {
  if (spentPercent <= elapsedPercent - 10) return "under";
  if (spentPercent >= elapsedPercent + 10) return "ahead";
  return "on_track";
}

export function recommendedMonthlyContribution(params: {
  targetMinor: bigint;
  currentMinor: bigint;
  monthsRemaining: number;
}): bigint {
  const remaining = params.targetMinor - params.currentMinor;
  if (remaining <= 0n) return 0n;
  const months = BigInt(Math.max(1, params.monthsRemaining));
  return (remaining + months - 1n) / months;
}

export function monthsBetween(fromIso: string, toIso: string): number {
  const [fy, fm] = fromIso.split("-").map(Number);
  const [ty, tm] = toIso.split("-").map(Number);
  return Math.max(0, (ty - fy) * 12 + (tm - fm));
}

export function goalProgress(currentMinor: bigint, targetMinor: bigint): number {
  if (targetMinor <= 0n) return 0;
  return Math.min(100, Number((currentMinor * 10_000n) / targetMinor) / 100);
}
