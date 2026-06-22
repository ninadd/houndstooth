export type ProjectionPoint = {
  year: number;
  bear: number;
  base: number;
  bull: number;
  /** Stacking helpers: each band's height above the one below it. */
  baseDelta: number;
  bullDelta: number;
};

export const PROJECTION_RATES = { bear: 0.02, base: 0.04, bull: 0.06 } as const;

/** Simple annual compounding of `currentValue` at fixed real-return rates. */
export function projectPortfolio(
  currentValue: number,
  years: number,
): ProjectionPoint[] {
  return Array.from({ length: years + 1 }, (_, year) => {
    const bear = currentValue * (1 + PROJECTION_RATES.bear) ** year;
    const base = currentValue * (1 + PROJECTION_RATES.base) ** year;
    const bull = currentValue * (1 + PROJECTION_RATES.bull) ** year;
    return { year, bear, base, bull, baseDelta: base - bear, bullDelta: bull - base };
  });
}
