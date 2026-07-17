import { describe, expect, it } from "vitest";
import { matchSector } from "./gemini";

describe("matchSector", () => {
  it("accepts exact allowlist matches", () => {
    expect(matchSector("Information Technology")).toBe("Information Technology");
    expect(matchSector("Broad ETF")).toBe("Broad ETF");
  });

  it("normalizes case and whitespace", () => {
    expect(matchSector("  health care ")).toBe("Health Care");
    expect(matchSector("BOND ETF")).toBe("Bond ETF");
  });

  it("discards sectors outside the allowlist", () => {
    expect(matchSector("Technology")).toBeNull();
    expect(matchSector("")).toBeNull();
    expect(matchSector("Growth")).toBeNull();
  });
});
