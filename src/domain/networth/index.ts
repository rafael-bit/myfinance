export type NetWorthInput = {
  accountBalancesMinor: bigint;
  propertyValuesMinor: bigint;
  investmentMarketMinor: bigint;
  cardBalancesMinor: bigint;
  otherLiabilitiesMinor: bigint;
};

export type NetWorth = {
  grossMinor: bigint;
  debtsMinor: bigint;
  netMinor: bigint;
};

export function calculateNetWorth(input: NetWorthInput): NetWorth {
  const grossMinor = input.accountBalancesMinor + input.propertyValuesMinor + input.investmentMarketMinor;
  const debtsMinor = input.cardBalancesMinor + input.otherLiabilitiesMinor;
  return {
    grossMinor,
    debtsMinor,
    netMinor: grossMinor - debtsMinor,
  };
}
