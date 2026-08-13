import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  classifySectors,
  generateSummary,
  matchSector,
  parseClassifications,
} from "./openrouter";

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

describe("parseClassifications", () => {
  const rows = [
    { ticker: "AAPL", sector: "Information Technology" },
    { ticker: "BND", sector: "Bond ETF" },
  ];

  it("reads the schema's classifications key", () => {
    expect(parseClassifications(JSON.stringify({ classifications: rows }))).toEqual(
      rows,
    );
  });

  it("survives a provider that renames the wrapper key", () => {
    // Observed live: asked for the shape by example, the model echoed part of
    // the prompt's literal template back as the key. Any single array-valued
    // property is good enough.
    expect(parseClassifications('{" [{": [{"ticker":"AAPL","sector":"Information Technology"}]}')).toEqual(
      [rows[0]],
    );
  });

  it("accepts a bare array and strips code fences", () => {
    expect(parseClassifications("```json\n" + JSON.stringify(rows) + "\n```")).toEqual(
      rows,
    );
  });

  it("coerces missing fields to empty strings rather than throwing", () => {
    expect(parseClassifications('{"classifications":[{"ticker":"AAPL"}]}')).toEqual([
      { ticker: "AAPL", sector: "" },
    ]);
  });

  it("throws when there is no list at all", () => {
    expect(() => parseClassifications("no json here")).toThrow(
      "no classifications",
    );
  });
});

describe("chatCompletion retry policy", () => {
  const items = [{ ticker: "AAPL", name: "Apple Inc." }];

  const ok = () => ({
    ok: true,
    status: 200,
    statusText: "OK",
    json: async () => ({
      choices: [
        {
          message: {
            content:
              '{"classifications":[{"ticker":"AAPL","sector":"Information Technology"}]}',
          },
        },
      ],
    }),
    text: async () => "",
  });

  const fail = (status: number) => ({
    ok: false,
    status,
    statusText: "Error",
    json: async () => ({}),
    text: async () => `{"error":{"code":${status}}}`,
  });

  beforeEach(() => {
    process.env.OPENROUTER_API_KEY = "test-key";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.OPENROUTER_API_KEY;
  });

  it("retries once past a transient failure and succeeds", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(fail(503))
      .mockResolvedValueOnce(ok());
    vi.stubGlobal("fetch", fetchMock);

    const result = await classifySectors(items);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.get("AAPL")).toBe("Information Technology");
  });

  it("retries a cancelled request", async () => {
    const timeout = Object.assign(new Error("aborted"), { name: "TimeoutError" });
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(timeout)
      .mockResolvedValueOnce(ok());
    vi.stubGlobal("fetch", fetchMock);

    await expect(classifySectors(items)).resolves.toBeInstanceOf(Map);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not retry a permanent failure — a bad slug or key fails the same way twice", async () => {
    const fetchMock = vi.fn().mockResolvedValue(fail(400));
    vi.stubGlobal("fetch", fetchMock);

    await expect(classifySectors(items)).rejects.toThrow("OpenRouter 400");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("gives up after MAX_ATTEMPTS rather than looping", async () => {
    const fetchMock = vi.fn().mockResolvedValue(fail(503));
    vi.stubGlobal("fetch", fetchMock);

    await expect(classifySectors(items)).rejects.toThrow("OpenRouter 503");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("sends data_collection: deny on every attempt", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(fail(503))
      .mockResolvedValueOnce(ok());
    vi.stubGlobal("fetch", fetchMock);

    await classifySectors(items);

    for (const call of fetchMock.mock.calls) {
      expect(JSON.parse(call[1].body).provider).toEqual({
        data_collection: "deny",
      });
    }
  });

  it("does not retry the summary — one slow call must not become two", async () => {
    // The grounded summary needs almost the whole 90s cron stage for a single
    // attempt, so a second one cannot fit. Retrying is the cron's job.
    const fetchMock = vi.fn().mockResolvedValue(fail(503));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      generateSummary({
        date: "2026-08-12",
        taxSplitPct: { taxable: 60, taxAdvantaged: 40 },
        sectorWeights: [{ sector: "Energy", weightPct: 10 }],
        holdings: [
          {
            ticker: "XOM",
            name: "Exxon Mobil Corporation",
            sector: "Energy",
            changePct: -2.1,
          },
        ],
        movers: [{ ticker: "XOM", direction: "down", changePct: -2.1 }],
      }),
    ).rejects.toThrow("OpenRouter 503");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
