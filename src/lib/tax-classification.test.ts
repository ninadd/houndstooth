import { describe, expect, it } from "vitest";
import {
  classifyTaxTreatment,
  effectiveTaxTreatment,
  isDebtType,
} from "./tax-classification";

describe("classifyTaxTreatment", () => {
  it("classifies retirement & education accounts as tax-advantaged", () => {
    expect(classifyTaxTreatment("investment", "401k")).toBe("tax_advantaged");
    expect(classifyTaxTreatment("investment", "ira")).toBe("tax_advantaged");
    expect(classifyTaxTreatment("investment", "roth")).toBe("tax_advantaged");
    expect(classifyTaxTreatment("investment", "roth 401k")).toBe(
      "tax_advantaged",
    );
    expect(classifyTaxTreatment("investment", "529")).toBe("tax_advantaged");
    expect(classifyTaxTreatment("investment", "hsa")).toBe("tax_advantaged");
  });

  it("classifies brokerage & depository accounts as taxable", () => {
    expect(classifyTaxTreatment("investment", "brokerage")).toBe("taxable");
    expect(classifyTaxTreatment("depository", "checking")).toBe("taxable");
    expect(classifyTaxTreatment("depository", "savings")).toBe("taxable");
    expect(classifyTaxTreatment("investment", "mutual fund")).toBe("taxable");
  });

  it("is case- and whitespace-insensitive", () => {
    expect(classifyTaxTreatment("investment", "  Roth 401k ")).toBe(
      "tax_advantaged",
    );
    expect(classifyTaxTreatment("INVESTMENT", "SEP IRA")).toBe("tax_advantaged");
  });

  it("matches SnapTrade free-form raw_type labels via keyword tokens", () => {
    expect(classifyTaxTreatment("investment", "Roth IRA")).toBe(
      "tax_advantaged",
    );
    expect(classifyTaxTreatment("investment", "Traditional 401k")).toBe(
      "tax_advantaged",
    );
    expect(classifyTaxTreatment("investment", "Rollover IRA")).toBe(
      "tax_advantaged",
    );
    expect(classifyTaxTreatment("investment", "Individual")).toBe("taxable");
    expect(classifyTaxTreatment("investment", "Joint Taxable")).toBe("taxable");
  });

  it("reads the account name when the subtype is generic (Schwab via SnapTrade)", () => {
    // raw_type "investmentAccount" is generic; the signal is in the name.
    expect(
      classifyTaxTreatment("investment", "investmentAccount", "Roth Contributory IRA"),
    ).toBe("tax_advantaged");
    expect(
      classifyTaxTreatment("investment", "investmentAccount", "Rollover IRA"),
    ).toBe("tax_advantaged");
    expect(
      classifyTaxTreatment("investment", "investmentAccount", "Community Property"),
    ).toBe("taxable");
  });

  it("defaults unknown/null subtypes to taxable", () => {
    expect(classifyTaxTreatment("investment", null)).toBe("taxable");
    expect(classifyTaxTreatment(null, undefined)).toBe("taxable");
    expect(classifyTaxTreatment("investment", "something-new")).toBe("taxable");
  });
});

describe("effectiveTaxTreatment", () => {
  it("honors a user override over the auto classification", () => {
    expect(
      effectiveTaxTreatment({
        type: "investment",
        subtype: "brokerage",
        tax_treatment_override: "tax_advantaged",
      }),
    ).toBe("tax_advantaged");
  });

  it("falls back to auto classification when no override", () => {
    expect(
      effectiveTaxTreatment({ type: "investment", subtype: "401k" }),
    ).toBe("tax_advantaged");
  });
});

describe("isDebtType", () => {
  it("flags loan and credit types as debt", () => {
    expect(isDebtType("loan")).toBe(true);
    expect(isDebtType("credit")).toBe(true);
    expect(isDebtType("depository")).toBe(false);
    expect(isDebtType("investment")).toBe(false);
  });
});
