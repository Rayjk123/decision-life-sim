// Turns a golden scenario spec into a real world + sim, so the eval uses the exact same rules,
// legal moves and state text as the live simulation.
import {
  ARCHETYPE, CAREER, amortizedPayment, buildRequest, careerSalary, createWorld, dollars, spawnSim,
  type DecisionRequest, type Sim, type StateStyle, type World,
} from '@dls/sim-core';
import type { MovePattern, Pair, Scenario } from './types.ts';

const MONTH = 480;
const c = (d: number) => dollars(d);

export function buildScenario(sc: Scenario): { world: World; sim: Sim } {
  const world = createWorld(1000, 1);
  world.month = MONTH;
  const mk = world.market;
  Object.assign(mk, {
    regime: sc.market?.regime ?? 'expansion',
    lastIndexReturn: sc.market?.lastIndexReturn ?? 0.008,
    lastHomeReturn: sc.market?.lastHomeReturn ?? 0.002,
    stockReturn: (sc.market?.lastIndexReturn ?? 0.008) * 1.15,
    mortgageRate: sc.market?.mortgageRate ?? 0.062,
    jobsSignal: sc.market?.jobsSignal ?? 'steady',
    homeIndex: 1,
  });
  Object.assign(world.economy, {
    rentalUnits: sc.economy?.rentalUnits ?? 20,
    vacantUnits: sc.economy?.vacantUnits ?? 2,
    businessCount: sc.economy?.businessCount ?? 30,
    demandIndex: sc.economy?.demandIndex ?? 1,
    typeCounts: {},
  });

  const s = sc.sim;
  if (!CAREER[s.career]) throw new Error(`${sc.id}: unknown career ${s.career}`);
  const sim = spawnSim(world, MONTH - (s.age - 18) * 12);
  sim.name = s.name ?? sim.name;
  sim.birthMonth = MONTH - s.age * 12;
  sim.deathMonth = MONTH + 600;
  sim.career = s.career;
  sim.archetype = s.archetype;
  sim.traits = { ...ARCHETYPE[s.archetype].traits, ...(s.traits ?? {}) };
  sim.persona = ARCHETYPE[s.persona ?? s.archetype].persona;
  sim.retired = s.retired ?? false;
  sim.selfEmployed = s.selfEmployed ?? false;
  sim.employed = !sim.retired && !sim.selfEmployed && (s.employed ?? true);
  sim.monthsUnemployed = s.monthsUnemployed ?? 0;
  sim.salary = sim.employed ? c(s.salary ?? careerSalary(sim, MONTH) / 100) : 0;
  sim.cash = c(s.cash);
  sim.index = c(s.index ?? 0);
  sim.stocks = c(s.stocks ?? 0);
  sim.assets = [];
  sim.loans = [];
  sim.memory = [...(s.memory ?? [])];
  sim.flows = {};
  sim.creditScore = 740;
  const rate = mk.mortgageRate;
  if (s.home) {
    sim.assets.push({ id: 'home', kind: 'home', value: c(s.home.value), boughtMonth: MONTH - 60 });
    if (s.home.mortgage) sim.loans.push({ id: 'home-loan', kind: 'mortgage', balance: c(s.home.mortgage), annualRate: rate, payment: amortizedPayment(c(s.home.mortgage), rate, 300), assetId: 'home' });
  }
  (s.rentals ?? []).forEach((r, i) => {
    const id = `rental-${i}`;
    sim.assets.push({ id, kind: 'rental', value: c(r.value), boughtMonth: MONTH - 36, rent: c(r.rent ?? r.value * 0.008), tenantId: r.rented ? `tenant-${i}` : undefined, vacantMonths: r.rented ? 0 : 4 });
    if (r.mortgage) sim.loans.push({ id: `${id}-loan`, kind: 'mortgage', balance: c(r.mortgage), annualRate: rate + 0.005, payment: amortizedPayment(c(r.mortgage), rate + 0.005, 330), assetId: id });
  });
  if (s.car) {
    sim.assets.push({ id: 'car', kind: 'car', value: c(s.car.value), boughtMonth: MONTH - s.car.ageMonths });
    if (s.car.loan) sim.loans.push({ id: 'car-loan', kind: 'auto', balance: c(s.car.loan), annualRate: rate + 0.012, payment: amortizedPayment(c(s.car.loan), rate + 0.012, 48), assetId: 'car' });
  }
  for (const [i, d] of (s.debts ?? []).entries()) {
    sim.loans.push({ id: `debt-${i}`, kind: d.kind, balance: c(d.balance), annualRate: d.rate, payment: d.kind === 'card' ? 0 : c(d.payment ?? 0) || amortizedPayment(c(d.balance), d.rate, 120) });
  }
  if (s.business) {
    sim.assets.push({ id: 'biz', kind: 'business', value: c(20000), boughtMonth: MONTH - s.business.ageMonths, businessType: s.business.type, profitLo: c(1000), profitHi: c(6000), failYr1: 0.3 });
  }
  world.sims = [sim];
  return { world, sim };
}

export function requestFor(sc: Scenario, style: StateStyle): DecisionRequest {
  const { world, sim } = buildScenario(sc);
  return buildRequest(sim, world, style);
}

/** Apply a pair's dot-path changes to a deep copy of the base scenario. */
export function applyChange(base: Scenario, pair: Pair): Scenario {
  const copy = structuredClone(base) as Scenario;
  copy.id = `${base.id}~${pair.id}`;
  for (const [path, value] of Object.entries(pair.change)) {
    const keys = path.split('.');
    let obj: any = copy;
    for (const key of keys.slice(0, -1)) { obj[key] ??= {}; obj = obj[key]; }
    obj[keys[keys.length - 1]] = value;
  }
  return copy;
}

export function matches(pattern: MovePattern, id: string): boolean {
  return pattern.endsWith('*') ? id.startsWith(pattern.slice(0, -1)) : id === pattern;
}

export function mass(probs: Record<string, number>, patterns: MovePattern | MovePattern[]): number {
  const ps = Array.isArray(patterns) ? patterns : [patterns];
  return Object.entries(probs).filter(([id]) => ps.some((p) => matches(p, id))).reduce((s, [, v]) => s + v, 0);
}
