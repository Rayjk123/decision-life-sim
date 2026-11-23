import {
  ARCHETYPE, ARCHETYPES, ARRIVAL_MONTHS, BUSINESSES, CAREER, PROBE_CHANGES, ageInt, balanceSheet, buildRequest, createWorld,
  heuristicAnswers, heuristicDecider, runMonth, type Decider, type DecisionRequest, type DecisionResult, type World,
} from '../../sim-core/src/index.ts';
import { CURRENCY, FUND, LOAN_NAME, REGIME_NAME, RENTAL, VAULT, VENTURES } from '../../sim-core/src/theme.ts';
import { ERRAND, monthLabel, moveKindOf } from '../../worker/src/store.ts';

export const DAY = 90_000;
const IDLE = 15 * 60_000;
const HISTORY_MONTHS = 12;
const MODEL_PROBE_ARCHIVE_MONTHS = 2;
const COMPARED_INPUTS = ['money', 'monthly', 'warnings', 'market'] as const;
const doubleCoin = PROBE_CHANGES.find(change => change.id === 'double_coin');
const presentation = {
  currency: CURRENCY,
  fund: FUND,
  houseLoan: LOAN_NAME.mortgage,
  regimes: REGIME_NAME,
  archetypes: Object.fromEntries(ARCHETYPES.map(({ key, label }) => [key, label])),
  moves: {
    nothing: 'Do nothing',
    invest_index: `Invest in the ${FUND}`,
    trade_stocks: `Back ${VENTURES}`,
    save_cash: `Save in the ${VAULT}`,
    pay_debt: 'Pay down debt',
    buy_home: 'Buy a home',
    buy_home_big: 'Buy a larger home',
    buy_rental: `Buy a ${RENTAL}`,
    sell_rental: `Sell a ${RENTAL}`,
    buy_car: 'Buy a cart or carriage',
    start_business: 'Start a business',
    ...Object.fromEntries(BUSINESSES.map(({ key, label }) => [
      'start_' + key,
      `Start ${/^[aeiou]/i.test(label) ? 'an' : 'a'} ${label.toLowerCase()}`,
    ])),
  },
};

function captureProbe(request: DecisionRequest, keepModelRequest: boolean) {
  if (!doubleCoin?.applies(request.sim, request.world)) return undefined;
  const sim = structuredClone(request.sim);
  // Double coin edits only this resident. The same month, market and town economy stay in view.
  const world = { ...request.world, sims: request.world.sims.map(resident => resident.id === sim.id ? sim : resident) };
  doubleCoin.apply(sim, world);
  const variant = buildRequest(sim, world);
  return {
    beforeCoin: request.sim.cash,
    afterCoin: sim.cash,
    offered: variant.moves.map(move => move.id),
    heuristicOdds: heuristicAnswers(sim, world, variant.moves, variant.askRetire).main,
    modelRequest: keepModelRequest ? { state: variant.state, questions: variant.questions, moves: variant.moves } : undefined,
  };
}

async function next(world: World, decider: Decider) {
  const probes = new Map<string, NonNullable<ReturnType<typeof captureProbe>>>();
  const result = await runMonth(world, decider, {
    onDecisionRequest(request) {
      const capture = captureProbe(request, decider !== heuristicDecider);
      if (capture) probes.set(request.sim.id, capture);
    },
  });
  const decisions = new Map(result.decisions.map(d => [d.simId, d]));
  return {
    month: world.month, label: monthLabel(world.month), market: world.market.regime,
    rate: world.market.mortgageRate, change: world.market.lastIndexReturn,
    sims: world.sims.map(s => {
      const d = decisions.get(s.id);
      const sheet = balanceSheet(s);
      const context = d?.state && Object.fromEntries(COMPARED_INPUTS.flatMap(key => {
        const value = d.state?.[key];
        return typeof value === 'string' ? [[key, value]] : [];
      }));
      const decision = d && {
        provider: d.provider, model: d.model, valid: d.valid, sampling: d.sampling,
        reason: d.reason, offered: d.moves, context,
      };
      return {
        id: s.id, name: s.name, arch: s.archetype, career: s.career, age: ageInt(s, world.month),
        working: s.employed || s.selfEmployed, nw: sheet.netWorth, cash: sheet.cash, debt: sheet.debt,
        memories: s.memory, move: d?.picked, errand: d ? ERRAND[moveKindOf(d.picked)] : null,
        probabilities: d?.answers.main, draw: d?.draw, decision, spend: s.spendLevel, persona: s.persona,
        probe: probes.get(s.id),
      };
    }),
  };
}

