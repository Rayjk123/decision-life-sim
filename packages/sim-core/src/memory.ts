import type { Sim } from './types.ts';

/** Keep the six most recent notable outcomes, newest first. The model sees these as "recent". */
export function remember(sim: Sim, text: string) {
  sim.memory.unshift(text);
  if (sim.memory.length > 6) sim.memory.length = 6;
}
