export type CashFlow = {
  date: string;
  amountMinor: bigint;
};

export type TwrPeriod = {
  startValueMinor: bigint;
  endValueMinor: bigint;
  flowMinor: bigint;
};

export function timeWeightedReturn(periods: TwrPeriod[]): number {
  if (periods.length === 0) return 0;
  let factor = 1;
  for (const period of periods) {
    const denom = Number(period.startValueMinor);
    if (denom === 0) continue;
    const r = Number(period.endValueMinor - period.flowMinor - period.startValueMinor) / denom;
    factor *= 1 + r;
  }
  return factor - 1;
}

export function modifiedDietz(params: {
  startValueMinor: bigint;
  endValueMinor: bigint;
  flows: { weight: number; amountMinor: bigint }[];
}): number {
  const flowSum = params.flows.reduce((acc, f) => acc + f.amountMinor, 0n);
  const weighted = params.flows.reduce((acc, f) => acc + Number(f.amountMinor) * f.weight, 0);
  const denom = Number(params.startValueMinor) + weighted;
  if (denom === 0) return 0;
  return Number(params.endValueMinor - params.startValueMinor - flowSum) / denom;
}

export function nominalReturn(costMinor: bigint, currentMinor: bigint): bigint {
  return currentMinor - costMinor;
}

export function percentReturn(costMinor: bigint, currentMinor: bigint): number {
  if (costMinor === 0n) return 0;
  return Number(((currentMinor - costMinor) * 10_000n) / costMinor) / 100;
}

export function annualize(periodReturn: number, days: number): number {
  if (days <= 0) return 0;
  return (1 + periodReturn) ** (365 / days) - 1;
}
