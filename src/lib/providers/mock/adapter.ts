import type {
  DataProvider,
  ProviderConnection,
  ProviderSnapshot,
} from "../types";

const today = () => new Date().toISOString().slice(0, 10);

/**
 * Deterministic in-memory provider. Drives offline tests and `DATA_PROVIDER=mock`
 * so the full sync path can run with no SnapTrade credentials or network. Returns
 * one taxable brokerage + one Roth IRA (tax-advantaged) with a couple of holdings.
 */
export class MockProvider implements DataProvider {
  readonly name = "mock" as const;

  async listConnections(): Promise<ProviderConnection[]> {
    return [
      { authorizationId: "mock-auth-1", institutionName: "Mock Brokerage" },
    ];
  }

  async fetchConnection(): Promise<ProviderSnapshot> {
    return {
      accounts: [
        {
          externalId: "mock-acct-taxable",
          name: "Individual Brokerage",
          officialName: "Mock Brokerage",
          type: "investment",
          subtype: "Individual",
          currentBalance: 25000,
          availableBalance: 25000,
          isoCurrency: "USD",
          mask: "1234",
          isDebt: false,
        },
        {
          externalId: "mock-acct-roth",
          name: "Roth IRA",
          officialName: "Mock Brokerage",
          type: "investment",
          subtype: "Roth IRA",
          currentBalance: 40000,
          availableBalance: 40000,
          isoCurrency: "USD",
          mask: "5678",
          isDebt: false,
        },
      ],
      securities: [
        {
          externalId: "mock-sec-vti",
          ticker: "VTI",
          name: "Vanguard Total Stock Market ETF",
          securityType: "et",
          closePrice: 250,
          closePriceAsOf: today(),
          isoCurrency: "USD",
          isCashEquivalent: false,
        },
        {
          externalId: "mock-sec-vxus",
          ticker: "VXUS",
          name: "Vanguard Total International Stock ETF",
          securityType: "et",
          closePrice: 60,
          closePriceAsOf: today(),
          isoCurrency: "USD",
          isCashEquivalent: false,
        },
      ],
      holdings: [
        {
          accountExternalId: "mock-acct-taxable",
          securityExternalId: "mock-sec-vti",
          quantity: 50,
          costBasis: 10000,
          institutionPrice: 250,
          institutionValue: 12500,
          isoCurrency: "USD",
          asOfDate: today(),
        },
        {
          accountExternalId: "mock-acct-roth",
          securityExternalId: "mock-sec-vxus",
          quantity: 200,
          costBasis: 10000,
          institutionPrice: 60,
          institutionValue: 12000,
          isoCurrency: "USD",
          asOfDate: today(),
        },
      ],
    };
  }
}
