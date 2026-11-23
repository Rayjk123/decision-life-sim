// Monthly upkeep for one sim: school, jobs, income, bills, rentals, businesses, investments, debt, bankruptcy.
// No decision model is involved here; this is the world's rules. Every cash change goes through post().
import type { Cents, Loan, Sim, SimEvent, World } from './types.ts';
import { BUSINESS, LAYOFF_MONTHLY } from './data.ts';
import { REGIMES } from './market.ts';
import { rngFor } from './rng.ts';
import { amortizedPayment, dollars, fmt } from './money.ts';
import { flowTotal, post } from './ledger.ts';
import { remember } from './memory.ts';
import { businessProfit } from './economy.ts';
import {
  ageInt, ageYears, balanceSheet, career, careerSalary, cashCushion, effectiveAutoInvest, emergencyFloor, essentialSpend, riskyShare, grossMonthlyIncome, home, incomeBasis, inSchool,
  livingCost, propertyCarry, rentPaid, rentals, taxRate,
} from './finance.ts';

export { remember };

function ev(world: World, sim: Sim, type: SimEvent['type'], text: string, data?: Record<string, unknown>): SimEvent {
  return { month: world.month, simId: sim.id, type, text, data };
}

function loanOfKind(sim: Sim, kind: 'card' | 'past_due'): Loan {
  let l = sim.loans.find((x) => x.kind === kind);
  if (!l) {
    l = { id: `${sim.id}-${kind}`, kind, balance: 0, annualRate: kind === 'card' ? 0.24 : 0.3, payment: 0 };
    sim.loans.push(l);
  }
  return l;
}
export const cardLoan = (sim: Sim) => loanOfKind(sim, 'card');

/**
 * Credit score, derived every month from what real scores weigh (no randomness):
 * payment history (missed payments, bankruptcy), card utilization, non-mortgage debt load vs income, and the length
 * of credit history. Range 300-850. A thin file starts near 700; a long, clean, low-debt history reaches ~830.
 */
export function creditScoreFor(f: {
  historyPenalty: number; cardBalance: number; cardLimit: number; nonMortgageDebt: number; annualIncome: number;
  monthsOfHistory: number; pastDueNow: boolean; inBankruptcy: boolean;
}): number {
  let score = 830 - Math.min(250, f.historyPenalty);
  const u = f.cardLimit > 0 ? f.cardBalance / f.cardLimit : 0;
  score -= u <= 0.1 ? 0 : u <= 0.3 ? 20 : u <= 0.5 ? 45 : u <= 0.75 ? 70 : 100;
  const load = f.annualIncome > 0 ? f.nonMortgageDebt / f.annualIncome : f.nonMortgageDebt > 0 ? Infinity : 0;
  score -= load <= 0.2 ? 0 : load <= 0.5 ? 15 : load <= 1 ? 35 : load <= 2 ? 55 : 70;
  const h = f.monthsOfHistory;
  score -= h < 24 ? 130 : h < 60 ? 80 : h < 120 ? 40 : h < 240 ? 15 : 0;
  if (f.pastDueNow) score -= 40;
  if (f.inBankruptcy) score = Math.min(score, 560);
  return Math.max(300, Math.min(850, Math.round(score)));
}

export function cardLimit(sim: Sim, month: number): number {
  return Math.max(dollars(3000), Math.round(careerSalary(sim, month) * 0.3));
}

/** Scheduled payments on all loans. Returns the total paid (taken from cash by the caller). */
function payLoans(sim: Sim, month: number): number {
  let paid = 0;
  for (const l of sim.loans) {
    if (l.balance <= 0 || l.kind === 'past_due') continue;
    const interest = Math.round(l.balance * (l.annualRate / 12));
    if (l.kind === 'card') {
      l.balance += interest;
      const min = Math.min(l.balance, Math.max(dollars(25), Math.round(l.balance * 0.03)));
      l.balance -= min; paid += min;
      continue;
    }
    if (l.deferredUntil !== undefined && month < l.deferredUntil) continue;
    const pay = Math.min(l.payment, l.balance + interest);
    l.balance = l.balance + interest - pay;
    paid += pay;
  }
  return paid;
}

