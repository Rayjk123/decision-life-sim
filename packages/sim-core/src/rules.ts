// The rules engine: which moves are legal for a sim this month, with real costs.
// The decision model only ever chooses among these, so it can never buy what a sim can't afford.
import type { Move, Sim, World } from './types.ts';
import { BUSINESSES, BUSINESS_PROFIT_SCALE, CAREER, HOME_TIERS, STARTER_HOME, type BusinessType } from './data.ts';
import { rngFor } from './rng.ts';
import { amortizedPayment, dollars, fmt, k } from './money.ts';
import {
  ageInt, businessIncomeMonthly, canBorrow, car, dti, emergencyFloor, essentialSpend, grossMonthlyIncome, home, inSchool, liquidAbove, offeredRate, rentPaid, rentals,
} from './finance.ts';

export const MAX_DTI = 0.43;
const roundTo = (c: number, step: number) => Math.round(c / step) * step;

export interface HomeQuote { price: number; down: number; closing: number; loan: number; payment: number; carry: number; rate: number }

/** Quote a home in a given tier at today's market price. */
export function quoteHome(sim: Sim, world: World, tier: number, downPct = 0.1): HomeQuote & { tierLabel: string } {
  const t = HOME_TIERS[Math.max(0, Math.min(HOME_TIERS.length - 1, tier))];
  const price = roundTo(STARTER_HOME * t.multiple * world.market.homeIndex, k(5));
  const rate = offeredRate(sim, world, 'mortgage');
  const down = Math.round(price * downPct);
  const closing = Math.round(price * 0.03);
  const loan = price - down;
  return { price, down, closing, loan, payment: amortizedPayment(loan, rate, 360), carry: Math.round((price * 0.027) / 12), rate, tierLabel: t.label };
}

/** The home tier a sim would naturally look at: the largest whose price is under ~3.5x salary. */
export function naturalTier(sim: Sim, world: World): number {
  let tier = 0;
  const income = Math.max(sim.salary, businessIncomeMonthly(sim) * 12);
  HOME_TIERS.forEach((t, i) => { if (STARTER_HOME * t.multiple * world.market.homeIndex <= income * 3.5) tier = i; });
  return tier;
}

export function quoteRental(sim: Sim, world: World): HomeQuote & { rent: number; netMonthly: number } {
  const price = roundTo(STARTER_HOME * world.market.homeIndex, k(5));
  const rate = offeredRate(sim, world, 'mortgage') + 0.005;
  const down = Math.round(price * 0.2);
  const closing = Math.round(price * 0.03);
  const loan = price - down;
  const payment = amortizedPayment(loan, rate, 360);
  const carry = Math.round((price * 0.027) / 12);
  const rent = Math.round(price * 0.008);
  return { price, down, closing, loan, payment, carry, rate, rent, netMonthly: Math.round(rent * 0.94) - carry - payment };
}

const signed = (c: number) => (c >= 0 ? `+${fmt(c)}` : fmt(c));

