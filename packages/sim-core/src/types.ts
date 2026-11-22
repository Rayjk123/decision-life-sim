// Core data structures. All money is integer cents. Months are absolute month numbers since world start.

export type Cents = number;
export type SimId = string;

export type ArchetypeKey =
  | 'saver' | 'index' | 'picker' | 're' | 'biz' | 'spender' | 'status' | 'fire' | 'balanced';

export type Regime = 'expansion' | 'boom' | 'recession' | 'crash';

export interface Traits {
  risk: number;          // 0..1 risk tolerance
  debt: number;          // comfort with debt
  status: number;        // desire for status
  patience: number;      // long-term thinking
  discipline: number;    // sticks to the plan; sharpens the model's spread when picking
  herding: number;       // fear of missing out
  lossAversion: number;
}

export interface Market {
  regime: Regime;
  monthsInRegime: number;
  indexLevel: number;      // index fund price level, 1000 at start
  lastIndexReturn: number; // last month's return, e.g. 0.012
  stockReturn: number;     // last month's return for the "single stocks" basket
  lastHomeReturn: number;  // last month's home price change
  homeIndex: number;       // home price multiplier, 1.0 at start
  mortgageRate: number;    // annual, e.g. 0.061
  jobsSignal: 'strong' | 'steady' | 'weak';
}

export type LoanKind = 'mortgage' | 'auto' | 'student' | 'business' | 'card' | 'past_due';

export interface Loan {
  id: string;
  kind: LoanKind;
  balance: Cents;
  annualRate: number;
  payment: Cents;          // scheduled monthly payment (card: minimum computed monthly)
  assetId?: string;        // collateral
  deferredUntil?: number;  // student loans: no payments until this month
}

export type AssetKind = 'home' | 'rental' | 'car' | 'business';

export interface Asset {
  id: string;
  kind: AssetKind;
  value: Cents;
  boughtMonth: number;
  // rentals
  rent?: Cents;
  tenantId?: SimId;        // the sim renting this unit; none = vacant
  vacantMonths?: number;
  // businesses
  businessType?: string;
  profitLo?: Cents;
  profitHi?: Cents;
  failYr1?: number;
  lossMonths?: number;     // consecutive losing months
  avgProfit?: Cents;       // trailing monthly profit (each month weighs 10%), drives the business's value
  quality?: number;        // how well this business is run, drawn once at start (~lognormal around 1, 0.4-2.2)
}

export interface Sim {
  id: SimId;
  name: string;
  birthMonth: number;        // month when age was 0
  deathMonth: number;        // hidden from the sim and the model
  arrivedMonth: number;
  career: string;            // key into CAREERS
  archetype: ArchetypeKey;
  traits: Traits;
  persona: string;           // short description sent to the model

  cash: Cents;
  index: Cents;              // index fund holdings (market value)
  stocks: Cents;             // single-stock basket (market value)
  assets: Asset[];
  loans: Loan[];
  creditScore: number;
  bankruptUntil?: number;    // no new borrowing before this month
  missedPayments: number;    // consecutive months unable to pay
  creditHistory?: number;    // payment-history penalty points: +60 per month past due, +150 at bankruptcy, heal 2/clean month

  salary: Cents;             // current annual gross salary (0 when unemployed, self-employed or retired)
  employed: boolean;
  selfEmployed: boolean;     // runs a full-time business instead of a job
  rentsUnit?: string;        // asset id of a sim-owned rental this sim lives in (otherwise town apartments)
  landlordId?: SimId;
  unitRent?: Cents;
  monthsUnemployed: number;
  retired: boolean;

  autoInvestPct: number;     // standing order: share of monthly surplus into investments (0..0.6)
  memory: string[];          // last six notable outcomes, newest first
  lastDecisionMonth: number;
  peakNetWorth: Cents;
  bankruptcies: number;
  /** This month's cash movements by kind (reset each month). Sum equals the change in cash. */
  flows: Record<string, Cents>;
}

export type StateStyle = 'words' | 'numbers' | 'terse' | 'focused';

export type MoveKind =
  | 'nothing' | 'invest_index' | 'trade_stocks' | 'pay_debt'
  | 'buy_home' | 'buy_rental' | 'sell_rental' | 'buy_car' | 'start_business';

export interface Move {
  id: string;               // option name shown to the model, e.g. "buy_rental"
  kind: MoveKind;
  description: string;      // e.g. "Buy a $160k starter rental: $37k cash, +$57/mo after costs"
  price?: Cents;
  cashNeeded?: Cents;
  businessType?: string;
  assetId?: string;
  homeTier?: number;
}

/** Answers in the decision model's shape: probabilities per option. */
export interface Answers {
  main: Record<string, number>;          // move id -> probability
  investShare?: Record<string, number>;  // level index "0".."5" -> probability
  retire?: number;                       // probability of yes
}

export interface DecisionRecord {
  simId: SimId;
  month: number;
  provider: string;          // 'kev' (the /v1/systemone protocol) | 'heuristic' | 'heuristic-fallback' | 'random'
  model?: string;            // the model that actually answered, e.g. 'd3' or 'kev-latest' (provider alone can't tell Kev from d3)
  moves: string[];
  answers: Answers;
  picked: string;
  draw: number;
  heuristicPick: string;
  reason: string;
  investLevel?: number;
  retired?: boolean;
  valid: boolean;
  latencyMs: number;
  tokens: number;
  state?: Record<string, unknown>;   // what the model saw (kept in public decision files, not the log)
  descriptions?: Record<string, string>;
}

export type EventType =
  | 'arrived' | 'started_career' | 'raise' | 'laid_off' | 'hired' | 'retired' | 'died'
  | 'decision' | 'bought_home' | 'bought_rental' | 'sold_rental' | 'bought_car' | 'started_business'
  | 'business_failed' | 'invested' | 'paid_debt' | 'repair' | 'vacancy' | 'tenant_found'
  | 'missed_payment' | 'bankrupt' | 'regime_change' | 'inherited' | 'moved_in' | 'moved_out' | 'rent_cut' | 'business_exit';

export interface SimEvent {
  month: number;
  simId?: SimId;
  type: EventType;
  text: string;
  data?: Record<string, unknown>;
}

export interface HallOfFameEntry {
  simId: SimId; name: string; archetype: ArchetypeKey; career: string;
  ageAtDeath: number; finalNetWorth: Cents; peakNetWorth: Cents; diedMonth: number;
}

export interface Economy {
  localSpend: Cents;        // residents' monthly spending at local businesses
  businessCount: number;
  typeCounts: Record<string, number>; // businesses of each type in town
  demandIndex: number;      // local spending per business vs a healthy level (1 = healthy)
  rentalUnits: number;
  vacantUnits: number;
}

export interface World {
  seed: number;
  month: number;
  targetPopulation: number;
  nextSimNumber: number;
  market: Market;
  economy: Economy;
  sims: Sim[];
  hallOfFame: HallOfFameEntry[];
  pendingEstates: Array<{ fromId: SimId; fromName: string; amount: Cents }>;
}

/** Anything that turns (state, questions) into probabilities: Kev, Jev or the heuristic. */
export interface Decider {
  name: string;
  decide(req: DecisionRequest): Promise<DecisionResult>;
}

export interface DecisionRequest {
  sim: Sim;
  world: World;
  moves: Move[];
  askRetire: boolean;
  state: Record<string, unknown>;      // the compact state object sent to the model
  questions: Record<string, unknown>;  // Kev / Jev questions object
}

export interface DecisionResult {
  answers: Answers;
  provider: string;
  model?: string;
  latencyMs: number;
  tokens: number;
}
