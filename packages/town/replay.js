// The hosted replay reads immutable files. The browser supplies the shared clock
// and the response shapes already used by the town UI.
const abbreviations = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const yearOf = month => Math.ceil(month / 12);
const label = month => 'Year ' + yearOf(month) + ' · ' + abbreviations[(month - 1) % 12];
const query = new URLSearchParams(location.search);
const pinned = query.has('year') && query.has('part')
  ? (Number(query.get('year')) - 1) * 12 + Number(query.get('part')) : null;
const opened = Date.now();
const dataDir = new URL('./replay/', import.meta.url);
const manifest = fetch(new URL('manifest.json', dataDir)).then(response => {
  if (!response.ok) throw Error('Replay manifest unavailable');
  return response.json();
});
const cache = new Map();
let archive;

async function readGzip(path) {
  const response = await fetch(new URL(path, dataDir));
  if (!response.ok) throw Error('Replay file unavailable: ' + path);
  const bytes = new Uint8Array(await response.arrayBuffer());
  // Fetch already decodes objects served with a gzip Content-Encoding.
  if (bytes[0] !== 31 || bytes[1] !== 139) return JSON.parse(new TextDecoder().decode(bytes));
  return new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).json();
}

const frameAt = (m, month) => {
  const sequence = month - m.firstMonth + 1;
  if (sequence < 1 || sequence > m.published) throw Error('Month outside the replay');
  if (!cache.has(sequence)) {
    const pending = readGzip('months/' + String(sequence).padStart(4, '0') + '.json.gz')
      .catch(error => { if (cache.get(sequence) === pending) cache.delete(sequence); throw error; });
    cache.set(sequence, pending);
    if (cache.size > 28) cache.delete(cache.keys().next().value);
  }
  return cache.get(sequence);
};

async function windowAt(m, through) {
  const first = Math.max(m.firstMonth, through - 11);
  const last = Math.min(through, m.firstMonth + m.published - 1);
  return Promise.all(Array.from({length: Math.max(0, last - first + 1)}, (_, i) => frameAt(m, first + i)));
}

function replayTime(m) {
  const now = Date.now();
  const duration = 90_000;
  const index = pinned === null ? null : pinned - m.firstMonth;
  if (Number.isInteger(index) && index >= 0 && index < m.published) {
    return {month: pinned, startedAt: opened, serverTime: now, duration};
  }
  const tick = Math.floor(Math.max(0, now - m.epoch) / duration);
  return {month: m.firstMonth + tick % m.published, startedAt: Math.min(now, m.epoch + tick * duration), serverTime: now, duration};
}

function decisionMix(entries) {
  const groups = new Map();
  const moveType = move => move.startsWith('start_') ? 'start_business' : move.startsWith('buy_home') ? 'buy_home' : move;
  let decisions = 0, missingArchetype = 0;
  for (const {frame, rows} of entries) for (const row of rows) {
    if (!row.move) continue;
    decisions++;
    const {arch, decision} = row;
    if (!arch) { missingArchetype++; continue; }
    const key = JSON.stringify([arch, decision?.provider, decision?.model]);
    if (!groups.has(key)) groups.set(key, {arch, label: frame.presentation.archetypes[arch] ?? arch,
      provider: decision?.provider, model: decision?.model, decisions: 0, knownOffers: 0, moves: new Map()});
    const group = groups.get(key);
    const counts = move => {
      if (!group.moves.has(move)) group.moves.set(move, {move, picked: 0, offered: 0, pickedWhenOffered: 0});
      return group.moves.get(move);
    };
    group.decisions++;
    const picked = moveType(row.move);
    counts(picked).picked++;
    if (!decision?.offered) continue;
    group.knownOffers++;
    for (const offered of new Set(decision.offered.map(moveType))) {
      counts(offered).offered++;
      if (picked === offered) counts(offered).pickedWhenOffered++;
    }
  }
  return {months: entries.map(({frame}) => ({month: frame.month, label: frame.label})), decisions, missingArchetype,
    groups: [...groups.values()].map(group => ({...group, moves: [...group.moves.values()]
      .sort((a,b) => b.picked - a.picked || b.offered - a.offered || a.move.localeCompare(b.move))}))};
}

