// The town's setting: a medieval market town (user direction, 2026-11-22, to match the pixel town).
// Every word the model, memories, events and screens use for money, assets, debts and the economy comes from here.
// Mechanics and numbers don't change: the steady pooled investment is still the "index", the risky one "stocks",
// in the code and the data; only the names people read do.
import type { LoanKind, Regime } from './types.ts';

/** The currency, written after the amount: "12k crowns". */
export const CURRENCY = 'crowns';

/** The steady, pooled investment (the code's index fund). */
export const FUND = 'Guild Fund';
/** The risky, single-bet investment (the code's stocks). Not "ventures": in plain English that means starting a business. */
export const VENTURES = 'trading voyages';
/** The safe account with a small return (the code's savings account). */
export const VAULT = 'counting-house vault';

export const LOAN_NAME: Record<LoanKind, string> = {
  mortgage: 'house loan',
  auto: 'cart loan',
  student: 'apprenticeship debt',
  business: 'business loan',
  card: "moneylender's debt (like a credit card)",
  past_due: 'overdue bills',
};

/** Home tiers (keys match HOME_TIERS). */
export const HOME_NAME = { starter: 'cottage', family: 'townhouse', luxury: 'manor house' } as const;
/** A rental property and a vehicle. */
export const RENTAL = 'cottage to let';
export const CART = 'horse and cart';
/** A costly vehicle (what a status seeker or a spender buys). */
export const CARRIAGE = 'fine carriage';
/** Price above which the vehicle is a carriage, not a cart (cents). */
export const CARRIAGE_FROM = 3_500_000;

/** Economy regimes as townsfolk would say them. */
export const REGIME_NAME: Record<Regime, string> = {
  expansion: 'steady trade',
  boom: 'a bountiful year',
  recession: 'a lean year',
  crash: 'a blight on the land',
};

/** The public jobs signal. */
export const JOBS_NAME = { strong: 'work is plentiful', steady: 'work is steady', weak: 'work is scarce' } as const;

/** Rates and prices in the market line. */
export const RATE_NAME = "moneylender's rate";
export const HOME_PRICES = 'house prices';
