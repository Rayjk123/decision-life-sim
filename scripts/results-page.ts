// Regenerates the tables in docs/results.md from docs/results/data/*.json.
//   npm run docs:results
// To add a run: copy its evals-results/eval-*.json entry into docs/results/data/<model>-<style>.json (one run per file,
// with a "model" field), add the model to MODELS below, then run this script.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const DATA = join(ROOT, 'docs', 'results', 'data');
const PAGE = join(ROOT, 'docs', 'results.md');

// display order; params and where each ran
const MODELS: Record<string, { label: string; params: string; host: string }> = {
  random: { label: 'Random', params: '–', host: 'CPU' },
  heuristic: { label: 'Heuristic', params: '–', host: 'CPU' },
  'kev-0.8b': { label: 'Kev-0.8B', params: '0.8B', host: 'Mac M3 Pro (MLX)' },
  'kev-4b': { label: 'Kev-4B', params: '4B (LoRA)', host: 'Mac M3 Pro (MLX)' },
  'd3-2b': { label: 'd3:2b', params: '2.4B Q8_0', host: 'RTX 4070 Super (Ollama)' },
  'd3-4b': { label: 'd3:4b', params: '4.8B Q8_0', host: 'RTX 4070 Super (Ollama)' },
};

interface Grade { pass: boolean; top?: string; delta?: number }
interface Run {
  model: string; style: string;
  summary: { overall: number; scenarioScore: number; scenarioPass: number; topAccuracy: number; avoidRate: number; pairPass: number; byCategory: Record<string, { n: number; score: number; pass: number }> };
  scenarios: Array<{ id: string; grade: Grade }>;
  pairs: Array<{ id: string; grade: Grade }>;
}

const runs: Run[] = readdirSync(DATA).filter((f) => f.endsWith('.json'))
  .map((f) => JSON.parse(readFileSync(join(DATA, f), 'utf8')))
  .filter((r): r is Run => Array.isArray(r?.scenarios) && typeof r?.model === 'string')
  .sort((a, b) => Object.keys(MODELS).indexOf(a.model) - Object.keys(MODELS).indexOf(b.model) || b.summary.overall - a.summary.overall);

const pct = (x: number) => `${Math.round(x * 100)}%`;
const best = new Map<string, Run>();
for (const r of runs) if (!best.has(r.model) || r.summary.overall > best.get(r.model)!.summary.overall) best.set(r.model, r);
const cols = Object.keys(MODELS).filter((m) => best.has(m));
const head = (first: string) => `| ${first} | ${cols.map((m) => `${MODELS[m].label}<br><sub>${best.get(m)!.style}</sub>`).join(' | ')} |\n|---|${cols.map(() => '---').join('|')}|`;

const leaderboard = [
  '| Model | Params | Ran on | State style | **Overall** | Scenario score | Top pick in character | Stayed out of avoid | Personality pass | **Pairs** |',
  '|---|---|---|---|---|---|---|---|---|---|',
  ...runs.map((r) => {
    const m = MODELS[r.model] ?? { label: r.model, params: '?', host: '?' };
    const isBest = best.get(r.model) === r;
    const b = (s: string) => (isBest ? `**${s}**` : s);
    return `| ${b(m.label)} | ${m.params} | ${m.host} | ${r.style}${isBest ? ' ★' : ''} | ${b(pct(r.summary.overall))} | ${pct(r.summary.scenarioScore)} | ${pct(r.summary.topAccuracy)} | ${pct(r.summary.avoidRate)} | ${pct(r.summary.byCategory.personality?.pass ?? 0)} | ${b(pct(r.summary.pairPass))} |`;
  }),
].join('\n');

const pairIds = best.get('heuristic')?.pairs.map((p) => p.id) ?? runs[0].pairs.map((p) => p.id);
const pairs = [head('Counterfactual pair'), ...pairIds.map((id) => `| \`${id}\` | ${cols.map((m) => {
  const g = best.get(m)!.pairs.find((p) => p.id === id)?.grade;
  if (!g) return '–';
  const d = g.delta === undefined ? '' : ` ${g.delta >= 0 ? '+' : ''}${g.delta.toFixed(2)}`;
  return `${g.pass ? '✅' : '❌'}${d}`;
}).join(' | ')} |`), `| **Passed** | ${cols.map((m) => `**${best.get(m)!.pairs.filter((p) => p.grade.pass).length}/${best.get(m)!.pairs.length}**`).join(' | ')} |`].join('\n');