export function pruneLoans(sim: Sim, month: number) {
  sim.loans = sim.loans.filter((l) => l.balance > 0 || l.kind === 'card' || (l.deferredUntil !== undefined && month < l.deferredUntil));
}

export function upkeep(world: World, sim: Sim): SimEvent[] {
  const m = world.month;
  const flowsBefore = flowTotal(sim); // arrivals and inheritances posted earlier this month
  const rng = rngFor(world.seed, 'upkeep', m, sim.id);
  const regime = REGIMES[world.market.regime];
  const c = career(sim);
  const out: SimEvent[] = [];
  const age = ageYears(sim, m);
  const birthday = (m - sim.birthMonth) % 12 === 0;

  // 1. School and career start
  if (inSchool(sim, m)) {
    const student = sim.loans.find((l) => l.kind === 'student');
    const schoolMonths = Math.max(1, (c.startAge - 18) * 12);
    if (student) student.balance += Math.round(c.debtAtStart / schoolMonths);
  } else if (!sim.employed && !sim.selfEmployed && !sim.retired && sim.salary === 0 && sim.monthsUnemployed === 0 && Math.abs(age - c.startAge) < 1 / 24) {
    sim.employed = true;
    sim.salary = careerSalary(sim, m);
    const student = sim.loans.find((l) => l.kind === 'student');
    if (student) student.payment = amortizedPayment(student.balance, student.annualRate, 120);
    out.push(ev(world, sim, 'started_career', `Started as a ${c.label.toLowerCase()} earning ${fmt(sim.salary)}`));
    remember(sim, `Started as a ${c.label.toLowerCase()}`);
  }

  // 2. Jobs: raises, layoffs, rehiring (self-employed owners have no job to lose)
  if (!inSchool(sim, m) && !sim.retired && !sim.selfEmployed) {
    if (sim.employed) {
      if (rng.chance(LAYOFF_MONTHLY[c.layoff] * regime.layoffMult)) {
        sim.employed = false; sim.salary = 0; sim.monthsUnemployed = 0;
        out.push(ev(world, sim, 'laid_off', 'Was laid off'));
        remember(sim, 'Was laid off');
      } else if (birthday) {
        const perf = Math.max(0.85, Math.min(1.25, 1 + rng.normal(0, c.layoff === 'volatile' ? 0.15 : 0.05)));
        const next = Math.round(careerSalary(sim, m) * perf);
        if (next > sim.salary * 1.05) {
          out.push(ev(world, sim, 'raise', `Got a raise to ${fmt(next)}`));
          remember(sim, `Got a raise to ${fmt(next)}`);
        }
        sim.salary = next;
      }
    } else {
      sim.monthsUnemployed++;
      const rehire = { expansion: 0.25, boom: 0.35, recession: 0.12, crash: 0.08 }[world.market.regime];
      if (rng.chance(rehire)) {
        sim.employed = true; sim.salary = Math.round(careerSalary(sim, m) * 0.95); sim.monthsUnemployed = 0;
        out.push(ev(world, sim, 'hired', `Found a new job at ${fmt(sim.salary)}`));
        remember(sim, 'Found a new job');
      }
    }
  }

  // 3. Income and taxes
  const gross = grossMonthlyIncome(sim, m);
  const incomeKind = inSchool(sim, m) ? 'part_time' : sim.retired ? 'pension' : sim.employed ? 'salary' : 'benefits';
  post(sim, incomeKind, gross);

  // 4. Businesses: profit from town demand, failures, rare exits
  const regimeBad = regime.layoffMult > 1;
  let bizProfit = 0;
  for (const b of sim.assets.filter((a) => a.kind === 'business')) {
    const type = BUSINESS[b.businessType!];
    const profit = businessProfit(world, world.economy.typeCounts[b.businessType!] ?? 1, b.profitLo!, b.profitHi!, rng.range(0.7, 1.3), b.quality ?? 1);
    bizProfit += profit;
    const yr1 = m - b.boughtMonth < 12;
    const struggling = profit < 0 ? 2 : 1;
    const hazard = (1 - Math.pow(1 - (b.failYr1 ?? 0.2), 1 / 12)) * (yr1 ? 1 : 0.4) * (regimeBad ? 2 : 1) * struggling;
    if (type?.exitChanceYr && rng.chance(type.exitChanceYr / 12)) {
      const value = Math.round(rng.range(type.exitValue![0], type.exitValue![1]));
      post(sim, 'business_exit', value);
      closeBusiness(world, sim, b.id);
      out.push(ev(world, sim, 'business_exit', `Sold the ${type.label.toLowerCase()} for ${fmt(value)}!`, { exit: value }));
      remember(sim, `Sold the ${type.label.toLowerCase()} for ${fmt(value)}`);
    } else if (rng.chance(hazard)) {
      closeBusiness(world, sim, b.id);
      out.push(ev(world, sim, 'business_failed', `The ${type?.label.toLowerCase() ?? 'business'} failed`));
      remember(sim, `The ${type?.label.toLowerCase() ?? 'business'} failed`);
    } else if ((b.lossMonths = profit < 0 ? (b.lossMonths ?? 0) + 1 : 0) >= 6) {
      closeBusiness(world, sim, b.id);
      out.push(ev(world, sim, 'business_failed', `Closed the ${type?.label.toLowerCase() ?? 'business'} after six losing months`));
      remember(sim, `Closed the ${type?.label.toLowerCase() ?? 'business'} after it kept losing money`);
    } else {
      // Valued at 2 years of its own trailing profit, so winners and losers show in net worth
      // (it used to be a fixed multiple of the type's average, identical for every business of a type).
      b.avgProfit = b.avgProfit === undefined ? profit : Math.round(b.avgProfit * 0.9 + profit * 0.1);
      b.value = businessValue(b.avgProfit);
    }
  }
  post(sim, 'business_profit', bizProfit);
  post(sim, 'tax', -Math.round((gross + Math.max(0, bizProfit)) * taxRate((gross + Math.max(0, bizProfit)) * 12)));

  // 5. Housing and rentals
  const h = home(sim);
  if (h) post(sim, 'home_costs', -propertyCarry(h));
  else post(sim, 'rent_paid', -rentPaid(sim, m));
  let rentIn = 0, rentalCosts = 0;
  for (const r of rentals(sim)) {
    if (birthday && r.rent && r.tenantId === undefined) r.rent = Math.round(r.rent * (1 + Math.max(-0.02, world.market.lastHomeReturn * 6)));
    if (r.tenantId) rentIn += r.rent ?? 0;
    rentalCosts += propertyCarry(r);
  }
  post(sim, 'rent_received', rentIn);
  post(sim, 'rental_costs', -rentalCosts);

  // 6. Living costs, loan payments, repairs
  post(sim, 'living', -livingCost(sim, m));
  post(sim, 'loan_payments', -payLoans(sim, m));
  let repairs = 0;
  if (h && rng.chance(0.01)) repairs += Math.round(rng.range(dollars(1000), dollars(8000)));
  if (sim.assets.some((a) => a.kind === 'car') && rng.chance(0.02)) repairs += Math.round(rng.range(dollars(500), dollars(3000)));
  for (let i = 0; i < rentals(sim).length; i++) if (rng.chance(0.015)) repairs += Math.round(rng.range(dollars(1000), dollars(6000)));
  post(sim, 'repairs', -repairs);
  if (repairs > dollars(2000)) { out.push(ev(world, sim, 'repair', `Paid ${fmt(repairs)} in repairs`)); remember(sim, `Paid ${fmt(repairs)} in surprise repairs`); }

  // 7. Standing order and retiree drawdown
  const surplus = flowTotal(sim) - flowsBefore;
  if (surplus > 0 && !sim.retired && sim.cash > cashCushion(sim, m) && effectiveAutoInvest(sim) > 0) {
    // The standing order splits by temperament: cautious sims keep most of it in the savings account
    const amt = Math.round(surplus * effectiveAutoInvest(sim));
    const risky = Math.round(amt * riskyShare(sim));
    post(sim, 'auto_invest', -risky);
    if (sim.archetype === 'picker') sim.stocks += risky; else sim.index += risky;
    post(sim, 'to_savings', -(amt - risky));
    sim.savings = (sim.savings ?? 0) + (amt - risky);
  }
  // Habitual savers keep their emergency cushion in the savings account, with one month of essentials in checking
  if (!sim.retired && (sim.saveHabit ?? 1) >= 0.5) {
    const need = emergencyFloor(sim, m) - (sim.savings ?? 0);
    const buffer = essentialSpend(sim, m);
    const move = Math.min(need, sim.cash - buffer);
    if (move > 0) { post(sim, 'to_savings', -move); sim.savings = (sim.savings ?? 0) + move; }
  }
  const living = livingCost(sim, m);
  if (sim.retired && sim.cash < living * 2 && (sim.savings ?? 0) > 0) {
    const fromSavings = Math.min(sim.savings ?? 0, living * 2 - sim.cash);
    sim.savings = (sim.savings ?? 0) - fromSavings; post(sim, 'from_savings', fromSavings);
  }
  if (sim.retired && sim.cash < living * 2) {
    const take = Math.min(living * 2 - sim.cash, sim.index + sim.stocks);
    const fromIndex = Math.min(sim.index, take);
    sim.index -= fromIndex; sim.stocks -= take - fromIndex;
    post(sim, 'sell_investments', take);
  }

  // 8. Markets move holdings and property; savings earn ~0.5%/yr after inflation, checking cash loses ~2.5%/yr to it
  if (sim.savings) sim.savings = Math.round(sim.savings * (1 + 0.005 / 12));
  if (sim.cash > 0) post(sim, 'inflation', -Math.round((sim.cash * 0.025) / 12));
  sim.index = Math.round(sim.index * (1 + world.market.lastIndexReturn));
  sim.stocks = Math.round(sim.stocks * Math.max(0, 1 + world.market.stockReturn + rng.normal(0, 0.045))); // each sim's own picks
  for (const a of sim.assets) {
    if (a.kind === 'home' || a.kind === 'rental') a.value = Math.round(a.value * (1 + world.market.lastHomeReturn) * (1 + rng.normal(0, 0.002)));
    if (a.kind === 'car') a.value = Math.round(a.value * (1 - 0.15 / 12));
  }

  // 9. Shortfalls: draw savings, sell investments, then the credit card up to its limit, then bills go unpaid
  if (sim.cash < 0 && (sim.savings ?? 0) > 0) {
    const fromSavings = Math.min(sim.savings ?? 0, -sim.cash);
    sim.savings = (sim.savings ?? 0) - fromSavings; post(sim, 'from_savings', fromSavings);
  }
  if (sim.cash < 0) {
    const fromIndex = Math.min(sim.index, -sim.cash); sim.index -= fromIndex; post(sim, 'sell_investments', fromIndex);
    const fromStocks = Math.min(sim.stocks, -sim.cash); sim.stocks -= fromStocks; post(sim, 'sell_investments', fromStocks);
  }
  const card = cardLoan(sim);
  const pastDue = loanOfKind(sim, 'past_due');
  if (sim.cash < 0) {
    const room = Math.max(0, cardLimit(sim, m) - card.balance);
    const draw = Math.min(room, -sim.cash);
    card.balance += draw; post(sim, 'card_draw', draw);
    if (sim.cash < 0) { pastDue.balance += -sim.cash + dollars(35); post(sim, 'unpaid_bills', -sim.cash); }
  }
  // Catch up: past-due bills first, then the card, out of cash above the cushion
  if (pastDue.balance > 0) {
    pastDue.balance = Math.round(pastDue.balance * 1.02);
    const pay = Math.min(pastDue.balance, Math.max(0, sim.cash));
    pastDue.balance -= pay; post(sim, 'past_due_payment', -pay);
  }
  const floor = cashCushion(sim, m);
  if (card.balance > 0 && sim.cash > floor) {
    const pay = Math.min(card.balance, sim.cash - floor);
    card.balance -= pay; post(sim, 'card_payment', -pay);
  }
  if (pastDue.balance > 0) {
    sim.missedPayments++;
    sim.creditHistory = (sim.creditHistory ?? 0) + 60;
    out.push(ev(world, sim, 'missed_payment', `Missed payments: ${fmt(pastDue.balance)} past due`));
    if (sim.missedPayments === 1) remember(sim, 'Started missing payments');
  } else {
    sim.missedPayments = 0;
    sim.creditHistory = Math.max(0, (sim.creditHistory ?? 0) - 2);
  }
  sim.creditScore = creditScoreFor({
    historyPenalty: sim.creditHistory ?? 0,
    cardBalance: card.balance,
    cardLimit: cardLimit(sim, m),
    nonMortgageDebt: sim.loans.filter((l) => l.kind !== 'mortgage').reduce((t, l) => t + l.balance, 0),
    annualIncome: incomeBasis(sim, m) * 12,
    monthsOfHistory: m - sim.arrivedMonth,
    pastDueNow: pastDue.balance > 0,
    inBankruptcy: sim.bankruptUntil !== undefined && m < sim.bankruptUntil,
  });
  pruneLoans(sim, m);
  if (sim.missedPayments >= 3) out.push(...bankrupt(world, sim));

  // 10. Forced retirement and bookkeeping
  if (!sim.retired && ageInt(sim, m) >= 72) {
    retire(sim);
    out.push(ev(world, sim, 'retired', 'Retired at 72'));
  }
  const nw = balanceSheet(sim).netWorth;
  if (nw > sim.peakNetWorth) sim.peakNetWorth = nw;
  return out;
}

