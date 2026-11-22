// Money math shared by cash flow, the rules engine and the read model.
import type { Asset, Cents, Sim, World } from './types.ts';
import { CAREER, ARCHETYPE } from './data.ts';
import { dollars } from './money.ts';
import { post } from './ledger.ts';

export const ageYears = (sim: Sim, month: number) => (month - sim.birthMonth) / 12;
export const ageInt = (sim: Sim, month: number) => Math.floor(ageYears(sim, month));
export const career = (sim: Sim) => CAREER[sim.career];
export const inSchool = (sim: Sim, month: number) => ageYears(sim, month) < career(sim).startAge && !sim.retired;

/** Salary for this career at this age if employed: linear from start to peak over 20 years. */
export function careerSalary(sim: Sim, month: number): Cents {
  const c = career(sim);
  const yrs = Math.max(0, ageYears(sim, month) - c.startAge);
  const f = Math.min(1, yrs / 20);
  return Math.round(c.startSalary + (c.peakSalary - c.startSalary) * f);
}

/** Effective income tax rate (federal + state, flattened). */
/**
 * SPEC decision 17: one crude progressive schedule, marginal (payroll tax folded in, no state tax).
 * Each rate applies only to the slice of income above its threshold, so a raise never lowers take-home pay.
 */
export const TAX_BRACKETS: ReadonlyArray<readonly [fromDollars: number, rate: number]> = [
  [0, 0], [12_000, 0.18], [50_000, 0.28], [100_000, 0.33], [200_000, 0.37],
];

/** Annual tax in cents on an annual gross income in cents. */
export function annualTax(grossAnnual: Cents): Cents {
  let tax = 0;
  for (let i = 0; i < TAX_BRACKETS.length; i++) {
    const lo = TAX_BRACKETS[i][0] * 100;
    const hi = i + 1 < TAX_BRACKETS.length ? TAX_BRACKETS[i + 1][0] * 100 : Infinity;
    if (grossAnnual > lo) tax += (Math.min(grossAnnual, hi) - lo) * TAX_BRACKETS[i][1];
  }
  return Math.round(tax);
}

/** Effective (average) tax rate on an annual gross income: what callers multiply gross pay by. */
export function taxRate(grossAnnual: Cents): number {
  return grossAnnual > 0 ? annualTax(grossAnnual) / grossAnnual : 0;
}

export const home = (sim: Sim) => sim.assets.find((a) => a.kind === 'home');
export const rentals = (sim: Sim) => sim.assets.filter((a) => a.kind === 'rental');
export const car = (sim: Sim) => sim.assets.find((a) => a.kind === 'car');
export const businesses = (sim: Sim) => sim.assets.filter((a) => a.kind === 'business');

/** Property tax + insurance + maintenance per month (1.1% + 0.6% + 1.0% of value a year). */
export const propertyCarry = (a: Asset): Cents => Math.round((a.value * 0.027) / 12);

export function loanFor(sim: Sim, assetId: string) {
  return sim.loans.find((l) => l.assetId === assetId);
}

/** Rent paid by a sim without a home of their own: a sim landlord's unit, or a town apartment. */
export function rentPaid(sim: Sim, month: number): Cents {
  if (home(sim)) return 0;
  if (sim.rentsUnit && sim.unitRent) return sim.unitRent;
  if (inSchool(sim, month)) return dollars(500); // shared housing while studying
  if (sim.salary <= 0) return dollars(900);
  return Math.round(Math.min(dollars(3500), Math.max(dollars(900), (sim.salary / 12) * 0.28)));
}

/** Monthly housing cost: rent, or the home's tax/insurance/maintenance (mortgage counted in loan payments). */
export function housingCost(sim: Sim, month: number): Cents {
  const h = home(sim);
  return h ? propertyCarry(h) : rentPaid(sim, month);
}

export function scheduledLoanPayments(sim: Sim, month: number): Cents {
  return sim.loans.reduce((s, l) => {
    if (l.kind === 'card') return s + (l.balance > 0 ? Math.max(dollars(25), Math.round(l.balance * 0.03)) : 0);
    if (l.kind === 'past_due') return s;
    if (l.deferredUntil !== undefined && month < l.deferredUntil) return s;
    return s + Math.min(l.payment, l.balance + Math.round(l.balance * (l.annualRate / 12)));
  }, 0);
}

