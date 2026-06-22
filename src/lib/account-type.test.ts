import { describe, expect, it } from "vitest";
import { formatAccountType } from "./account-type";

describe("formatAccountType", () => {
  it("maps known subtypes to canonical labels", () => {
    expect(formatAccountType("investment", "401k")).toBe("401(k)");
    expect(formatAccountType("investment", "Roth IRA")).toBe("Roth IRA");
    expect(formatAccountType("investment", "sep ira")).toBe("SEP IRA");
    expect(formatAccountType("investment", "hsa")).toBe("HSA");
    expect(formatAccountType("investment", "529")).toBe("529 Plan");
    expect(formatAccountType("investment", "individual")).toBe("Individual");
    expect(formatAccountType("deposit", "checking")).toBe("Checking");
    expect(formatAccountType("loc", "credit card")).toBe("Credit card");
  });

  it("is case- and whitespace-insensitive", () => {
    expect(formatAccountType("INVESTMENT", "  Roth IRA ")).toBe("Roth IRA");
    expect(formatAccountType("investment", "investmentAccount")).toBe(
      "Brokerage",
    );
  });

  it("keyword-scans free-form labels and the account name", () => {
    expect(
      formatAccountType("investment", "investmentAccount", "Roth Contributory IRA"),
    ).toBe("Roth IRA");
    expect(
      formatAccountType("investment", "investmentAccount", "Rollover IRA"),
    ).toBe("Rollover IRA");
    expect(formatAccountType("investment", "Traditional 401k Plan")).toBe(
      "401(k)",
    );
  });

  it("falls back to a broad category from the coarse type", () => {
    expect(formatAccountType("investment", null)).toBe("Investments");
    expect(formatAccountType("investment", "investmentAccount", "Community Property")).toBe(
      "Brokerage",
    );
    expect(formatAccountType("deposit", null)).toBe("Cash");
    expect(formatAccountType("loc", null)).toBe("Line of credit");
    expect(formatAccountType("crypto", null)).toBe("Digital asset");
  });

  it("title-cases unknown subtypes and handles empty input", () => {
    expect(formatAccountType("something", "weird label")).toBe("Weird Label");
    expect(formatAccountType(null, null)).toBe("—");
    expect(formatAccountType(null, undefined)).toBe("—");
  });
});
