// Rewrite stored training states (modern wording) into today's medieval wording, keeping every decision, id and
// number, so the existing labels still apply (user, 2026-11-23: retrain E07 on medieval wording without relabelling).
// Output matches what buildState / legalMoves / buildQuestions produce now: field order (warnings and memories up),
// market news as consequences, glossed move descriptions, medieval spend levels.
//   npx tsx research/finetune/medievalize.ts <in.jsonl> <out.jsonl>   (prints a residue check: modern words left over)
import { readFileSync, writeFileSync } from 'node:fs';
import { BUSINESS, CARRIAGE, CART, FUND, LOAN_NAME, marketNews, RENTAL, SPEND_LEVELS, VAULT, VENTURES } from '@dls/sim-core';

const MAP = JSON.parse(readFileSync(new URL('./medieval-map.json', import.meta.url), 'utf8')) as { labels: Array<[string, string]>; personas: Array<[string, string]>; items: Array<[string, string]> };
const PERSONA = new Map(MAP.personas);
const LABELS = [...MAP.labels].sort((a, b) => b[0].length - a[0].length);   // longest first ("software engineer" before "engineer")
const ITEMS = [...MAP.items].sort((a, b) => b[0].length - a[0].length);
const TIER: Record<string, string> = { starter: 'cottage', family: 'townhouse', luxury: 'manor house' };

