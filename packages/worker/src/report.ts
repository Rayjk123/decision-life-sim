// Text reports: how each archetype is doing, and what the decider actually chose.
import { ARCHETYPES, balanceSheet, fmt, home, inSchool, rentals, type DecisionRecord, type World } from '@dls/sim-core';

const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};
const pad = (s: string | number, n: number) => String(s).padStart(n);
const padR = (s: string | number, n: number) => String(s).padEnd(n);

export function archetypeTable(world: World): string {
  const rows = ['  archetype            n   median NW   median cash  own home  rentals/sim  business  bankrupt  unemployed'];
  for (const a of ARCHETYPES) {
    const sims = world.sims.filter((s) => s.archetype === a.key);
    if (!sims.length) continue;
    const bs = sims.map(balanceSheet);
    const pct = (f: (s: (typeof sims)[number]) => boolean) => `${Math.round((sims.filter(f).length / sims.length) * 100)}%`;
    rows.push(
      `  ${padR(a.label, 18)}${pad(sims.length, 4)}${pad(fmt(median(bs.map((b) => b.netWorth))), 12)}${pad(fmt(median(bs.map((b) => b.cash))), 14)}` +
      `${pad(pct((s) => !!home(s)), 10)}${pad((sims.reduce((t, s) => t + rentals(s).length, 0) / sims.length).toFixed(2), 13)}` +
      `${pad(pct((s) => s.assets.some((x) => x.kind === 'business')), 10)}${pad(sims.reduce((t, s) => t + s.bankruptcies, 0), 10)}${pad(pct((s) => !s.employed && !s.selfEmployed && !s.retired && !inSchool(s, world.month)), 12)}`,
    );
  }
  return rows.join('\n');
}

const KINDS = ['nothing', 'invest_index', 'trade_stocks', 'pay_debt', 'buy_home', 'buy_rental', 'sell_rental', 'buy_car', 'start'];
const kindOf = (id: string) => (id.startsWith('start_') ? 'start' : id.startsWith('buy_home') ? 'buy_home' : id);

/** Share of picks per move kind, by archetype: the main "does personality matter" check. */
export function decisionMix(world: World, decisions: DecisionRecord[]): string {
  const arch = new Map(world.sims.map((s) => [s.id, s.archetype]));
  const rows = [`  ${padR('archetype', 18)}${KINDS.map((k) => pad(k.replace('_', ' ').slice(0, 9), 10)).join('')}   agree w/ heuristic`];
  for (const a of ARCHETYPES) {
    const ds = decisions.filter((d) => (arch.get(d.simId) ?? '') === a.key);
    if (!ds.length) continue;
    const counts = KINDS.map((k) => ds.filter((d) => kindOf(d.picked) === k).length);
    const agree = ds.filter((d) => kindOf(d.picked) === kindOf(d.heuristicPick)).length;
    rows.push(`  ${padR(a.label, 18)}${counts.map((c) => pad(`${Math.round((c / ds.length) * 100)}%`, 10)).join('')}   ${Math.round((agree / ds.length) * 100)}%`);
  }
  return rows.join('\n');
}
