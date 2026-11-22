// The town's connected markets, settled once a month before upkeep:
// - Rentals: sim-owned rental units are rented by sims who don't own a home. Too many units means vacancies;
//   long vacancies make landlords cut rent. Renters not in a sim unit live in town apartments.
// - Local businesses: their revenue comes from residents' spending, shared among all businesses in town,
//   so a booming town supports more businesses and a crowded one squeezes them.
import type { Economy, Sim, SimEvent, World } from './types.ts';
import { rngFor } from './rng.ts';
import { REGIMES } from './market.ts';
import { dollars, fmt } from './money.ts';
import { home, incomeBasis, livingCost, rentals } from './finance.ts';
import { remember } from './memory.ts';

/** Share of residents' living costs spent at local businesses. */
export const LOCAL_SPEND_SHARE = 0.25;
/** Customers from outside town: local spending is multiplied by this. */
export const REGION_MULTIPLIER = 2;
/** Revenue a business needs per dollar of mid-range profit (a 25% margin). */
export const REVENUE_PER_PROFIT = 4;

/** Monthly revenue a business needs to hit the middle of its profit range. */
export function revenueNeeded(lo: number, hi: number): number {
  return Math.max(dollars(1000), ((lo + hi) / 2) * REVENUE_PER_PROFIT);
}

export function emptyEconomy(): Economy {
  return { localSpend: 0, businessCount: 0, typeCounts: {}, demandIndex: 1, rentalUnits: 0, vacantUnits: 0 };
}

/** Recompute local business demand from this month's residents. */
export function settleBusinessDemand(world: World) {
  const m = world.month;
  const spend = world.sims.reduce((s, sim) => s + livingCost(sim, m), 0) * LOCAL_SPEND_SHARE * REGION_MULTIPLIER;
  const typeCounts: Record<string, number> = {};
  let needed = 0;
  for (const s of world.sims) for (const a of s.assets) {
    if (a.kind !== 'business' || !a.businessType) continue;
    typeCounts[a.businessType] = (typeCounts[a.businessType] ?? 0) + 1;
    needed += revenueNeeded(a.profitLo ?? 0, a.profitHi ?? 0);
  }
  const count = Object.values(typeCounts).reduce((n, c) => n + c, 0);
  world.economy.typeCounts = typeCounts;
  world.economy.localSpend = Math.round(spend);
  world.economy.businessCount = count;
  world.economy.demandIndex = needed ? Math.min(2, spend / needed) : 2;
}

/** Profit for one business this month: its range, scaled by town demand, crowding of its type and the economy.
 *  A level of 1 (healthy demand, no competitors, normal economy) lands at the midpoint; 2 or more at the top. */
export function businessProfit(world: World, sameTypeCount: number, lo: number, hi: number, noise: number): number {
  const regime = { expansion: 1, boom: 1.15, recession: 0.75, crash: 0.55 }[world.market.regime];
  const crowding = 1 / (1 + 0.25 * Math.max(0, sameTypeCount - 1));
  const level = Math.max(0, Math.min(2, world.economy.demandIndex * crowding * regime * noise));
  return Math.round(lo + (hi - lo) * (level / 2));
}

/** Move tenants in and out of sim-owned rentals. Returns events. */
/**
 * A sim died: end its tenancies on the spot, both ways, so no snapshot shows a sim renting from (or to) the dead.
 * (Found by the adversarial long-life test; settleRentals used to clean this up a month later.)
 */
export function releaseTenancies(world: World, dead: Sim, m: number): SimEvent[] {
  const out: SimEvent[] = [];
  const byId = new Map(world.sims.map((s) => [s.id, s]));
  for (const unit of rentals(dead)) {
    const tenant = unit.tenantId ? byId.get(unit.tenantId) : undefined;
    unit.tenantId = undefined;
    if (tenant && tenant.rentsUnit === unit.id) {
      tenant.rentsUnit = undefined; tenant.landlordId = undefined; tenant.unitRent = undefined;
      remember(tenant, 'Had to move out: the landlord passed away');
      out.push({ month: m, simId: tenant.id, type: 'moved_out', text: 'Had to move out: the landlord passed away' });
    }
  }
  if (dead.rentsUnit) {
    const landlord = dead.landlordId ? byId.get(dead.landlordId) : undefined;
    const unit = landlord?.assets.find((a) => a.id === dead.rentsUnit);
    if (landlord && unit && unit.tenantId === dead.id) {
      unit.tenantId = undefined;
      unit.vacantMonths = 0;
      remember(landlord, 'A rental went vacant');
      out.push({ month: m, simId: landlord.id, type: 'vacancy', text: 'A rental went vacant (the tenant passed away)' });
    }
    dead.rentsUnit = undefined; dead.landlordId = undefined; dead.unitRent = undefined;
  }
  return out;
}

