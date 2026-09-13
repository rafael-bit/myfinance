export type CardCycleInput = {
  closingDay: number;
  dueDay: number;
  asOf: string;
};

export type InvoicePeriod = {
  periodStart: string;
  periodEnd: string;
  closingDate: string;
  dueDate: string;
};

function dateWithDay(year: number, month: number, day: number): string {
  const last = new Date(year, month, 0).getDate();
  const clamped = Math.min(day, last);
  return `${year}-${String(month).padStart(2, "0")}-${String(clamped).padStart(2, "0")}`;
}

export function invoicePeriodFor(input: CardCycleInput): InvoicePeriod {
  const asOf = new Date(`${input.asOf}T00:00:00`);
  const year = asOf.getFullYear();
  const month = asOf.getMonth() + 1;
  const day = asOf.getDate();

  let closeYear = year;
  let closeMonth = month;
  if (day > input.closingDay) {
    closeMonth += 1;
    if (closeMonth > 12) {
      closeMonth = 1;
      closeYear += 1;
    }
  }

  const closingDate = dateWithDay(closeYear, closeMonth, input.closingDay);
  let startMonth = closeMonth - 1;
  let startYear = closeYear;
  if (startMonth < 1) {
    startMonth = 12;
    startYear -= 1;
  }
  const periodStart = dateWithDay(startYear, startMonth, input.closingDay + 1);
  const periodEnd = closingDate;

  let dueMonth = closeMonth;
  let dueYear = closeYear;
  if (input.dueDay <= input.closingDay) {
    dueMonth += 1;
    if (dueMonth > 12) {
      dueMonth = 1;
      dueYear += 1;
    }
  }
  const dueDate = dateWithDay(dueYear, dueMonth, input.dueDay);

  return { periodStart, periodEnd, closingDate, dueDate };
}

export function availableLimit(limitMinor: bigint, usedMinor: bigint): bigint {
  return limitMinor - usedMinor;
}

export function invoiceStatus(params: {
  closed: boolean;
  totalMinor: bigint;
  paidMinor: bigint;
}): "open" | "closed" | "paid" | "partial" {
  if (!params.closed) return "open";
  if (params.paidMinor <= 0n) return "closed";
  if (params.paidMinor >= params.totalMinor) return "paid";
  return "partial";
}
