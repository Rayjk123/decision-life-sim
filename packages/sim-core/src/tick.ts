// One month of the world: market, arrivals, town markets, upkeep, deaths, decisions.
import type { Decider, DecisionRecord, DecisionRequest, DecisionResult, Sim, SimEvent, StateStyle, World } from './types.ts';
import { stepMarket } from './market.ts';
import { arrivalsDue, spawnSim } from './world.ts';
import { retire, upkeep } from './lifecycle.ts';
import { ageInt, balanceSheet, inSchool, livingCost, pensionMonthly } from './finance.ts';
import { legalMoves } from './rules.ts';
import { buildQuestions, buildState } from './prompt.ts';
import { argmax, pick } from './policy.ts';
import { heuristicAnswers, heuristicDecider } from './heuristic.ts';
import { applyMove } from './executor.ts';
import { decisionReason, type CallPolicy } from './triggers.ts';
import { drawFor } from './rng.ts';
import { ARCHETYPE } from './data.ts';
import { fmt } from './money.ts';
import { resetFlows } from './ledger.ts';
import { releaseTenancies, settleBusinessDemand, settleRentals } from './economy.ts';

export interface TickOptions {
  policy?: CallPolicy;
  concurrency?: number;
  style?: StateStyle;
  onDecision?: (d: DecisionRecord) => void;
}

export interface MonthResult {
  month: number;
  events: SimEvent[];
  decisions: DecisionRecord[];
  calls: number;
  fallbacks: number;
}

/** Retirement is only offered at 67+, or earlier when pension + a 4% drawdown covers living costs. */
export function canAffordRetirement(sim: Sim, m: number): boolean {
  if (ageInt(sim, m) >= 67) return true;
  return pensionMonthly(sim, m) + ((sim.index + sim.stocks) * 0.04) / 12 >= livingCost(sim, m);
}

async function pool<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) { const idx = i++; out[idx] = await fn(items[idx]); }
  });
  await Promise.all(workers);
  return out;
}

/** Build the decision request for one sim (also used by evals and probes). */
export function buildRequest(sim: Sim, world: World, style: StateStyle = 'words'): DecisionRequest {
  const m = world.month;
  const moves = legalMoves(sim, world);
  const askRetire = !sim.retired && !inSchool(sim, m) && ageInt(sim, m) >= 55 && canAffordRetirement(sim, m);
  return { sim, world, moves, askRetire, state: buildState(sim, world, style), questions: buildQuestions(sim, moves, askRetire) };
}

export async function runMonth(world: World, decider: Decider, opts: TickOptions = {}): Promise<MonthResult> {
  world.month++;
  const m = world.month;
  const events: SimEvent[] = [];
  for (const s of world.sims) resetFlows(s);

  // Market
  const { market, changed } = stepMarket(world.seed, m, world.market);
  world.market = market;
  if (changed) events.push({ month: m, type: 'regime_change', text: `The economy entered a ${market.regime}`, data: { regime: market.regime } });

  // Arrivals (initial fill-up, replacements for deaths, heirs)
  for (let n = arrivalsDue(world); n > 0; n--) {
    const s = spawnSim(world, m);
    world.sims.push(s);
    events.push({ month: m, simId: s.id, type: 'arrived', text: `${s.name} moved to town at 18 (${ARCHETYPE[s.archetype].label.toLowerCase()}, ${s.career})` });
    if (s.flows.inheritance) events.push({ month: m, simId: s.id, type: 'inherited', text: `${s.name} inherited ${fmt(s.flows.inheritance)}` });
  }

  // Town markets: rentals and local business demand
  events.push(...settleRentals(world));
  settleBusinessDemand(world);

  // Upkeep and deaths
  const eventsBySim = new Map<string, SimEvent[]>();
  const survivors: Sim[] = [];
  for (const sim of world.sims) {
    const evs = upkeep(world, sim);
    events.push(...evs);
    eventsBySim.set(sim.id, evs);
    if (m >= sim.deathMonth) {
      const bs = balanceSheet(sim);
      world.hallOfFame.push({ simId: sim.id, name: sim.name, archetype: sim.archetype, career: sim.career, ageAtDeath: ageInt(sim, m), finalNetWorth: bs.netWorth, peakNetWorth: sim.peakNetWorth, diedMonth: m });
      if (bs.netWorth > 0) world.pendingEstates.push({ fromId: sim.id, fromName: sim.name, amount: bs.netWorth });
      events.push({ month: m, simId: sim.id, type: 'died', text: `${sim.name} died at ${ageInt(sim, m)} with a net worth of ${fmt(bs.netWorth)}` });
      events.push(...releaseTenancies(world, sim, m));
    } else survivors.push(sim);
  }
  world.sims = survivors;

  // Decisions
  const requests: Array<{ req: DecisionRequest; reason: string }> = [];
  for (const sim of [...world.sims].sort((a, b) => a.id.localeCompare(b.id))) {
    const reason = decisionReason(sim, world, eventsBySim.get(sim.id) ?? [], opts.policy ?? 'events');
    if (!reason) continue;
    const req = buildRequest(sim, world, opts.style);
    if (req.moves.length === 1 && !req.askRetire) continue; // nothing to decide
    requests.push({ reason, req });
  }

  let fallbacks = 0;
  const results = await pool(requests, opts.concurrency ?? 8, async ({ req }): Promise<DecisionResult> => {
    try {
      return await decider.decide(req);
    } catch {
      fallbacks++;
      const r = await heuristicDecider.decide(req);
      return { ...r, provider: 'heuristic-fallback' };
    }
  });

  const decisions: DecisionRecord[] = [];
  requests.forEach(({ req, reason }, i) => {
    const { sim, moves } = req;
    const res = results[i];
    const draw = drawFor(world.seed, m, sim.id, 'main');
    const retireDraw = drawFor(world.seed, m, sim.id, 'retire');
    const p = pick(sim, res.answers, draw, retireDraw);
    const heuristicPick = argmax(heuristicAnswers(sim, world, moves, req.askRetire).main);

    if (p.retire) {
      retire(sim);
      events.push({ month: m, simId: sim.id, type: 'retired', text: `${sim.name} retired at ${ageInt(sim, m)}` });
    }
    const move = moves.find((mv) => mv.id === p.picked) ?? moves[0];
    const { valid, events: evs } = applyMove(world, sim, move, p.shareLevel);
    events.push(...evs);
    sim.lastDecisionMonth = m;
    const rec: DecisionRecord = {
      simId: sim.id, month: m, provider: res.provider, model: res.model, moves: moves.map((mv) => mv.id), answers: res.answers,
      picked: valid ? move.id : 'nothing', draw, heuristicPick, reason, investLevel: p.shareLevel, retired: p.retire,
      valid, latencyMs: res.latencyMs, tokens: res.tokens,
      state: req.state, descriptions: Object.fromEntries(moves.map((mv) => [mv.id, mv.description])),
    };
    decisions.push(rec);
    events.push({ month: m, simId: sim.id, type: 'decision', text: `Decided: ${rec.picked} (${Math.round((res.answers.main[move.id] ?? 0) * 100)}%) after ${reason}`, data: { picked: rec.picked, reason } });
    opts.onDecision?.(rec);
  });

  return { month: m, events, decisions, calls: requests.length, fallbacks };
}
