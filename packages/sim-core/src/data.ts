// Static tables: careers, archetypes, businesses, names. All money in cents; numbers are game values to tune.
import type { ArchetypeKey, Traits, Cents } from './types.ts';
import { k } from './money.ts';

export type LayoffRisk = 'very_low' | 'low' | 'medium' | 'high' | 'volatile';

export interface Career {
  key: string;
  label: string;
  startAge: number;        // full pay starts at this age; school or training before it
  debtAtStart: Cents;      // student or training loans accumulated by startAge
  startSalary: Cents;      // annual
  peakSalary: Cents;       // reached after ~20 years
  layoff: LayoffRisk;
  pension: boolean;
  workplace: 'hospital' | 'office' | 'school' | 'factory' | 'shop' | 'civic' | 'realtor';
  unlocksBusiness?: string[];
}

export const CAREERS: Career[] = [
  { key: 'retail', label: 'Retail worker', startAge: 18, debtAtStart: 0, startSalary: k(28), peakSalary: k(40), layoff: 'high', pension: false, workplace: 'shop' },
  { key: 'warehouse', label: 'Warehouse worker', startAge: 18, debtAtStart: 0, startSalary: k(34), peakSalary: k(52), layoff: 'high', pension: false, workplace: 'factory' },
  { key: 'military', label: 'Soldier', startAge: 18, debtAtStart: 0, startSalary: k(35), peakSalary: k(70), layoff: 'very_low', pension: true, workplace: 'civic' },
  { key: 'plumber', label: 'Plumber', startAge: 18, debtAtStart: 0, startSalary: k(38), peakSalary: k(110), layoff: 'low', pension: false, workplace: 'factory', unlocksBusiness: ['trades_company'] },
  { key: 'electrician', label: 'Electrician', startAge: 18, debtAtStart: 0, startSalary: k(40), peakSalary: k(115), layoff: 'low', pension: false, workplace: 'factory', unlocksBusiness: ['trades_company'] },
  { key: 'hvac', label: 'HVAC technician', startAge: 19, debtAtStart: k(8), startSalary: k(40), peakSalary: k(95), layoff: 'low', pension: false, workplace: 'factory', unlocksBusiness: ['trades_company'] },
  { key: 'trucker', label: 'Truck driver', startAge: 19, debtAtStart: k(6), startSalary: k(50), peakSalary: k(80), layoff: 'medium', pension: false, workplace: 'factory' },
  { key: 'agent', label: 'Real estate agent', startAge: 19, debtAtStart: k(1), startSalary: k(30), peakSalary: k(150), layoff: 'volatile', pension: false, workplace: 'realtor', unlocksBusiness: ['brokerage'] },
  { key: 'police', label: 'Police officer', startAge: 21, debtAtStart: 0, startSalary: k(50), peakSalary: k(95), layoff: 'very_low', pension: true, workplace: 'civic' },
  { key: 'teacher', label: 'Teacher', startAge: 22, debtAtStart: k(30), startSalary: k(44), peakSalary: k(78), layoff: 'very_low', pension: true, workplace: 'school' },
  { key: 'designer', label: 'Graphic designer', startAge: 22, debtAtStart: k(30), startSalary: k(40), peakSalary: k(90), layoff: 'high', pension: false, workplace: 'office' },
  { key: 'sales', label: 'Sales rep', startAge: 22, debtAtStart: k(28), startSalary: k(50), peakSalary: k(160), layoff: 'volatile', pension: false, workplace: 'office' },
  { key: 'nurse', label: 'Nurse', startAge: 22, debtAtStart: k(30), startSalary: k(65), peakSalary: k(110), layoff: 'very_low', pension: false, workplace: 'hospital' },
  { key: 'accountant', label: 'Accountant', startAge: 22, debtAtStart: k(32), startSalary: k(60), peakSalary: k(140), layoff: 'low', pension: false, workplace: 'office' },
  { key: 'engineer', label: 'Mechanical engineer', startAge: 22, debtAtStart: k(32), startSalary: k(75), peakSalary: k(150), layoff: 'low', pension: false, workplace: 'office' },
  { key: 'swe', label: 'Software engineer', startAge: 22, debtAtStart: k(30), startSalary: k(95), peakSalary: k(240), layoff: 'medium', pension: false, workplace: 'office' },
  { key: 'pilot', label: 'Pilot', startAge: 23, debtAtStart: k(90), startSalary: k(60), peakSalary: k(300), layoff: 'medium', pension: false, workplace: 'civic' },
  { key: 'pharmacist', label: 'Pharmacist', startAge: 24, debtAtStart: k(160), startSalary: k(125), peakSalary: k(155), layoff: 'low', pension: false, workplace: 'hospital' },
  { key: 'lawyer', label: 'Lawyer', startAge: 25, debtAtStart: k(160), startSalary: k(80), peakSalary: k(300), layoff: 'medium', pension: false, workplace: 'office', unlocksBusiness: ['law_firm'] },
  { key: 'dentist', label: 'Dentist', startAge: 26, debtAtStart: k(300), startSalary: k(150), peakSalary: k(280), layoff: 'low', pension: false, workplace: 'hospital', unlocksBusiness: ['practice'] },
  { key: 'doctor', label: 'Doctor', startAge: 30, debtAtStart: k(250), startSalary: k(250), peakSalary: k(380), layoff: 'very_low', pension: false, workplace: 'hospital', unlocksBusiness: ['practice'] },
];

