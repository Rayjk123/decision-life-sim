// A town with a past. Without one, every sim arrives at 18 within the first ten years and the whole town ages as one
// cohort (by year 50, 86 of 200 sims are in their 60s and 3 in their 40s). growHistory runs the town for decades with
// the rules before the visible start, then re-bases the clock so month 0 is "today": every age is present, and
// wealth, homes, debts and businesses come out of the same rules that run the visible era.
import type { Decider, SimEvent, World } from './types.ts';
import { runMonth } from './tick.ts';
import { heuristicDecider } from './heuristic.ts';

/** Event types kept from the history as life milestones (so an older resident's story doesn't start at month 0). */
export const HISTORY_MILESTONES = new Set(['arrived', 'inherited', 'started_career', 'bought_home', 'bought_rental', 'sold_rental', 'started_business', 'business_exit', 'business_failed', 'laid_off', 'retired', 'bankrupt']);

/** Years of history a new town gets by default (long enough that the first arrivals have mostly died and been replaced). */
export const HISTORY_YEARS = 70;

/** The seed the history runs under. Distinct from the town's own seed, so no keyed random draw (market, spawns,
 * life events) is reused when the clock restarts at month 0 after the history. */
export const historySeed = (seed: number): number => (Math.imul(seed ^ 0x5bd1e995, 0x27d4eb2d) >>> 0) || 1;

/**
 * Run `years` of history on a freshly created world, then shift every month field so the world sits at month 0.
 * Deaths during the history leave the Hall of Fame (it lists only people who die in the visible era); estates still
 * waiting for an heir carry over. Deterministic in (seed, population, years).
 */
export async function growHistory(world: World, years = HISTORY_YEARS, decider: Decider = heuristicDecider): Promise<World> {
  if (world.month !== 0 || world.sims.length) throw new Error('growHistory needs a freshly created world');
  if (years <= 0) return world;
  const seed = world.seed;
  world.seed = historySeed(seed);
  const months = Math.round(years * 12);
  const past: SimEvent[] = [];
  while (world.month < months) {
    const r = await runMonth(world, decider, { recordDecisions: false });
    for (const e of r.events) if (e.simId && HISTORY_MILESTONES.has(e.type)) past.push({ month: e.month, simId: e.simId, type: e.type, text: e.text });
  }
  const shift = world.month;
  // Asset ids embed the month they were bought (`<sim>-<kind>-<month>`); after the clock restarts, a purchase in the
  // visible era could reuse one. Tag every history-era id with "-h" and follow it through loans and tenancies.
  const renamed = new Map<string, string>();
  for (const s of world.sims) for (const a of s.assets) { renamed.set(a.id, `${a.id}-h`); a.id = `${a.id}-h`; }
  for (const s of world.sims) {
    for (const l of s.loans) {
      if (l.assetId && renamed.has(l.assetId)) { if (l.id === `${l.assetId}-loan`) l.id = `${renamed.get(l.assetId)}-loan`; l.assetId = renamed.get(l.assetId); }
    }
    if (s.rentsUnit && renamed.has(s.rentsUnit)) s.rentsUnit = renamed.get(s.rentsUnit);
  }
  for (const s of world.sims) {
    s.birthMonth -= shift;
    s.deathMonth -= shift;
    s.arrivedMonth -= shift;
    s.lastDecisionMonth -= shift;
    if (s.bankruptUntil !== undefined) s.bankruptUntil -= shift;
    for (const l of s.loans) if (l.deferredUntil !== undefined) l.deferredUntil -= shift;
    for (const a of s.assets) a.boughtMonth -= shift;
  }
  const alive = new Set(world.sims.map((x) => x.id));
  world.pastMilestones = past.filter((e) => alive.has(e.simId!)).map((e) => ({ ...e, month: e.month - shift }));
  world.month = 0;
  world.hallOfFame = [];
  world.seed = seed;
  return world;
}
