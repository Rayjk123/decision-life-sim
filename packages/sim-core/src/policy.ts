// Turns probabilities into a pick with a seeded dice roll. Discipline sharpens the spread:
// disciplined sims nearly always take the top option, impulsive ones sometimes take the second.
import type { Answers, Sim } from './types.ts';

export function temperature(sim: Sim): number {
  return 0.35 + (1 - sim.traits.discipline) * 0.9;
}

export function sharpen(probs: Record<string, number>, temp: number): Record<string, number> {
  const entries = Object.entries(probs).map(([key, p]) => [key, Math.pow(Math.max(p, 1e-9), 1 / temp)] as const);
  const total = entries.reduce((s, [, v]) => s + v, 0);
  return Object.fromEntries(entries.map(([key, v]) => [key, v / total]));
}

export function sample(probs: Record<string, number>, draw: number): string {
  const keys = Object.keys(probs);
  let acc = 0;
  for (const key of keys) { acc += probs[key]; if (draw < acc) return key; }
  return keys[keys.length - 1];
}

export function argmax(probs: Record<string, number>): string {
  return Object.entries(probs).sort((a, b) => b[1] - a[1])[0][0];
}

/** Expected level index of a score answer, rounded. */
export function expectedLevel(probs: Record<string, number> | undefined, fallback = 2): number {
  if (!probs) return fallback;
  let s = 0, t = 0;
  for (const [key, p] of Object.entries(probs)) { s += Number(key) * p; t += p; }
  return t > 0 ? Math.round(s / t) : fallback;
}

export function pick(sim: Sim, answers: Answers, draw: number, retireDraw: number) {
  const sharpened = sharpen(answers.main, temperature(sim));
  return {
    picked: sample(sharpened, draw),
    sharpened,
    shareLevel: expectedLevel(answers.investShare),
    retire: answers.retire !== undefined && retireDraw < answers.retire,
  };
}