type Frame = Awaited<ReturnType<typeof next>>;
type ResidentFrame = Frame['sims'][number];
type ResidentMonth = Pick<ResidentFrame, 'age' | 'nw' | 'cash' | 'debt' | 'move'>
  & Partial<Pick<ResidentFrame, 'arch' | 'probabilities' | 'draw' | 'decision' | 'probe'>>;
type HistoryMonth = { month: number; residents: Record<string, ResidentMonth> };

function monthRecord({ age, nw, cash, debt, move, arch, probabilities, draw, decision, probe }: ResidentFrame): ResidentMonth {
  return { age, nw, cash, debt, move, arch: move ? arch : undefined, probabilities, draw, decision, probe };
}

function publicMonthRecord(resident: ResidentMonth) {
  const { probe, ...record } = resident;
  return { ...record, hasProbe: hasProbe(probe, record.decision?.provider) };
}

function hasProbe(probe: ResidentMonth['probe'], provider: string | undefined) {
  return Boolean(probe && (provider === 'heuristic' || provider === 'heuristic-fallback'
    || (provider === 'kev' && probe.modelRequest)));
}

export interface Checkpoint {
  world: World;
  current: Frame;
  pending: Frame | null;
  startedAt: number;
  lastSeenAt: number;
  history?: HistoryMonth[];
}
export interface Storage {
  load(): Promise<{ value: Checkpoint; version: string } | null>;
  save(value: Checkpoint, version?: string): Promise<boolean>;
}

type ModelProbe = {
  model: string;
  decide(request: Pick<DecisionRequest, 'state' | 'questions' | 'moves'>): Promise<DecisionResult>;
};

