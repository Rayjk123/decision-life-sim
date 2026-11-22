// Applies a chosen move. Re-checks legality first; an invalid move becomes "nothing" and is reported.
import type { Move, Sim, SimEvent, World } from './types.ts';
import { BUSINESS, BUSINESS_PROFIT_SCALE } from './data.ts';
import { amortizedPayment, fmt, k } from './money.ts';
import { cashCushion, emergencyFloor, liquidAbove, offeredRate, raiseCash } from './finance.ts';
import { businessCash, isFullTimeBusiness, quoteHome, quoteRental } from './rules.ts';
import { remember } from './memory.ts';
import { rngFor } from './rng.ts';
import { post } from './ledger.ts';
import { pruneLoans } from './lifecycle.ts';

/** Share of spare cash used by invest / pay-debt moves, by investShare level. */
export const SHARE_LEVELS = [0.1, 0.25, 0.5, 0.75, 1];
export const SHARE_LABELS = ['10% of spare cash', '25% of spare cash', 'half of spare cash', '75% of spare cash', 'all spare cash'];

export function applyMove(world: World, sim: Sim, move: Move, shareLevel: number): { valid: boolean; events: SimEvent[] } {
  const m = world.month;
  const ev = (type: SimEvent['type'], text: string, data?: Record<string, unknown>): SimEvent => ({ month: m, simId: sim.id, type, text, data });
  const floor = emergencyFloor(sim, m);
  const spare = sim.cash - cashCushion(sim, m);
  const share = SHARE_LEVELS[Math.max(0, Math.min(SHARE_LEVELS.length - 1, shareLevel))];
  const nextId = (kind: string) => `${sim.id}-${kind}-${m}`;
  const invalid = { valid: false, events: [] as SimEvent[] };

  switch (move.kind) {
    case 'nothing':
      return { valid: true, events: [] };

    case 'save_cash': {
      if (spare <= 0) return invalid;
      const amt = Math.round(spare * share);
      post(sim, 'to_savings', -amt);
      sim.savings = (sim.savings ?? 0) + amt;
      remember(sim, `Put ${fmt(amt)} into savings`);
      return { valid: true, events: [ev('saved', `Put ${fmt(amt)} into a savings account`, { amount: amt })] };
    }

    case 'invest_index':
    case 'trade_stocks': {
      if (spare <= 0) return invalid;
      const amt = Math.round(spare * share);
      post(sim, 'invest', -amt);
      if (move.kind === 'invest_index') sim.index += amt; else sim.stocks += amt;
      const what = move.kind === 'invest_index' ? 'the index fund' : 'individual stocks';
      remember(sim, `Put ${fmt(amt)} into ${what}`);
      return { valid: true, events: [ev('invested', `Put ${fmt(amt)} into ${what}`, { amount: amt, kind: move.kind })] };
    }

    case 'pay_debt': {
      if (spare <= 0) return invalid;
      let budget = Math.round(spare * share);
      let paid = 0;
      const payable = sim.loans
        .filter((x) => x.kind !== 'mortgage' && x.balance > 0 && !(x.deferredUntil !== undefined && m < x.deferredUntil))
        .sort((a, b) => b.annualRate - a.annualRate);
      for (const l of payable) {
        const pay = Math.min(budget, l.balance);
        l.balance -= pay; budget -= pay; paid += pay;
        if (budget <= 0) break;
      }
      if (paid <= 0) return invalid;
      post(sim, 'pay_debt', -paid);
      pruneLoans(sim, m);
      remember(sim, `Paid off ${fmt(paid)} of debt early`);
      return { valid: true, events: [ev('paid_debt', `Paid down ${fmt(paid)} of debt`, { amount: paid })] };
    }

    case 'buy_home': {
      const q = quoteHome(sim, world, move.homeTier ?? 0, 0.1);
      if (liquidAbove(sim, m) < q.down + q.closing || sim.assets.some((a) => a.kind === 'home')) return invalid;
      raiseCash(sim, q.down + q.closing);
      post(sim, 'down_payment', -q.down);
      post(sim, 'closing_costs', -q.closing);
      const id = nextId('home');
      sim.assets.push({ id, kind: 'home', value: q.price, boughtMonth: m });
      sim.loans.push({ id: `${id}-loan`, kind: 'mortgage', balance: q.loan, annualRate: q.rate, payment: q.payment, assetId: id });
      remember(sim, `Bought a ${fmt(q.price)} ${q.tierLabel} home`);
      const events = [ev('bought_home', `Bought a ${fmt(q.price)} ${q.tierLabel} home`, { price: q.price, assetId: id, tier: q.tierLabel })];
      // Moving into the new home ends any tenancy now, so no snapshot shows a sim both owning a home and renting
      // (found by the adversarial property test; settleRentals used to clean this up a month later).
      if (sim.rentsUnit) {
        const landlord = world.sims.find((s) => s.id === sim.landlordId);
        const unit = landlord?.assets.find((a) => a.id === sim.rentsUnit);
        if (landlord && unit && unit.tenantId === sim.id) {
          unit.tenantId = undefined;
          unit.vacantMonths = 0;
          remember(landlord, 'A rental went vacant');
          events.push({ month: m, simId: landlord.id, type: 'vacancy', text: 'A rental went vacant (the tenant bought a home)' });
        }
        sim.rentsUnit = undefined; sim.landlordId = undefined; sim.unitRent = undefined;
      }
      return { valid: true, events };
    }

    case 'buy_rental': {
      const q = quoteRental(sim, world);
      if (liquidAbove(sim, m) < q.down + q.closing) return invalid;
      raiseCash(sim, q.down + q.closing);
      post(sim, 'down_payment', -q.down);
      post(sim, 'closing_costs', -q.closing);
      const id = nextId('rental');
      sim.assets.push({ id, kind: 'rental', value: q.price, boughtMonth: m, rent: q.rent, vacantMonths: 0 });
      sim.loans.push({ id: `${id}-loan`, kind: 'mortgage', balance: q.loan, annualRate: q.rate, payment: q.payment, assetId: id });
      remember(sim, `Bought a ${fmt(q.price)} rental`);
      return { valid: true, events: [ev('bought_rental', `Bought a ${fmt(q.price)} rental`, { price: q.price, assetId: id })] };
    }

    case 'sell_rental': {
      const a = sim.assets.find((x) => x.id === move.assetId);
      if (!a) return invalid;
      const loan = sim.loans.find((l) => l.assetId === a.id);
      const proceeds = Math.round(a.value * 0.94) - (loan?.balance ?? 0);
      post(sim, 'rental_sale', proceeds);
      if (loan) loan.balance = 0;
      if (a.tenantId) {
        const tenant = world.sims.find((s) => s.id === a.tenantId);
        if (tenant) { tenant.rentsUnit = undefined; tenant.landlordId = undefined; tenant.unitRent = undefined; }
      }
      sim.assets = sim.assets.filter((x) => x !== a);
      pruneLoans(sim, m);
      remember(sim, `Sold a rental for ${fmt(a.value)}`);
      return { valid: true, events: [ev('sold_rental', `Sold a rental (${proceeds >= 0 ? '+' : ''}${fmt(proceeds)} cash)`, { proceeds })] };
    }

    case 'buy_car': {
      const price = move.price ?? k(25);
      const old = sim.assets.find((a) => a.kind === 'car');
      const oldLoan = old ? sim.loans.find((l) => l.assetId === old.id) : undefined;
      const tradeIn = old ? old.value - (oldLoan?.balance ?? 0) : 0;
      const downNeeded = Math.round(price * 0.1);
      const fromCash = Math.max(0, downNeeded - Math.max(0, tradeIn)) + Math.max(0, -tradeIn);
      if (liquidAbove(sim, m) + floor * 0.5 < fromCash) return invalid;
      if (old) {
        if (oldLoan) oldLoan.balance = 0;
        sim.assets = sim.assets.filter((a) => a !== old);
      }
      raiseCash(sim, fromCash);
      post(sim, 'car_down_payment', -fromCash);
      const id = nextId('car');
      const loanAmt = price - downNeeded;
      const rate = offeredRate(sim, world, 'auto');
      sim.assets.push({ id, kind: 'car', value: price, boughtMonth: m });
      sim.loans.push({ id: `${id}-loan`, kind: 'auto', balance: loanAmt, annualRate: rate, payment: amortizedPayment(loanAmt, rate, 60), assetId: id });
      pruneLoans(sim, m);
      remember(sim, `Bought a ${fmt(price)} car`);
      return { valid: true, events: [ev('bought_car', `Bought a ${fmt(price)} car`, { price })] };
    }

    case 'start_business': {
      const b = BUSINESS[move.businessType!];
      if (!b) return invalid;
      const cash = businessCash(b.startup);
      if (liquidAbove(sim, m) < cash) return invalid;
      raiseCash(sim, cash);
      post(sim, 'business_startup', -cash);
      const id = nextId('biz');
      sim.assets.push({
        id, kind: 'business', value: Math.round(b.startup * 0.5), boughtMonth: m, businessType: b.key,
        profitLo: Math.round(b.profitLo * BUSINESS_PROFIT_SCALE), profitHi: Math.round(b.profitHi * BUSINESS_PROFIT_SCALE), failYr1: b.failYr1,
        // Some owners run a business far better than others: a lasting quality, from its own keyed stream
        quality: Math.min(2.2, Math.max(0.4, Math.exp(rngFor(world.seed, 'business-quality', m, sim.id).normal(0, 0.35)))),
      });
      if (b.startup > cash) {
        const rate = offeredRate(sim, world, 'business');
        sim.loans.push({ id: `${id}-loan`, kind: 'business', balance: b.startup - cash, annualRate: rate, payment: amortizedPayment(b.startup - cash, rate, 120), assetId: id });
      }
      const fullTime = isFullTimeBusiness(b) && sim.employed;
      if (fullTime) { sim.employed = false; sim.selfEmployed = true; sim.salary = 0; }
      remember(sim, `Started a ${b.label.toLowerCase()}${fullTime ? ' and quit the job' : ''}`);
      return { valid: true, events: [ev('started_business', `Started a ${b.label.toLowerCase()}${fullTime ? ' and quit the job to run it' : ' on the side'}`, { businessType: b.key, startup: b.startup, fullTime })] };
    }
  }
}