export function retire(sim: Sim) {
  sim.retired = true; sim.employed = false; sim.selfEmployed = false; sim.salary = 0;
}

/** Remove a business; its loan stays (personal guarantee). A full-time owner goes back to job hunting. */
/** A going concern is worth 24 months of its trailing profit; a business losing money on average is worth nothing. */
export const businessValue = (avgMonthlyProfit: Cents): Cents => Math.max(0, Math.round(avgMonthlyProfit * 24));

export function closeBusiness(world: World, sim: Sim, assetId: string) {
  sim.assets = sim.assets.filter((a) => a.id !== assetId);
  const loan = sim.loans.find((l) => l.assetId === assetId);
  if (loan) loan.assetId = undefined;
  if (sim.selfEmployed && !sim.assets.some((a) => a.kind === 'business')) {
    sim.selfEmployed = false; sim.employed = false; sim.salary = 0; sim.monthsUnemployed = 1;
  }
}

export function bankrupt(world: World, sim: Sim): SimEvent[] {
  const m = world.month;
  // Sell property and investments; secured loans are paid from their collateral where possible.
  let recovered = 0;
  for (const a of [...sim.assets]) {
    // A seized cottage's tenant moves out now, as on a sale (otherwise they point at a unit that no longer exists until next month).
    if (a.kind === 'rental' && a.tenantId) {
      const t = world.sims.find((x) => x.id === a.tenantId);
      // delete (not = undefined): a snapshot-resumed world has no such keys, and replays must be byte-identical
      if (t && t.rentsUnit === a.id) { delete t.rentsUnit; delete t.landlordId; delete t.unitRent; }
    }
    const loan = sim.loans.find((l) => l.assetId === a.id);
    if (a.kind === 'home' || a.kind === 'rental') recovered += Math.max(0, Math.round(a.value * 0.9) - (loan?.balance ?? 0));
    if (loan) loan.balance = 0;
  }
  sim.assets = [];
  sim.selfEmployed = false;
  recovered += sim.index + sim.stocks + (sim.savings ?? 0); sim.index = 0; sim.stocks = 0; sim.savings = 0;
  post(sim, 'bankruptcy', recovered);
  // Unsecured debt is paid from what's left, then wiped, except student loans, which survive bankruptcy.
  for (const l of sim.loans) {
    if (l.kind === 'student') continue;
    const pay = Math.min(Math.max(0, sim.cash), l.balance);
    post(sim, 'bankruptcy', -pay);
    l.balance = 0;
  }
  pruneLoans(sim, m);
  sim.missedPayments = 0;
  sim.creditHistory = (sim.creditHistory ?? 0) + 150;
  sim.creditScore = 520;
  sim.bankruptUntil = m + 84;
  sim.bankruptcies++;
  remember(sim, 'Went bankrupt and lost everything but the apprenticeship debt');
  return [{ month: m, simId: sim.id, type: 'bankrupt', text: 'Declared bankrupt before the magistrate' }];
}

