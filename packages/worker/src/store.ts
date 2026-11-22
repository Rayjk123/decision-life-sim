// Persistence and the read model.
// - log/: append-only events.ndjson and decisions.ndjson (the source of truth for history)
// - snapshots/: the full world every 12 months (restart point for --resume)
// - public/: small files the browser reads:
//     latest.json, months/N.json, decisions/N.json, people/ID.json, leaderboard.json, stats.json
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  ARCHETYPE, ARCHETYPES, CAREER, ageInt, balanceSheet, home, rentals,
  type DecisionRecord, type MonthResult, type MoveKind, type Sim, type World,
} from '@dls/sim-core';

/** Which building a sim walks to for each kind of move. */
export const ERRAND: Record<MoveKind, string | null> = {
  nothing: null, invest_index: 'brokerage', trade_stocks: 'brokerage', pay_debt: 'bank', save_cash: 'bank',
  buy_home: 'realtor', buy_rental: 'realtor', sell_rental: 'realtor', buy_car: 'car_lot', start_business: 'city_hall',
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const monthLabel = (m: number) => `Year ${Math.floor((m - 1) / 12) + 1} · ${MONTHS[(m - 1) % 12]}`;

export function moveKindOf(id: string): MoveKind {
  if (id.startsWith('start_')) return 'start_business';
  if (id.startsWith('buy_home')) return 'buy_home';
  return id as MoveKind;
}

const median = (xs: number[]) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] : 0);

interface YearStat { year: number; population: number; index: number; homeIndex: number; regime: string; byArchetype: Record<string, { n: number; medianNetWorth: number; ownHome: number; rentals: number; business: number }> }

export class WorldStore {
  private life = new Map<string, Array<{ month: number; text: string }>>();
  private nwByYear = new Map<string, number[]>();
  private lastDecision = new Map<string, DecisionRecord>();
  private stats: YearStat[] = [];

  constructor(private dir: string) {
    for (const d of ['log', 'snapshots', 'public/months', 'public/decisions', 'public/people']) mkdirSync(join(dir, d), { recursive: true });
  }

  /** Latest snapshot month in this folder, or null. */
  latestSnapshot(): number | null {
    const dir = join(this.dir, 'snapshots');
    if (!existsSync(dir)) return null;
    const months = readdirSync(dir).map((f) => /^month-(\d+)\.json$/.exec(f)?.[1]).filter(Boolean).map(Number);
    return months.length ? Math.max(...months) : null;
  }

  /** Load a snapshot and rebuild in-memory history from the logs, dropping anything logged after it. */
  resume(month: number): World {
    const world = JSON.parse(readFileSync(join(this.dir, `snapshots/month-${month}.json`), 'utf8')) as World;
    const trim = (file: string, onKeep: (o: any) => void) => {
      const path = join(this.dir, 'log', file);
      if (!existsSync(path)) return;
      const kept: string[] = [];
      for (const line of readFileSync(path, 'utf8').split('\n')) {
        if (!line) continue;
        const o = JSON.parse(line);
        if (o.month > month) continue;
        kept.push(line); onKeep(o);
      }
      writeFileSync(path, kept.length ? kept.join('\n') + '\n' : '');
    };
    trim('events.ndjson', (e) => {
      if (!e.simId || e.type === 'decision') return;
      const list = this.life.get(e.simId) ?? [];
      list.unshift({ month: e.month, text: e.text });
      if (list.length > 200) list.length = 200;
      this.life.set(e.simId, list);
    });
    trim('decisions.ndjson', (d) => this.lastDecision.set(d.simId, d));
    const statsPath = join(this.dir, 'public/stats.json');
    if (existsSync(statsPath)) this.stats = (JSON.parse(readFileSync(statsPath, 'utf8')).years as YearStat[]).filter((y) => y.year * 12 <= month);
    // Rebuild each sim's yearly net worth from the snapshots up to the resume point.
    const snaps = readdirSync(join(this.dir, 'snapshots'))
      .map((f) => Number(/^month-(\d+)\.json$/.exec(f)?.[1])).filter((x) => x && x <= month).sort((a, b) => a - b);
    for (const sm of snaps) {
      const w = sm === month ? world : (JSON.parse(readFileSync(join(this.dir, `snapshots/month-${sm}.json`), 'utf8')) as World);
      for (const sim of w.sims) {
        const arr = this.nwByYear.get(sim.id) ?? [];
        arr.push(balanceSheet(sim).netWorth);
        this.nwByYear.set(sim.id, arr);
      }
    }
    return world;
  }