export const CAREER = Object.fromEntries(CAREERS.map((c) => [c.key, c])) as Record<string, Career>;

/** Monthly chance of being laid off in an expansion; the regime multiplies it. */
export const LAYOFF_MONTHLY: Record<LayoffRisk, number> = {
  very_low: 0.0005, low: 0.0015, medium: 0.003, high: 0.006, volatile: 0.005,
};

export interface Archetype {
  key: ArchetypeKey;
  label: string;
  persona: string;              // sent to the model
  traits: Traits;               // average; each sim gets jitter
  consumption: number;          // share of after-housing net income spent on living
  heuristic: Partial<Record<string, number>>; // base weights by move kind for heuristic mode
}

export const ARCHETYPES: Archetype[] = [
  { key: 'saver', label: 'Saver', persona: 'A careful saver. Keeps a big cash cushion, hates debt, buys used and pays things off early.',
    traits: { risk: 0.2, debt: 0.1, status: 0.2, patience: 0.8, discipline: 0.85, herding: 0.2, lossAversion: 0.85 }, consumption: 0.55,
    heuristic: { nothing: 3, pay_debt: 5, invest_index: 2, buy_home: 1.5, buy_rental: 0.3, buy_car: 0.3, trade_stocks: 0.1, start_business: 0.2, sell_rental: 0.5 , save_cash: 4 } },
  { key: 'index', label: 'Index investor', persona: 'A steady index-fund investor. Automates investing, ignores the news, plays the long game.',
    traits: { risk: 0.5, debt: 0.3, status: 0.2, patience: 0.9, discipline: 0.85, herding: 0.15, lossAversion: 0.5 }, consumption: 0.6,
    heuristic: { nothing: 2, invest_index: 6, pay_debt: 1.5, buy_home: 1.5, buy_rental: 0.4, buy_car: 0.4, trade_stocks: 0.2, start_business: 0.2, sell_rental: 0.3 , save_cash: 0.8 } },
  { key: 'picker', label: 'Stock picker', persona: 'An active stock picker. Confident, follows market momentum, likes to trade.',
    traits: { risk: 0.75, debt: 0.4, status: 0.4, patience: 0.4, discipline: 0.45, herding: 0.75, lossAversion: 0.4 }, consumption: 0.65,
    heuristic: { nothing: 1.5, trade_stocks: 6, invest_index: 1.5, pay_debt: 0.8, buy_home: 1, buy_rental: 0.4, buy_car: 0.8, start_business: 0.4, sell_rental: 0.4 , save_cash: 0.4 } },
  { key: 're', label: 'Real estate investor', persona: 'A real estate investor. Comfortable with leverage, wants to own many rentals, thinks in properties not stocks.',
    traits: { risk: 0.65, debt: 0.85, status: 0.4, patience: 0.65, discipline: 0.6, herding: 0.4, lossAversion: 0.45 }, consumption: 0.6,
    heuristic: { nothing: 1.5, buy_rental: 6, buy_home: 3, invest_index: 1.2, pay_debt: 0.8, buy_car: 0.5, trade_stocks: 0.2, start_business: 0.6, sell_rental: 0.3 , save_cash: 1 } },
  { key: 'biz', label: 'Business owner', persona: 'An entrepreneur. Wants to own a business, takes big swings, reinvests in ventures.',
    traits: { risk: 0.8, debt: 0.7, status: 0.5, patience: 0.55, discipline: 0.55, herding: 0.35, lossAversion: 0.35 }, consumption: 0.62,
    heuristic: { nothing: 1.5, start_business: 6, invest_index: 1.2, buy_rental: 0.8, buy_home: 1.2, pay_debt: 0.8, buy_car: 0.6, trade_stocks: 0.5, sell_rental: 0.4 , save_cash: 0.8 } },
  { key: 'spender', label: 'Spender', persona: 'A spender. Lives for today, loves new cars and nice things, rarely thinks about retirement.',
    traits: { risk: 0.5, debt: 0.7, status: 0.8, patience: 0.15, discipline: 0.2, herding: 0.6, lossAversion: 0.3 }, consumption: 0.93,
    heuristic: { nothing: 3, buy_car: 5, buy_home: 1, invest_index: 0.4, pay_debt: 0.3, trade_stocks: 0.6, buy_rental: 0.2, start_business: 0.3, sell_rental: 0.5 , save_cash: 0.8 } },
  { key: 'status', label: 'Status seeker', persona: 'A status seeker. Wants the big house in the nice neighborhood and the luxury car, invests a little.',
    traits: { risk: 0.55, debt: 0.65, status: 0.95, patience: 0.35, discipline: 0.45, herding: 0.7, lossAversion: 0.45 }, consumption: 0.82,
    heuristic: { nothing: 2, buy_home: 4, buy_car: 3.5, invest_index: 1.2, pay_debt: 0.5, trade_stocks: 0.8, buy_rental: 0.6, start_business: 0.4, sell_rental: 0.4 , save_cash: 1 } },
  { key: 'fire', label: 'Early retiree', persona: 'Pursuing early retirement. Extremely frugal, invests most income, wants to stop working decades early.',
    traits: { risk: 0.55, debt: 0.2, status: 0.05, patience: 0.95, discipline: 0.95, herding: 0.1, lossAversion: 0.55 }, consumption: 0.42,
    heuristic: { nothing: 2, invest_index: 7, pay_debt: 2.5, buy_home: 0.8, buy_rental: 0.6, buy_car: 0.1, trade_stocks: 0.1, start_business: 0.2, sell_rental: 0.3 , save_cash: 1 } },
  { key: 'balanced', label: 'Balanced', persona: 'A balanced, ordinary planner. A bit of saving, a bit of investing, a bit of fun.',
    traits: { risk: 0.5, debt: 0.45, status: 0.5, patience: 0.55, discipline: 0.55, herding: 0.45, lossAversion: 0.5 }, consumption: 0.7,
    heuristic: { nothing: 2.5, invest_index: 2, pay_debt: 1.5, buy_home: 2, buy_car: 1.2, buy_rental: 0.7, trade_stocks: 0.5, start_business: 0.5, sell_rental: 0.4 , save_cash: 2 } },
];

