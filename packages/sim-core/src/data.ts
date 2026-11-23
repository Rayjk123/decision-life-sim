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
  { key: 'retail', label: 'Shop assistant', startAge: 18, debtAtStart: 0, startSalary: k(28), peakSalary: k(40), layoff: 'high', pension: false, workplace: 'shop' },
  { key: 'warehouse', label: 'Dock porter', startAge: 18, debtAtStart: 0, startSalary: k(34), peakSalary: k(52), layoff: 'high', pension: false, workplace: 'factory' },
  { key: 'military', label: 'Soldier of the garrison', startAge: 18, debtAtStart: 0, startSalary: k(35), peakSalary: k(70), layoff: 'very_low', pension: true, workplace: 'civic' },
  { key: 'plumber', label: 'Mason', startAge: 18, debtAtStart: 0, startSalary: k(38), peakSalary: k(110), layoff: 'low', pension: false, workplace: 'factory', unlocksBusiness: ['trades_company'] },
  { key: 'electrician', label: 'Blacksmith', startAge: 18, debtAtStart: 0, startSalary: k(40), peakSalary: k(115), layoff: 'low', pension: false, workplace: 'factory', unlocksBusiness: ['trades_company'] },
  { key: 'hvac', label: 'Chimney sweep', startAge: 19, debtAtStart: k(8), startSalary: k(40), peakSalary: k(95), layoff: 'low', pension: false, workplace: 'factory', unlocksBusiness: ['trades_company'] },
  { key: 'trucker', label: 'Carter', startAge: 19, debtAtStart: k(6), startSalary: k(50), peakSalary: k(80), layoff: 'medium', pension: false, workplace: 'factory' },
  { key: 'agent', label: 'Land agent', startAge: 19, debtAtStart: k(1), startSalary: k(30), peakSalary: k(150), layoff: 'volatile', pension: false, workplace: 'realtor', unlocksBusiness: ['brokerage'] },
  { key: 'police', label: 'Town watchman', startAge: 21, debtAtStart: 0, startSalary: k(50), peakSalary: k(95), layoff: 'very_low', pension: true, workplace: 'civic' },
  { key: 'teacher', label: 'Schoolmaster', startAge: 22, debtAtStart: k(30), startSalary: k(44), peakSalary: k(78), layoff: 'very_low', pension: true, workplace: 'school' },
  { key: 'designer', label: 'Illuminator', startAge: 22, debtAtStart: k(30), startSalary: k(40), peakSalary: k(90), layoff: 'high', pension: false, workplace: 'office' },
  { key: 'sales', label: 'Traveling merchant', startAge: 22, debtAtStart: k(28), startSalary: k(50), peakSalary: k(160), layoff: 'volatile', pension: false, workplace: 'office' },
  { key: 'nurse', label: 'Healer', startAge: 22, debtAtStart: k(30), startSalary: k(65), peakSalary: k(110), layoff: 'very_low', pension: false, workplace: 'hospital' },
  { key: 'accountant', label: 'Bookkeeper', startAge: 22, debtAtStart: k(32), startSalary: k(60), peakSalary: k(140), layoff: 'low', pension: false, workplace: 'office' },
  { key: 'engineer', label: 'Millwright', startAge: 22, debtAtStart: k(32), startSalary: k(75), peakSalary: k(150), layoff: 'low', pension: false, workplace: 'office' },
  { key: 'swe', label: 'Clockmaker', startAge: 22, debtAtStart: k(30), startSalary: k(95), peakSalary: k(240), layoff: 'medium', pension: false, workplace: 'office' },
  { key: 'pilot', label: "Ship's captain", startAge: 23, debtAtStart: k(90), startSalary: k(60), peakSalary: k(300), layoff: 'medium', pension: false, workplace: 'civic' },
  { key: 'pharmacist', label: 'Apothecary', startAge: 24, debtAtStart: k(160), startSalary: k(125), peakSalary: k(155), layoff: 'low', pension: false, workplace: 'hospital' },
  { key: 'lawyer', label: 'Advocate', startAge: 25, debtAtStart: k(160), startSalary: k(80), peakSalary: k(300), layoff: 'medium', pension: false, workplace: 'office', unlocksBusiness: ['law_firm'] },
  { key: 'dentist', label: 'Barber-surgeon', startAge: 26, debtAtStart: k(300), startSalary: k(150), peakSalary: k(280), layoff: 'low', pension: false, workplace: 'hospital', unlocksBusiness: ['practice'] },
  { key: 'doctor', label: 'Physician', startAge: 30, debtAtStart: k(250), startSalary: k(250), peakSalary: k(380), layoff: 'very_low', pension: false, workplace: 'hospital', unlocksBusiness: ['practice'] },
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
  { key: 'saver', label: 'Saver', persona: 'A careful saver. Keeps a big purse in reserve, hates debt, buys secondhand and pays things off early.',
    traits: { risk: 0.2, debt: 0.1, status: 0.2, patience: 0.8, discipline: 0.85, herding: 0.2, lossAversion: 0.85 }, consumption: 0.55,
    heuristic: { nothing: 3, pay_debt: 5, invest_index: 2, buy_home: 1.5, buy_rental: 0.3, buy_car: 0.3, trade_stocks: 0.1, start_business: 0.2, sell_rental: 0.5 , save_cash: 4 } },
  { key: 'index', label: 'Guild Fund investor', persona: 'A steady Guild Fund investor. Puts a share of every wage into the fund, ignores market gossip, plays the long game.',
    traits: { risk: 0.5, debt: 0.3, status: 0.2, patience: 0.9, discipline: 0.85, herding: 0.15, lossAversion: 0.5 }, consumption: 0.6,
    heuristic: { nothing: 2, invest_index: 6, pay_debt: 1.5, buy_home: 1.5, buy_rental: 0.4, buy_car: 0.4, trade_stocks: 0.2, start_business: 0.2, sell_rental: 0.3 , save_cash: 0.8 } },
  { key: 'picker', label: 'Voyage backer', persona: 'A bold backer of trading voyages. Confident, follows the talk of the market, likes to stake coin on single ships.',
    traits: { risk: 0.75, debt: 0.4, status: 0.4, patience: 0.4, discipline: 0.45, herding: 0.75, lossAversion: 0.4 }, consumption: 0.65,
    heuristic: { nothing: 1.5, trade_stocks: 6, invest_index: 1.5, pay_debt: 0.8, buy_home: 1, buy_rental: 0.4, buy_car: 0.8, start_business: 0.4, sell_rental: 0.4 , save_cash: 0.4 } },
  { key: 're', label: 'Landlord', persona: 'A would-be landlord. Comfortable borrowing, wants to own many cottages to let, thinks in property, not voyages or funds.',
    traits: { risk: 0.65, debt: 0.85, status: 0.4, patience: 0.65, discipline: 0.6, herding: 0.4, lossAversion: 0.45 }, consumption: 0.6,
    heuristic: { nothing: 1.5, buy_rental: 6, buy_home: 3, invest_index: 1.2, pay_debt: 0.8, buy_car: 0.5, trade_stocks: 0.2, start_business: 0.6, sell_rental: 0.3 , save_cash: 1 } },
  { key: 'biz', label: 'Business owner', persona: 'An entrepreneur. Wants to run a business of their own, takes big risks on new businesses, puts profits back into the business.',
    traits: { risk: 0.8, debt: 0.7, status: 0.5, patience: 0.55, discipline: 0.55, herding: 0.35, lossAversion: 0.35 }, consumption: 0.62,
    heuristic: { nothing: 1.5, start_business: 6, invest_index: 1.2, buy_rental: 0.8, buy_home: 1.2, pay_debt: 0.8, buy_car: 0.6, trade_stocks: 0.5, sell_rental: 0.4 , save_cash: 0.8 } },
  { key: 'spender', label: 'Spender', persona: 'A spender. Lives for today, loves fine horses, new clothes and nice things, rarely thinks about old age.',
    traits: { risk: 0.5, debt: 0.7, status: 0.8, patience: 0.15, discipline: 0.2, herding: 0.6, lossAversion: 0.3 }, consumption: 0.93,
    heuristic: { nothing: 3, buy_car: 5, buy_home: 1, invest_index: 0.4, pay_debt: 0.3, trade_stocks: 0.6, buy_rental: 0.2, start_business: 0.3, sell_rental: 0.5 , save_cash: 0.8 } },
  { key: 'status', label: 'Status seeker', persona: 'A status seeker. Wants the grandest house in town and a fine carriage to be seen in, invests a little.',
    traits: { risk: 0.55, debt: 0.65, status: 0.95, patience: 0.35, discipline: 0.45, herding: 0.7, lossAversion: 0.45 }, consumption: 0.82,
    heuristic: { nothing: 2, buy_home: 4, buy_car: 3.5, invest_index: 1.2, pay_debt: 0.5, trade_stocks: 0.8, buy_rental: 0.6, start_business: 0.4, sell_rental: 0.4 , save_cash: 1 } },
  { key: 'fire', label: 'Early retiree', persona: 'Saving to stop working early. Extremely frugal, puts most wages into the Guild Fund, wants to leave the trade decades early.',
    traits: { risk: 0.55, debt: 0.2, status: 0.05, patience: 0.95, discipline: 0.95, herding: 0.1, lossAversion: 0.55 }, consumption: 0.42,
    heuristic: { nothing: 2, invest_index: 7, pay_debt: 2.5, buy_home: 0.8, buy_rental: 0.6, buy_car: 0.1, trade_stocks: 0.1, start_business: 0.2, sell_rental: 0.3 , save_cash: 1 } },
  { key: 'balanced', label: 'Balanced', persona: 'A balanced, ordinary townsperson. A bit of saving, a bit of investing, a bit of fun.',
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
  { key: 'snack_cart', label: 'Pie cart', startup: k(3), profitLo: k(0.5), profitHi: k(2), failYr1: 0.3, upside: 'low' },
  { key: 'cleaning', label: 'Laundress service', startup: k(4), profitLo: k(1), profitHi: k(5), failYr1: 0.2, upside: 'low' },
  { key: 'lawn', label: 'Garden-keeping', startup: k(5), profitLo: k(1), profitHi: k(4), failYr1: 0.2, upside: 'low' },
  { key: 'vending', label: "Peddler's round", startup: k(8), profitLo: k(0.3), profitHi: k(1.5), failYr1: 0.1, upside: 'low' },
  { key: 'laundromat', label: 'Washhouse', startup: k(150), profitLo: k(3), profitHi: k(8), failYr1: 0.08, upside: 'low' },
  { key: 'storage', label: 'Granary', startup: k(2000), profitLo: k(15), profitHi: k(40), failYr1: 0.05, upside: 'low' },
  { key: 'barber', label: "Barber's shop", startup: k(40), profitLo: k(2), profitHi: k(8), failYr1: 0.2, upside: 'medium' },
  { key: 'food_truck', label: 'Roast-meat cart', startup: k(60), profitLo: k(2), profitHi: k(10), failYr1: 0.35, upside: 'medium' },
  { key: 'bakery', label: 'Bakery', startup: k(90), profitLo: k(1), profitHi: k(7), failYr1: 0.35, upside: 'medium' },
  { key: 'daycare', label: 'Dame school', startup: k(100), profitLo: k(3), profitHi: k(12), failYr1: 0.15, upside: 'medium' },
  { key: 'coffee', label: 'Tea house', startup: k(120), profitLo: k(1), profitHi: k(9), failYr1: 0.4, upside: 'medium' },
  { key: 'auto_repair', label: "Wheelwright's shop", startup: k(120), profitLo: k(4), profitHi: k(15), failYr1: 0.2, upside: 'medium' },
  { key: 'car_wash', label: 'Livery stable', startup: k(250), profitLo: k(4), profitHi: k(15), failYr1: 0.1, upside: 'medium' },
  { key: 'franchise', label: 'Chain of coaching inns', startup: k(1200), profitLo: k(8), profitHi: k(25), failYr1: 0.1, upside: 'medium' },
  { key: 'trades_company', label: "Masons' and smiths' workshop", startup: k(50), profitLo: k(5), profitHi: k(25), failYr1: 0.15, upside: 'high', requires: 'trades_company' },
  { key: 'gym', label: 'Fencing hall', startup: k(200), profitLo: -k(5), profitHi: k(20), failYr1: 0.35, upside: 'high' },
  { key: 'bar', label: 'Alehouse', startup: k(250), profitLo: -k(5), profitHi: k(25), failYr1: 0.4, upside: 'high' },
  { key: 'restaurant', label: 'Tavern', startup: k(300), profitLo: -k(10), profitHi: k(30), failYr1: 0.5, upside: 'high' },
  { key: 'brokerage', label: 'Land agency', startup: k(30), profitLo: 0, profitHi: k(30), failYr1: 0.35, upside: 'high', requires: 'brokerage' },
  { key: 'law_firm', label: "Advocate's chambers", startup: k(80), profitLo: k(5), profitHi: k(50), failYr1: 0.25, upside: 'high', requires: 'law_firm' },
  { key: 'practice', label: "Physician's practice", startup: k(500), profitLo: k(20), profitHi: k(60), failYr1: 0.05, upside: 'high', requires: 'practice' },
  { key: 'hotel', label: 'Inn', startup: k(3000), profitLo: -k(20), profitHi: k(80), failYr1: 0.2, upside: 'high' },
  { key: 'online_store', label: 'Caravan trading company', startup: k(10), profitLo: -k(1), profitHi: k(20), failYr1: 0.6, upside: 'high' },
  { key: 'app_studio', label: 'Printing press', startup: k(25), profitLo: -k(3), profitHi: k(40), failYr1: 0.7, upside: 'very_high' },
  { key: 'startup', label: "Alchemist's workshop", startup: k(100), profitLo: -k(20), profitHi: -k(5), failYr1: 0.85, upside: 'moonshot', exitChanceYr: 0.03, exitValue: [k(5000), k(50000)] },
];

