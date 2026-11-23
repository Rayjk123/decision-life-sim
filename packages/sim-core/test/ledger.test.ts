// Integration tests for the money and the connected markets: nothing appears or vanishes by accident.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  businessProfit, createWorld, flowTotal, heuristicDecider, k, rentals, runMonth, settleBusinessDemand, spawnSim,
} from '../src/index.ts';

test('ledger: every sim\'s change in cash equals the sum of its recorded flows, every month for 20 years', async () => {
  const w = createWorld(11, 120);
  let checked = 0;
  for (let i = 0; i < 240; i++) {
    const before = new Map(w.sims.map((s) => [s.id, s.cash]));
    await runMonth(w, heuristicDecider);
    for (const s of w.sims) {
      const prev = before.get(s.id) ?? 0;
      assert.equal(s.cash - prev, flowTotal(s), `${s.id} month ${w.month}: cash moved ${s.cash - prev}, flows say ${flowTotal(s)} ${JSON.stringify(s.flows)}`);
      checked++;
    }
  }
  assert.ok(checked > 20_000);
});

test('rental market: every tenant and every rented unit point at each other', async () => {
  const w = createWorld(12, 150);
  for (let i = 0; i < 300; i++) {
    await runMonth(w, heuristicDecider);
    if (i % 12) continue;
    const byId = new Map(w.sims.map((s) => [s.id, s]));
    for (const owner of w.sims) for (const unit of rentals(owner)) {
      if (!unit.tenantId) continue;
      const t = byId.get(unit.tenantId);
      // a tenant who died this month is cleaned up at the start of next month
      if (!t) continue;
      assert.equal(t.rentsUnit, unit.id, `unit ${unit.id} says tenant ${t.id}, tenant says ${t.rentsUnit}`);
      assert.equal(t.landlordId, owner.id);
      assert.equal(t.unitRent, unit.rent);
    }
    for (const t of w.sims) {
      if (!t.rentsUnit) continue;
      const owner = byId.get(t.landlordId!);
      if (!owner) continue;
      assert.ok(rentals(owner).some((u) => u.id === t.rentsUnit && u.tenantId === t.id), `${t.id} rents ${t.rentsUnit} but the unit disagrees`);
    }
  }
});

test('rent paid to sim landlords equals rent they receive', async () => {
  const w = createWorld(13, 150);
  for (let i = 0; i < 240; i++) await runMonth(w, heuristicDecider);
  const byId = new Map(w.sims.map((s) => [s.id, s]));
  // Next month's flows: tenants who stay all month pay exactly what their landlord's unit charges.
  await runMonth(w, heuristicDecider);
  let paid = 0, received = 0;
  for (const owner of w.sims) for (const u of rentals(owner)) {
    if (!u.tenantId || !byId.has(u.tenantId)) continue;
    received += u.rent ?? 0;
    const t = byId.get(u.tenantId)!;
    if (t.rentsUnit === u.id) paid += t.unitRent ?? 0;
  }
  assert.equal(paid, received);
});

test('inheritance: a newcomer inherits 90% of a pending estate', () => {
  const w = createWorld(14, 10);
  w.month = 300;
  w.pendingEstates.push({ fromId: 'x', fromName: 'Ada Lovelace', amount: k(500) });
  const heir = spawnSim(w, 300);
  assert.equal(heir.flows.inheritance, k(450));
  assert.ok((heir.flows.arrival ?? 0) >= 200_000, 'arrives with at least $2k (movers bring savings too)');
  assert.equal(heir.cash, k(450) + (heir.flows.arrival ?? 0));
  assert.match(heir.name, /Lovelace$/);
  assert.match(heir.memory[0], /Inherited/);
  assert.equal(w.pendingEstates.length, 0);
});

test('business demand: more businesses means lower demand and lower profit', () => {
  const w = createWorld(15, 50);
  w.month = 300;
  for (let i = 0; i < 50; i++) w.sims.push(spawnSim(w, 100));
  settleBusinessDemand(w);
  const calm = w.economy.demandIndex;
  for (const s of w.sims.slice(0, 30)) s.assets.push({ id: `${s.id}-b`, kind: 'business', value: 0, boughtMonth: 290, businessType: 'coffee', profitLo: k(0.5), profitHi: k(4.5) });
  settleBusinessDemand(w);
  assert.ok(w.economy.demandIndex < calm, `${w.economy.demandIndex} should be below ${calm}`);
  assert.equal(w.economy.typeCounts.coffee, 30);
  const lo = k(0.5), hi = k(4.5);
  w.economy.demandIndex = 1;
  const alone = businessProfit(w, 1, lo, hi, 1);
  const crowded = businessProfit(w, 10, lo, hi, 1);
  assert.equal(alone, Math.round((lo + hi) / 2), 'healthy demand and no rivals lands at the midpoint');
  assert.ok(crowded < alone);
});
