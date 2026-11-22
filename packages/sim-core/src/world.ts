import type { ArchetypeKey, Sim, Traits, World } from './types.ts';
import { ARCHETYPE, ARCHETYPES, CAREERS, FIRST_NAMES, LAST_NAMES } from './data.ts';
import { initialMarket } from './market.ts';
import { emptyEconomy } from './economy.ts';
import { post } from './ledger.ts';
import { remember } from './memory.ts';
import { fmt } from './money.ts';
import { rngFor, type Rng } from './rng.ts';
import { dollars } from './money.ts';

/** Months over which the first population arrives (so ages are mixed instead of 1,000 identical 18-year-olds). */
export const ARRIVAL_MONTHS = 120;

export function createWorld(seed: number, targetPopulation: number): World {
  return { seed, month: 0, targetPopulation, nextSimNumber: 1, market: initialMarket(), economy: emptyEconomy(), sims: [], hallOfFame: [], pendingEstates: [] };
}

// How common each career is among new arrivals.
const CAREER_WEIGHTS: Record<string, number> = {
  retail: 10, warehouse: 8, military: 3, plumber: 4, electrician: 4, hvac: 3, trucker: 4, agent: 3, police: 3,
  teacher: 6, designer: 3, sales: 6, nurse: 7, accountant: 5, engineer: 4, swe: 6, pilot: 1, pharmacist: 2,
  lawyer: 2, dentist: 1, doctor: 2,
};
const ARCHETYPE_WEIGHTS: Record<ArchetypeKey, number> = {
  saver: 1, index: 1, picker: 1, re: 1, biz: 1, spender: 1, status: 1, fire: 0.7, balanced: 2,
};
const AUTO_INVEST: Record<ArchetypeKey, number> = {
  saver: 0.2, index: 0.3, picker: 0.2, re: 0.1, biz: 0.1, spender: 0, status: 0.05, fire: 0.5, balanced: 0.1,
};

function weighted<T extends string>(rng: Rng, w: Record<T, number>): T {
  const entries = Object.entries(w) as [T, number][];
  const total = entries.reduce((s, [, v]) => s + v, 0);
  let u = rng.next() * total;
  for (const [key, v] of entries) { u -= v; if (u <= 0) return key; }
  return entries[entries.length - 1][0];
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

function triangular(rng: Rng, lo: number, mode: number, hi: number): number {
  const u = rng.next();
  const f = (mode - lo) / (hi - lo);
  return u < f ? lo + Math.sqrt(u * (hi - lo) * (mode - lo)) : hi - Math.sqrt((1 - u) * (hi - lo) * (hi - mode));
}

export function spawnSim(world: World, month: number): Sim {
  const n = world.nextSimNumber++;
  const rng = rngFor(world.seed, 'spawn', n);
  const careerKey = weighted(rng, CAREER_WEIGHTS);
  const archetype = weighted(rng, ARCHETYPE_WEIGHTS);
  const base = ARCHETYPE[archetype].traits;
  const traits = Object.fromEntries(
    Object.entries(base).map(([key, v]) => [key, Math.round(clamp01(v + rng.normal(0, 0.1)) * 100) / 100]),
  ) as unknown as Traits;
  const birthMonth = month - 18 * 12;
  const lifespan = triangular(rng, 35, 65, 95);
  const c = CAREERS.find((x) => x.key === careerKey)!;
  const startMonth = birthMonth + c.startAge * 12;
  const employed = c.startAge <= 18;
  const sim: Sim = {
    id: `s${String(n).padStart(5, '0')}`,
    name: `${rng.pick(FIRST_NAMES)} ${rng.pick(LAST_NAMES)}`,
    birthMonth,
    deathMonth: birthMonth + Math.round(lifespan * 12),
    arrivedMonth: month,
    career: careerKey,
    archetype,
    traits,
    persona: ARCHETYPE[archetype].persona,
    cash: 0,
    index: 0,
    stocks: 0,
    assets: [],
    loans: [],
    creditScore: 680,
    missedPayments: 0,
    salary: employed ? c.startSalary : 0,
    employed,
    selfEmployed: false,
    monthsUnemployed: 0,
    retired: false,
    autoInvestPct: AUTO_INVEST[archetype],
    memory: [],
    lastDecisionMonth: -99,
    peakNetWorth: 0,
    bankruptcies: 0,
    flows: {},
  };
  post(sim, 'arrival', dollars(2000));
  // An heir: a newcomer inherits the estate of someone who died (after 10% estate costs), invested in the index.
  const estate = world.pendingEstates.shift();
  if (estate) {
    const inheritance = Math.round(estate.amount * 0.9);
    post(sim, 'inheritance', inheritance);
    sim.name = `${sim.name.split(' ')[0]} ${estate.fromName.split(' ').slice(1).join(' ') || sim.name.split(' ')[1]}`;
    remember(sim, `Inherited ${fmt(inheritance)} from ${estate.fromName}`);
  }
  if (c.debtAtStart > 0) {
    sim.loans.push({ id: `${sim.id}-student`, kind: 'student', balance: 0, annualRate: 0.055, payment: 0, deferredUntil: startMonth });
  }
  return sim;
}

/** How many sims should arrive this month during the initial staggered arrival. */
export function arrivalsDue(world: World): number {
  // During the arrival period the town fills up linearly; afterwards each death is replaced by a new 18-year-old.
  const desired = world.month >= ARRIVAL_MONTHS
    ? world.targetPopulation
    : Math.floor((world.targetPopulation * (world.month + 1)) / ARRIVAL_MONTHS);
  return Math.max(0, desired - world.sims.length);
}

export { ARCHETYPES };