export const BUSINESS = Object.fromEntries(BUSINESSES.map((b) => [b.key, b])) as Record<string, BusinessType>;

export const FIRST_NAMES = ['Maya', 'Dev', 'Rosa', 'Jules', 'Priya', 'Ben', 'Grace', 'Theo', 'Ana', 'Sam', 'Lena', 'Omar', 'Iris', 'Noah', 'Zoe', 'Eli', 'Kai', 'Nia', 'Leo', 'Ivy', 'Raj', 'Mei', 'Owen', 'Lucia', 'Hugo', 'Ada', 'Finn', 'Sana', 'Marco', 'June', 'Tariq', 'Elsa', 'Cole', 'Hana', 'Diego', 'Ruth', 'Nico', 'Amir', 'Tess', 'Yuki', 'Malik', 'Clara', 'Ravi', 'Lila', 'Jonah', 'Aiko', 'Felix', 'Nora', 'Kofi', 'Vera'];
export const LAST_NAMES = ['Chen', 'Park', 'Ruiz', 'Okafor', 'Voss', 'Haddad', 'Patel', 'Kim', 'Novak', 'Silva', 'Brooks', 'Nakamura', 'Diaz', 'Shah', 'Moreau', 'Lind', 'Adeyemi', 'Costa', 'Reyes', 'Walsh', 'Ito', 'Mensah', 'Berg', 'Romero', 'Khan', 'Duarte', 'Feld', 'Osei', 'Sato', 'Quinn'];

