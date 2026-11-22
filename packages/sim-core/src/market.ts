// Synthetic economy: a hidden regime drives index returns, home prices, mortgage rates and jobs.
// Everything is in today's dollars (real terms): no inflation, so returns here are after inflation.
import type { Market, Regime } from './types.ts';
import { rngFor } from './rng.ts';

interface RegimeParams {
  idxMean: number; idxSd: number;     // monthly index return
  homeMean: number; homeSd: number;   // monthly home price change
  rateTarget: number;                 // mortgage rate the market drifts toward
  layoffMult: number;
  jobs: Market['jobsSignal'];
  next: Partial<Record<Regime, number>>; // monthly transition probabilities
  minMonths: number;
}

export const REGIMES: Record<Regime, RegimeParams> = {
  expansion: { idxMean: 0.0045, idxSd: 0.035, homeMean: 0.0012, homeSd: 0.004, rateTarget: 0.062, layoffMult: 1, jobs: 'steady', next: { boom: 0.02, recession: 0.012 }, minMonths: 12 },
  boom:      { idxMean: 0.009, idxSd: 0.03, homeMean: 0.005, homeSd: 0.005, rateTarget: 0.069, layoffMult: 0.6, jobs: 'strong', next: { expansion: 0.05, crash: 0.015 }, minMonths: 6 },
  recession: { idxMean: -0.01, idxSd: 0.05, homeMean: -0.005, homeSd: 0.005, rateTarget: 0.05, layoffMult: 3, jobs: 'weak', next: { expansion: 0.07 }, minMonths: 6 },
  crash:     { idxMean: -0.04, idxSd: 0.08, homeMean: -0.012, homeSd: 0.008, rateTarget: 0.045, layoffMult: 5, jobs: 'weak', next: { recession: 0.25 }, minMonths: 2 },
};

export function initialMarket(): Market {
  return { regime: 'expansion', monthsInRegime: 0, indexLevel: 1000, lastIndexReturn: 0, stockReturn: 0, lastHomeReturn: 0, homeIndex: 1, mortgageRate: 0.062, jobsSignal: 'steady' };
}

/** Advance one month. Returns the new market and whether the regime changed. */
export function stepMarket(seed: number, month: number, m: Market): { market: Market; changed: boolean } {
  const rng = rngFor(seed, 'market', month);
  const p = REGIMES[m.regime];
  let regime = m.regime;
  let monthsInRegime = m.monthsInRegime + 1;
  if (monthsInRegime >= p.minMonths) {
    const u = rng.next();
    let acc = 0;
    for (const [r, prob] of Object.entries(p.next) as [Regime, number][]) {
      acc += prob;
      if (u < acc) { regime = r; monthsInRegime = 0; break; }
    }
  }
  const q = REGIMES[regime];
  const idxR = rng.normal(q.idxMean, q.idxSd);
  const stockR = 1.15 * idxR - 0.0015; // shared part of single-stock returns; each sim adds its own noise in upkeep
  const homeR = rng.normal(q.homeMean, q.homeSd);
  const rate = clamp(m.mortgageRate + (q.rateTarget - m.mortgageRate) * 0.08 + rng.normal(0, 0.0008), 0.025, 0.095);
  // the public jobs signal is noisy: it usually, but not always, matches the hidden regime
  const jobs = rng.chance(0.8) ? q.jobs : rng.pick(['strong', 'steady', 'weak'] as const);
  return {
    changed: regime !== m.regime,
    market: {
      regime, monthsInRegime,
      indexLevel: m.indexLevel * (1 + idxR),
      lastIndexReturn: idxR,
      stockReturn: stockR,
      lastHomeReturn: homeR,
      homeIndex: Math.max(0.3, m.homeIndex * (1 + homeR)),
      mortgageRate: rate,
      jobsSignal: jobs,
    },
  };
}

export const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
