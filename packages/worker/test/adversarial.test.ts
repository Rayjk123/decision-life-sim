// Adversarial property test: hostile deciders hammer the rules every month (monthly policy) and we check the
// invariants a viewer would trust after every month, for every sim. A failure here is a rules exploit or a
// bookkeeping bug, never a model problem: the model can only pick among moves the rules call legal.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, estateShare, flowTotal, home, runMonth, type Decider, type World } from '@dls/sim-core';
import { integrityViolations } from '../../../scripts/health-lib.ts';
import { randomDecider } from '../src/random.ts';

// Hostile deciders: each always picks the first available move kind in its preference order.
function prefers(name: string, order: string[], share: number, retire: number): Decider {
  return {
    name,
    async decide(req) {
      const rank = (k: string) => { const i = order.indexOf(k); return i < 0 ? order.length : i; };
      const ranked = [...req.moves].sort((a, b) => rank(a.kind) - rank(b.kind) || Number(b.id.includes('big')) - Number(a.id.includes('big')));
      return {
        answers: {
          main: Object.fromEntries(req.moves.map((m) => [m.id, m.id === ranked[0].id ? 1 : 0])),
          investShare: Object.fromEntries([0, 1, 2, 3, 4].map((l) => [String(l), l === share ? 1 : 0])),
          retire: req.askRetire ? retire : undefined,
        },
        provider: name, latencyMs: 0, tokens: 0,
      };
    },
  };
}
// Biggest, most leveraged move available; invest everything; retire whenever offered.
const maxLeverage = prefers('max-leverage', ['start_business', 'buy_rental', 'buy_home', 'buy_car', 'trade_stocks', 'invest_index', 'pay_debt', 'sell_rental', 'nothing'], 4, 1);
// Buy and sell over and over: sell any rental, otherwise buy one, start businesses, buy cars; never retire.
const churner = prefers('churner', ['sell_rental', 'buy_rental', 'start_business', 'buy_car', 'trade_stocks', 'buy_home', 'invest_index', 'pay_debt', 'nothing'], 4, 0);
// Never pay anything off and never invest: spend on cars and homes, keep cash idle, never retire voluntarily.
const neverPays = prefers('never-pays', ['buy_car', 'buy_home', 'nothing', 'start_business', 'buy_rental', 'trade_stocks', 'invest_index', 'sell_rental', 'pay_debt'], 0, 0);

function violations(world: World, before: Map<string, { cash: number; loans: Set<string> }>): string[] {
  const out: string[] = [];
  const m = world.month;
  const byId = new Map(world.sims.map((s) => [s.id, s]));
  for (const s of world.sims) {
    const prev = before.get(s.id);
    if (prev && s.cash - prev.cash !== flowTotal(s)) out.push(`ledger: ${s.id} cash moved ${s.cash - prev.cash} but flows sum to ${flowTotal(s)}`);
    if (s.cash < 0) out.push(`negative cash: ${s.id} ${s.cash}`);
    if (s.assets.filter((a) => a.kind === 'home').length > 1) out.push(`two homes: ${s.id}`);
    for (const a of s.assets) {
      if (a.kind !== 'rental' || !a.tenantId) continue;
      const t = byId.get(a.tenantId);
      if (!t) out.push(`tenancy: ${s.id}/${a.id} has missing tenant ${a.tenantId}`);
      else if (t.rentsUnit !== a.id || t.landlordId !== s.id) out.push(`tenancy: ${s.id}/${a.id} tenant ${t.id} points at ${t.landlordId}/${t.rentsUnit}`);
      // the landlord collects unit.rent and the tenant pays unitRent: if they ever differ, money is created or destroyed
      else if (t.unitRent !== a.rent) out.push(`rent drift: ${s.id}/${a.id} collects ${a.rent} but tenant ${t.id} pays ${t.unitRent}`);
      if (a.tenantId === s.id) out.push(`tenancy: ${s.id} rents their own unit ${a.id}`);
    }
    if (s.rentsUnit) {
      const landlord = s.landlordId ? byId.get(s.landlordId) : undefined;
      const unit = landlord?.assets.find((a) => a.id === s.rentsUnit);
      if (!unit || unit.tenantId !== s.id) out.push(`tenancy: ${s.id} thinks it rents ${s.landlordId}/${s.rentsUnit}, which doesn't list it`);
      if (home(s)) out.push(`tenancy: ${s.id} owns a home and still rents ${s.rentsUnit}`);
    }
    for (const l of s.loans) {
      if ((l.kind === 'mortgage' || l.kind === 'auto') && l.assetId && !s.assets.some((a) => a.id === l.assetId) && l.balance > 0)
        out.push(`collateral: ${s.id} ${l.kind} ${l.id} points at missing asset ${l.assetId} (balance ${l.balance})`);
      const bankrupt = s.bankruptUntil !== undefined && m < s.bankruptUntil;   // "no new borrowing before this month"
      if (bankrupt && prev && !prev.loans.has(l.id) && l.kind !== 'card' && l.kind !== 'past_due')
        out.push(`bankrupt borrowing: ${s.id} opened ${l.kind} ${l.id} while barred until ${s.bankruptUntil}`);
    }
  }
  return [...out, ...integrityViolations(world).map((v) => `integrity: ${v}`)];
}

