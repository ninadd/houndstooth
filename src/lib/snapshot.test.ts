import { describe, expect, it } from "vitest";
import { computeNetWorth, type SnapshotAccount } from "./snapshot";

const acct = (o: Partial<SnapshotAccount>): SnapshotAccount => ({
  current_balance: 0,
  is_debt: false,
  type: "investment",
  subtype: "brokerage",
  tax_treatment: "taxable",
  tax_treatment_override: null,
  manual_category: null,
  ...o,
});

describe("computeNetWorth", () => {
  it("computes net worth, investable assets and the tax split", () => {
    const accounts: SnapshotAccount[] = [
      acct({ current_balance: 100_000, tax_treatment: "taxable" }), // brokerage
      acct({
        current_balance: 250_000,
        subtype: "401k",
        tax_treatment: "tax_advantaged",
      }),
      acct({ current_balance: 20_000, type: "depository", subtype: "checking" }),
      acct({
        current_balance: 5_000,
        type: "credit",
        subtype: "credit card",
        is_debt: true,
      }),
      acct({
        current_balance: 600_000,
        manual_category: "property",
        is_debt: false,
      }), // manual home
      acct({
        current_balance: 30_000,
        manual_category: "investment",
      }), // manual investment, defaults to taxable
      acct({
        current_balance: 400_000,
        manual_category: "debt",
        is_debt: true,
      }), // manual mortgage
    ];

    const f = computeNetWorth(accounts);

    expect(f.total_assets).toBe(1_000_000); // 100k+250k+20k+600k+30k
    expect(f.total_debts).toBe(405_000); // 5k card + 400k mortgage
    expect(f.net_worth).toBe(595_000);
    expect(f.home_value).toBe(600_000);
    expect(f.investable_assets).toBe(400_000); // 1,000,000 − 600,000
    expect(f.tax_advantaged_total).toBe(250_000);
    expect(f.taxable_total).toBe(150_000); // 100k + 20k + 30k manual investment
    // Invariant: taxable + tax_advantaged === investable_assets
    expect(f.taxable_total + f.tax_advantaged_total).toBe(f.investable_assets);
  });

  it("respects a per-account tax override", () => {
    const f = computeNetWorth([
      acct({
        current_balance: 50_000,
        subtype: "brokerage",
        tax_treatment: "taxable",
        tax_treatment_override: "tax_advantaged",
      }),
    ]);
    expect(f.tax_advantaged_total).toBe(50_000);
    expect(f.taxable_total).toBe(0);
  });

  it("keeps a manual investment taxable even if its label looks tax-advantaged", () => {
    const f = computeNetWorth([
      acct({
        current_balance: 30_000,
        manual_category: "investment",
        name: "Roth IRA (Solium)",
        type: null,
        subtype: null,
      }),
    ]);
    expect(f.tax_advantaged_total).toBe(0);
    expect(f.taxable_total).toBe(30_000);
  });

  it("respects an explicit tax-advantaged choice on a manual investment", () => {
    const f = computeNetWorth([
      acct({
        current_balance: 30_000,
        manual_category: "investment",
        tax_treatment: "tax_advantaged",
        type: null,
        subtype: null,
      }),
    ]);
    expect(f.tax_advantaged_total).toBe(30_000);
    expect(f.taxable_total).toBe(0);
  });

  it("treats a debt's balance as a positive magnitude regardless of sign", () => {
    // Some brokerages report a credit card's current_balance as negative
    // (e.g. SnapTrade). The UI always displays debts as a positive amount
    // owed, so the total must too — a negative balance must not subtract.
    const f = computeNetWorth([
      acct({ current_balance: 248_430, manual_category: "debt", is_debt: true }),
      acct({ current_balance: -292.25, type: "credit", subtype: "credit card", is_debt: true }),
    ]);
    expect(f.total_debts).toBe(248_722.25);
  });

  it("handles an empty portfolio", () => {
    const f = computeNetWorth([]);
    expect(f.net_worth).toBe(0);
    expect(f.investable_assets).toBe(0);
  });

  it("treats null balances as zero", () => {
    const f = computeNetWorth([acct({ current_balance: null })]);
    expect(f.total_assets).toBe(0);
  });
});