export function sharedWorld(storage: Storage, {
  pop = 1000, decider = heuristicDecider, modelProbe,
}: { pop?: number; decider?: Decider; modelProbe?: ModelProbe } = {}) {
  let inFlight: ReturnType<typeof read> | undefined;
  let modelProbeRunning = false, lastModelProbe = -Infinity;
  const probeCache = new Map<string, Record<string, number>>();

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
          const residents = Object.fromEntries(value.current.sims.map(sim => [sim.id, monthRecord(sim)]));
          value.history = [...(value.history ?? []), { month: value.current.month, residents }].slice(1 - HISTORY_MONTHS);
          for (const older of value.history.slice(0, -MODEL_PROBE_ARCHIVE_MONTHS)) {
            for (const resident of Object.values(older.residents)) {
              if (resident.probe?.modelRequest) delete resident.probe.modelRequest;
            }
          }
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
    const sims = value.current.sims.map(({ probe, ...sim }) => {
      const career = CAREER[sim.career];
      const d = sim.decision;
      const decision = d && { provider: d.provider, model: d.model, valid: d.valid, sampling: d.sampling };
      return { ...sim, decision, hasProbe: hasProbe(probe, d?.provider), workplace: career?.workplace, occupation: career?.label };
    });
    return { ...value.current, sims, presentation, startedAt: value.startedAt, serverTime: now, duration: DAY, decider: decider.name };
  }

  async function residentHistory(id: string) {
    const saved = await storage.load();
    if (!saved) return [];
    const { current, history = [] } = saved.value;
    const months = history.flatMap(({ month, residents }) =>
      Object.hasOwn(residents, id) ? [{ month, label: monthLabel(month), ...publicMonthRecord(residents[id]) }] : []);
    const resident = current.sims.find(sim => sim.id === id);
    if (resident) months.push({ month: current.month, label: current.label, ...publicMonthRecord(monthRecord(resident)) });
    return months;
  }

  async function counterfactual(id: string, month: number) {
    const saved = await storage.load();
    if (!saved) return { status: 'unavailable' as const };
    const { current, history = [] } = saved.value;
    const archived = history.find(row => row.month === month)?.residents;
    const record = month === current.month ? current.sims.find(sim => sim.id === id)
      : archived && Object.hasOwn(archived, id) ? archived[id] : undefined;
    const capture = record?.probe, decision = record?.decision, base = record?.probabilities;
    if (!capture || !decision || !base) return { status: 'unavailable' as const };
    let variant = capture.heuristicOdds;
    if (decision.provider === 'kev') {
      if (!capture.modelRequest || !decision.model || modelProbe?.model !== decision.model) {
        return { status: 'source-unavailable' as const };
      }
      const key = month + ':' + id;
      const cached = probeCache.get(key);
      if (cached) variant = cached;
      else {
        if (modelProbeRunning || Date.now() - lastModelProbe < 3000) return { status: 'busy' as const };
        modelProbeRunning = true;
        lastModelProbe = Date.now();
        try {
          const answer = await modelProbe.decide(capture.modelRequest);
          if (answer.provider !== decision.provider || answer.model !== decision.model
            || !Object.values(answer.answers.main).some(weight => Number.isFinite(weight) && weight > 0)) {
            return { status: 'source-unavailable' as const };
          }
          variant = answer.answers.main;
          probeCache.set(key, variant);
          if (probeCache.size > 64) probeCache.delete(probeCache.keys().next().value!);
        } catch {
          return { status: 'source-unavailable' as const };
        } finally {
          modelProbeRunning = false;
        }
      }
    } else if (decision.provider !== 'heuristic' && decision.provider !== 'heuristic-fallback') {
      return { status: 'source-unavailable' as const };
    }
    const offered = decision.offered ?? Object.keys(base);
    return {
      status: 'ready' as const, month, label: monthLabel(month), beforeCoin: capture.beforeCoin, afterCoin: capture.afterCoin,
      provider: decision.provider, model: decision.model, base, variant,
      movesAdded: capture.offered.filter(move => !offered.includes(move)),
      movesRemoved: offered.filter(move => !capture.offered.includes(move)),
    };
  }

  async function decisionMix(through: number) {
    const saved = await storage.load();
    type Counts = { move: string; picked: number; offered: number; pickedWhenOffered: number };
    type Group = {
      arch: string; label: string; provider?: string; model?: string;
      decisions: number; knownOffers: number; moves: Map<string, Counts>;
    };
    const groups = new Map<string, Group>();
    let decisions = 0, missingArchetype = 0;
    function count(resident: ResidentMonth) {
      if (!resident.move) return;
      decisions++;
      const arch = resident.arch;
      if (!arch) { missingArchetype++; return; }
      const provider = resident.decision?.provider, model = resident.decision?.model;
      const key = JSON.stringify([arch, provider, model]);
      let group = groups.get(key);
      if (!group) {
        group = { arch, label: ARCHETYPE[arch]?.label ?? arch, provider, model, decisions: 0, knownOffers: 0, moves: new Map() };
        groups.set(key, group);
      }
      const active = group;
      function moveCounts(move: string) {
        const existing = active.moves.get(move);
        if (existing) return existing;
        const counts = { move, picked: 0, offered: 0, pickedWhenOffered: 0 };
        active.moves.set(move, counts);
        return counts;
      }
      active.decisions++;
      const picked = moveKindOf(resident.move);
      moveCounts(picked).picked++;
      if (!resident.decision?.offered) return;
      active.knownOffers++;
      // An offer counts once per decision even if several options share a move kind.
      for (const move of new Set(resident.decision.offered.map(moveKindOf))) {
        const counts = moveCounts(move);
        counts.offered++;
        if (move === picked) counts.pickedWhenOffered++;
      }
    }
    const months: number[] = [];
    if (saved) {
      const { current, history = [] } = saved.value;
      for (const month of history) {
        if (month.month > through) continue;
        months.push(month.month);
        for (const resident of Object.values(month.residents)) count(resident);
      }
      if (current.month <= through) {
        months.push(current.month);
        for (const resident of current.sims) count(resident);
      }
    }
    return {
      months: months.map(month => ({ month, label: monthLabel(month) })),
      decisions, missingArchetype,
      groups: [...groups.values()].map(group => ({
        ...group, moves: [...group.moves.values()].sort((a, b) => b.picked - a.picked || b.offered - a.offered || a.move.localeCompare(b.move)),
      })),
    };
  }

  return Object.assign(
    (now = Date.now()) => inFlight ??= read(now).finally(() => { inFlight = undefined; }),
    { residentHistory, decisionMix, counterfactual },
  );
}
