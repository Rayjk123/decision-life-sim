// Persistence and the read model.
// - log/: append-only events.ndjson and decisions.ndjson (the source of truth for history)
// - snapshots/: the full world every 12 months (restart point for --resume)
// - public/: small files the browser reads:
//     latest.json, months/N.json, decisions/N.json, people/ID.json, leaderboard.json, stats.json
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  ARCHETYPE, ARCHETYPES, CAREER, ageInt, balanceSheet, home, rentals,
  type DecisionRecord, type MonthResult, type MoveKind, type Sim, type SimEvent, type World,
} from '@dls/sim-core';

/** Which building a sim walks to for each kind of move. */
/** A sim's month-by-month history, columnar to stay small (amounts in cents). */
export interface Journey {
  id: string; name: string;
  m: number[]; cash: number[]; savings: number[]; invested: number[]; property: number[]; other: number[]; debt: number[];
  spend: Array<number | null>; inflow: number[]; outflow: number[];
  events: Array<{ month: number; type: string; text: string }>;
  decisions: Array<Record<string, unknown> & { month: number; stateDelta?: Record<string, unknown>; stateRemoved?: string[] }>;
  lastState?: Record<string, unknown>;   // in memory only: the previous decision's full state
}

/** Rebuild each decision's full state from the stored deltas (what the dashboard does too). */
export function journeyStates(x: Journey): Array<Record<string, unknown>> {
  let cur: Record<string, unknown> = {};
  return x.decisions.map((d) => {
    cur = { ...cur, ...(d.stateDelta ?? {}) };
    for (const k of d.stateRemoved ?? []) delete cur[k];
    return cur;
  });
}
const SERIES = ['m', 'cash', 'savings', 'invested', 'property', 'other', 'debt', 'spend', 'inflow', 'outflow'] as const;
const emptyJourney = (id: string, name: string): Journey => ({ id, name, m: [], cash: [], savings: [], invested: [], property: [], other: [], debt: [], spend: [], inflow: [], outflow: [], events: [], decisions: [] });
export function truncateJourney(x: Journey, month: number): Journey {
  const n = x.m.filter((v) => v <= month).length;
  const out = { ...x } as Journey;
  for (const k of SERIES) (out[k] as unknown[]) = (x[k] as unknown[]).slice(0, n);
  out.events = x.events.filter((e) => e.month <= month);
  out.decisions = x.decisions.filter((d) => d.month <= month);
  return out;
}

