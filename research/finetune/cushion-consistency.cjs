const fs=require("fs"); const usd=(s)=>{const m=/\$([\d.]+)([kM]?)/.exec(s||"");return m?Number(m[1])*(m[2]==="M"?1e6:m[2]==="k"?1e3:1):0;};
const rows=fs.readFileSync("research/finetune/data/states.jsonl","utf8").trim().split("\n").map(l=>JSON.parse(l));
let below=0, covered=0;
const parse=(money)=>{const cash=usd(/cash (\$[\d.]+[kM]?)/.exec(money)?.[1]); const cushion=usd(/keeps (\$[\d.]+[kM]?)/.exec(money)?.[1]); const sav=usd(/savings account (\$[\d.]+[kM]?)/.exec(money)?.[1]); return {cash,cushion,sav};};
const info=new Map();
for (const r of rows){ const {cash,cushion,sav}=parse(r.state.money); const b=cash<cushion, c=cash+sav>=cushion; if(b)below++; if(b&&c)covered++; info.set(r.id,{b,c,arch:r.archetype,moves:r.moves.map(m=>m.id)}); }
console.log(`states ${rows.length}: cash below the stated cushion ${(below/rows.length*100).toFixed(0)}%; of those, savings fully cover it ${(covered/below*100).toFixed(0)}%`);
// Haiku consistency: for index/fire/picker states that look 'below cushion but covered' with their signature move offered, what did each labeller pick?
const sig={index:"invest_index",fire:"invest_index",picker:"trade_stocks"};
for (const b of [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15]){ const f=`research/finetune/data/labels/haiku/batch-${b}.jsonl`; if(!fs.existsSync(f)) continue;
  let n=0,sigPick=0; for (const l of fs.readFileSync(f,"utf8").trim().split("\n")){ const j=JSON.parse(l); const x=info.get(j.id); if(!x||!sig[x.arch]||!x.b||!x.c||!x.moves.includes(sig[x.arch])) continue; n++; if(j.labels.main===sig[x.arch]) sigPick++; }
  if(n) process.stdout.write(`batch ${b}: ${sigPick}/${n} signature  `); }
console.log();