export function legalMoves(sim: Sim, world: World): Move[] {
  const m = world.month;
  const moves: Move[] = [{ id: 'nothing', kind: 'nothing', description: 'Change nothing this month' }];
  if (inSchool(sim, m) || sim.missedPayments > 0) return moves;

  const floor = emergencyFloor(sim, m);
  const spare = sim.cash - floor;
  const liquid = liquidAbove(sim, m); // purchases can sell investments for the down payment

  if (spare > dollars(2000)) {
    moves.push({ id: 'invest_index', kind: 'invest_index', description: `Put spare cash in a broad index fund (up to ${fmt(spare)} available)` });
    moves.push({ id: 'trade_stocks', kind: 'trade_stocks', description: `Buy individual stocks: bigger swings than the index (up to ${fmt(spare)})` });
  }

  const nonMortgage = sim.loans.filter((l) => l.kind !== 'mortgage' && l.balance > 0 && !(l.deferredUntil !== undefined && m < l.deferredUntil));
  if (nonMortgage.length && spare > dollars(1000)) {
    const worst = [...nonMortgage].sort((a, b) => b.annualRate - a.annualRate)[0];
    const total = nonMortgage.reduce((s, l) => s + l.balance, 0);
    moves.push({ id: 'pay_debt', kind: 'pay_debt', description: `Pay down debt early: ${fmt(total)} owed, worst is ${worst.kind} at ${(worst.annualRate * 100).toFixed(1)}%` });
  }

  const borrow = canBorrow(sim, m) && (sim.employed || sim.selfEmployed) && !sim.retired;

  if (!home(sim) && borrow) {
    const base = naturalTier(sim, world);
    const options: Array<[string, number]> = [['buy_home', base], ['buy_home_big', base + 1]];
    for (const [id, tierIdx] of options) {
      if (tierIdx >= HOME_TIERS.length) continue;
      const q = quoteHome(sim, world, tierIdx, 0.1);
      const cashNeeded = q.down + q.closing;
      const ok = liquid >= cashNeeded && dti(sim, m, q.payment + q.carry, 0, true) <= MAX_DTI;
      if (!ok) continue;
      moves.push({
        id, kind: 'buy_home', price: q.price, cashNeeded, homeTier: tierIdx,
        description: `Buy a ${fmt(q.price)} ${q.tierLabel} home to live in: ${fmt(cashNeeded)} down and closing, ${fmt(q.payment + q.carry)}/mo all-in vs ${fmt(rentPaid(sim, m))}/mo rent now`,
      });
    }
  }

  if (borrow && rentals(sim).length < 12) {
    const q = quoteRental(sim, world);
    const cashNeeded = q.down + q.closing;
    if (liquid >= cashNeeded && dti(sim, m, q.payment + q.carry, q.rent) <= MAX_DTI) {
      moves.push({
        id: 'buy_rental', kind: 'buy_rental', price: q.price, cashNeeded,
        description: `Buy a ${fmt(q.price)} starter rental: ${fmt(cashNeeded)} down and closing, about ${signed(q.netMonthly)}/mo after mortgage and costs once rented${world.economy.vacantUnits > 0 ? ` (${world.economy.vacantUnits} of ${world.economy.rentalUnits} town rentals sit empty)` : ''}`,
      });
    }
  }

  const rs = rentals(sim);
  if (rs.length) {
    const best = [...rs].sort((a, b) => equity(sim, b.id, b.value) - equity(sim, a.id, a.value))[0];
    const proceeds = Math.round(best.value * 0.94) - (sim.loans.find((l) => l.assetId === best.id)?.balance ?? 0);
    moves.push({ id: 'sell_rental', kind: 'sell_rental', assetId: best.id, description: `Sell a rental worth ${fmt(best.value)}: about ${signed(proceeds)} cash after the loan and fees` });
  }

  const myCar = car(sim);
  const carOld = !myCar || m - myCar.boughtMonth >= 72;
  if (carOld && canBorrow(sim, m) && (sim.employed || sim.selfEmployed || sim.retired)) {
    const income = Math.max(sim.salary, businessIncomeMonthly(sim) * 12, grossMonthlyIncome(sim, m) * 12);
    const price = roundTo(Math.max(k(12), Math.min(k(18) + sim.traits.status * k(55), income * 0.5)), k(1));
    const tradeIn = myCar ? Math.max(0, myCar.value - (sim.loans.find((l) => l.assetId === myCar.id)?.balance ?? 0)) : 0;
    const down = Math.max(0, Math.round(price * 0.1) - tradeIn);
    const payment = amortizedPayment(price - Math.round(price * 0.1), offeredRate(sim, world, 'auto'), 60);
    if (liquid + floor * 0.5 >= down && dti(sim, m, payment) <= MAX_DTI) {
      moves.push({ id: 'buy_car', kind: 'buy_car', price, cashNeeded: down, description: `Buy a ${fmt(price)} ${myCar ? 'new car, trading in the old one' : 'car'}: ${fmt(down)} down, ${fmt(payment)}/mo for 5 years` });
    }
  }

  const hasBusiness = sim.assets.some((a) => a.kind === 'business');
  if (!hasBusiness && !sim.retired && ageInt(sim, m) < 62) {
    const unlocked = CAREER[sim.career].unlocksBusiness ?? [];
    const rng = rngFor(world.seed, 'biz-offer', m, sim.id);
    // Quitting a job to run a business needs the startup cash plus six months of essentials as runway.
    const runway = essentialSpend(sim, m) * 6;
    const affordable = BUSINESSES.filter((b) => (!b.requires || unlocked.includes(b.requires))
      && businessCash(b.startup) + (isFullTimeBusiness(b) && sim.employed ? runway : 0) <= liquid
      && (b.startup <= k(100) || canBorrow(sim, m)));
    const offers = new Map<string, (typeof BUSINESSES)[number]>();
    const special = affordable.filter((b) => b.requires);
    if (special.length) offers.set(special[0].key, special[0]);
    const general = affordable.filter((b) => !b.requires);
    if (general.length) { const pick = rng.pick(general); offers.set(pick.key, pick); }
    for (const b of offers.values()) {
      const cashNeeded = businessCash(b.startup);
      const rivals = world.economy.typeCounts[b.key] ?? 0;
      const fullTime = isFullTimeBusiness(b) && sim.employed;
      moves.push({
        id: `start_${b.key}`, kind: 'start_business', businessType: b.key, price: b.startup, cashNeeded,
        description: `Start a ${b.label.toLowerCase()}${fullTime ? ' and quit the job to run it' : ' on the side'}: ${fmt(cashNeeded)} cash${b.startup > cashNeeded ? ` plus a ${fmt(b.startup - cashNeeded)} loan` : ''}, profit usually ${signed(Math.round(b.profitLo * BUSINESS_PROFIT_SCALE))} to ${signed(Math.round(b.profitHi * BUSINESS_PROFIT_SCALE))}/mo, ${Math.round(b.failYr1 * 100)}% fail in year one, ${rivals ? `${rivals} already in town` : 'none in town yet'}`,
      });
    }
  }
  return moves;
}

/** Side hustles (startup $10k or less) are run alongside a job; anything bigger means quitting to run it. */
export const isFullTimeBusiness = (b: BusinessType) => b.startup > k(10);

/** Businesses over $100k are financed: 20% cash, the rest a 10-year loan. */
export const businessCash = (startup: number) => (startup <= k(100) ? startup : Math.round(startup * 0.2));

function equity(sim: Sim, assetId: string, value: number) {
  return value - (sim.loans.find((l) => l.assetId === assetId)?.balance ?? 0);
}

