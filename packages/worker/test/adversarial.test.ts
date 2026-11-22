// Adversarial property test: hostile deciders hammer the rules every month (monthly policy) and we check the
// invariants a viewer would trust after every month, for every sim. A failure here is a rules exploit or a
// bookkeeping bug, never a model problem: the model can only pick among moves the rules call legal.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, flowTotal, home, runMonth, type Decider, type World } from '@dls/sim-core';
import { integrityViolations } from '../../../scripts/health-lib.ts';
import { randomDecider } from '../src/random.ts';

// Always grab the biggest, most leveraged move available, invest everything, retire whenever offered.
const PRIORITY = ['start_business', 'buy_rental', 'buy_home', 'buy_car', 'trade_stocks', 'invest_index', 'pay_debt', 'sell_rental', 'nothing'];
const maxLeverage: Decider = {
  name: 'max-leverage',
  async decide(req) {
    const ranked = [...req.moves].sort((a, b) =>
      PRIORITY.indexOf(a.kind) - PRIORITY.indexOf(b.kind) || Number(b.id.includes('big')) - Number(a.id.includes('big')));
    return {
      answers: {
        main: Object.fromEntries(req.moves.map((m) => [m.id, m.id === ranked[0].id ? 1 : 0])),
        investShare: { '0': 0, '1': 0, '2': 0, '3': 0, '4': 1 },
        retire: req.askRetire ? 1 : undefined,
      },
      provider: 'max-leverage', latencyMs: 0, tokens: 0,
    };
  },
};

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

for (const decider of [randomDecider, maxLeverage]) {
  test(`adversarial: ${decider.name} decider, every sim every month, 3 seeds x 30 years: no invariant breaks`, async () => {
    const found: string[] = [];
    for (const seed of [11, 12, 13]) {
      const world = createWorld(seed, 80);
      const estatesLeft: number[] = [];      // every positive estate, in the order it was queued
      let inherited = 0;                     // every inheritance actually paid to a newcomer
      while (world.month < 360 && found.length < 10) {
        const before = new Map(world.sims.map((s) => [s.id, { cash: s.cash, loans: new Set(s.loans.map((l) => l.id)) }]));
        const hof = world.hallOfFame.length;
        await runMonth(world, decider, { policy: 'monthly' });
        for (const v of violations(world, before)) found.push(`seed ${seed} month ${world.month}: ${v}`);
        // Cross-sim money: rent can't be received that wasn't paid (town apartments make paid >= received)
        const received = world.sims.reduce((t, s) => t + (s.flows.rent_received ?? 0), 0);
        const paid = -world.sims.reduce((t, s) => t + (s.flows.rent_paid ?? 0), 0);
        if (received > paid) found.push(`seed ${seed} month ${world.month}: rent minted: received ${received} > paid ${paid}`);
        estatesLeft.push(...world.hallOfFame.slice(hof).filter((h) => h.finalNetWorth > 0).map((h) => h.finalNetWorth));
        inherited += world.sims.reduce((t, s) => t + (s.flows.inheritance ?? 0), 0);
      }
      // Cross-sim money: estates are paid out FIFO at 90% (10% estate costs); the rest are still queued
      const queued = world.pendingEstates.map((e) => e.amount);
      const paidOut = estatesLeft.slice(0, estatesLeft.length - queued.length);
      assert.deepEqual(queued, estatesLeft.slice(paidOut.length), `seed ${seed}: queued estates don't match the estates left`);
      const expected = paidOut.reduce((t, a) => t + Math.round(a * 0.9), 0);
      if (inherited !== expected) found.push(`seed ${seed}: inheritances paid ${inherited} != 90% of estates distributed ${expected}`);
      if (!paidOut.length) found.push(`seed ${seed}: no estate was ever distributed, so the estate check proved nothing`);
    }
    assert.deepEqual(found.slice(0, 10), []);
  });
}