/** Base price of a starter home in today's market (scaled by the home price index). */
export const STARTER_HOME = k(180);
/** Home tiers as multiples of the starter price. */
export const HOME_TIERS = [
  { key: 'starter', label: 'cottage', multiple: 1 },
  { key: 'family', label: 'townhouse', multiple: 1.8 },
  { key: 'luxury', label: 'manor house', multiple: 3.5 },
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
  { level: 1, label: 'bare bones', criterion: 'Bare bones: bread and rent only', share: 0.30 },
  { level: 2, label: 'frugal', criterion: 'Frugal: cuts almost every extra', share: 0.40 },
  { level: 3, label: 'careful', criterion: 'Careful: few extras', share: 0.50 },
  { level: 4, label: 'modest', criterion: 'Modest: some extras', share: 0.60 },
  { level: 5, label: 'normal', criterion: 'An ordinary month', share: 0.70 },
  { level: 6, label: 'treat', criterion: 'A treat: a feast at the tavern or a night out at the inn (100-400 crowns)', share: 0.78, oneOff: [100, 400], items: ['a feast at the tavern', 'a day at the fair', 'minstrels at the inn'] },
  { level: 7, label: 'splurge', criterion: 'A splurge: fine silks, jewelry or a getaway to the coast (400-2k crowns)', share: 0.86, oneOff: [400, 2000], items: ['a silk gown', 'a silver brooch', 'a trip to the coast'] },
  { level: 8, label: 'big purchase', criterion: 'A big purchase: a long holiday or fine carved furniture (2k-8k crowns)', share: 0.86, oneOff: [2000, 8000], items: ['new oak furniture', 'a pilgrimage', 'a woven tapestry'] },
  { level: 9, label: 'major purchase', criterion: 'A major purchase: a horse paid in coin or a voyage abroad (8k-30k crowns)', share: 0.86, oneOff: [8000, 30000], items: ['a horse, paid in coin', 'a voyage abroad', 'a small boat'] },
  { level: 10, label: 'blowout', criterion: 'A blowout: a fine carriage or a lavish wedding feast (30k-80k crowns, can be borrowed from the moneylender at high interest)', share: 0.92, oneOff: [30000, 80000], items: ['a fine carriage', 'a lavish wedding feast', 'a grand tour'] },
];
