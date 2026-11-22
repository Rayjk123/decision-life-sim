// Grading a decider's probabilities against the golden expectations.
import type { Answers } from '@dls/sim-core';
import { mass, matches } from './build.ts';
import type { Expectation } from './types.ts';

export interface ScenarioGrade {
  top: string;
  topOk: boolean;            // the most likely move is an in-character pick
  bestMass: number;          // total probability on in-character picks
  avoidMass: number;         // total probability on out-of-character picks
  avoidOk: boolean;
  constraintsMet: number;    // fraction of pairwise constraints satisfied
  retireOk: boolean | null;  // null when not graded
  spendOk: boolean | null;   // null when not graded
  score: number;             // 0..1
  pass: boolean;
}

export const PASS_SCORE = 0.7;

export function gradeScenario(answers: Answers, expect: Expectation): ScenarioGrade {
  const probs = answers.main;
  const sorted = Object.entries(probs).sort((a, b) => b[1] - a[1]);
  const top = sorted[0]?.[0] ?? 'nothing';
  const tied = sorted.length > 1 && Math.abs(sorted[0][1] - sorted[1][1]) < 1e-9; // no real preference, no credit
  const topOk = !tied && expect.best.some((p) => matches(p, top));
  const bestMass = mass(probs, expect.best);
  const avoidMass = expect.avoid?.length ? mass(probs, expect.avoid) : 0;
  const avoidOk = avoidMass <= (expect.maxAvoidMass ?? 0.3);
  const cs = expect.constraints ?? [];
  const met = cs.filter((c) => mass(probs, c.more) > mass(probs, c.than)).length;
  const constraintsMet = cs.length ? met / cs.length : 1;
  let retireOk: boolean | null = null;
  if (expect.retire) {
    const p = answers.retire;
    retireOk = p !== undefined && (expect.retire.min === undefined || p >= expect.retire.min) && (expect.retire.max === undefined || p <= expect.retire.max);
  }
  // Weights: top pick 40%, staying away from out-of-character moves 30%, ordering constraints 30%.
  // When a retirement expectation exists it takes a 25% share and the rest scale down.
  let score = 0.4 * (topOk ? 1 : 0) + 0.3 * (avoidOk ? 1 : 0) + 0.3 * constraintsMet;
  if (retireOk !== null) score = score * 0.75 + 0.25 * (retireOk ? 1 : 0);
  // A spend expectation (SPEC 18) takes a 20% share the same way
  let spendOk: boolean | null = null;
  if (expect.spend) {
    const lv = expectedSpend(answers);
    spendOk = lv !== undefined && (expect.spend.min === undefined || lv >= expect.spend.min) && (expect.spend.max === undefined || lv <= expect.spend.max);
    score = score * 0.8 + 0.2 * (spendOk ? 1 : 0);
  }
  return { top, topOk, bestMass, avoidMass, avoidOk, constraintsMet, retireOk, spendOk, score, pass: score >= PASS_SCORE };
}

/** Expected spend level (1-10) from a decider's spend-level probabilities; undefined when it didn't answer. */
export function expectedSpend(answers: Answers): number | undefined {
  const e = Object.entries(answers.spendLevel ?? {});
  const tot = e.reduce((t, [, p]) => t + p, 0);
  return tot > 0 ? e.reduce((t, [lv, p]) => t + Number(lv) * p, 0) / tot : undefined;
}

export interface PairGrade { base: number; variant: number; delta: number; pass: boolean }

export function gradePair(baseValue: number, variantValue: number, direction: 'up' | 'down', minDelta = 0.03): PairGrade {
  const delta = variantValue - baseValue;
  const pass = direction === 'up' ? delta >= minDelta : delta <= -minDelta;
  return { base: baseValue, variant: variantValue, delta, pass };
}
