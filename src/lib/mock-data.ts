/**
 * Deterministic mock portfolio data for the Milestone-1 dashboard shell.
 * Seeded so server and client render identical values (no hydration drift).
 * Replaced by real net_worth_snapshots data in Milestone 4.
 */

export type RangeKey = "1D" | "1W" | "1M" | "3M" | "1Y" | "ALL";

export type SeriesPoint = {
  /** ISO timestamp for the point. */
  t: string;
  netWorth: number;
  investments: number;
};

const RANGE_CONFIG: Record<RangeKey, { points: number; stepMs: number }> = {
  "1D": { points: 78, stepMs: 5 * 60 * 1000 }, // ~6.5h trading, 5-min bars
  "1W": { points: 56, stepMs: 3 * 60 * 60 * 1000 },
  "1M": { points: 30, stepMs: 24 * 60 * 60 * 1000 },
  "3M": { points: 90, stepMs: 24 * 60 * 60 * 1000 },
  "1Y": { points: 52, stepMs: 7 * 24 * 60 * 60 * 1000 },
  ALL: { points: 60, stepMs: 30 * 24 * 60 * 60 * 1000 },
};

export const RANGE_KEYS: RangeKey[] = ["1D", "1W", "1M", "3M", "1Y", "ALL"];

/** mulberry32 — tiny deterministic PRNG. */
function makeRng(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Current "true" balances the walks terminate at.
const NET_WORTH_NOW = 1_284_500;
const INVESTMENTS_NOW = 962_300;

function buildWalk(
  end: number,
  points: number,
  drift: number,
  volatility: number,
  seed: number,
): number[] {
  const rng = makeRng(seed);
  // Walk backwards from the known "now" value, then reverse.
  const values: number[] = [end];
  for (let i = 1; i < points; i++) {
    const prev = values[values.length - 1];
    const shock = (rng() - 0.5) * volatility;
    const prevBack = prev / (1 + drift + shock);
    values.push(prevBack);
  }
  return values.reverse();
}

export function getSeries(range: RangeKey): SeriesPoint[] {
  const { points, stepMs } = RANGE_CONFIG[range];
  const seed = range.charCodeAt(0) * 1000 + points;

  // Shorter ranges => smaller drift & volatility per step.
  const driftMap: Record<RangeKey, number> = {
    "1D": 0.0008,
    "1W": 0.002,
    "1M": 0.004,
    "3M": 0.012,
    "1Y": 0.03,
    ALL: 0.06,
  };
  const drift = driftMap[range];

  const net = buildWalk(NET_WORTH_NOW, points, drift, drift * 1.2, seed);
  const inv = buildWalk(INVESTMENTS_NOW, points, drift, drift * 1.6, seed + 7);

  const now = Date.now();
  return net.map((v, i) => ({
    t: new Date(now - (points - 1 - i) * stepMs).toISOString(),
    netWorth: Math.round(v),
    investments: Math.round(inv[i]),
  }));
}

export const MOCK_LATEST = {
  netWorth: NET_WORTH_NOW,
  investments: INVESTMENTS_NOW,
  // Static breakdown for below-the-fold cards (Milestone 3 will compute these).
  taxAdvantaged: 401_200,
  taxable: 561_100,
  homeValue: 322_200,
};
