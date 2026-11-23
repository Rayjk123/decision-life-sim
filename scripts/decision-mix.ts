// What each personality actually chooses in a world, and whether its signature move was available.
//   npx tsx scripts/decision-mix.ts <world-dir> [<world-dir> ...]     (e.g. experiments/p0-medieval/seed-1-model)
// For each archetype: the share of decisions picking each move kind, then for the archetype's signature move(s)
// the share of decisions where it was OFFERED (legal) and the share picked WHEN offered. That separates "the rules
// rarely allow it" from "the model turns it down" (backlog B0, M-TOP 3-4).
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { ARCHETYPES } from '@dls/sim-core';

const KEY_OF = new Map(ARCHETYPES.flatMap((a) => [[a.key, a.key], [a.label, a.key]] as Array<[string, string]>));

const SIGNATURE: Record<string, RegExp> = {
  saver: /^save_cash$/, index: /^invest_index$/, picker: /^trade_stocks$/, re: /^buy_rental$/, biz: /^start_/,
  spender: /^buy_car$/, status: /^(buy_home_big|buy_home|buy_car)$/, fire: /^invest_index$/, balanced: /^(invest_index|save_cash|pay_debt)$/,
};
const kind = (id: string) => (id.startsWith('start_') ? 'start_business' : id);

export interface MixRow { archetype: string; n: number; mix: Record<string, number>; offered: number; pickedWhenOffered: number }

export function decisionMix(dirs: string[]): MixRow[] {
  const by = new Map<string, { n: number; mix: Record<string, number>; offered: number; taken: number }>();
  for (const dir of dirs) {
    const people = join(dir, 'public', 'people');
    const arch = new Map<string, string>();
    for (const f of readdirSync(people)) if (!f.includes('journey')) { const p = JSON.parse(readFileSync(join(people, f), 'utf8')); arch.set(p.id, KEY_OF.get(p.archetype) ?? p.archetype); }
    const log = join(dir, 'log', 'decisions.ndjson');
    if (!existsSync(log)) continue;
    for (const line of readFileSync(log, 'utf8').split('\n')) {
      if (!line) continue;
      const d = JSON.parse(line);
      const a = arch.get(d.simId) ?? '?';
      const row = by.get(a) ?? { n: 0, mix: {}, offered: 0, taken: 0 };
      row.n++;
      row.mix[kind(d.picked)] = (row.mix[kind(d.picked)] ?? 0) + 1;
      const sig = SIGNATURE[a];
      if (sig && (d.moves as string[]).some((m) => sig.test(m))) { row.offered++; if (sig.test(d.picked)) row.taken++; }
      by.set(a, row);
    }
  }
  return [...by.entries()].sort().map(([archetype, r]) => ({
    archetype, n: r.n,
    mix: Object.fromEntries(Object.entries(r.mix).map(([k, v]) => [k, v / r.n]).sort((x, y) => (y[1] as number) - (x[1] as number))),
    offered: r.offered / r.n, pickedWhenOffered: r.offered ? r.taken / r.offered : 0,
  }));
}

if (process.argv[1]?.endsWith('decision-mix.ts')) {
  const dirs = process.argv.slice(2);
  if (!dirs.length) { console.error('usage: npx tsx scripts/decision-mix.ts <world-dir> [...]'); process.exit(1); }
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  console.log('archetype   n      signature offered · picked when offered | top picks');
  for (const r of decisionMix(dirs)) {
    console.log(`${r.archetype.padEnd(10)} ${String(r.n).padStart(5)}   ${pct(r.offered).padStart(5)} · ${pct(r.pickedWhenOffered).padStart(4)}               | ${Object.entries(r.mix).slice(0, 4).map(([k, v]) => `${k} ${pct(v)}`).join(', ')}`);
  }
}
