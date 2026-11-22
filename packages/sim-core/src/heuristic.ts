// Heuristic mode: hand-written weights by archetype plus a few context rules.
// It is the free offline baseline, the fallback when the model is down, and the comparison for experiments.
import { heuristicSpendLevel } from './spend.ts';
import type { Answers, Decider, DecisionRequest, DecisionResult, Move, Sim, World } from './types.ts';
import { ARCHETYPE } from './data.ts';
import { ageYears, balanceSheet, livingCost } from './finance.ts';

export function heuristicAnswers(sim: Sim, world: World, moves: Move[], askRetire: boolean): Answers {
  const arch = ARCHETYPE[sim.archetype];
  const mk = world.market;
  const t = sim.traits;
  const recentBad = sim.memory.slice(0, 3).some((s) => /laid off|failed|bankrupt|missing payments|vacant|repairs/i.test(s));
  const weights: Record<string, number> = {};
  for (const mv of moves) {
    let w = arch.heuristic[mv.kind] ?? 0.5;
    const big = mv.kind === 'buy_home' || mv.kind === 'buy_rental' || mv.kind === 'start_business' || mv.kind === 'buy_car';
    if (mv.kind === 'invest_index' || mv.kind === 'trade_stocks') {
      if (mk.lastIndexReturn < -0.05) w *= 1 - t.herding * 0.7;      // panic
      if (mk.lastIndexReturn > 0.03) w *= 1 + t.herding * 0.6;       // chase
    }
    if (mv.kind === 'buy_home' || mv.kind === 'buy_rental') {
      w *= mk.mortgageRate > 0.07 ? 0.6 : mk.mortgageRate < 0.05 ? 1.4 : 1;
      if (mv.id === 'buy_home_big') w *= 0.4 + t.status * 1.2;
    }
    if (big && mk.jobsSignal === 'weak') w *= 1 - t.lossAversion * 0.4;
    if (big && recentBad) w *= 0.6;
    if (mv.kind === 'buy_car') w *= 0.5 + t.status;
    if (mv.kind === 'start_business') w *= Math.max(0.15, Math.min(1.5, world.economy.demandIndex));   // crowded town, fewer new shops
    if (mv.kind === 'buy_rental' && world.economy.rentalUnits > 4) w *= Math.max(0.2, 1 - (2 * world.economy.vacantUnits) / world.economy.rentalUnits); // empty rentals put buyers off
    weights[mv.id] = Math.max(0.01, w);
  }
  const total = Object.values(weights).reduce((s, v) => s + v, 0);
  const main = Object.fromEntries(Object.entries(weights).map(([key, v]) => [key, v / total]));

  const lvl = Math.round(1 + t.patience * 2 + t.discipline * 1.5 - (t.status > 0.7 ? 1 : 0));
  const level = Math.max(0, Math.min(4, lvl));
  const investShare: Record<string, number> = { '0': 0, '1': 0, '2': 0, '3': 0, '4': 0 };
  investShare[String(level)] = 1;

  let retire: number | undefined;
  if (askRetire) {
    const age = ageYears(sim, world.month);
    const nw = balanceSheet(sim).netWorth;
    const enough = nw > livingCost(sim, world.month) * 12 * 25;
    retire = age >= 67 ? 0.35 : age >= 62 ? (enough ? 0.15 : 0.04) : enough ? (sim.archetype === 'fire' ? 0.5 : 0.08) : 0.01;
  }
  // SPEC 18: a spend-level distribution centred on the heuristic's level (60%, with 20% either side)
  const c = heuristicSpendLevel(sim, world);
  const raw: Record<string, number> = {};
  for (const [lv, p] of [[c - 1, 0.2], [c, 0.6], [c + 1, 0.2]] as const) if (lv >= 1 && lv <= 10) raw[String(lv)] = p;
  const tot = Object.values(raw).reduce((t, p) => t + p, 0);
  const spendLevel = Object.fromEntries(Object.entries(raw).map(([k, p]) => [k, p / tot]));
  return { main, investShare, retire, spendLevel };
}

export const heuristicDecider: Decider = {
  name: 'heuristic',
  async decide(req: DecisionRequest): Promise<DecisionResult> {
    return { answers: heuristicAnswers(req.sim, req.world, req.moves, req.askRetire), provider: 'heuristic', latencyMs: 0, tokens: 0 };
  },
};