export const ARCHETYPE = Object.fromEntries(ARCHETYPES.map((a) => [a.key, a])) as Record<ArchetypeKey, Archetype>;

export type Upside = 'low' | 'medium' | 'high' | 'very_high' | 'moonshot';

export interface BusinessType {
  key: string;
  label: string;
  startup: Cents;
  profitLo: Cents;   // monthly
  profitHi: Cents;   // monthly
  failYr1: number;   // probability of failing in year one
  upside: Upside;
  requires?: string; // business key unlocked by a career
  exitChanceYr?: number;   // moonshot: yearly chance of a big exit
  exitValue?: [Cents, Cents];
}

export const BUSINESSES: BusinessType[] = [
  { key: 'snack_cart', label: 'Snack cart', startup: k(3), profitLo: k(0.5), profitHi: k(2), failYr1: 0.3, upside: 'low' },
  { key: 'cleaning', label: 'Cleaning service', startup: k(4), profitLo: k(1), profitHi: k(5), failYr1: 0.2, upside: 'low' },
  { key: 'lawn', label: 'Lawn care', startup: k(5), profitLo: k(1), profitHi: k(4), failYr1: 0.2, upside: 'low' },
  { key: 'vending', label: 'Vending route', startup: k(8), profitLo: k(0.3), profitHi: k(1.5), failYr1: 0.1, upside: 'low' },
  { key: 'laundromat', label: 'Laundromat', startup: k(150), profitLo: k(3), profitHi: k(8), failYr1: 0.08, upside: 'low' },
  { key: 'storage', label: 'Self-storage', startup: k(2000), profitLo: k(15), profitHi: k(40), failYr1: 0.05, upside: 'low' },
  { key: 'barber', label: 'Barbershop', startup: k(40), profitLo: k(2), profitHi: k(8), failYr1: 0.2, upside: 'medium' },
  { key: 'food_truck', label: 'Food truck', startup: k(60), profitLo: k(2), profitHi: k(10), failYr1: 0.35, upside: 'medium' },
  { key: 'bakery', label: 'Bakery', startup: k(90), profitLo: k(1), profitHi: k(7), failYr1: 0.35, upside: 'medium' },
  { key: 'daycare', label: 'Daycare', startup: k(100), profitLo: k(3), profitHi: k(12), failYr1: 0.15, upside: 'medium' },
  { key: 'coffee', label: 'Coffee shop', startup: k(120), profitLo: k(1), profitHi: k(9), failYr1: 0.4, upside: 'medium' },
  { key: 'auto_repair', label: 'Auto repair shop', startup: k(120), profitLo: k(4), profitHi: k(15), failYr1: 0.2, upside: 'medium' },
  { key: 'car_wash', label: 'Car wash', startup: k(250), profitLo: k(4), profitHi: k(15), failYr1: 0.1, upside: 'medium' },
  { key: 'franchise', label: 'Burger franchise', startup: k(1200), profitLo: k(8), profitHi: k(25), failYr1: 0.1, upside: 'medium' },
  { key: 'trades_company', label: 'Plumbing / HVAC company', startup: k(50), profitLo: k(5), profitHi: k(25), failYr1: 0.15, upside: 'high', requires: 'trades_company' },
  { key: 'gym', label: 'Fitness gym', startup: k(200), profitLo: -k(5), profitHi: k(20), failYr1: 0.35, upside: 'high' },
  { key: 'bar', label: 'Bar', startup: k(250), profitLo: -k(5), profitHi: k(25), failYr1: 0.4, upside: 'high' },
  { key: 'restaurant', label: 'Restaurant', startup: k(300), profitLo: -k(10), profitHi: k(30), failYr1: 0.5, upside: 'high' },
  { key: 'brokerage', label: 'Real estate brokerage', startup: k(30), profitLo: 0, profitHi: k(30), failYr1: 0.35, upside: 'high', requires: 'brokerage' },
  { key: 'law_firm', label: 'Law firm', startup: k(80), profitLo: k(5), profitHi: k(50), failYr1: 0.25, upside: 'high', requires: 'law_firm' },
  { key: 'practice', label: 'Dental / medical practice', startup: k(500), profitLo: k(20), profitHi: k(60), failYr1: 0.05, upside: 'high', requires: 'practice' },
  { key: 'hotel', label: 'Motel', startup: k(3000), profitLo: -k(20), profitHi: k(80), failYr1: 0.2, upside: 'high' },
  { key: 'online_store', label: 'Online store', startup: k(10), profitLo: -k(1), profitHi: k(20), failYr1: 0.6, upside: 'high' },
  { key: 'app_studio', label: 'Mobile app studio', startup: k(25), profitLo: -k(3), profitHi: k(40), failYr1: 0.7, upside: 'very_high' },
  { key: 'startup', label: 'Tech startup', startup: k(100), profitLo: -k(20), profitHi: -k(5), failYr1: 0.85, upside: 'moonshot', exitChanceYr: 0.03, exitValue: [k(5000), k(50000)] },
];

