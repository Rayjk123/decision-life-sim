// The rubric's spend rule, as code: default by archetype, net -1 / +1 (at most one each way), clamp, no-paycheck cap.
//   node research/finetune/rule-spend.cjs <labels dir or .jsonl> [--mode net|stack]   → agreement with those labels
const fs = require("fs"), path = require("path");
const pos = process.argv.slice(2).filter((a) => !a.startsWith("--")); const mode = process.argv.includes("--stack") ? "stack" : "net";
const read = (p) => fs.readFileSync(p, "utf8").trim().split("\n").filter(Boolean).map(JSON.parse);
const L = fs.statSync(pos[0]).isDirectory() ? fs.readdirSync(pos[0]).filter((f) => f.endsWith(".jsonl")).flatMap((f) => read(path.join(pos[0], f))) : read(pos[0]);
const S = new Map(read("research/finetune/data/states.jsonl").map((s) => [s.id, s]));
const usd = (t) => { if (!t) return 0; const m = /(-?)\$([\d.]+)([kM]?)/.exec(t); return m ? (m[1] ? -1 : 1) * Number(m[2]) * (m[3] === "M" ? 1e6 : m[3] === "k" ? 1e3 : 1) : 0; };
const DEF = { saver: [3, 2, 3], index: [4, 3, 4], fire: [2, 2, 3], picker: [5, 4, 5], re: [4, 4, 5], biz: [5, 4, 5], spender: [7, 6, 8], status: [6, 5, 7], balanced: [4, 4, 5] };
function spend(s) {
  const st = s.state, [d, lo, hi] = DEF[s.archetype];
  const money = st.money || "", cash = usd(/cash (-?\$[\d.]+[kM]?)/.exec(money)?.[1]), cushion = usd(/keeps (\$[\d.]+[kM]?)/.exec(money)?.[1]), sav = usd(/savings account (\$[\d.]+[kM]?)/.exec(money)?.[1]);
  const debts = st.debts || "", expensive = [...debts.matchAll(/(\$[\d.]+[kM]?) at ([\d.]+)%/g)].some((m) => Number(m[2]) >= 20 && usd(m[1]) >= 500);
  const idx = Number(/index fund ([+-][\d.]+)%/.exec(st.market || "")?.[1] ?? 0), weak = /jobs report weak/.test(st.market || "");
  const recent = st.recent || "", income = usd(/earning (\$[\d.]+[kM]?)/.exec(st.person || "")?.[1]);
  const unemployed = /unemployed/.test(st.person || "");
  const downs = [expensive, cash + sav < cushion, weak, idx <= -5, /failed/.test(recent)].filter(Boolean).length;
  const ups = [/Got a raise/.test(recent), income >= 150000].filter(Boolean).length;
  let v = mode === "net" ? d - (downs ? 1 : 0) + (ups ? 1 : 0) : d - downs + ups;
  v = Math.max(lo, Math.min(hi, v));
  if (unemployed) v = Math.min(v, ["spender", "status"].includes(s.archetype) ? 3 : 2);
  return v - 1; // position
}
let n = 0, ok = 0, w1 = 0;
for (const l of L) { const s = S.get(l.id); if (!s || l.labels.spend_level === undefined) continue; n++; const r = spend(s); if (r === l.labels.spend_level) ok++; if (Math.abs(r - l.labels.spend_level) <= 1) w1++; }
console.log(`${mode}: rule spend vs labels on ${n}: exact ${(ok / n * 100).toFixed(0)}%, ±1 ${(w1 / n * 100).toFixed(0)}%`);
module.exports = { spend };
