import { describe, expect, it } from "vitest";
import {
  allocateToCategories,
  REFERENCE_PERCENTS,
  defaultGroupForCategory,
  diagnoseCurrentDistribution,
  recommendOrganization,
} from "@/domain/organization";

describe("Organization", () => {
  it("maps seed categories to groups", () => {
    expect(defaultGroupForCategory("Mercado")).toBe("fixed");
    expect(defaultGroupForCategory("Moradia")).toBe("fixed");
    expect(defaultGroupForCategory("Lazer")).toBe("pleasure");
    expect(defaultGroupForCategory("Educação")).toBe("knowledge");
    expect(defaultGroupForCategory("Assinaturas")).toBe("comfort");
  });

  it("recommends six slices from salary with emergency diverted from invest", () => {
    const income = 1_000_000; // R$ 10.000,00
    const rec = recommendOrganization({
      incomeMinor: income,
      currentReserveMinor: 0,
      targetMonths: 6,
    });

    expect(rec.insufficient).toBe(false);
    expect(rec.slices).toHaveLength(7);

    const byGroup = Object.fromEntries(rec.slices.map((s) => [s.group, s.amountMinor]));
    expect(byGroup.fixed).toBe(Math.round((income * REFERENCE_PERCENTS.fixed) / 100));
    // Sem reserva: emergencial tira de invest
    expect(byGroup.emergency).toBeGreaterThan(0);
    expect(byGroup.invest).toBeLessThan(Math.round((income * REFERENCE_PERCENTS.invest) / 100));

    const total = rec.slices.reduce((a, s) => a + s.amountMinor, 0);
    expect(total).toBe(income);
    expect(rec.emergency.targetReserveMinor).toBe(byGroup.fixed! * 6);
  });

  it("anchors fixed costs when observed exceeds 30%", () => {
    const income = 1_000_000;
    const rec = recommendOrganization({
      incomeMinor: income,
      observedFixedMinor: 450_000,
      currentReserveMinor: 450_000 * 6,
      targetMonths: 6,
    });
    const fixed = rec.slices.find((s) => s.group === "fixed")!;
    expect(fixed.amountMinor).toBe(450_000);
    expect(rec.emergency.monthlyContributionMinor).toBe(0);
    expect(rec.slices.reduce((a, s) => a + s.amountMinor, 0)).toBe(income);
  });

  it("marks insufficient when fixed costs exceed income", () => {
    const rec = recommendOrganization({
      incomeMinor: 100_000,
      observedFixedMinor: 150_000,
    });
    expect(rec.insufficient).toBe(true);
    expect(rec.deficitMinor).toBe(50_000);
    expect(rec.slices.find((s) => s.group === "invest")!.amountMinor).toBe(0);
  });

  it("allocates category limits by weight without losing cents", () => {
    const parts = allocateToCategories(10_000, [
      { id: "a", weightMinor: 7000 },
      { id: "b", weightMinor: 3000 },
    ]);
    expect(parts.map((p) => p.limitMinor)).toEqual([7000, 3000]);
    expect(parts.reduce((a, p) => a + p.limitMinor, 0)).toBe(10_000);
  });

  it("allocates equally when weights are zero", () => {
    const parts = allocateToCategories(100, [
      { id: "a", weightMinor: 0 },
      { id: "b", weightMinor: 0 },
    ]);
    expect(parts.reduce((a, p) => a + p.limitMinor, 0)).toBe(100);
  });

  it("diagnoses current distribution percents vs salary", () => {
    const rows = diagnoseCurrentDistribution({
      incomeMinor: 1_000_000,
      spentByGroup: { fixed: 300_000, comfort: 100_000 },
      goalsContributedMinor: 50_000,
      investedMinor: 200_000,
      emergencyContributedMinor: 0,
    });
    expect(rows.find((r) => r.group === "fixed")!.actualPercent).toBe(30);
    expect(rows.find((r) => r.group === "invest")!.actualPercent).toBe(20);
  });
});
