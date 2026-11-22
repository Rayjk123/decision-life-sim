import type { ArchetypeKey, Regime, Traits } from '@dls/sim-core';

/** A hand-built situation, in dollars (not cents) so the golden files stay readable. */
export interface SimSpec {
  name?: string;
  archetype: ArchetypeKey;
  persona?: ArchetypeKey;          // use another archetype's persona text (traits stay as given)
  traits?: Partial<Traits>;
  career: string;
  age: number;
  salary?: number;                 // default: the career's salary at this age
  employed?: boolean;              // default true
  selfEmployed?: boolean;
  retired?: boolean;
  monthsUnemployed?: number;
  cash: number;
  index?: number;
  stocks?: number;
  home?: { value: number; mortgage: number };
  rentals?: Array<{ value: number; mortgage: number; rented: boolean; rent?: number }>;
  car?: { value: number; ageMonths: number; loan?: number };
  debts?: Array<{ kind: 'card' | 'student' | 'auto' | 'business'; balance: number; rate: number; payment?: number }>;
  business?: { type: string; ageMonths: number };
  memory?: string[];
}

export interface MarketSpec {
  regime?: Regime;
  lastIndexReturn?: number;
  lastHomeReturn?: number;
  mortgageRate?: number;
  jobsSignal?: 'strong' | 'steady' | 'weak';
}

export interface EconomySpec {
  rentalUnits?: number;
  vacantUnits?: number;
  businessCount?: number;
  demandIndex?: number;
}

/** Move ids may use a trailing * to match a family: "start_*", "buy_home*". */
export type MovePattern = string;

export interface Expectation {
  options: MovePattern[];                 // must be legal, or the scenario is invalid
  best: MovePattern[];                    // in-character picks: the top choice should be one of these
  avoid?: MovePattern[];                  // out-of-character picks
  maxAvoidMass?: number;                  // probability allowed on avoid (default 0.3)
  constraints?: Array<{ more: MovePattern | MovePattern[]; than: MovePattern | MovePattern[] }>;
  retire?: { min?: number; max?: number };
}

export interface Scenario {
  id: string;
  category: 'personality' | 'situation' | 'memory' | 'lifecycle';
  title: string;
  sim: SimSpec;
  market?: MarketSpec;
  economy?: EconomySpec;
  expect: Expectation;
  rationale: string;
}

export interface Pair {
  id: string;
  title: string;
  base: string;                              // scenario id
  change: Record<string, unknown>;           // dot paths into the scenario, e.g. {"sim.archetype": "spender"}
  measure: MovePattern | MovePattern[] | 'retire';
  direction: 'up' | 'down';
  minDelta?: number;                         // default 0.03
  rationale: string;
}
