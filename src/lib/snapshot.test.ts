import { describe, expect, it } from "vitest";
import {
  computeNetWorth,
  type SnapshotAccount,
  type SnapshotManualAsset,
} from "./snapshot";

const acct = (o: Partial<SnapshotAccount>): SnapshotAccount => ({
  current_balance: 0,
  is_debt: false,
  type: "investment",
  subtype: "brokerage",
  tax_treatment: "taxable",
  tax_treatment_override: null,
  ...o,
});

const manual = (o: Partial<SnapshotManualAsset>): SnapshotManualAsset => ({
  value: 0,
  is_debt: false,
  asset_class: "other",
  tax_treatment: "taxable",
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
    ];
    const manualAssets: SnapshotManualAsset[] = [
      manual({ value: 600_000, asset_class: "real_estate" }), // home
      manual({ value: 30_000, asset_class: "529", tax_treatment: "tax_advantaged" }),
      manual({ value: 400_000, is_debt: true }), // mortgage
    ];

    const f = computeNetWorth(accounts, manualAssets);

    expect(f.total_assets).toBe(1_000_000); // 100k+250k+20k+600k+30k
    expect(f.total_debts).toBe(405_000); // 5k card + 400k mortgage
    expect(f.net_worth).toBe(595_000);
    expect(f.home_value).toBe(600_000);
    expect(f.investable_assets).toBe(400_000); // 1,000,000 − 600,000
    expect(f.tax_advantaged_total).toBe(280_000); // 250k + 30k
    expect(f.taxable_total).toBe(120_000); // 100k + 20k
    // Invariant: taxable + tax_advantaged === investable_assets
    expect(f.taxable_total + f.tax_advantaged_total).toBe(f.investable_assets);
  });

  it("respects a per-account tax override", () => {
    const f = computeNetWorth(
      [
        acct({
          current_balance: 50_000,
          subtype: "brokerage",
          tax_treatment: "taxable",
          tax_treatment_override: "tax_advantaged",
        }),
      ],
      [],
    );
    expect(f.tax_advantaged_total).toBe(50_000);
    expect(f.taxable_total).toBe(0);
  });

  it("handles an empty portfolio", () => {
    const f = computeNetWorth([], []);
    expect(f.net_worth).toBe(0);
    expect(f.investable_assets).toBe(0);
  });

  it("treats null balances as zero", () => {
    const f = computeNetWorth([acct({ current_balance: null })], []);
    expect(f.total_assets).toBe(0);
  });
});