const scIds = runs[0].scenarios.map((s) => s.id);
const scenarios = [head('Scenario'), ...scIds.map((id) => `| \`${id}\` | ${cols.map((m) => {
  const g = best.get(m)!.scenarios.find((s) => s.id === id)?.grade;
  return g ? `${g.pass ? '✅' : '❌'} ${g.top ?? ''}` : '–';
}).join(' | ')} |`), `| **Passed** | ${cols.map((m) => `**${best.get(m)!.scenarios.filter((s) => s.grade.pass).length}/${best.get(m)!.scenarios.length}**`).join(' | ')} |`].join('\n');

const data = readdirSync(DATA).filter((f) => f.endsWith('.json')).sort().map((f) => `[\`${f}\`](results/data/${f})`).join(' · ');

// ---------- charts: inline SVG, light theme (the site is light-only), native <title> tooltips on every mark ----------
// Palette: reference categorical slots 1-2 (validated: CVD ΔE 24.7, normal ΔE 33.6, >= 3:1 on the surface);
// diverging blue <-> red through a gray midpoint for the pairs heatmap.
const C = { surface: '#fcfcfb', text: '#0b0b0b', text2: '#52514e', muted: '#8a8984', grid: '#e6e5e1', s1: '#2a78d6', s2: '#eb6834', mid: '#f0efec', neg: '#e34948' };
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const svgOpen = (w: number, h: number, label: string) =>
  `<div class="viz" markdown="0"><svg viewBox="0 0 ${w} ${h}" width="100%" style="max-width:${w}px;font-family:inherit;background:${C.surface};border-radius:6px" role="img" aria-label="${esc(label)}">`;
const svgClose = '</svg></div>';
const txt = (x: number, y: number, s: string, o: { anchor?: string; size?: number; fill?: string; weight?: number } = {}) =>
  `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="${o.anchor ?? 'start'}" font-size="${o.size ?? 12}" fill="${o.fill ?? C.text2}"${o.weight ? ` font-weight="${o.weight}"` : ''}>${esc(s)}</text>`;
const legend = (x: number, y: number, items: Array<[string, string]>) => items.map(([color, label], i) => {
  const lx = x + i * 150;
  return `<rect x="${lx}" y="${y - 9}" width="10" height="10" rx="2" fill="${color}"/>${txt(lx + 16, y, label, { fill: C.text })}`;
}).join('');
// horizontal bar from the baseline with a 4px rounded data end (right side only)
const hbar = (x: number, y: number, w: number, h: number, fill: string, tip: string) => {
  const r = Math.min(4, w / 2, h / 2);
  if (w <= 0) return '';
  return `<path d="M${x},${y}h${w - r}a${r},${r} 0 0 1 ${r},${r}v${h - 2 * r}a${r},${r} 0 0 1 -${r},${r}h-${w - r}z" fill="${fill}"><title>${esc(tip)}</title></path>`;
};

const speed = JSON.parse(readFileSync(join(DATA, 'speed.json'), 'utf8')) as Record<string, { callsPerSec: number; host: string }> & { targetCallsPerSec: number };

