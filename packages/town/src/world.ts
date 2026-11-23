import { ARRIVAL_MONTHS, ageInt, balanceSheet, createWorld, heuristicDecider, runMonth, type Decider, type World } from '../../sim-core/src/index.ts';
import { ERRAND, monthLabel, moveKindOf } from '../../worker/src/store.ts';

export const DAY = 90_000;
const IDLE = 15 * 60_000;

async function next(world: World, decider: Decider) {
  const result = await runMonth(world, decider);
  const decisions = new Map(result.decisions.map(d => [d.simId, d]));
  return {
    month: world.month, label: monthLabel(world.month), market: world.market.regime,
    rate: world.market.mortgageRate, change: world.market.lastIndexReturn,
    sims: world.sims.map(s => {
      const d = decisions.get(s.id);
      const sheet = balanceSheet(s);
      return {
        id: s.id, name: s.name, arch: s.archetype, career: s.career, age: ageInt(s, world.month),
        working: s.employed || s.selfEmployed, nw: sheet.netWorth, cash: sheet.cash, debt: sheet.debt,
        memories: s.memory, move: d?.picked, errand: d ? ERRAND[moveKindOf(d.picked)] : null,
        probabilities: d?.answers.main, draw: d?.draw, spend: s.spendLevel, persona: s.persona,
      };
    }),
  };
}

type Frame = Awaited<ReturnType<typeof next>>;
export interface Checkpoint {
  world: World;
  current: Frame;
  pending: Frame | null;
  startedAt: number;
  lastSeenAt: number;
}
export interface Storage {
  load(): Promise<{ value: Checkpoint; version: string } | null>;
  save(value: Checkpoint, version?: string): Promise<boolean>;
}

export function sharedWorld(storage: Storage, { pop = 1000, decider = heuristicDecider }: { pop?: number; decider?: Decider } = {}) {
  let inFlight: ReturnType<typeof read> | undefined;

  async function read(now: number) {
    for (let attempt = 0; attempt < 4; attempt++) {
      const saved = await storage.load();
      let value: Checkpoint;
      if (!saved) {
        const world = createWorld(42, pop);
        while (world.month < ARRIVAL_MONTHS) await runMonth(world, heuristicDecider);
        value = { world, current: await next(world, decider), pending: null, startedAt: now, lastSeenAt: now };
      } else {
        value = saved.value;
        const dormant = now - value.lastSeenAt >= IDLE;
        if (dormant) value.startedAt += now - value.lastSeenAt;
        // Keep the visible month stable while preparing the following one.
        if (now - value.startedAt >= DAY && value.pending) {
          value.current = value.pending;
          value.pending = null;
          value.startedAt = now;
        } else if (!value.pending && !dormant) {
          value.pending = await next(value.world, decider);
        } else if (now - value.lastSeenAt < 25_000) {
          return response(value, now);
        }
        value.lastSeenAt = now;
      }
      if (await storage.save(value, saved?.version)) return response(value, now);
    }
    throw new Error('Shared world changed during the request');
  }

  function response(value: Checkpoint, now: number) {
    return { ...value.current, startedAt: value.startedAt, serverTime: now, duration: DAY, decider: decider.name };
  }

  return (now = Date.now()) => inFlight ??= read(now).finally(() => { inFlight = undefined; });
}
