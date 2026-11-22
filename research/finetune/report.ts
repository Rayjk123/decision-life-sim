// Build docs/finetune/results.md from every trained run: one table of numbers, a "student vs teacher" chart and a
// per-archetype heatmap, all scored on the same Opus gold test set.
//   npx tsx research/finetune/report.ts
// Inputs: research/finetune/runs/<run>/{config.json,metrics.json,eval-*.json} (pulled with sync.sh pull-run) and the
// label files (for each teacher's own agreement with gold).
import { readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const RUNS = 'research/finetune/runs', LABELS = 'research/finetune/data/labels';
const read = (p: string) => readFileSync(p, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
const states = new Map(read('research/finetune/data/states.jsonl').map((s: any) => [s.id, s]));
const gold = new Map(read(join(LABELS, 'claude.jsonl')).map((g: any) => [g.id, g]));
const goldTest = [...gold.values()].filter((g: any) => states.get(g.id)?.split === 'test');
const ARCH = ['saver', 'index', 'fire', 'picker', 're', 'biz', 'spender', 'status', 'balanced'];
const ARCH_LABEL: Record<string, string> = { saver: 'Saver', index: 'Index', fire: 'Early retiree', picker: 'Picker', re: 'Real estate', biz: 'Business', spender: 'Spender', status: 'Status', balanced: 'Balanced' };

// ---- each teacher's own agreement with gold on the gold test states (the ceiling a student is expected to hit)
const top = (d: any) => d && Object.entries(d as Record<string, number>).sort((a, b) => b[1] - a[1])[0]?.[0];
const d3 = existsSync(join(LABELS, 'd3.jsonl')) ? new Map(read(join(LABELS, 'd3.jsonl')).map((l: any) => [l.id, l])) : new Map();
const haikuGold = new Map<string, any>();
for (const dir of ['haiku-v13-gold', 'haiku-v14-gold']) if (existsSync(join(LABELS, dir))) for (const f of readdirSync(join(LABELS, dir))) for (const l of read(join(LABELS, dir, f))) haikuGold.set(l.id, l);
function teacherMain(name: string, id: string): string | undefined {
  const s: any = states.get(id);
  if (name === 'heuristic') return top(s.heuristic.main);
  if (name === 'd3') return top(d3.get(id)?.labels?.main?.probabilities);
  if (name === 'haiku') return haikuGold.get(id)?.labels?.main;
}
function teacherAgreement(name: string) {
  let n = 0, ok = 0;
  for (const g of goldTest) { const t = teacherMain(name, g.id); if (t === undefined) continue; n++; if (t === g.labels.main) ok++; }
  return { n, acc: n ? ok / n : NaN };
}

// ---- runs
type Run = { name: string; teacher: string; why: string; metrics: any; gold?: any; own?: any };
const runs: Run[] = [];
for (const name of existsSync(RUNS) ? readdirSync(RUNS).sort() : []) {
  if (!name.startsWith('e')) continue;
  const dir = join(RUNS, name), cfgP = join(dir, 'config.json');
  if (!existsSync(cfgP) || !existsSync(join(dir, 'metrics.json'))) continue;
  const cfg = JSON.parse(readFileSync(cfgP, 'utf8'));
  const teacher = /heuristic/.test(cfg.train) ? 'heuristic' : /d3-soft/.test(cfg.train) ? 'd3 (soft)' : /d3/.test(cfg.train) ? 'd3' : /haiku/.test(cfg.train) ? 'haiku' : '?';
  const ownName = /heuristic/.test(cfg.train) ? 'heuristic-hard' : /d3/.test(cfg.train) ? 'd3-hard' : null;
  const ev = (n: string) => { const p = join(dir, `eval-${n}-test.json`); return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : undefined; };
  runs.push({ name, teacher, why: cfg._why ?? '', metrics: JSON.parse(readFileSync(join(dir, 'metrics.json'), 'utf8')), gold: ev('claude-hard'), own: ownName ? ev(ownName) : undefined });
}
const scored = runs.filter((r) => r.gold);

// ---- chart helpers (light theme like docs/results.md; native <title> tooltips)
const C = { surface: '#fcfcfb', text: '#0b0b0b', text2: '#52514e', muted: '#8a8984', grid: '#e6e5e1', s1: '#2a78d6', s2: '#eb6834' };
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const pct = (v: number) => `${Math.round(v * 100)}%`;
const svgOpen = (w: number, h: number, label: string) => `<div class="viz" markdown="0"><svg viewBox="0 0 ${w} ${h}" width="100%" style="max-width:${w}px;font-family:inherit;background:${C.surface};border-radius:6px" role="img" aria-label="${esc(label)}">`;
const txt = (x: number, y: number, s: string, o: { anchor?: string; size?: number; fill?: string; weight?: number } = {}) =>
  `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="${o.anchor ?? 'start'}" font-size="${o.size ?? 12}" fill="${o.fill ?? C.text2}"${o.weight ? ` font-weight="${o.weight}"` : ''}>${esc(s)}</text>`;
const hbar = (x: number, y: number, w: number, h: number, fill: string, tip: string) => {
  if (w <= 0) return ''; const r = Math.min(4, w / 2, h / 2);
  return `<path d="M${x},${y}h${w - r}a${r},${r} 0 0 1 ${r},${r}v${h - 2 * r}a${r},${r} 0 0 1 -${r},${r}h-${w - r}z" fill="${fill}"><title>${esc(tip)}</title></path>`;
};

// 1. Student vs teacher: does a student land where its teacher's own agreement with gold is?
function studentTeacherChart(): string {
  const W = 720, L = 170, R = 60, T = 46, rowH = 46, H = T + scored.length * rowH + 24;
  const x = (v: number) => L + v * (W - L - R);
  const out = [svgOpen(W, H, 'Each student model next to its teacher, both scored on the gold test set')];
  for (const v of [0, 0.25, 0.5, 0.75, 1]) out.push(`<line x1="${x(v)}" x2="${x(v)}" y1="${T - 8}" y2="${H - 20}" stroke="${C.grid}"/>`, txt(x(v), H - 6, pct(v), { anchor: 'middle', fill: C.muted }));
  out.push(`<rect x="${W - R - 300}" y="12" width="10" height="10" rx="2" fill="${C.s1}"/>`, txt(W - R - 284, 21, 'Student (trained model)', { fill: C.text }),
    `<rect x="${W - R - 130}" y="12" width="10" height="10" rx="2" fill="${C.s2}"/>`, txt(W - R - 114, 21, 'Its teacher', { fill: C.text }));
  scored.forEach((r, i) => {
    const y = T + i * rowH, s = r.gold.per_question.main.accuracy, t = teacherAgreement(r.teacher.replace(' (soft)', ''));
    out.push(txt(L - 10, y + 13, r.name, { anchor: 'end', fill: C.text, weight: 600 }), txt(L - 10, y + 28, `teacher: ${r.teacher}`, { anchor: 'end', fill: C.muted, size: 11 }));
    out.push(hbar(L, y, x(s) - L, 14, C.s1, `${r.name}: ${pct(s)} of gold moves (n=${r.gold.per_question.main.n})`), txt(x(s) + 6, y + 11, pct(s), { fill: C.text }));
    if (!Number.isNaN(t.acc)) out.push(hbar(L, y + 16, x(t.acc) - L, 14, C.s2, `${r.teacher} itself: ${pct(t.acc)} of gold moves (n=${t.n})`), txt(x(t.acc) + 6, y + 27, pct(t.acc), { fill: C.text2 }));
  });
  out.push('</svg></div>');
  return out.join('');
}

// 2. Per-archetype heatmap of gold move accuracy (single blue hue, light → dark), value printed in each cell
function archetypeHeatmap(): string {
  const W = 720, L = 150, T = 40, cw = (W - L - 10) / ARCH.length, ch = 30, H = T + scored.length * ch + 16;
  const fill = (v: number) => `rgba(42,120,214,${(0.08 + 0.85 * v).toFixed(2)})`;
  const out = [svgOpen(W, H, 'Gold move accuracy by archetype for each trained model')];
  ARCH.forEach((a, j) => out.push(txt(L + j * cw + cw / 2, T - 10, ARCH_LABEL[a], { anchor: 'middle', size: 11, fill: C.text })));
  scored.forEach((r, i) => {
    out.push(txt(L - 10, T + i * ch + 19, r.name, { anchor: 'end', fill: C.text, weight: 600 }));
    ARCH.forEach((a, j) => {
      const c = r.gold.main_by_archetype[a]; if (!c) return;
      const x = L + j * cw, y = T + i * ch;
      out.push(`<rect x="${x + 1}" y="${y + 1}" width="${cw - 2}" height="${ch - 2}" rx="3" fill="${fill(c.accuracy)}"><title>${esc(`${r.name}, ${ARCH_LABEL[a]}: ${pct(c.accuracy)} of ${c.n}`)}</title></rect>`,
        txt(x + cw / 2, y + 19, pct(c.accuracy), { anchor: 'middle', size: 11, fill: c.accuracy > 0.55 ? '#ffffff' : C.text }));
    });
  });
  out.push('</svg></div>');
  return out.join('');
}

const f = (v: any, d = 1) => (v === undefined || v === null || Number.isNaN(v) ? '–' : (v * 100).toFixed(d) + '%');
const table = ['| Run | Teacher | Own test: acc · record · ECE | Gold move | Gold spend (±1) | Gold invest share | Train min | VRAM |', '|---|---|---|---|---|---|---|---|',
  ...runs.map((r) => {
    const m = r.metrics, b = m.before_calibration?.test?.all, a = m.after_calibration?.test?.all, g = r.gold?.per_question;
    return `| ${r.name} | ${r.teacher} | ${f(b?.accuracy)} · ${f(b?.record_accuracy, 0)} · ${(a?.ece ?? NaN).toFixed(3)} | ${g ? `**${f(g.main.accuracy, 0)}** (n=${g.main.n})` : '–'} | ${g?.spend_level ? `${f(g.spend_level.accuracy, 0)} (${f(g.spend_level.within1, 0)})` : '–'} | ${g?.invest_share ? f(g.invest_share.accuracy, 0) : '–'} | ${(m.seconds?.train / 60).toFixed(1)} | ${m.peak_vram_gb} GB |`;
  })].join('\n');
const teachers = ['heuristic', 'd3', 'haiku'].map((t) => { const a = teacherAgreement(t); return `${t} ${f(a.acc, 0)} (n=${a.n})`; }).join(' · ');

writeFileSync('docs/finetune/results.md', `---
title: Results
parent: Training our own decision model
nav_order: 2
---

# Fine-tuning results

<!-- generated by research/finetune/report.ts: do not edit by hand -->

Every run fine-tunes **Qwen3.5-0.8B** with Unsloth's \`FastDecisionModel\` (LoRA r 16, lr 2e-4, 2 epochs, 2,048 tokens) unless its name says otherwise, then is scored on the **same ${goldTest.length} Opus gold test states** from held-out towns (seeds 151–160). "Own test" is accuracy against the teacher's labels on the test towns: how well the student imitates.

## Student vs teacher

A student model is capped by its teacher. Each pair of bars shows the trained model's agreement with the gold labels (blue) next to its teacher's own agreement on the same states (orange).

${scored.length ? studentTeacherChart() : '_No scored runs yet._'}

Teacher agreement with gold on the test states: ${teachers}. (Haiku is measured on the states it labelled blind during the rubric checks.)

## By archetype

${scored.length ? archetypeHeatmap() : ''}

## All runs

${table}

**Reading the columns.** *Acc* is per question; *record* means every question in a decision was right; *ECE* (expected calibration error) is the gap between how confident the model is and how often it's right, after temperature calibration. *Gold spend* is exact level, with within one level in brackets: exact spend tops out near 60% for any rule (see the lab notebook, row 25).
`);
console.log(`wrote docs/finetune/results.md: ${runs.length} runs, ${scored.length} scored on gold (${goldTest.length} states); teachers: ${teachers}`);
