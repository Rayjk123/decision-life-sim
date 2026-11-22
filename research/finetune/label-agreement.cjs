const fs=require("fs"); const rd=(p)=>new Map(fs.readFileSync(p,"utf8").trim().split("\n").map(l=>{const j=JSON.parse(l);return[j.id,j]}));
const states=new Map(fs.readFileSync("research/finetune/data/states.jsonl","utf8").trim().split("\n").map(l=>{const j=JSON.parse(l);return[j.id,j]}));
const o=rd(process.argv[2]), h=rd(process.argv[3]);
let n=0,main=0,inv=[0,0,0],sp=[0,0,0]; const dis=[], byArch={};
for (const [id,a] of o){ const b=h.get(id); if(!b) continue; n++; const s=states.get(id); const m=a.labels.main===b.labels.main; main+=m;
 (byArch[s.archetype]??=[0,0]); byArch[s.archetype][1]++; if(m)byArch[s.archetype][0]++; if(!m) dis.push(`${s.archetype.padEnd(8)} ${id.padEnd(16)} opus=${a.labels.main} haiku=${b.labels.main}`);
 if("invest_share" in a.labels && "invest_share" in b.labels){inv[2]++; if(a.labels.invest_share===b.labels.invest_share)inv[0]++; if(Math.abs(a.labels.invest_share-b.labels.invest_share)<=1)inv[1]++;}
 sp[2]++; if(a.labels.spend_level===b.labels.spend_level)sp[0]++; if(Math.abs(a.labels.spend_level-b.labels.spend_level)<=1)sp[1]++; }
const pct=(x,y)=>(x/y*100).toFixed(0)+"%";
console.log(`states ${n} · main ${pct(main,n)} · invest exact ${pct(inv[0],inv[2])} / ±1 ${pct(inv[1],inv[2])} · spend exact ${pct(sp[0],sp[2])} / ±1 ${pct(sp[1],sp[2])}`);
console.log("by archetype:", Object.entries(byArch).map(([k,v])=>`${k} ${v[0]}/${v[1]}`).join(", "));
console.log("disagreements:\n "+dis.join("\n "));
