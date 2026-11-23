import { HISTORY_MILESTONES, ageInt, balanceSheet, type SimEvent, type World } from '../../sim-core/src/index.ts';
import { monthLabel } from '../../worker/src/store.ts';

type LifeEvent = { month: number; text: string };
type NetWorth = { month: number; age: number; nw: number };
type Life = { from: number; arrived?: number; events: LifeEvent[]; wealth: NetWorth[] };
export type LifetimeArchive = Record<string, Life>;

const extraMilestones = new Set(['hired', 'raise', 'bought_car', 'died']);
const lifeYear = (month: number) => Math.ceil(month / 12);

export function recordLifeMonth(
  archive: LifetimeArchive, month: number,
  residents: Iterable<{ id: string; age: number; nw: number; arrived?: number; events?: string[] }>,
) {
  for (const resident of residents) {
    const { id, age, nw, arrived, events = [] } = resident;
    const life = archive[id] ??= { from: month, arrived, events: [], wealth: [] };
    life.arrived ??= arrived;
    life.events.push(...events.map(text => ({ month, text })));
    if (!life.wealth.length || month % 12 === 0) life.wealth.push({ month, age, nw });
  }
}

export function recordLifeTick(archive: LifetimeArchive, world: World, events: SimEvent[]) {
  const milestones = new Map<string, string[]>();
  for (const event of events) {
    if (!event.simId || (!HISTORY_MILESTONES.has(event.type) && !extraMilestones.has(event.type))) continue;
    const list = milestones.get(event.simId) ?? [];
    list.push(event.text);
    milestones.set(event.simId, list);
  }
  recordLifeMonth(archive, world.month, world.sims.map(sim => ({
    id: sim.id, age: ageInt(sim, world.month), arrived: sim.arrivedMonth,
    nw: balanceSheet(sim).netWorth, events: milestones.get(sim.id),
  })));
  // The engine records terminal wealth and age before removing the resident.
  for (let i = world.hallOfFame.length - 1; i >= 0; i--) {
    const death = world.hallOfFame[i];
    if (death.diedMonth !== world.month) break;
    recordLifeMonth(archive, world.month, [{
      id: death.simId, age: death.ageAtDeath, nw: death.finalNetWorth, events: milestones.get(death.simId),
    }]);
  }
}

export function readLife(archive: LifetimeArchive, world: World, through: number, id: string, viewed?: NetWorth) {
  const record = Object.hasOwn(archive, id) ? archive[id] : undefined;
  const death = world.hallOfFame.find(entry => entry.simId === id && entry.diedMonth <= through);
  if ((!record || record.from > through) && !death) return null;
  const events = record?.events.filter(event => event.month <= through) ?? [];
  const wealth = record?.wealth.filter(point => point.month <= through) ?? [];
  if (death) {
    if (!events.some(event => event.month === death.diedMonth && event.text.startsWith(death.name + ' died '))) {
      events.push({ month: death.diedMonth, text: 'Died at age ' + death.ageAtDeath });
    }
    if (wealth.at(-1)?.month !== death.diedMonth) {
      wealth.push({ month: death.diedMonth, age: death.ageAtDeath, nw: death.finalNetWorth });
    }
  } else if (viewed && wealth.at(-1)?.month !== viewed.month) {
    wealth.push(viewed);
  }
  return {
    from: monthLabel(record?.from ?? death!.diedMonth),
    partial: record?.arrived === undefined || record.from > record.arrived,
    events: events.map(event => ({ ...event, label: monthLabel(event.month), year: lifeYear(event.month) })),
    wealth: wealth.map(point => ({ ...point, label: monthLabel(point.month), year: lifeYear(point.month) })),
  };
}