  write(world: World, r: MonthResult) {
    const m = r.month;
    appendFileSync(join(this.dir, 'log/events.ndjson'), r.events.map((e) => JSON.stringify(e)).join('\n') + (r.events.length ? '\n' : ''));
    if (r.decisions.length) appendFileSync(join(this.dir, 'log/decisions.ndjson'), r.decisions.map(({ state, descriptions, ...d }) => JSON.stringify(d)).join('\n') + '\n');
    if (m % 12 === 0) writeFileSync(join(this.dir, `snapshots/month-${m}.json`), JSON.stringify(world));

    const changed = new Set<string>();
    for (const e of r.events) {
      if (!e.simId || e.type === 'decision') continue;
      const list = this.life.get(e.simId) ?? [];
      list.unshift({ month: e.month, text: e.text });
      if (list.length > 200) list.length = 200;
      this.life.set(e.simId, list);
      changed.add(e.simId);
    }
    for (const d of r.decisions) { const { state, descriptions, ...lean } = d; this.lastDecision.set(d.simId, { ...lean, descriptions } as DecisionRecord); changed.add(d.simId); }
    if (m % 12 === 0) {
      for (const s of world.sims) {
        const arr = this.nwByYear.get(s.id) ?? [];
        arr.push(balanceSheet(s).netWorth);
        this.nwByYear.set(s.id, arr);
        changed.add(s.id);
      }
      this.stats.push(yearStat(world));
      writeFileSync(join(this.dir, 'public/stats.json'), JSON.stringify({ years: this.stats }));
    }

    const byId = new Map(world.sims.map((s) => [s.id, s]));
    const decided = new Map(r.decisions.map((d) => [d.simId, d]));
    const monthFile = {
      month: m,
      label: monthLabel(m),
      market: { regime: world.market.regime, index: Math.round(world.market.indexLevel), indexChange: world.market.lastIndexReturn, mortgageRate: world.market.mortgageRate, homeIndex: world.market.homeIndex, jobs: world.market.jobsSignal },
      economy: world.economy,
      sims: world.sims.map((s) => {
        const d = decided.get(s.id);
        return {
          id: s.id, name: s.name, arch: s.archetype, career: s.career, age: ageInt(s, m), nw: balanceSheet(s).netWorth,
          ...(d ? { move: d.picked, p: Math.round((d.answers.main[d.picked] ?? 0) * 100) / 100, errand: ERRAND[moveKindOf(d.picked)] } : {}),
        };
      }),
      events: r.events.filter((e) => e.type !== 'decision'),
    };
    writeFileSync(join(this.dir, `public/months/${m}.json`), JSON.stringify(monthFile));
    writeFileSync(join(this.dir, `public/decisions/${m}.json`), JSON.stringify(r.decisions.map((d) => {
      const s = byId.get(d.simId);
      return { ...d, name: s?.name, arch: s?.archetype };
    })));

    for (const id of changed) {
      const s = byId.get(id);
      if (s) writeFileSync(join(this.dir, `public/people/${id}.json`), JSON.stringify(this.person(world, s)));
    }

    const ranked = [...world.sims].map((s) => ({ s, nw: balanceSheet(s).netWorth })).sort((a, b) => b.nw - a.nw).slice(0, 50);
    writeFileSync(join(this.dir, 'public/leaderboard.json'), JSON.stringify({
      month: m,
      living: ranked.map(({ s, nw }) => ({ id: s.id, name: s.name, age: ageInt(s, m), arch: s.archetype, career: s.career, nw })),
      hallOfFame: [...world.hallOfFame].sort((a, b) => b.peakNetWorth - a.peakNetWorth).slice(0, 50),
    }));
    writeFileSync(join(this.dir, 'public/latest.json'), JSON.stringify({ month: m, label: monthLabel(m), population: world.sims.length, writtenAt: new Date().toISOString() }));
  }

  person(world: World, s: Sim) {
    const m = world.month;
    const d = this.lastDecision.get(s.id);
    return {
      id: s.id, name: s.name, age: ageInt(s, m), career: CAREER[s.career].label, archetype: ARCHETYPE[s.archetype].label,
      persona: s.persona, traits: s.traits, employed: s.employed, selfEmployed: s.selfEmployed, retired: s.retired,
      salary: s.salary, creditScore: s.creditScore, rentsFrom: s.landlordId ?? null,
      balance: balanceSheet(s),
      thisMonth: s.flows,
      assets: s.assets.map((a) => ({ kind: a.kind, value: a.value, rented: a.kind === 'rental' ? !!a.tenantId : undefined, rent: a.rent, businessType: a.businessType, since: a.boughtMonth })),
      loans: s.loans.filter((l) => l.balance > 0).map((l) => ({ kind: l.kind, balance: l.balance, rate: l.annualRate, payment: l.payment })),
      memory: s.memory,
      netWorthByYear: this.nwByYear.get(s.id) ?? [],
      life: this.life.get(s.id) ?? [],
      lastDecision: d ?? null,
    };
  }
}

function yearStat(world: World): YearStat {
  const byArchetype: YearStat['byArchetype'] = {};
  for (const a of ARCHETYPES) {
    const sims = world.sims.filter((s) => s.archetype === a.key);
    if (!sims.length) continue;
    byArchetype[a.key] = {
      n: sims.length,
      medianNetWorth: median(sims.map((s) => balanceSheet(s).netWorth)),
      ownHome: sims.filter((s) => !!home(s)).length / sims.length,
      rentals: sims.reduce((t, s) => t + rentals(s).length, 0) / sims.length,
      business: sims.filter((s) => s.assets.some((x) => x.kind === 'business')).length / sims.length,
    };
  }
  return { year: world.month / 12, population: world.sims.length, index: Math.round(world.market.indexLevel), homeIndex: world.market.homeIndex, regime: world.market.regime, byArchetype };
}