/** Gross monthly income from work, benefits or pension (business profit is separate). */
export function grossMonthlyIncome(sim: Sim, month: number): Cents {
  if (inSchool(sim, month)) return dollars(1000); // part-time work while studying
  if (sim.retired) return pensionMonthly(sim, month);
  if (sim.employed) return Math.round(sim.salary / 12);
  if (sim.selfEmployed) return 0;
  if (sim.monthsUnemployed <= 6) return Math.min(dollars(2500), Math.round((careerSalary(sim, month) / 12) * 0.4));
  return 0;
}

/** Expected monthly profit from the sim's businesses (midpoint of each range, never negative). */
export function businessIncomeMonthly(sim: Sim): Cents {
  return sim.assets.filter((a) => a.kind === 'business').reduce((s, a) => s + Math.max(0, Math.round(((a.profitLo ?? 0) + (a.profitHi ?? 0)) / 2)), 0);
}

/** What lenders and budgets treat as income: work income plus expected business profit. */
export function incomeBasis(sim: Sim, month: number): Cents {
  return grossMonthlyIncome(sim, month) + businessIncomeMonthly(sim);
}

export function pensionMonthly(sim: Sim, month: number): Cents {
  const c = career(sim);
  const age = ageYears(sim, month);
  let p = 0;
  if (c.pension) p += Math.round((c.peakSalary / 12) * 0.45);
  if (age >= 67) p += Math.min(dollars(3200), Math.round((c.peakSalary / 12) * 0.3));
  return p;
}

/** The monthly lifestyle a retiree spends toward (excluding housing, loans and health insurance). */
export function retiredLifestyle(sim: Sim): Cents {
  return Math.round((career(sim).peakSalary / 12) * 0.42 * (ARCHETYPE[sim.archetype].consumption / 0.7));
}

/** Health insurance a retiree pays before Medicare at 65. */
export function preMedicareHealth(sim: Sim, month: number): Cents {
  return ageYears(sim, month) < 65 ? dollars(650) : 0;
}

/** Share of after-housing income spent: the archetype's share, with the saved part scaled by the sim's own habit. */
export function consumptionShare(sim: Sim): number {
  const base = ARCHETYPE[sim.archetype].consumption;
  return Math.min(0.99, Math.max(0.3, 1 - (1 - base) * (sim.saveHabit ?? 1)));
}

/** The auto-invest standing order actually in effect: sims who rarely save don't keep one. */
export const effectiveAutoInvest = (sim: Sim): number => ((sim.saveHabit ?? 1) < 0.5 ? 0 : sim.autoInvestPct);

/** Living costs excluding housing and loans. */
export function livingCost(sim: Sim, month: number): Cents {
  const arch = ARCHETYPE[sim.archetype];
  if (inSchool(sim, month)) return dollars(330); // school months roughly break even; tuition goes on the student loan
  if (sim.retired) {
    // Retirees spend toward their old lifestyle, but adjust to what pension + a 4% drawdown can support.
    // Before Medicare (65) they also buy their own health insurance.
    const health = preMedicareHealth(sim, month);
    const budget = pensionMonthly(sim, month) + ((sim.index + sim.stocks) * 0.04) / 12 - housingCost(sim, month) - scheduledLoanPayments(sim, month);
    return Math.round(Math.max(dollars(900), Math.min(retiredLifestyle(sim), budget - health)) + health);
  }
  const gross = sim.employed ? sim.salary / 12 : sim.selfEmployed ? businessIncomeMonthly(sim) : (careerSalary(sim, month) / 12) * 0.5;
  const net = gross * (1 - taxRate(gross * 12));
  const afterHousing = Math.max(0, net - housingCost(sim, month) - scheduledLoanPayments(sim, month));
  // TODO(golden-change run): essentials for one person cost ~$1,800/mo (out of work ~$1,300); raising this changes
  // what the model sees in 10 golden requests, so it ships with the d3 re-eval (docs/LOOP.md B-TOP budgets a).
  const floor = sim.employed || sim.selfEmployed ? dollars(1100) : dollars(800); // out of work: bare-bones budget
  return Math.round(Math.max(floor, afterHousing * consumptionShare(sim)));
}

/** Rent collected minus carrying costs, before mortgage. */
export function rentalNetBeforeMortgage(a: Asset): Cents {
  return (a.tenantId ? a.rent ?? 0 : 0) - propertyCarry(a);
}

export function balanceSheet(sim: Sim) {
  const property = sim.assets.filter((a) => a.kind === 'home' || a.kind === 'rental').reduce((s, a) => s + a.value, 0);
  const other = sim.assets.filter((a) => a.kind === 'car' || a.kind === 'business').reduce((s, a) => s + a.value, 0);
  const debt = sim.loans.reduce((s, l) => s + l.balance, 0);
  const investments = sim.index + sim.stocks;
  const savings = sim.savings ?? 0;
  return { cash: sim.cash, savings, investments, property, other, debt, netWorth: sim.cash + savings + investments + property + other - debt };
}