export const BUSINESS = Object.fromEntries(BUSINESSES.map((b) => [b.key, b])) as Record<string, BusinessType>;

export const FIRST_NAMES = ['Maya', 'Dev', 'Rosa', 'Jules', 'Priya', 'Ben', 'Grace', 'Theo', 'Ana', 'Sam', 'Lena', 'Omar', 'Iris', 'Noah', 'Zoe', 'Eli', 'Kai', 'Nia', 'Leo', 'Ivy', 'Raj', 'Mei', 'Owen', 'Lucia', 'Hugo', 'Ada', 'Finn', 'Sana', 'Marco', 'June', 'Tariq', 'Elsa', 'Cole', 'Hana', 'Diego', 'Ruth', 'Nico', 'Amir', 'Tess', 'Yuki', 'Malik', 'Clara', 'Ravi', 'Lila', 'Jonah', 'Aiko', 'Felix', 'Nora', 'Kofi', 'Vera'];
export const LAST_NAMES = ['Chen', 'Park', 'Ruiz', 'Okafor', 'Voss', 'Haddad', 'Patel', 'Kim', 'Novak', 'Silva', 'Brooks', 'Nakamura', 'Diaz', 'Shah', 'Moreau', 'Lind', 'Adeyemi', 'Costa', 'Reyes', 'Walsh', 'Ito', 'Mensah', 'Berg', 'Romero', 'Khan', 'Duarte', 'Feld', 'Osei', 'Sato', 'Quinn'];

