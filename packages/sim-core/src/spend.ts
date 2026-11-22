// SPEC decision 18: how much a sim spends is a personality trait and a choice. A spend level 1-10 sets the ongoing
// lifestyle (share of income left after housing and loans) and, at levels 6-10, a one-off purchase in the month it's
// chosen. The level persists until the sim's next decision.
import type { Sim, SimEvent, World } from './types.ts';
import { SPEND_LEVELS, type SpendLevel } from './data.ts';
import { canBorrow, consumptionShare } from './finance.ts';
import { cardLimit, cardLoan } from './lifecycle.ts';
import { rngFor } from './rng.ts';
import { dollars, fmt } from './money.ts';
import { post } from './ledger.ts';
import { remember } from './memory.ts';

export const spendLevel = (level: number): SpendLevel => SPEND_LEVELS[Math.max(1, Math.min(10, Math.round(level))) - 1];

/** The level whose ongoing share is closest to the sim's personality-and-habit consumption share. */
export function baselineSpendLevel(sim: Sim): number {
  const c = consumptionShare(sim);
  let best = SPEND_LEVELS[0];
  for (const l of SPEND_LEVELS.slice(0, 7)) if (Math.abs(l.share - c) < Math.abs(best.share - c)) best = l;  // 8-10 are one-off levels
  return best.level;
}

/** The heuristic's spend level this decision: personality baseline, moved by markets, jobs, debt and recent news. */
export function heuristicSpendLevel(sim: Sim, world: World): number {
  let level = baselineSpendLevel(sim);
  const mk = world.market;
  const t = sim.traits;
  if (mk.regime === 'crash' || mk.regime === 'recession' || mk.lastIndexReturn < -0.03) level -= (t.lossAversion ?? 0.5) > 0.6 ? 2 : 1;
  if (mk.regime === 'boom' && t.herding > 0.6) level += 1;
  if (mk.jobsSignal === 'weak') level -= 1;
  if (sim.missedPayments > 0 || sim.loans.some((l) => (l.kind === 'card' || l.kind === 'past_due') && l.balance > 0)) level -= 1;
  if (sim.memory.slice(-3).some((x) => /raise/i.test(x))) level += 1;
  if (t.status > 0.75 && t.discipline < 0.4) level += 1;
  if (!sim.employed && !sim.selfEmployed && !sim.retired) level = Math.min(level, 2);
  level = Math.max(1, Math.min(10, level));
  // A one-off you can't come close to paying for doesn't happen (some of it can go on the card)
  while (level > 5 && (spendLevel(level).oneOff?.[0] ?? 0) * 100 > sim.cash + (sim.savings ?? 0) + (canBorrow(sim, world.month) ? cardLimit(sim, world.month) * 0.5 : 0)) level--;
  return level;
}

/** Set the sim's level and, for levels 6-10, make the one-off purchase now (through the ledger). */
export function applySpendLevel(world: World, sim: Sim, level: number): SimEvent[] {
  const l = spendLevel(level);
  sim.spendLevel = l.level;
  if (!l.oneOff) return [];
  const rng = rngFor(world.seed, 'splurge', world.month, sim.id);
  const wanted = dollars(Math.round(rng.range(l.oneOff[0], l.oneOff[1]) / 10) * 10);
  const item = rng.pick(l.items ?? ['something nice']);
  // Paid from cash, then savings, then the card up to its limit; investments are never sold for a splurge.
  // Capped at what's reachable, and skipped if even the low end of the range is out of reach.
  const card = cardLoan(sim);
  // Splurging on the card is new borrowing: not while bankrupt, with poor credit or with bills past due
  const room = canBorrow(sim, world.month) ? Math.max(0, cardLimit(sim, world.month) - card.balance) : 0;
  const reachable = Math.max(0, sim.cash) + (sim.savings ?? 0) + room;
  const amount = Math.min(wanted, reachable);
  if (amount < dollars(l.oneOff[0])) return [];
  const fromSavings = Math.min(sim.savings ?? 0, Math.max(0, amount - Math.max(0, sim.cash)));
  if (fromSavings > 0) { sim.savings = (sim.savings ?? 0) - fromSavings; post(sim, 'from_savings', fromSavings); }
  const onCard = Math.max(0, amount - Math.max(0, sim.cash));
  if (onCard > 0) { card.balance += onCard; post(sim, 'card_draw', onCard); }
  post(sim, 'discretionary', -amount);
  if (l.level >= 7) remember(sim, `Spent ${fmt(amount)} on ${item}`);
  return [{ month: world.month, simId: sim.id, type: 'splurge', text: `Spent ${fmt(amount)} on ${item}`, data: { level: l.level, amount, item } }];
}

/** Sample a level from a decider's "1".."10" probabilities with a keyed draw in [0, 1). */
export function sampleSpendLevel(probs: Record<string, number>, draw: number): number {
  const entries = Object.entries(probs).filter(([k]) => Number(k) >= 1 && Number(k) <= 10).sort((a, b) => Number(a[0]) - Number(b[0]));
  const total = entries.reduce((t, [, p]) => t + p, 0);
  if (!entries.length || total <= 0) return 5;
  let acc = 0;
  for (const [k, p] of entries) { acc += p / total; if (draw < acc) return Number(k); }
  return Number(entries[entries.length - 1][0]);
}
