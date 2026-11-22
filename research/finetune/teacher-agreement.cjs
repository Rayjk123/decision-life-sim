// How well does each teacher (heuristic, d3, Haiku) agree with Opus gold labels, question by question?
// node research/finetune/teacher-agreement.cjs
const fs = require("fs");
const rd = (p) => fs.existsSync(p) ? new Map(fs.readFileSync(p, "utf8").trim().split("\n").filter(Boolean).map((l) => { const j = JSON.parse(l); return [j.id, j]; })) : new Map();
const states = rd("research/finetune/data/states.jsonl");
const opus = rd("research/finetune/data/labels/claude.jsonl"), haiku = rd("research/finetune/data/labels/haiku.jsonl"), d3 = rd("research/finetune/data/labels/d3.jsonl");
const top = (d) => d && Object.entries(d).sort((a, b) => b[1] - a[1])[0]?.[0];
const teachers = {
  heuristic: (s) => ({ main: top(s.heuristic.main), spend_level: s.heuristic.spendLevel ? Number(top(s.heuristic.spendLevel)) - 1 : undefined, invest_share: s.heuristic.investShare ? Number(top(s.heuristic.investShare)) : undefined }),
  d3: (s) => { const l = d3.get(s.id)?.labels; if (!l) return null; return { main: top(l.main?.probabilities), spend_level: l.spend_level ? Number(top(l.spend_level.probabilities)) : undefined, invest_share: l.invest_share ? Number(top(l.invest_share.probabilities)) : undefined }; },
  haiku: (s) => haiku.get(s.id)?.labels ?? null,
};
for (const [name, f] of Object.entries(teachers)) {
  const acc = {}; let n = 0;
  for (const [id, o] of opus) {
    const s = states.get(id); const t = f(s); if (!t) continue; n++;
    for (const q of ["main", "spend_level", "invest_share"]) {
      if (o.labels[q] === undefined || t[q] === undefined) continue;
      const a = (acc[q] ??= { n: 0, exact: 0, w1: 0 }); a.n++; if (o.labels[q] === t[q]) a.exact++; if (q !== "main" && Math.abs(o.labels[q] - t[q]) <= 1) a.w1++;
    }
  }
  console.log(`${name.padEnd(9)} on ${n} Opus-labelled states: ` + Object.entries(acc).map(([q, a]) => `${q} ${(a.exact / a.n * 100).toFixed(0)}%${q !== "main" ? ` (±1 ${(a.w1 / a.n * 100).toFixed(0)}%)` : ""}`).join(" · "));
}