/** Event types that make up a life's milestones (big splurges, level 9-10, are added too). */
const MILESTONES = new Set(['arrived', 'inherited', 'started_career', 'bought_home', 'bought_rental', 'sold_rental', 'started_business', 'business_exit', 'business_failed', 'laid_off', 'retired', 'bankrupt']);

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
  private life = new Map<string, Array<{ month: number; type: string; text: string }>>();
  private milestones = new Map<string, Array<{ month: number; type: string; text: string }>>();   // never crowded out by routine events
  private nwByYear = new Map<string, number[]>();
  private lastDecision = new Map<string, DecisionRecord>();
  private stats: YearStat[] = [];
  private journeys = new Map<string, Journey>();   // month-by-month history per living sim (written yearly, at death, at the end)

  constructor(private dir: string) {
    for (const d of ['log', 'snapshots', 'public/months', 'public/decisions', 'public/people']) mkdirSync(join(dir, d), { recursive: true });
    // Written from the start so a young world (before its first full year) serves an empty chart, not a 404
    const stats = join(dir, 'public/stats.json');
    if (!existsSync(stats)) writeFileSync(stats, JSON.stringify({ years: [] }));
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
    // Journeys were written at year ends, so the files hold at least the history up to this snapshot: reload and trim
    for (const s of world.sims) {
      const path = join(this.dir, `public/people/${s.id}-journey.json`);
      if (existsSync(path)) {
        const x = truncateJourney(JSON.parse(readFileSync(path, 'utf8')) as Journey, month);
        x.lastState = journeyStates(x).at(-1);
        this.journeys.set(s.id, x);
      }
    }
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
      this.addLife(e);
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
    this.recordJourneys(world, r);

    const changed = new Set<string>();
    for (const e of r.events) {
      if (!e.simId || e.type === 'decision') continue;
      this.addLife(e);
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

  /** Append this month to every living sim's journey; write the dead at once and everyone at year ends. */
  private recordJourneys(world: World, r: MonthResult) {
    const m = r.month;
    const j = (id: string, name: string) => { let x = this.journeys.get(id); if (!x) this.journeys.set(id, (x = emptyJourney(id, name))); return x; };
    for (const s of world.sims) {
      const b = balanceSheet(s), x = j(s.id, s.name);
      const flows = Object.values(s.flows ?? {});
      const usd = (c: number) => Math.round(c / 100);   // whole dollars keep the file small
      x.m.push(m); x.cash.push(usd(b.cash)); x.savings.push(usd(b.savings ?? 0)); x.invested.push(usd(b.investments)); x.property.push(usd(b.property));
      x.other.push(usd(b.other)); x.debt.push(usd(b.debt)); x.spend.push(s.spendLevel ?? null);
      x.inflow.push(usd(flows.filter((v) => v > 0).reduce((t, v) => t + v, 0))); x.outflow.push(usd(flows.filter((v) => v < 0).reduce((t, v) => t + v, 0)));
    }
    for (const e of r.events) if (e.simId && e.type !== 'decision') this.journeys.get(e.simId)?.events.push({ month: e.month, type: e.type, text: e.text });
    for (const d of r.decisions) {
      const x = this.journeys.get(d.simId);
      if (!x) continue;
      // The state is stored as a delta: in full on the first decision, then only the facts that changed
      // (small files, and exactly what "what changed since the last decision" needs)
      const prev = x.lastState ?? {};
      const state = (d.state ?? {}) as Record<string, unknown>;
      const changed = Object.fromEntries(Object.entries(state).filter(([k, v]) => prev[k] !== v));
      const removed = Object.keys(prev).filter((k) => !(k in state));
      x.lastState = state;
      x.decisions.push({
        month: d.month, picked: d.picked, valid: d.valid, heuristicPick: d.heuristicPick, reason: d.reason, draw: d.draw,
        investLevel: d.investLevel, spendLevel: d.spendLevel, retired: d.retired, provider: d.provider, model: d.model,
        odds: Object.fromEntries(Object.entries(d.answers.main).map(([k, v]) => [k, Math.round(v * 1000) / 1000])),
        stateDelta: changed, ...(removed.length ? { stateRemoved: removed } : {}),
      });
    }
    for (const e of r.events) if (e.type === 'died' && e.simId) { this.writeJourney(e.simId); this.journeys.delete(e.simId); }
    if (m % 12 === 0) for (const s of world.sims) this.writeJourney(s.id);
  }

  private writeJourney(id: string) {
    const x = this.journeys.get(id);
    if (x) { const { lastState: _omit, ...file } = x; writeFileSync(join(this.dir, `public/people/${id}-journey.json`), JSON.stringify(file)); }
  }

  /** Write every living sim's journey (end of a run). */
  flush(world: World) { for (const s of world.sims) this.writeJourney(s.id); }

  /** Recent events (newest first, capped) plus a separate, chronological list of life milestones. */
  private addLife(e: SimEvent) {
    const list = this.life.get(e.simId!) ?? [];
    list.unshift({ month: e.month, type: e.type, text: e.text });
    if (list.length > 200) list.length = 200;
    this.life.set(e.simId!, list);
    const big = e.type === 'splurge' && Number((e.data as { level?: number } | undefined)?.level) >= 9;
    if (MILESTONES.has(e.type) || big) {
      const ms = this.milestones.get(e.simId!) ?? [];
      ms.push({ month: e.month, type: e.type, text: e.text });
      if (ms.length > 80) ms.splice(1, ms.length - 80);   // keep the arrival, drop the oldest after it
      this.milestones.set(e.simId!, ms);
    }
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
      life: (this.life.get(s.id) ?? []).map((e) => ({ ...e, age: Math.floor((e.month - s.birthMonth) / 12) })),
      milestones: (this.milestones.get(s.id) ?? []).map((e) => ({ ...e, age: Math.floor((e.month - s.birthMonth) / 12) })),
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
