import { describe, it, expect } from "vitest";
import type { Account, Position } from "snaptrade-typescript-sdk";
import { mapAccount, mapSecurity, mapHolding } from "./adapter";

describe("SnapTrade adapter mapping", () => {
  it("reconstructs cost basis from units × average_purchase_price", () => {
    const pos = {
      symbol: {
        symbol: {
          id: "s1",
          symbol: "VTI",
          description: "Vanguard Total Stock Market ETF",
          type: { code: "et" },
          currency: { code: "USD" },
        },
      },
      units: 10,
      price: 250,
      average_purchase_price: 200, // per-share cost basis
      cash_equivalent: false,
    } as unknown as Position;

    const h = mapHolding("acct-1", pos)!;
    expect(h.quantity).toBe(10);
    expect(h.costBasis).toBe(2000); // 10 × 200
    expect(h.institutionValue).toBe(2500); // 10 × 250
    expect(h.securityExternalId).toBe("s1");
  });

  it("flags LOC accounts as debt and lowercases the category", () => {
    const loc = {
      id: "a1",
      name: "HELOC",
      number: "11112222",
      account_category: "LOC",
      balance: { total: { amount: -5000, currency: "USD" } },
    } as unknown as Account;

    const acct = mapAccount(loc);
    expect(acct.isDebt).toBe(true);
    expect(acct.type).toBe("loc");
    expect(acct.mask).toBe("2222");
  });

  it("carries raw_type into subtype for tax classification", () => {
    const inv = {
      id: "a2",
      name: "Retirement",
      number: "9999",
      account_category: "INVESTMENT",
      raw_type: "Roth IRA",
      balance: { total: { amount: 1000, currency: "USD" } },
    } as unknown as Account;

    const acct = mapAccount(inv);
    expect(acct.isDebt).toBe(false);
    expect(acct.type).toBe("investment");
    expect(acct.subtype).toBe("Roth IRA");
  });

  it("reads security identity from the nested universal symbol", () => {
    const pos = {
      symbol: {
        symbol: {
          id: "s2",
          symbol: "AAPL",
          description: "Apple Inc",
          type: { code: "cs" },
          currency: { code: "USD" },
        },
      },
      price: 190,
      cash_equivalent: false,
    } as unknown as Position;

    const sec = mapSecurity(pos)!;
    expect(sec.ticker).toBe("AAPL");
    expect(sec.name).toBe("Apple Inc");
    expect(sec.securityType).toBe("cs");
    expect(sec.isCashEquivalent).toBe(false);
  });

  it("returns null when a position has no resolvable symbol", () => {
    const pos = { units: 5, price: 10 } as unknown as Position;
    expect(mapSecurity(pos)).toBeNull();
    expect(mapHolding("acct-1", pos)).toBeNull();
  });
});