export async function replayFetch(path, {signal} = {}) {
  signal?.throwIfAborted();
  const m = await manifest;
  const time = replayTime(m);
  const route = new URL(path, location.href);
  const [kind, first, second] = route.pathname.split('/').slice(3);
  if (!kind) {
    const {frame} = await frameAt(m, time.month);
    const position = 'Month ' + (time.month - m.firstMonth + 1) + ' of ' + m.published.toLocaleString();
    const status = document.getElementById('replay-position');
    if (status.textContent !== position) status.textContent = position;
    return Response.json({...frame, ...time});
  }
  if (kind === 'probe') return Response.json({status: 'source-unavailable'});
  const viewedMonth = Number(route.searchParams.get('through')) || time.month;
  if (kind === 'history') {
    const entries = await windowAt(m, viewedMonth);
    const id = decodeURIComponent(first);
    const months = entries.flatMap(({frame, rows}) => {
      const row = rows.find(entry => entry.id === id);
      return row ? [{...row, month: frame.month, label: frame.label, name: frame.sims.find(sim => sim.id === id)?.name, hasProbe: false}] : [];
    });
    signal?.throwIfAborted();
    return Response.json({months});
  }
  const through = Number(first);
  if (kind === 'mix') return Response.json(decisionMix(await windowAt(m, through)));
  if (kind !== 'lifetime') return new Response(null, {status: 404});
  archive ??= readGzip('lifetime.json.gz').catch(error => { archive = undefined; throw error; });
  const {lifetimes, pastResidents} = await archive;
  const deaths = pastResidents.filter(resident => resident.diedMonth <= through);
  if (!second) return Response.json({residents: deaths.reverse()
    .map(death => ({id: death.simId, name: death.name, age: death.ageAtDeath, label: label(death.diedMonth)}))});
  const id = decodeURIComponent(second);
  const life = Object.hasOwn(lifetimes, id) ? lifetimes[id] : undefined;
  const death = deaths.find(resident => resident.simId === id);
  if ((!life || life.from > through) && !death) return Response.json({life: null});
  const recentWealth = (await windowAt(m, through)).flatMap(({frame, rows}) => {
    const row = rows.find(entry => entry.id === id);
    return row ? [{month: frame.month, label: frame.label, age: row.age, nw: row.nw}] : [];
  });
  const events = life?.events.filter(row => row.month <= through) ?? [];
  const wealth = life?.wealth.filter(row => row.month <= through) ?? [];
  if (death) {
    if (!events.some(event => event.month === death.diedMonth && event.text.startsWith(death.name + ' died '))) {
      events.push({month: death.diedMonth, text: 'Died at age ' + death.ageAtDeath});
    }
    if (wealth.at(-1)?.month !== death.diedMonth) wealth.push({month:death.diedMonth, age:death.ageAtDeath, nw:death.finalNetWorth});
  } else if (recentWealth.at(-1)?.month === through && wealth.at(-1)?.month !== through) {
    wealth.push(recentWealth.at(-1));
  }
  const annotated = row => ({...row, label:label(row.month), year:yearOf(row.month)});
  return Response.json({life: {from:label(life?.from ?? death.diedMonth),
    partial:life?.arrived === undefined || life.from > life.arrived, events:events.map(annotated), wealth:wealth.map(annotated), recentWealth}});
}

manifest.then(m => {
  document.querySelector('.replay-nav').hidden = false;
  document.getElementById('replay-label').textContent = m.model.toUpperCase() + ' replay';
  document.getElementById('live').textContent = 'Replay';
  const year = document.getElementById('replay-year');
  const month = document.getElementById('replay-month');
  const current = replayTime(m).month;
  for (let n = yearOf(m.firstMonth); n <= yearOf(m.firstMonth + m.published - 1); n++) {
    year.add(new Option('Year ' + n, n, false, n === yearOf(current)));
  }
  abbreviations.forEach((name, index) => month.add(new Option(name, index + 1, false, index === (current - 1) % 12)));
  document.getElementById('shared-replay').hidden = pinned === null;
}).catch(() => {
  document.querySelector('.replay-nav').hidden = false;
  document.getElementById('replay-position').textContent = 'Replay unavailable';
});
