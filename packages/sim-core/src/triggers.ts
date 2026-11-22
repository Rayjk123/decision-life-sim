// When a sim gets a model call: a staggered quarterly review, or something happened.
import type { Sim, SimEvent, World } from './types.ts';
import { stableHash } from './rng.ts';
import { ageInt, emergencyFloor, inSchool } from './finance.ts';
import { dollars } from './money.ts';

const EVENT_TRIGGERS = new Set<SimEvent['type']>(['started_career', 'raise', 'laid_off', 'hired', 'business_failed', 'bankrupt', 'vacancy']);

export type CallPolicy = 'events' | 'monthly';

export function decisionReason(sim: Sim, world: World, events: SimEvent[], policy: CallPolicy): string | null {
  const m = world.month;
  if (inSchool(sim, m)) return null;
  if (policy === 'monthly') return 'monthly';
  if (stableHash(sim.id) % 3 === m % 3) return 'quarterly review';
  const hit = events.find((e) => EVENT_TRIGGERS.has(e.type));
  if (hit) return hit.type;
  if (m - sim.lastDecisionMonth >= 2 && sim.cash > emergencyFloor(sim, m) + dollars(20000)) return 'cash windfall';
  if (Math.abs(world.market.lastIndexReturn) > 0.06 && sim.traits.herding > 0.5) return 'market swing';
  if (!sim.retired && ageInt(sim, m) >= 55 && (m - sim.birthMonth) % 12 === 0) return 'birthday 55+';
  return null;
}
