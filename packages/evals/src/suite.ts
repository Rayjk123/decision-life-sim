// Loads the golden data and runs a decider over it.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { Answers, Decider, StateStyle } from '@dls/sim-core';
import { applyChange, mass, requestFor } from './build.ts';
import { gradePair, gradeScenario, type PairGrade, type ScenarioGrade } from './grade.ts';
import type { Pair, Scenario } from './types.ts';

const here = dirname(fileURLToPath(import.meta.url));
export const GOLDEN_DIR = join(here, '..', 'golden');

export function loadGolden(): { scenarios: Scenario[]; pairs: Pair[] } {
  const scenarios = JSON.parse(readFileSync(join(GOLDEN_DIR, 'scenarios.json'), 'utf8')).scenarios as Scenario[];
  const pairs = JSON.parse(readFileSync(join(GOLDEN_DIR, 'pairs.json'), 'utf8')).pairs as Pair[];
  return { scenarios, pairs };
}

export { randomDecider } from '@dls/worker/src/random.ts';

export interface ScenarioResult { scenario: Scenario; answers: Answers; grade: ScenarioGrade; moves: string[] }
export interface PairResult { pair: Pair; grade: PairGrade }
export interface SuiteResult {
  decider: string;
  style: StateStyle;
  scenarios: ScenarioResult[];
  pairs: PairResult[];
  summary: {
    scenarioScore: number; scenarioPass: number; topAccuracy: number; avoidRate: number;
    byCategory: Record<string, { n: number; score: number; pass: number }>;
    pairPass: number; overall: number;
  };
}

const measureOf = (answers: Answers, measure: Pair['measure']) => (measure === 'retire' ? answers.retire ?? 0 : mass(answers.main, measure));

export async function runSuite(decider: Decider, style: StateStyle, concurrency = 4): Promise<SuiteResult> {
  const { scenarios, pairs } = loadGolden();
  const byId = new Map(scenarios.map((s) => [s.id, s]));
  const cache = new Map<string, Answers>();
  const ask = async (sc: Scenario) => {
    const hit = cache.get(sc.id);
    if (hit) return hit;
    const req = requestFor(sc, style);
    const res = await decider.decide(req);
    cache.set(sc.id, res.answers);
    return res.answers;
  };

  const jobs: Array<() => Promise<void>> = [];
  const scenarioResults: ScenarioResult[] = new Array(scenarios.length);
  scenarios.forEach((sc, i) => jobs.push(async () => {
    const answers = await ask(sc);
    scenarioResults[i] = { scenario: sc, answers, grade: gradeScenario(answers, sc.expect), moves: Object.keys(answers.main) };
  }));
  const pairResults: PairResult[] = new Array(pairs.length);
  pairs.forEach((pair, i) => jobs.push(async () => {
    const base = byId.get(pair.base);
    if (!base) throw new Error(`pair ${pair.id}: unknown base ${pair.base}`);
    const variant = applyChange(base, pair);
    const [a, b] = [await ask(base), await ask(variant)];
    pairResults[i] = { pair, grade: gradePair(measureOf(a, pair.measure), measureOf(b, pair.measure), pair.direction, pair.minDelta) };
  }));
  let next = 0;
  await Promise.all(Array.from({ length: concurrency }, async () => { while (next < jobs.length) await jobs[next++](); }));

  const byCategory: SuiteResult['summary']['byCategory'] = {};
  for (const r of scenarioResults) {
    const c = (byCategory[r.scenario.category] ??= { n: 0, score: 0, pass: 0 });
    c.n++; c.score += r.grade.score; c.pass += r.grade.pass ? 1 : 0;
  }
  for (const c of Object.values(byCategory)) { c.score /= c.n; c.pass /= c.n; }
  const n = scenarioResults.length;
  const scenarioScore = scenarioResults.reduce((s, r) => s + r.grade.score, 0) / n;
  const pairPass = pairResults.filter((r) => r.grade.pass).length / pairResults.length;
  return {
    decider: decider.name, style, scenarios: scenarioResults, pairs: pairResults,
    summary: {
      scenarioScore,
      scenarioPass: scenarioResults.filter((r) => r.grade.pass).length / n,
      topAccuracy: scenarioResults.filter((r) => r.grade.topOk).length / n,
      avoidRate: scenarioResults.filter((r) => r.grade.avoidOk).length / n,
      byCategory, pairPass,
      overall: 0.6 * scenarioScore + 0.4 * pairPass,   // headline number
    },
  };
}