export const netWorth = (sim: Sim) => balanceSheet(sim).netWorth;

/** Cash plus sellable investments above the emergency floor: what a purchase can draw on. */
export function liquidAbove(sim: Sim, month: number): Cents {
  return sim.cash + (sim.savings ?? 0) + sim.index + Math.round(sim.stocks * 0.95) - emergencyFloor(sim, month);
}

/** Draw savings, then sell investments (index first), until cash reaches the target. */
export function raiseCash(sim: Sim, target: Cents) {
  if (sim.cash >= target) return;
  const fromSavings = Math.min(sim.savings ?? 0, target - sim.cash);
  if (fromSavings > 0) { sim.savings = (sim.savings ?? 0) - fromSavings; post(sim, 'from_savings', fromSavings); }
  if (sim.cash >= target) return;
  const fromIndex = Math.min(sim.index, target - sim.cash);
  sim.index -= fromIndex; post(sim, 'sell_investments', fromIndex);
  if (sim.cash >= target) return;
  const fromStocks = Math.min(sim.stocks, target - sim.cash);
  sim.stocks -= fromStocks; post(sim, 'sell_investments', fromStocks);
}

/** Essential monthly spend: housing + loan payments + living. */
export function essentialSpend(sim: Sim, month: number): Cents {
  return housingCost(sim, month) + scheduledLoanPayments(sim, month) + livingCost(sim, month);
}

/** Cash a sim keeps untouched: three months of essentials (savers keep more). */
/** The part of the emergency cushion that must sit in checking cash: whatever savings doesn't already cover. */
export function cashCushion(sim: Sim, month: number): Cents {
  return Math.max(0, emergencyFloor(sim, month) - (sim.savings ?? 0));
}

/**
 * Share of each month's saving that goes into investments rather than the savings account. People who invest by
 * nature (index investors, early retirees, stock pickers) invest most; otherwise it rises with risk-taking and falls
 * with loss aversion, so cautious sims keep most of it in savings.
 */
export function riskyShare(sim: Sim): number {
  if (sim.archetype === 'index' || sim.archetype === 'fire' || sim.archetype === 'picker') return 0.9;
  const t = sim.traits;
  return Math.max(0, Math.min(1, 0.3 + 1.2 * (t.risk - 0.5) - 0.8 * ((t.lossAversion ?? 0.5) - 0.5)));
}

export function emergencyFloor(sim: Sim, month: number): Cents {
  const months = sim.archetype === 'saver' ? 6 : sim.archetype === 'spender' ? 1.5 : 3;
  return Math.round(essentialSpend(sim, month) * months);
}

/** Debt-to-income with an optional new monthly payment and new rent income (lenders count 75% of rent). */
export function dti(sim: Sim, month: number, extraPayment: Cents = 0, extraRent: Cents = 0, replacesHousing = false): number {
  const income = incomeBasis(sim, month) + rentals(sim).reduce((s, a) => s + Math.round((a.rent ?? 0) * 0.75), 0) + Math.round(extraRent * 0.75);
  if (income <= 0) return Infinity;
  const h = home(sim);
  const housing = replacesHousing ? 0 : h ? propertyCarry(h) : rentPaid(sim, month); // renters' rent counts, unless this purchase replaces it
  const debts = sim.loans.filter((l) => l.kind !== 'card' && l.kind !== 'past_due').reduce((s, l) => s + l.payment, 0);
  return (housing + debts + extraPayment) / income;
}

export function canBorrow(sim: Sim, month: number): boolean {
  return !(sim.bankruptUntil && month < sim.bankruptUntil) && sim.creditScore >= 580 && !inSchool(sim, month)
    && !sim.loans.some((l) => l.kind === 'past_due' && l.balance > 0);
}

/** Rate offered on new loans: market mortgage rate plus a credit spread. */
export function offeredRate(sim: Sim, world: World, kind: 'mortgage' | 'auto' | 'business'): number {
  const credit = sim.creditScore >= 760 ? 0 : sim.creditScore >= 700 ? 0.004 : sim.creditScore >= 640 ? 0.01 : 0.02;
  const base = world.market.mortgageRate;
  if (kind === 'mortgage') return base + credit;
  if (kind === 'auto') return base + 0.01 + credit;
  return base + 0.03 + credit;
}
