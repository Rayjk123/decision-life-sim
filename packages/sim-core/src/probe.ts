// "Why?" probes (backlog M-TOP 11 / UX "what changes the odds"): re-ask the decider with ONE fact changed and compare
// the odds. This shows what moves the answer, not the model's inner reasoning. The world is cloned; nothing is mutated.
import type { Decider, Sim, StateStyle, World } from './types.ts';
import { buildRequest } from './tick.ts';
import { careerSalary, inSchool } from './finance.ts';
import { remember } from './memory.ts';
import { fmt } from './money.ts';

export interface ProbeChange {
  id: string;
  label: string;                                   // shown to people: "if she had her wages back"
  applies(sim: Sim, world: World): boolean;        // only offered when it would change something
  apply(sim: Sim, world: World): void;             // mutates the CLONE
}

export const PROBE_CHANGES: ProbeChange[] = [
  { id: 'paycheck', label: 'had their wages back', applies: (s, w) => !s.employed && !s.selfEmployed && !s.retired && !inSchool(s, w.month),
    apply: (s, w) => { s.employed = true; s.salary = careerSalary(s, w.month); s.monthsUnemployed = 0; } },
  { id: 'laid_off', label: 'had just lost their job', applies: (s, w) => s.employed && !inSchool(s, w.month),
    apply: (s) => { s.employed = false; s.salary = 0; s.monthsUnemployed = 1; remember(s, 'Was laid off'); } },
  { id: 'no_debt', label: 'had no debts besides the house', applies: (s) => s.loans.some((l) => l.kind !== 'mortgage' && l.balance > 0),
    apply: (s) => { for (const l of s.loans) if (l.kind !== 'mortgage') { l.balance = 0; l.payment = 0; } } },
  { id: 'double_coin', label: 'had twice the coin', applies: (s) => s.cash > 0,
    apply: (s) => { s.cash *= 2; } },
  { id: 'raise', label: 'had just got a 20% raise', applies: (s) => s.employed && s.salary > 0,
    apply: (s) => { s.salary = Math.round(s.salary * 1.2); remember(s, `Got a raise to ${fmt(s.salary)}`); } },
  { id: 'crash', label: 'saw the Guild Fund crash 12% with work scarce', applies: () => true,
    apply: (_s, w) => { w.market.lastIndexReturn = -0.12; w.market.stockReturn = -0.15; w.market.jobsSignal = 'weak'; } },
  { id: 'boom', label: 'saw the Guild Fund soar 8% with work plentiful', applies: () => true,
    apply: (_s, w) => { w.market.lastIndexReturn = 0.08; w.market.stockReturn = 0.1; w.market.jobsSignal = 'strong'; } },
  { id: 'no_memories', label: 'remembered nothing of recent months', applies: (s) => s.memory.length > 0,
    apply: (s) => { s.memory = []; } },
  { id: 'bolder', label: 'were much bolder', applies: (s) => s.traits.risk < 0.8,
    apply: (s) => { s.traits.risk = Math.min(1, s.traits.risk + 0.35); s.traits.lossAversion = Math.max(0, s.traits.lossAversion - 0.35); } },
  { id: 'cautious', label: 'were much more cautious', applies: (s) => s.traits.risk > 0.2,
    apply: (s) => { s.traits.risk = Math.max(0, s.traits.risk - 0.35); s.traits.lossAversion = Math.min(1, s.traits.lossAversion + 0.35); } },
];

export interface ProbeResult {
  change: { id: string; label: string };
  base: Record<string, number>;                    // the move probabilities as things stand
  variant: Record<string, number>;                 // with the one fact changed (moves may differ: legality can change too)
  shift: Array<{ move: string; delta: number }>;   // biggest movers first; a move missing on one side counts as 0
  movesAdded: string[]; movesRemoved: string[];
}

/** Which changes make sense for this sim right now. */
export const probeChangesFor = (sim: Sim, world: World) => PROBE_CHANGES.filter((c) => c.applies(sim, world)).map(({ id, label }) => ({ id, label }));

/** Re-ask `decider` with one fact changed. `base` can be passed in (e.g. the recorded decision's answers) to save a call. */
export async function probe(world: World, simId: string, changeId: string, decider: Decider, opts: { style?: StateStyle; base?: Record<string, number> } = {}): Promise<ProbeResult> {
  const change = PROBE_CHANGES.find((c) => c.id === changeId);
  if (!change) throw new Error(`unknown probe change ${changeId}; one of ${PROBE_CHANGES.map((c) => c.id).join(', ')}`);
  const ask = async (w: World) => {
    const sim = w.sims.find((s) => s.id === simId);
    if (!sim) throw new Error(`no sim ${simId}`);
    const req = buildRequest(sim, w, opts.style);
    return { moves: req.moves.map((m) => m.id), probs: (await decider.decide(req)).answers.main };
  };
  const baseAsk = opts.base ? { moves: Object.keys(opts.base), probs: opts.base } : await ask(structuredClone(world));
  const clone = structuredClone(world);
  const sim = clone.sims.find((s) => s.id === simId)!;
  change.apply(sim, clone);
  const v = await ask(clone);
  const all = [...new Set([...baseAsk.moves, ...v.moves])];
  const shift = all.map((move) => ({ move, delta: (v.probs[move] ?? 0) - (baseAsk.probs[move] ?? 0) })).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  return {
    change: { id: change.id, label: change.label }, base: baseAsk.probs, variant: v.probs, shift,
    movesAdded: v.moves.filter((x) => !baseAsk.moves.includes(x)), movesRemoved: baseAsk.moves.filter((x) => !v.moves.includes(x)),
  };
}