// 1. quality vs speed (scatter, log x), two series = where the model ran
function tradeoffChart(): string {
  const W = 720, H = 380, L = 56, R = 24, T = 44, B = 52;
  const xs = (v: number) => L + ((Math.log10(v) - Math.log10(0.3)) / (Math.log10(30) - Math.log10(0.3))) * (W - L - R);
  const ys = (v: number) => T + (1 - (v - 0.4) / 0.45) * (H - T - B);
  const out = [svgOpen(W, H, 'Quality versus speed for each decision model')];
  for (const v of [0.4, 0.5, 0.6, 0.7, 0.8]) out.push(`<line x1="${L}" x2="${W - R}" y1="${ys(v)}" y2="${ys(v)}" stroke="${C.grid}"/>`, txt(L - 8, ys(v) + 4, pct(v), { anchor: 'end', fill: C.muted }));
  for (const v of [0.3, 1, 3, 10, 30]) out.push(txt(xs(v), H - B + 18, `${v}/s`, { anchor: 'middle', fill: C.muted }));
  out.push(txt((L + W - R) / 2, H - 10, 'Decisions per second (log scale)', { anchor: 'middle' }), txt(14, T - 22, 'Overall eval score', { fill: C.text2 }));
  const heur = best.get('heuristic')?.summary.overall ?? 0.77;
  out.push(`<line x1="${L}" x2="${W - R}" y1="${ys(heur)}" y2="${ys(heur)}" stroke="${C.text2}" stroke-dasharray="4 4"/>`, txt(L + 6, ys(heur) - 6, `Heuristic ${pct(heur)}`, { fill: C.text2 }));
  const tx = xs(speed.targetCallsPerSec);
  out.push(`<line x1="${tx}" x2="${tx}" y1="${T}" y2="${H - B}" stroke="${C.text2}" stroke-dasharray="4 4"/>`,
    txt(tx + 6, H - B - 8, 'Fast enough for 1,000 sims →', { fill: C.text2 }));
  out.push(legend(W - R - 300, 20, [[C.s1, 'Mac M3 Pro (MLX)'], [C.s2, 'RTX 4070 Super (Ollama)']]));
  for (const m of ['kev-0.8b', 'kev-4b', 'd3-2b', 'd3-4b']) {
    const r = best.get(m), s = speed[m];
    if (!r || !s) continue;
    const cx = xs(s.callsPerSec), cy = ys(r.summary.overall), color = s.host.startsWith('Mac') ? C.s1 : C.s2;
    out.push(`<circle cx="${cx}" cy="${cy}" r="7" fill="${color}" stroke="${C.surface}" stroke-width="2"><title>${esc(`${MODELS[m].label} (${r.style}): ${pct(r.summary.overall)} overall, ${pct(r.summary.pairPass)} pairs, ${s.callsPerSec} decisions/s`)}</title></circle>`,
      `<circle cx="${cx}" cy="${cy}" r="16" fill="transparent"><title>${esc(`${MODELS[m].label}: ${pct(r.summary.overall)} at ${s.callsPerSec}/s`)}</title></circle>`,
      // labels sit beside the point, except where a reference line runs through it (then above)
      Math.abs(r.summary.overall - heur) < 0.015
        ? txt(cx, cy - 14, `${MODELS[m].label} · ${pct(r.summary.overall)}`, { anchor: 'middle', fill: C.text, weight: 600 })
        : txt(cx + (m === 'd3-2b' ? -12 : 12), cy + 4, `${MODELS[m].label} · ${pct(r.summary.overall)}`, { anchor: m === 'd3-2b' ? 'end' : 'start', fill: C.text, weight: 600 }));
  }
  out.push(svgClose);
  return out.join('');
}

// 2. overall and pairs per model (grouped horizontal bars, best style each)
function scoresChart(): string {
  const order = [...cols].sort((a, b) => best.get(b)!.summary.overall - best.get(a)!.summary.overall);
  const W = 720, L = 150, R = 56, T = 48, rowH = 46, bh = 15, H = T + order.length * rowH + 30;
  const xs = (v: number) => L + v * (W - L - R);
  const out = [svgOpen(W, H, 'Overall score and counterfactual pairs passed, per model')];
  out.push(legend(L, 22, [[C.s1, 'Overall'], [C.s2, 'Counterfactual pairs']]));
  for (const v of [0, 0.25, 0.5, 0.75, 1]) out.push(`<line x1="${xs(v)}" x2="${xs(v)}" y1="${T - 6}" y2="${H - 26}" stroke="${C.grid}"/>`, txt(xs(v), H - 10, pct(v), { anchor: 'middle', fill: C.muted }));
  order.forEach((m, i) => {
    const r = best.get(m)!, y = T + i * rowH;
    out.push(txt(L - 10, y + bh + 5, MODELS[m].label, { anchor: 'end', fill: C.text, weight: 600 }), txt(L - 10, y + bh + 19, r.style, { anchor: 'end', size: 11, fill: C.muted }));
    const o = r.summary.overall, p = r.summary.pairPass;
    out.push(hbar(L, y, xs(o) - L, bh, C.s1, `${MODELS[m].label}: ${pct(o)} overall`), txt(xs(o) + 6, y + bh - 3, pct(o), { fill: C.text }));
    out.push(hbar(L, y + bh + 2, xs(p) - L, bh, C.s2, `${MODELS[m].label}: ${pct(p)} of pairs passed`), txt(xs(p) + 6, y + 2 * bh - 1, pct(p), { fill: C.text }));
  });
  out.push(`<line x1="${L}" x2="${L}" y1="${T - 6}" y2="${H - 26}" stroke="${C.text2}"/>`, svgClose);
  return out.join('');
}