export function settleRentals(world: World): SimEvent[] {
  const m = world.month;
  const out: SimEvent[] = [];
  const rng = rngFor(world.seed, 'rentals', m);
  const byId = new Map(world.sims.map((s) => [s.id, s]));
  const units: Array<{ owner: Sim; unit: NonNullable<ReturnType<typeof rentals>>[number] }> = [];
  for (const owner of world.sims) for (const unit of rentals(owner)) units.push({ owner, unit });
  units.sort((a, b) => a.unit.id.localeCompare(b.unit.id));

  // 0. Tenants whose unit no longer exists (sold, or the landlord died) go back to town apartments.
  const unitIds = new Set(units.map((u) => u.unit.id));
  for (const s of world.sims) {
    if (s.rentsUnit && !unitIds.has(s.rentsUnit)) {
      s.rentsUnit = undefined; s.landlordId = undefined; s.unitRent = undefined;
      out.push({ month: m, simId: s.id, type: 'moved_out', text: 'Had to move out: the rental was sold' });
    }
  }

  const moveOut = (tenant: Sim | undefined, unit: (typeof units)[number]['unit'], owner: Sim, why: string) => {
    unit.tenantId = undefined;
    unit.vacantMonths = 0;
    if (tenant) { tenant.rentsUnit = undefined; tenant.landlordId = undefined; tenant.unitRent = undefined; }
    out.push({ month: m, simId: owner.id, type: 'vacancy', text: `A rental went vacant (${why})` });
    remember(owner, 'A rental went vacant');
  };

  // 1. Departures: the tenant died, bought a home, or moved away.
  const churn = 0.01 * REGIMES[world.market.regime].layoffMult;
  for (const { owner, unit } of units) {
    if (!unit.tenantId) continue;
    const tenant = byId.get(unit.tenantId);
    if (!tenant) moveOut(undefined, unit, owner, 'the tenant passed away');
    else if (home(tenant)) moveOut(tenant, unit, owner, 'the tenant bought a home');
    else if (tenant.rentsUnit !== unit.id) moveOut(undefined, unit, owner, 'the tenant left');
    else if (rng.chance(churn)) moveOut(tenant, unit, owner, 'the tenant moved out');
  }

  // 2. Arrivals: renters in town apartments who can afford a unit move in.
  const pool = world.sims
    .filter((s) => !home(s) && !s.rentsUnit && incomeBasis(s, m) > 0)
    .sort((a, b) => a.id.localeCompare(b.id));
  let vacant = 0;
  for (const { owner, unit } of units) {
    if (unit.tenantId) continue;
    const rent = unit.rent ?? 0;
    const candidates = pool.filter((s) => s.id !== owner.id && !s.rentsUnit && rent <= incomeBasis(s, m) * 0.4);
    if (candidates.length && rng.chance(0.45)) {
      const t = rng.pick(candidates);
      unit.tenantId = t.id; unit.vacantMonths = 0;
      t.rentsUnit = unit.id; t.landlordId = owner.id; t.unitRent = rent;
      out.push({ month: m, simId: owner.id, type: 'tenant_found', text: `${t.name} moved into a rental (${fmt(rent)}/mo)` });
      out.push({ month: m, simId: t.id, type: 'moved_in', text: `Moved into ${owner.name}'s rental for ${fmt(rent)}/mo` });
      continue;
    }
    vacant++;
    unit.vacantMonths = (unit.vacantMonths ?? 0) + 1;
    if (unit.vacantMonths % 3 === 0 && rent > unit.value * 0.005) {
      unit.rent = Math.round(rent * 0.95);
      out.push({ month: m, simId: owner.id, type: 'rent_cut', text: `Cut the rent to ${fmt(unit.rent)} after ${unit.vacantMonths} empty months` });
    }
  }
  world.economy.rentalUnits = units.length;
  world.economy.vacantUnits = vacant;
  return out;
}
