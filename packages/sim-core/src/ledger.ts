// Every change to a sim's cash goes through post(), tagged with a kind. sim.flows holds this month's totals,
// so (cash at end of month) - (cash at end of last month) always equals the sum of sim.flows.
import type { Cents, Sim } from './types.ts';

export type FlowKind =
  | 'arrival' | 'salary' | 'benefits' | 'pension' | 'part_time' | 'tax'
  | 'rent_paid' | 'home_costs' | 'rental_costs' | 'rent_received' | 'living' | 'loan_payments' | 'repairs'
  | 'business_profit' | 'business_exit' | 'auto_invest' | 'invest' | 'sell_investments' | 'pay_debt'
  | 'down_payment' | 'closing_costs' | 'sale_proceeds' | 'business_startup' | 'car_down_payment'
  | 'card_draw' | 'card_payment' | 'unpaid_bills' | 'past_due_payment' | 'bankruptcy' | 'inheritance' | 'rental_sale'
  | 'to_savings' | 'from_savings' | 'inflation' | 'discretionary';

export function post(sim: Sim, kind: FlowKind, amount: Cents) {
  if (!amount) return;
  sim.cash += amount;
  sim.flows[kind] = (sim.flows[kind] ?? 0) + amount;
}

export function resetFlows(sim: Sim) {
  sim.flows = {};
}

export const flowTotal = (sim: Sim) => Object.values(sim.flows).reduce((s, v) => s + v, 0);