/** Base price of a starter home in today's market (scaled by the home price index). */
export const STARTER_HOME = k(180);
/** Home tiers as multiples of the starter price. */
export const HOME_TIERS = [
  { key: 'starter', label: 'starter', multiple: 1 },
  { key: 'family', label: 'family', multiple: 1.8 },
  { key: 'luxury', label: 'luxury', multiple: 3.5 },
] as const;
/** Small-business profits in the table are optimistic list values; the sim pays out this share of them. */
export const BUSINESS_PROFIT_SCALE = 0.5;

// SPEC decision 18: spend levels 1-10 (logic in spend.ts; the table lives here so finance.ts can read shares)
export interface SpendLevel {
  level: number;
  label: string;
  criterion: string;                     // what the model is shown for this level
  share: number;                         // ongoing share of income after housing and loans spent on living
  oneOff?: [lo: number, hi: number];     // dollars, drawn once in the month the level is chosen
  items?: string[];
}

export const SPEND_LEVELS: SpendLevel[] = [
  { level: 1, label: 'bare bones', criterion: 'Bare bones: essentials only', share: 0.30 },
  { level: 2, label: 'frugal', criterion: 'Frugal: cuts almost every extra', share: 0.40 },
  { level: 3, label: 'careful', criterion: 'Careful: few extras', share: 0.50 },
  { level: 4, label: 'modest', criterion: 'Modest: some extras', share: 0.60 },
  { level: 5, label: 'normal', criterion: 'A normal month', share: 0.70 },
  { level: 6, label: 'treat', criterion: 'A treat: a nice dinner or a weekend out ($100-$400)', share: 0.78, oneOff: [100, 400], items: ['a nice dinner out', 'a weekend away', 'concert tickets'] },
  { level: 7, label: 'splurge', criterion: 'A splurge: a designer purse, a gadget or a getaway ($400-$2k)', share: 0.86, oneOff: [400, 2000], items: ['a designer purse', 'a new phone', 'a weekend getaway'] },
  { level: 8, label: 'big purchase', criterion: 'A big purchase: a vacation or new furniture ($2k-$8k)', share: 0.86, oneOff: [2000, 8000], items: ['a vacation', 'new furniture', 'a home theater'] },
  { level: 9, label: 'major purchase', criterion: 'A major purchase: a car paid in cash or a big trip ($8k-$30k)', share: 0.86, oneOff: [8000, 30000], items: ['a car, paid in cash', 'a big trip abroad', 'a small boat'] },
  { level: 10, label: 'blowout', criterion: 'A blowout: a luxury car or a lavish wedding ($30k-$80k, can go on the card)', share: 0.92, oneOff: [30000, 80000], items: ['a luxury car', 'a lavish wedding', 'a dream vacation'] },
];
