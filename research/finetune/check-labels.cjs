// Flag labels that break the rubric's hard rules (v1.5). Reads the state text, so it works for any labeller.
//   node research/finetune/check-labels.cjs <labels dir or .jsonl> [--list]
const fs = require("fs"), path = require("path");
const pos = process.argv.slice(2).filter((a) => !a.startsWith("--")); const src = pos[0];
const read = (p) => fs.readFileSync(p, "utf8").trim().split("\n").filter(Boolean).map(JSON.parse);
const L = fs.statSync(src).isDirectory() ? fs.readdirSync(src).filter((f) => f.endsWith(".jsonl")).flatMap((f) => read(path.join(src, f))) : read(src);
const S = new Map(read("research/finetune/data/states.jsonl").map((s) => [s.id, s]));
const usd = (t) => { if (!t) return 0; const m = /(-?)\$([\d.]+)([kM]?)/.exec(t); return m ? (m[1] ? -1 : 1) * Number(m[2]) * (m[3] === "M" ? 1e6 : m[3] === "k" ? 1e3 : 1) : 0; };
const PURCHASE = /^(buy_|start_)/;
function facts(s) {
  const st = s.state, money = st.money || "", monthly = st.monthly || "", debts = st.debts || "";
  const cash = usd(/cash (-?\$[\d.]+[kM]?)/.exec(money)?.[1]), cushion = usd(/keeps (\$[\d.]+[kM]?)/.exec(money)?.[1]);
  const sav = usd(/savings account (\$[\d.]+[kM]?)/.exec(money)?.[1]);
  const take = usd(/takes home (\$[\d.]+[kM]?)/.exec(monthly)?.[1]), spend = usd(/spends about (\$[\d.]+[kM]?)/.exec(monthly)?.[1]);
  const rates = [...debts.matchAll(/(\$[\d.]+[kM]?) at ([\d.]+)%/g)].map((m) => ({ bal: usd(m[1]), rate: Number(m[2]) }));
  return { cash, cushion, sav, take, spend, rates, unemployed: /unemployed/.test(st.person || ""), expensive: rates.some((d) => d.rate >= 20 && d.bal >= 500), maxRate: Math.max(0, ...rates.map((d) => d.rate)) };
}
function cost(move) { const d = move.description || ""; return usd(/(\$[\d.]+[kM]?) down/.exec(d)?.[1] || /: (\$[\d.]+[kM]?) cash/.exec(d)?.[1]); }
const out = {}; let n = 0;
const flag = (rule, l, msg) => { (out[rule] ??= []).push(`${l.id} ${msg}`); };
for (const l of L) {
  const s = S.get(l.id); if (!s) continue; n++;
  const f = facts(s), main = l.labels.main, mv = s.moves.find((m) => m.id === main);
  const covered = f.cash + f.sav >= f.cushion;
  if (PURCHASE.test(main) && f.expensive) flag("R1 purchase with 20%+ debt", l, main);
  if (PURCHASE.test(main) && !covered) flag("R2 purchase below the cushion", l, main);
  if (PURCHASE.test(main) && covered && mv && f.cash + f.sav - cost(mv) < f.cushion) flag("R3 down payment breaks the cushion", l, `${main} cost ${cost(mv)}`);
  if (["invest_index", "trade_stocks"].includes(main) && f.unemployed) flag("R4 investing with no paycheck", l, main);
  if (f.unemployed && l.labels.invest_share > 0) flag("R7 invest share with no paycheck", l, String(l.labels.invest_share));
  const crunchA = !covered && (f.cash < 1000 || f.spend > f.take || f.maxRate >= 8), crunchB = f.cash < 1000 && f.spend > f.take && f.sav < 2 * f.cushion;
  if (main === "sell_rental" && !(crunchA || crunchB)) flag("R5 rental sold without a crunch", l, "");
  if (main !== "sell_rental" && (crunchA || crunchB) && s.moves.some((m) => m.id === "sell_rental")) flag("R6 crunch but no sale", l, main);
}
const total = Object.values(out).reduce((a, v) => a + v.length, 0);
console.log(`${n} labels checked, ${total} flags (${(total / n * 100).toFixed(1)}%)`);
for (const [r, v] of Object.entries(out)) { console.log(`  ${r}: ${v.length}`); if (process.argv.includes("--list")) for (const x of v) console.log("     " + x); }
