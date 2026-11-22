// Score a labeller against Opus gold, overall and per archetype.
//   node research/finetune/label-quality.cjs <labels-dir-or-jsonl> [gold=research/finetune/data/labels/claude.jsonl]
const fs = require("fs"), path = require("path");
const pos = process.argv.slice(2).filter((a) => !a.startsWith("--")); const src = pos[0], goldP = pos[1] || "research/finetune/data/labels/claude.jsonl";
const read = (p) => fs.readFileSync(p, "utf8").trim().split("\n").filter(Boolean).map(JSON.parse);
const L = fs.statSync(src).isDirectory() ? fs.readdirSync(src).filter((f) => f.endsWith(".jsonl")).flatMap((f) => read(path.join(src, f))) : read(src);
const gold = new Map(read(goldP).map((g) => [g.id, g]));
const arch = new Map(read("research/finetune/data/states.jsonl").map((s) => [s.id, s.archetype]));
const t = {}, byA = {}, miss = [];
for (const l of L) {
  const g = gold.get(l.id); if (!g) continue;
  for (const q of ["main", "spend_level", "invest_share"]) {
    if (g.labels[q] === undefined || l.labels[q] === undefined) continue;
    const a = (t[q] ??= { n: 0, ok: 0, w1: 0 }); a.n++; if (g.labels[q] === l.labels[q]) a.ok++; if (q !== "main" && Math.abs(g.labels[q] - l.labels[q]) <= 1) a.w1++;
  }
  const A = arch.get(l.id), b = (byA[A] ??= [0, 0]); b[1]++; if (g.labels.main === l.labels.main) b[0]++; else miss.push(`${A} ${l.id}: gold ${g.labels.main} / got ${l.labels.main}`);
}
console.log(Object.entries(t).map(([q, a]) => `${q} ${(a.ok / a.n * 100).toFixed(0)}%${q !== "main" ? ` (±1 ${(a.w1 / a.n * 100).toFixed(0)}%)` : ""} n=${a.n}`).join(" · "));
console.log(Object.entries(byA).sort().map(([k, [o, n]]) => `${k} ${o}/${n}`).join(" · "));
if (process.argv.includes("--misses")) console.log(miss.join("\n"));