// Each adversary must actually reach the paths it targets, or passing proves nothing.
const MUST_SEE: Record<string, string[]> = {
  random: ['bought_home', 'bought_rental', 'tenant_found', 'splurge'],
  'max-leverage': ['bought_rental', 'started_business', 'bankrupt'],
  churner: ['bought_rental', 'sold_rental', 'started_business'],
  'never-pays': ['bought_car', 'missed_payment', 'bankrupt'],
};

const RUNS: Array<{ decider: Decider; seeds: number[]; years: number; pop: number; mustSee: string[] }> = [
  ...[randomDecider, maxLeverage, churner, neverPays].map((decider) => ({ decider, seeds: [11, 12, 13], years: 30, pop: 80, mustSee: MUST_SEE[decider.name] })),
  // A whole lifetime: the first arrivals reach 72 (forced retirement), die, and leave estates to newcomers.
  { decider: randomDecider, seeds: [14], years: 65, pop: 40, mustSee: ['retired', 'died', 'inherited'] },
];

for (const { decider, seeds, years, pop, mustSee } of RUNS) {
  test(`adversarial: ${decider.name} decider, every sim every month, ${seeds.length} seed(s) x ${years} years: no invariant breaks`, async () => {
    const found: string[] = [];
    const seen = new Map<string, number>();
    for (const seed of seeds) {
      const world = createWorld(seed, pop);
      const estatesLeft: Array<{ amount: number; heirs: number }> = [];   // every positive estate, in queue order
      let inherited = 0;                     // every inheritance actually paid to a newcomer
      while (world.month < years * 12 && found.length < 10) {
        const before = new Map(world.sims.map((s) => [s.id, { cash: s.cash, loans: new Set(s.loans.map((l) => l.id)) }]));
        const hof = world.hallOfFame.length;
        const r = await runMonth(world, decider, { policy: 'monthly' });
        for (const e of r.events) seen.set(e.type, (seen.get(e.type) ?? 0) + 1);
        for (const v of violations(world, before)) found.push(`seed ${seed} month ${world.month}: ${v}`);
        // Cross-sim money: rent can't be received that wasn't paid (town apartments make paid >= received)
        const received = world.sims.reduce((t, s) => t + (s.flows.rent_received ?? 0), 0);
        const paid = -world.sims.reduce((t, s) => t + (s.flows.rent_paid ?? 0), 0);
        if (received > paid) found.push(`seed ${seed} month ${world.month}: rent minted: received ${received} > paid ${paid}`);
        estatesLeft.push(...world.hallOfFame.slice(hof).filter((h) => h.finalNetWorth > 0).map((h) => ({ amount: h.finalNetWorth, heirs: h.heirs ?? 1 })));
        inherited += world.sims.reduce((t, s) => t + (s.flows.inheritance ?? 0), 0);
      }
      // Cross-sim money: estates are paid out FIFO, one heir's share each (90% after costs, split among the heirs;
      // the other heirs live outside town); the rest are still queued
      const queued = world.pendingEstates.map((e) => ({ amount: e.amount, heirs: e.heirs ?? 1 }));
      const paidOut = estatesLeft.slice(0, estatesLeft.length - queued.length);
      assert.deepEqual(queued, estatesLeft.slice(paidOut.length), `seed ${seed}: queued estates don't match the estates left`);
      const expected = paidOut.reduce((t, e) => t + estateShare(e.amount, e.heirs), 0);
      if (inherited !== expected) found.push(`seed ${seed}: inheritances paid ${inherited} != heirs' shares of estates distributed ${expected}`);
      if (paidOut.length >= 5 && paidOut.every((e) => e.heirs === 1)) found.push(`seed ${seed}: every estate had one heir: splitting never exercised`);
      if (!paidOut.length) found.push(`seed ${seed}: no estate was ever distributed, so the estate check proved nothing`);
    }
    assert.deepEqual(found.slice(0, 10), []);
    const missing = mustSee.filter((t) => !seen.get(t));
    assert.deepEqual(missing, [], `${decider.name} never reached: ${missing.join(', ')} (saw ${[...seen].map(([k, v]) => `${k} ${v}`).join(', ')})`);
  });
}
