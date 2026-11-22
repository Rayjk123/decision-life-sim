// Builds the compact state object and questions sent to the decision model (Kev / Jev request shape).
// Kev flattens an object state into "key: value" lines, and shows choice options as "name: description".
// Three styles exist so the eval suite can measure which one the model reads best:
//   words   - plain sentences and qualitative trait levels (default)
//   numbers - exact figures and 0-1 trait scores
//   terse   - minimal labels, archetype name instead of the persona sentence
import type { Move, Sim, StateStyle, World } from './types.ts';
import { ARCHETYPE } from './data.ts';
import { fmt } from './money.ts';
import { SHARE_LABELS } from './executor.ts';
import {
  ageInt, balanceSheet, businessIncomeMonthly, career, effectiveAutoInvest, emergencyFloor, grossMonthlyIncome, home, housingCost, inSchool,
  livingCost, rentals, scheduledLoanPayments, taxRate,
} from './finance.ts';

const level = (x: number) => (x >= 0.7 ? 'high' : x >= 0.4 ? 'medium' : 'low');
const pct = (x: number) => `${x >= 0 ? '+' : ''}${(x * 100).toFixed(1)}%`;

export function firstName(sim: Sim) { return sim.name.split(' ')[0]; }

// focused style: only the traits that stand out, as plain phrases (middling traits say nothing about a choice)
const TRAIT_PHRASES: Array<[keyof Sim['traits'], string, string]> = [
  ['risk', 'loves taking risks', 'avoids risk'],
  ['debt', 'comfortable borrowing', 'hates debt'],
  ['status', 'wants to look successful', "doesn't care about status"],
  ['patience', 'thinks long term', 'wants results now'],
  ['discipline', 'sticks to a plan', 'impulsive with money'],
  ['herding', 'follows the crowd', 'ignores the crowd'],
];
function traitPhrases(t: Sim['traits']): string {
  return TRAIT_PHRASES.flatMap(([k, hi, lo]) => (t[k] >= 0.7 ? [hi] : t[k] < 0.3 ? [lo] : [])).join(', ');
}

// "Put $2.1k into the index fund" x6 becomes "Put $2.1k into the index fund (6 times)"; amounts are ignored for matching
function dedupe(lines: string[]): string[] {
  const out: Array<{ text: string; key: string; n: number }> = [];
  for (const text of lines) {
    const key = text.replace(/\$[\d.,]+[km]?/gi, '$');
    const prev = out.find((o) => o.key === key);
    if (prev) prev.n++; else out.push({ text, key, n: 1 });
  }
  return out.map((o) => (o.n > 1 ? `${o.text} (${o.n} times)` : o.text));
}

function workLine(sim: Sim, world: World): string {
  const m = world.month;
  const c = career(sim);
  if (sim.retired) return `retired (was a ${c.label.toLowerCase()})`;
  if (inSchool(sim, m)) return `in training to be a ${c.label.toLowerCase()} until ${c.startAge}`;
  if (sim.selfEmployed) return `runs a business full time (trained as a ${c.label.toLowerCase()})`;
  if (!sim.employed) return `unemployed for ${sim.monthsUnemployed} months (a ${c.label.toLowerCase()})`;
  return `${c.label.toLowerCase()} earning ${fmt(sim.salary)} a year`;
}