// 3. pairs heatmap: movement in the direction the pair wants (diverging, clamped at ±0.5), ✓ when the pair passed
const golden = JSON.parse(readFileSync(join(ROOT, 'packages', 'evals', 'golden', 'pairs.json'), 'utf8')).pairs as Array<{ id: string; direction: 'up' | 'down' }>;
const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const mix = (a: string, b: string, t: number) => `#${hex(a).map((v, i) => Math.round(v + (hex(b)[i] - v) * t).toString(16).padStart(2, '0')).join('')}`;
const lum = (h: string) => { const [r, g, b] = hex(h).map((v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
function pairsChart(): string {
  const W = 760, L = 190, T = 64, cw = (W - L - 12) / cols.length, ch = 26, H = T + pairIds.length * ch + 40;
  const out = [svgOpen(W, H, 'How far each counterfactual change moved each model, in the direction it should')];
  cols.forEach((m, j) => out.push(txt(L + j * cw + cw / 2, T - 26, MODELS[m].label, { anchor: 'middle', fill: C.text, weight: 600 }), txt(L + j * cw + cw / 2, T - 11, best.get(m)!.style, { anchor: 'middle', size: 11, fill: C.muted })));
  pairIds.forEach((id, i) => {
    const y = T + i * ch, dir = golden.find((g) => g.id === id)?.direction ?? 'up';
    out.push(txt(L - 10, y + ch / 2 + 4, id, { anchor: 'end', fill: C.text, size: 11.5 }));
    cols.forEach((m, j) => {
      const g = best.get(m)!.pairs.find((p) => p.id === id)?.grade;
      if (!g || g.delta === undefined) return;
      const right = dir === 'up' ? g.delta : -g.delta;            // + = moved the way it should
      const t = Math.min(1, Math.abs(right) / 0.5);
      const fill = right >= 0 ? mix(C.mid, C.s1, t) : mix(C.mid, C.neg, t);
      const ink = lum(fill) < 0.3 ? '#ffffff' : C.text;
      const x = L + j * cw;
      out.push(`<rect x="${(x + 1).toFixed(1)}" y="${y + 1}" width="${(cw - 2).toFixed(1)}" height="${ch - 2}" rx="3" fill="${fill}"><title>${esc(`${MODELS[m].label} · ${id}: ${g.delta >= 0 ? '+' : ''}${g.delta.toFixed(3)} (wants ${dir}) — ${g.pass ? 'passed' : 'failed'}`)}</title></rect>`,
        txt(x + cw / 2, y + ch / 2 + 4, `${g.pass ? '✓ ' : ''}${Math.abs(right) < 0.005 ? '' : right > 0 ? '+' : '−'}${Math.abs(right).toFixed(2)}`, { anchor: 'middle', fill: ink, size: 11.5, weight: g.pass ? 600 : undefined }));
    });
  });
  // scale key
  const ky = H - 22, kx = L, kw = 220;
  for (let k = 0; k <= 20; k++) { const v = -0.5 + k * 0.05; const t = Math.min(1, Math.abs(v) / 0.5); out.push(`<rect x="${kx + (k * kw) / 21}" y="${ky - 10}" width="${kw / 21 + 0.5}" height="10" fill="${v >= 0 ? mix(C.mid, C.s1, t) : mix(C.mid, C.neg, t)}"/>`); }
  out.push(txt(kx, ky + 14, 'wrong way −0.5', { size: 11, fill: C.muted }), txt(kx + kw, ky + 14, '+0.5 right way', { anchor: 'end', size: 11, fill: C.muted }),
    txt(kx + kw + 16, ky - 1, '✓ = moved at least 0.03 the right way (pair passed)', { size: 11, fill: C.text2 }), svgClose);
  return out.join('');
}

const blocks: Record<string, string> = { leaderboard, pairs, scenarios, data, 'chart-tradeoff': tradeoffChart(), 'chart-scores': scoresChart(), 'chart-pairs': pairsChart() };
let page = readFileSync(PAGE, 'utf8');
for (const [name, body] of Object.entries(blocks)) {
  const re = new RegExp(`(<!-- generated:${name} -->)[\\s\\S]*?(<!-- /generated:${name} -->)`);
  if (!re.test(page)) throw new Error(`docs/results.md is missing the generated:${name} markers`);
  page = page.replace(re, `$1\n\n${body}\n\n$2`);   // blank lines: kramdown (GitHub Pages) treats a table right after an HTML comment as a paragraph
}
writeFileSync(PAGE, page);
console.log(`Updated ${PAGE}: ${runs.length} runs, ${cols.length} models`);