/** "$12k" → "12k crowns", "-$3k" → "-3k crowns", "/mo" → " a month". */
const crowns = (s: string) => s.replace(/(-?)\$([\d.,]+[kM]?)/g, '$1$2 crowns').replace(/\/mo\b/g, ' a month');
const usd = (t?: string) => { const m = /(-?)\$([\d.,]+)([kM]?)/.exec(t ?? ''); return m ? (m[1] ? -1 : 1) * Number(m[2].replace(/,/g, '')) * (m[3] === 'M' ? 1e6 : m[3] === 'k' ? 1e3 : 1) : 0; };
const relabel = (s: string) => { let out = s; for (const [o, n] of LABELS) out = out.replace(new RegExp(`\\b${o.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi'), (m) => (m[0] === m[0].toUpperCase() && m[0] !== m[0].toLowerCase() ? n : n.toLowerCase())); return out; };
const bizName = (key: string) => (BUSINESS[key] ? BUSINESS[key].label.toLowerCase() : key.replace(/_/g, ' '));
const vehicle = (price: number) => (price >= 35_000 ? CARRIAGE : CART);

function memory(m: string): string {
  let s = m;
  s = s.replace(/^Put (\S+) into savings$/, `Put $1 in the ${VAULT}`)
    .replace(/^Put (\S+) into the index fund$/, `Put $1 into the ${FUND}`)
    .replace(/^Put (\S+) into individual stocks$/, `Put $1 into ${VENTURES}`)
    .replace(/^Bought a (\S+) (starter|family|luxury) home$/, (_x, p, t) => `Bought a ${TIER[t]} for ${p}`)
    .replace(/^Bought a (\S+) rental$/, `Bought a ${RENTAL} for $1`)
    .replace(/^Sold a rental for (\S+)$/, `Sold a ${RENTAL} for $1`)
    .replace(/^Bought a (\S+) car$/, (_x, p) => `Bought a ${vehicle(usd(p))} for ${p}`)
    .replace(/^A rental went vacant$/, 'A tenant moved out and a cottage stands empty')
    .replace(/ and quit the job$/, ' and left the craft to run it')
    .replace('Went bankrupt and lost everything but the student loans', 'Went bankrupt and lost everything but the apprenticeship debt');
  for (const [o, n] of ITEMS) s = s.replace(` on ${o}`, ` on ${n}`);
  return crowns(relabel(s));
}

function person(p: string): string { return crowns(relabel(p)); }

export function translateState(st: Record<string, string>): Record<string, string> {
  const money = st.money ?? '';
  const n = (re: RegExp) => usd(re.exec(money)?.[1]);
  const cash = n(/cash (-?\$[\d.,]+[kM]?)/), keeps = n(/keeps (\$[\d.,]+[kM]?)/), sav = n(/savings account (\$[\d.,]+[kM]?)/);
  const out: Record<string, string> = {};
  out.person = person(st.person);
  out.personality = PERSONA.get(st.personality) ?? st.personality;
  // warnings, as buildState derives them (from the same facts, read back from the text)
  const warnings: string[] = [];
  const unemp = /unemployed for (\d+) months?/.exec(st.person);
  if (unemp) warnings.push(`out of work for ${unemp[1]} month${unemp[1] === '1' ? '' : 's'}: no wages coming in`);
  for (const d of (st.debts ?? '').split('; ')) {
    const m = /^card (\$[\d.,]+[kM]?) at ([\d.]+)%/.exec(d);
    if (m && usd(m[1]) >= 500 && Number(m[2]) >= 20) warnings.push(`owes ${crowns(m[1])} to the moneylender at ${Number(m[2]).toFixed(0)}%, costing about ${Math.round((usd(m[1]) * Number(m[2])) / 1200).toLocaleString('en-US').replace(/,/g, '')} crowns a month in interest`);
  }
  if (cash + sav < keeps) warnings.push(`coin is below the reserve ${st.person.split(' ')[0]} likes to keep`);
  const town = /(\d+) of (\d+) rentals empty/.exec(st.town ?? '');
  if (town && Number(town[2]) > 0 && Number(town[1]) / Number(town[2]) >= 0.15) warnings.push(`${Math.round((Number(town[1]) / Number(town[2])) * 100)}% of the cottages to let in town stand empty`);
  if (warnings.length) out.warnings = warnings.join('; ');
  out.recent = st.recent === 'nothing notable lately' ? st.recent : st.recent.split('; ').map(memory).join('; ');
  out.traits = st.traits;
  out.money = crowns(money.replace(/^cash /, 'coin ').replace(' as a cushion)', ' in reserve)').replace('savings account', VAULT).replace('index fund', FUND).replace('stocks ', `${VENTURES} `));
  out.debts = st.debts === 'no debt' ? 'no debt' : st.debts.split('; ').map((d) => crowns(d.replace(/^(\w+) /, (_x, k: string) => `${LOAN_NAME[k as keyof typeof LOAN_NAME] ?? k} `))).join('; ');
  out.monthly = crowns(st.monthly.replace(/takes home (\S+), /, "takes home $1 a month after the lord's tax, ").replace(/auto-invests (\d+)% of what is left/, `puts $1% of what is left into the ${FUND}`));
  out.housing = crowns(st.housing.replace(/^owns a (\S+) home$/, 'owns a home worth $1'));
  out.property = st.property === 'no rentals' ? 'no cottages to let' : crowns(st.property.replace(/^(\d+) rentals? worth (\S+?)(, (\d+) empty)?$/, (_x, k, v, _e, e) => `${k} cottage${k === '1' ? '' : 's'} let to tenants, worth ${v}${e ? `, ${e} standing empty` : ''}`));
  out.business = st.business === 'no business' ? st.business : st.business.split(', ').map(bizName).join(', ');
  const mk = /index fund ([+-]?[\d.]+)% last month, home prices (\w+), mortgage rates ([\d.]+)%, jobs report (\w+)/.exec(st.market ?? '');
  out.market = mk ? marketNews(Number(mk[1]) / 100, mk[2] as 'rising' | 'falling' | 'flat', Number(mk[3]) / 100, mk[4] as 'strong' | 'steady' | 'weak') : st.market;
  out.town = (st.town ?? '').replace(/local businesses/, 'shops and trades in town').replace(/rentals empty/, 'cottages to let stand empty');
  return out;
}

export function translateMove(id: string, d: string, unemployed: boolean): string {
  const risk = unemployed ? '; with no wages coming in, this coin may be needed for bread and rent' : '';
  let m: RegExpExecArray | null;
  if (id === 'invest_index' && (m = /\(up to (\S+) available\)/.exec(d))) return `Put spare coin in the ${FUND}, a broad index fund (up to ${crowns(m[1])} available)${risk}`;
  if (id === 'trade_stocks' && (m = /\(up to (\S+)\)/.exec(d))) return `Buy stakes in ${VENTURES}, like single stocks: bigger swings than the ${FUND} (up to ${crowns(m[1])})${risk}`;
  if (id === 'save_cash' && (m = /\(up to (\S+)\)/.exec(d))) return `Put spare coin in the ${VAULT}, a high-yield savings account: safe, about +0.5%/yr after rising prices (up to ${crowns(m[1])})`;
  if (id === 'pay_debt' && (m = /^Pay down debt early: (\S+) owed, worst is (\w+) at ([\d.]+)%/.exec(d))) return `Pay down debt early: ${crowns(m[1])} owed; the worst, the ${LOAN_NAME[m[2] as keyof typeof LOAN_NAME] ?? m[2]}, costs ${m[3]}% a year`;
  if (id.startsWith('buy_home') && (m = /^Buy a (\S+) (starter|family|luxury) home to live in: (\S+) down and closing, (\S+)\/mo all-in vs (\S+)\/mo rent now/.exec(d))) return `Buy a ${TIER[m[2]]} to live in for ${crowns(m[1])}: ${crowns(m[3])} down and fees, ${crowns(m[4])} a month all-in vs ${crowns(m[5])} a month rent now`;
  if (id === 'buy_rental' && (m = /^Buy a (\S+) starter rental: (\S+) down and closing, about (\S+)\/mo after mortgage and costs once rented( \((\d+) of (\d+) town rentals sit empty\))?/.exec(d))) {
    const v = m[5] ? Number(m[5]) : 0, nU = m[6] ? Number(m[6]) : 0;
    const vac = !v ? '' : nU && v / nU >= 0.15 ? `, but ${v} of ${nU} cottages to let in town stand empty, so it may sit empty for months` : ` (${v} of ${nU} cottages to let in town stand empty)`;
    return `Buy a ${RENTAL} for ${crowns(m[1])}: ${crowns(m[2])} down and fees, about ${crowns(m[3])} a month after the loan and upkeep once a tenant moves in${vac}`;
  }
  if (id === 'sell_rental' && (m = /^Sell a rental worth (\S+): about (\S+) cash after the loan and fees/.exec(d))) return `Sell a ${RENTAL} worth ${crowns(m[1])}: about ${crowns(m[2])} in coin after the loan and fees`;
  if (id === 'buy_car' && (m = /^Buy a (\S+) (new car, trading in the old one|car): (\S+) down, (\S+)\/mo for 5 years/.exec(d))) {
    const veh = vehicle(usd(m[1]));
    return `Buy a ${m[2] === 'car' ? veh : `new ${veh}, trading in the old one,`} for ${crowns(m[1])}: ${crowns(m[3])} down, ${crowns(m[4])} a month for 5 years`;
  }
  if (id.startsWith('start_') && (m = /^Start a ([^:]+?)( and quit the job to run it| on the side): (.*)$/.exec(d))) {
    const label = bizName(id.slice('start_'.length));
    const rest = crowns(m[3]).replace(/ cash( plus|,)/, ' in coin$1');
    return `Start a ${label}${m[2] === ' on the side' ? ' on the side' : ' and leave your craft to run it'}: ${rest}`;
  }
  return crowns(d);
}

export function translateRow(r: any): any {
  const unemployed = /unemployed for/.test(r.state.person ?? '');
  const moves = r.moves.map((mv: any) => ({ ...mv, description: translateMove(mv.id, mv.description, unemployed) }));
  const q = structuredClone(r.questions);
  q.main.criteria = Object.fromEntries(moves.map((mv: any) => [mv.id, mv.description]));
  if (q.spend_level) q.spend_level.criteria = SPEND_LEVELS.map((l) => `${l.level}: ${l.criterion}`);
  return { ...r, state: translateState(r.state), moves, questions: q };
}

if (process.argv[1]?.endsWith('medievalize.ts')) {
  const [inp, outp] = process.argv.slice(2);
  const rows = readFileSync(inp, 'utf8').trim().split('\n').map((l) => JSON.parse(l)).map(translateRow);
  writeFileSync(outp, rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
  // Residue: modern words that should no longer appear (glosses excepted).
  const RESIDUE: Array<[string, RegExp]> = [['$', /\$\d/], ['index fund', /(?<!broad )index fund/i], ['individual stocks', /individual stocks/i], ['savings account', /(?<!high-yield )savings account/i],
    ['rental', /\brentals?\b/i], ['mortgage', /mortgage/i], ['car', /\bcars?\b/i], ['/mo', /\/mo\b/], ['old career/business', new RegExp(`\\b(${LABELS.filter(([o, n]) => !n.toLowerCase().includes(o.toLowerCase())).map(([o]) => o.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`, 'i')]];
  const hits: Record<string, { n: number; ex?: string }> = {};
  for (const r of rows) {
    const text = [...Object.values(r.state), ...r.moves.map((m: any) => m.description)].join(' | ');
    for (const [k, re] of RESIDUE) { const m = re.exec(text); if (m) { const h = (hits[k] ??= { n: 0 }); h.n++; h.ex ??= text.slice(Math.max(0, m.index - 60), m.index + 60); } }
  }
  console.log(`translated ${rows.length} rows → ${outp}`);
  for (const [k, h] of Object.entries(hits)) console.log(`  residue "${k}": ${h.n} rows, e.g. …${h.ex}…`);
  if (!Object.keys(hits).length) console.log('  no modern residue');
}