export function buildState(sim: Sim, world: World, style: StateStyle = 'words'): Record<string, unknown> {
  const m = world.month;
  const bs = balanceSheet(sim);
  const t = sim.traits;
  const age = ageInt(sim, m);
  const gross = grossMonthlyIncome(sim, m) + businessIncomeMonthly(sim);
  const takeHome = Math.round(gross * (1 - taxRate(gross * 12)));
  const spend = housingCost(sim, m) + scheduledLoanPayments(sim, m) + livingCost(sim, m);
  const debts = sim.loans.filter((l) => l.balance > 0).map((l) => `${l.kind} ${fmt(l.balance)} at ${(l.annualRate * 100).toFixed(1)}%`);
  const rs = rentals(sim);
  const empty = rs.filter((r) => !r.tenantId).length;
  const biz = sim.assets.filter((a) => a.kind === 'business');
  const h = home(sim);
  const mk = world.market;
  const econ = world.economy;
  const homeDir = mk.lastHomeReturn > 0.002 ? 'rising' : mk.lastHomeReturn < -0.002 ? 'falling' : 'flat';

  if (style === 'terse') {
    return {
      who: `${firstName(sim)}, ${age}, ${ARCHETYPE[sim.archetype].label}`,
      work: workLine(sim, world),
      cash: fmt(sim.cash), invested: fmt(sim.index + sim.stocks), debt: fmt(bs.debt), net_worth: fmt(bs.netWorth),
      home: h ? 'owns' : 'rents', rentals: rs.length, business: biz.length ? biz.map((b) => b.businessType).join(', ') : 'none',
      market: `index ${pct(mk.lastIndexReturn)}, homes ${homeDir}, rates ${(mk.mortgageRate * 100).toFixed(1)}%, jobs ${mk.jobsSignal}`,
      recent: sim.memory.slice(0, 3).join('; ') || 'none',
    };
  }

  if (style === 'focused') {
    // Personality first, only the facts that should move a decision, nothing empty, no repeated lines.
    const spare = Math.max(0, sim.cash - emergencyFloor(sim, m));
    const s: Record<string, unknown> = {
      who: `${sim.name}, ${age}, ${workLine(sim, world)}. ${sim.persona}`,
      character: traitPhrases(t) || 'average on every trait',
      money: `${fmt(spare)} spare cash beyond a ${fmt(emergencyFloor(sim, m))} cushion; ${fmt(sim.index + sim.stocks)} invested; net worth ${fmt(bs.netWorth)}; saves about ${fmt(Math.max(0, takeHome - spend))} a month`,
    };
    if (debts.length) s.debts = debts.join('; ');
    s.home = h ? `owns a ${fmt(h.value)} home` : `rents for ${fmt(housingCost(sim, m))} a month`;
    if (rs.length) s.rentals = `${rs.length} worth ${fmt(rs.reduce((sum, r) => sum + r.value, 0))}${empty ? `, ${empty} empty` : ''}`;
    if (biz.length) s.business = biz.map((b) => (b.businessType ?? '').replace(/_/g, ' ')).join(', ');
    s.economy = `index ${pct(mk.lastIndexReturn)} last month, home prices ${homeDir}, mortgage rates ${(mk.mortgageRate * 100).toFixed(1)}%, jobs report ${mk.jobsSignal}; ${econ.vacantUnits} of ${econ.rentalUnits} town rentals empty`;
    const recent = dedupe(sim.memory).slice(0, 4);
    if (recent.length) s.recent = recent.join('; ');
    return s;
  }

  const traits = style === 'numbers'
    ? `risk ${t.risk}, debt comfort ${t.debt}, status ${t.status}, patience ${t.patience}, discipline ${t.discipline}, herding ${t.herding}, loss aversion ${t.lossAversion} (0 to 1)`
    : `risk taking ${level(t.risk)}, comfort with debt ${level(t.debt)}, status seeking ${level(t.status)}, patience ${level(t.patience)}, discipline ${level(t.discipline)}, follows the crowd ${level(t.herding)}`;
  const market = style === 'numbers'
    ? `index fund ${pct(mk.lastIndexReturn)} last month, home prices ${pct(mk.lastHomeReturn)} last month, mortgage rate ${(mk.mortgageRate * 100).toFixed(2)}%, jobs report ${mk.jobsSignal}`
    : `index fund ${pct(mk.lastIndexReturn)} last month, home prices ${homeDir}, mortgage rates ${(mk.mortgageRate * 100).toFixed(1)}%, jobs report ${mk.jobsSignal}`;

  return {
    person: `${sim.name}, ${age}, ${workLine(sim, world)}`,
    personality: sim.persona,
    traits,
    money: `cash ${fmt(sim.cash)} (keeps ${fmt(emergencyFloor(sim, m))} as a cushion), index fund ${fmt(sim.index)}, stocks ${fmt(sim.stocks)}, net worth ${fmt(bs.netWorth)}`,
    debts: debts.length ? debts.join('; ') : 'no debt',
    monthly: `takes home ${fmt(takeHome)}, spends about ${fmt(spend)}, auto-invests ${Math.round(effectiveAutoInvest(sim) * 100)}% of what is left`,
    housing: h ? `owns a ${fmt(h.value)} home` : `rents for ${fmt(housingCost(sim, m))} a month`,
    property: rs.length ? `${rs.length} rental${rs.length > 1 ? 's' : ''} worth ${fmt(rs.reduce((s, a) => s + a.value, 0))}${empty ? `, ${empty} empty` : ''}` : 'no rentals',
    business: biz.length ? biz.map((b) => b.businessType).join(', ') : 'no business',
    market,
    town: `${econ.businessCount} local businesses (${econ.demandIndex >= 1.1 ? 'busy' : econ.demandIndex >= 0.8 ? 'healthy' : 'crowded'}), ${econ.vacantUnits} of ${econ.rentalUnits} rentals empty`,
    recent: sim.memory.length ? sim.memory.join('; ') : 'nothing notable lately',
  };
}

export function buildQuestions(sim: Sim, moves: Move[], askRetire: boolean): Record<string, unknown> {
  const first = firstName(sim);
  const q: Record<string, unknown> = {
    main: {
      type: 'choice',
      instructions: `Acting true to ${first}'s personality and situation, what does ${first} do with money this month?`,
      criteria: Object.fromEntries(moves.map((mv) => [mv.id, mv.description])),
    },
  };
  if (moves.some((mv) => mv.kind === 'invest_index' || mv.kind === 'trade_stocks' || mv.kind === 'pay_debt')) {
    q.invest_share = {
      type: 'score',
      instructions: `If ${first} invests or pays down debt this month, how much of the spare cash goes in?`,
      criteria: SHARE_LABELS,
    };
  }
  if (askRetire) {
    q.retire = { type: 'noul', instructions: `Does ${first} retire from work this month?` };
  }
  return q;
}

export function archetypeLabel(sim: Sim) { return ARCHETYPE[sim.archetype].label; }
