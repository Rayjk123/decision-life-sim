import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { chromium, webkit, type Browser, type Page } from 'playwright-core';
import { DAY, sharedWorld, type Checkpoint } from '../packages/town/src/world.ts';
import { kevDecider } from '../packages/worker/src/kev.ts';

const ROOT = join(import.meta.dirname, '..');
const { values: options } = parseArgs({ options: { 'live-model': { type: 'boolean' }, webkit: { type: 'boolean' } } });
const modelOptions = options['live-model'] ? {
  url: process.env.DECISION_URL, model: process.env.DECISION_MODEL, apiKey: process.env.KEV_API_KEY,
} : undefined;
if (modelOptions && (!modelOptions.url || !modelOptions.model)) {
  throw new Error('--live-model requires DECISION_URL and DECISION_MODEL');
}
const decider = modelOptions?.url ? kevDecider({ ...modelOptions, url: modelOptions.url, timeoutMs: 35_000, retries: 0 }) : undefined;
const population = decider ? 12 : 72;
const work = await mkdtemp(join(tmpdir(), 'maple-hollow-ux-'));
const checkpointFile = join(work, 'checkpoint.json');
let saved: Checkpoint | undefined;
const town = sharedWorld({
  async load() { return saved ? { value: structuredClone(saved), version: 'smoke' } : null; },
  async save(value) { saved = structuredClone(value); return true; },
}, { pop: population, decider });

function endpoint(server: ChildProcess) {
  return new Promise<string>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Town did not start in 10 seconds')), 10_000);
    server.once('error', error => { clearTimeout(timeout); reject(error); });
    server.once('exit', code => { clearTimeout(timeout); reject(new Error('Town exited with code ' + code)); });
    server.stdout?.on('data', chunk => {
      const port = /Maple Hollow on port (\d+)/.exec(String(chunk))?.[1];
      if (port) {
        clearTimeout(timeout);
        resolve('http://127.0.0.1:' + port);
      }
    });
  });
}

async function verifyViewport(page: Page, url: string, frame: Awaited<ReturnType<typeof town>>, resident: typeof frame.sims[number], events: string[]) {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    const draw = CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage = new Proxy(draw, {
      apply(target, brush: CanvasRenderingContext2D, args) {
        const [image] = args;
        if (image instanceof HTMLImageElement && /\/art\/(?:street-\w+|town-overview)\.(?:png|jpg)$/.test(image.src)) {
          brush.canvas.dataset.drawnArtwork = image.src.split('/').at(-1);
        }
        return Reflect.apply(target, brush, args);
      },
    });
  });
  // Read the rendered sprite position so the test clicks the canvas, not the roster.
  await page.route('**/town.js', async route => {
    const response = await route.fetch();
    const source = await response.text();
    await route.fulfill({ response, body: source + `
      Object.defineProperty(window, 'roomTargets', { get: () => interiorOpen ? hits.map(hit => ({
        id: hit.sim.id, name: hit.sim.name, x: hit.sx, y: hit.sy - hit.height / 2,
      })).filter(hit => roomResidentAt(hit.x, hit.y)?.sim.id === hit.id) : [] });
    ` });
  });
  const atlas = page.waitForResponse(response => response.url() === url + '/art/resident-walk.png');
  await page.goto(url);
  assert((await atlas).ok(), 'Walk atlas should load');
  const profile = page.locator('#resident');
  await page.locator('#street-resident').waitFor();
  await page.locator('#sound[aria-pressed="true"]').waitFor();
  await page.locator('#ranking').click();
  await profile.locator(`button[data-focus-key="${resident.id}"]`).click();
  const follow = profile.getByRole('button', { name: 'Follow', exact: true });
  if (await follow.getAttribute('aria-pressed') === 'false') await follow.click();
  await profile.getByRole('button', { name: /close/i }).click();
  await page.locator('[data-speed="4"]').click();
  await page.waitForFunction(() => {
    const activity = document.querySelector('#street-activity')?.textContent;
    const pose = document.querySelector('#inside') as HTMLButtonElement;
    return activity?.includes('Heading to') && pose.hidden;
  });
  assert(await page.locator('#street-resident').textContent() === resident.name);
  assert(await page.locator('#street-follow').textContent() === 'Stop following');
  await page.locator('#pause').click();
  await page.locator('#phase').getByText(/^Paused/).waitFor();
  const stage = page.locator('#town');
  const pixels = await stage.evaluate(node => (node as HTMLCanvasElement).toDataURL());
  await page.evaluate(() => new Promise<void>(done => requestAnimationFrame(() => requestAnimationFrame(() => done()))));
  assert.equal(await stage.evaluate(node => (node as HTMLCanvasElement).toDataURL()), pixels, 'Pause should hold the canvas');
  const phase = await page.locator('#phase').boundingBox();
  const canvas = await stage.boundingBox();
  assert(phase && canvas && phase.y + phase.height <= canvas.y, 'Playback status should stay above the scene');
  if (page.viewportSize()?.width === 320) {
    const rail = await page.locator('.map-tools').boundingBox();
    assert(rail && rail.y >= canvas.y + canvas.height - 1, 'Phone camera controls should stay below the scene');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 320, 'Phone layout should fit the viewport');
  }
  const day = await page.locator('#day').getAttribute('value');
  const caption = await page.locator('#street-activity').textContent();
  await page.locator('#overview').click();
  await stage.and(page.locator('[data-drawn-artwork="town-overview.jpg"]')).waitFor();
  const pins = page.locator('#district-pins button');
  assert.deepEqual(await pins.locator('.district-sign').allTextContents(), ['Waterfront', 'Market Lane', 'Guild Row', 'Town Square']);
  const occupancy = await pins.evaluateAll(nodes => nodes.reduce((sum, node) =>
    sum + Number(node.getAttribute('aria-label')?.match(/(\d+) here now/)?.[1]), 0));
  assert.equal(occupancy, frame.sims.length, 'Every resident should occupy one street');
  const followedPin = page.locator('#district-pins .followed');
  const district = await followedPin.getAttribute('data-district');
  assert(district);
  await followedPin.click();
  await page.locator('#district-panel').getByRole('heading', { name: 'Who’s here' }).waitFor();
  assert.equal(await page.locator('#overview').getAttribute('aria-pressed'), 'true');
  await page.locator('#district-panel').getByRole('button', { name: 'Zoom to street' }).click();
  assert.equal(await page.locator('#street').getAttribute('aria-pressed'), 'true');
  assert.equal(await page.locator('#day').getAttribute('value'), day);
  assert.equal(await page.locator('#street-activity').textContent(), caption);

  await page.locator('#street-resident').click();
  await profile.getByText('Monthly timeline', { exact: true }).click();
  const rows = profile.locator('.timeline > li');
  const current = rows.filter({ hasText: frame.label });
  await current.getByText(frame.label, { exact: true }).click();
  if (events.length) {
    await current.getByText('Life events', { exact: true }).waitFor();
    assert.deepEqual(await current.locator('.month-events > li').allTextContents(), events);
  } else {
    await current.getByText('No life events recorded this month.', { exact: true }).waitFor();
  }
  await current.getByText('Income after tax', { exact: true }).waitFor();
  await current.getByText('Discretionary spending', { exact: true }).waitFor();
  const decisionLink = current.getByRole('link', { name: 'View decision' });
  const decisionHash = '#decision/' + resident.id + '/' + frame.month;
  assert.equal(await decisionLink.getAttribute('href'), decisionHash);
  await decisionLink.click();
  const linked = page.getByRole('dialog');
  await linked.getByText(frame.label, { exact: true }).waitFor();
  await linked.getByText('Recorded outcome', { exact: true }).waitFor();
  await linked.getByRole('button', { name: 'Copy decision link' }).waitFor();
  assert.equal(new URL(page.url()).hash, decisionHash);
  await page.keyboard.press('Escape');
  await linked.waitFor({ state: 'hidden' });
  assert.equal(new URL(page.url()).hash, '');
  assert(await decisionLink.evaluate(node => document.activeElement === node), 'Closing evidence should restore link focus');
  await current.getByRole('heading', { name: 'Selected cash flows', exact: true }).waitFor();
  await current.getByText('Cash change also reflects purchases, investments, and transfers between accounts.', { exact: true }).waitFor();
  assert.equal(await rows.count(), 12, 'Timeline should include the retained warm-up months');
  assert(await rows.getByText('No recorded decision', { exact: true }).count() > 0);
  const earlier = rows.last();
  await earlier.locator(':scope > details > summary').click();
  await earlier.getByText('Income and outgoings were not retained for this month.', { exact: true }).waitFor();
  await earlier.getByText('Life events were not retained for this month.', { exact: true }).waitFor();
  await profile.getByText('Lifetime history', { exact: true }).click();
  await profile.locator('.recent-milestones strong').first().waitFor();
  const lifetime = profile.locator('.resident-lifetime');
  const chart = lifetime.getByRole('img', { name: /Net worth from/ });
  await chart.waitFor();
  const graph = lifetime.locator('.wealth-graph');
  if (!page.viewportSize()?.width || page.viewportSize()!.width > 500) {
    await chart.hover({ position: { x: 6, y: 12 } });
    assert(!(await graph.locator('.wealth-chart-caption').textContent())?.startsWith(frame.label));
  }
  await graph.press('End');
  await graph.press('Enter');
  await lifetime.locator('.wealth-month').getByText('Month details · ' + frame.label, { exact: true }).waitFor();
  await lifetime.locator('.wealth-month').getByRole('heading', { name: 'Selected cash flows' }).waitFor();
  const year = lifetime.getByLabel('Browse by year');
  await year.waitFor();
  await year.selectOption({ index: (await year.locator('option').count()) - 1 });
  await lifetime.getByText(/moved to town/).waitFor();
  await profile.getByText('Advanced decision details', { exact: true }).click();
  const source = resident.decision?.model ?? 'Heuristic';
  const evidence = profile.locator('.decision-details').filter({ hasText: 'Advanced decision details' }).first();
  await evidence.getByText(source, { exact: true }).waitFor();
  const exact = evidence.locator('.exact-sampling');
  if (await exact.getAttribute('open') === null) await exact.getByText('Exact sampling values', { exact: true }).click();
  await exact.getByText(String(resident.draw), { exact: true }).waitFor();
  if (decider) {
    const recorded = resident.decision?.sampling;
    const heuristic = resident.decision?.heuristicReplay;
    assert(recorded && heuristic);
    const replay = evidence.locator('.decision-replay');
    await replay.getByText('Model vs. heuristic', { exact: true }).click();
    await replay.getByText('Heuristic would sample', { exact: true }).waitFor();
    const rows = replay.locator('tbody tr');
    const moves = Object.keys(recorded.odds);
    assert.equal(await rows.count(), moves.length);
    for (const [index, move] of moves.entries()) {
      const cells = rows.nth(index).locator('td');
      assert.equal(await cells.nth(0).getAttribute('title'), String(recorded.odds[move]));
      assert.equal(await cells.nth(1).getAttribute('title'), String(heuristic.odds[move]));
    }
    const timelineEvidence = current.locator('.past-decision').filter({ hasText: 'Decision evidence' });
    await timelineEvidence.getByText('Decision evidence', { exact: true }).click();
    await timelineEvidence.getByText('Model vs. heuristic', { exact: true }).click();
    await timelineEvidence.getByRole('table', { name: 'Sampling odds' }).waitFor();
  } else {
    assert.equal(await evidence.getByText('Model vs. heuristic', { exact: true }).count(), 0);
  }
  await evidence.getByText('What changes the odds?', { exact: true }).click();
  const response = page.waitForResponse(r => r.url() === `${url}/api/town/probe/${resident.id}/${frame.month}`);
  await evidence.getByRole('button', { name: 'Try twice the coin' }).click();
  const probe = await (await response).json();
  assert.equal(probe.status, 'ready');
  assert.equal(probe.afterCoin, 2 * probe.beforeCoin);
  assert.equal(probe.provider, resident.decision?.provider);
  assert.equal(probe.model, resident.decision?.model);
  assert.deepEqual(probe.base, resident.probabilities);
  const variant = Object.values(probe.variant) as number[];
  assert(variant.length > 0 && variant.every(weight => Number.isFinite(weight) && weight >= 0));
  assert(Math.abs(variant.reduce((sum, weight) => sum + weight, 0) - 1) < 1e-8, 'The variant odds should sum to one');
  await evidence.getByText('With twice the coin', { exact: true }).waitFor();

  await page.getByRole('button', { name: 'Technical view', exact: true }).click();
  const world = page.locator('#world-live');
  await world.getByText('Viewed month · ' + frame.label, { exact: true }).waitFor();
  await world.getByText(source, { exact: true }).waitFor();
  const leaders = world.locator('.wealth-leaders');
  const expectedLeaders = [...frame.sims].sort((a, b) => b.nw - a.nw || a.name.localeCompare(b.name)).slice(0, 10);
  assert.deepEqual(await leaders.getByRole('button').allTextContents(), expectedLeaders.map(sim => sim.name));
  const explorer = world.locator('.decision-explorer');
  await explorer.getByLabel('Decision filter').selectOption('all');
  await explorer.getByLabel('Find a resident').fill(resident.name);
  await explorer.getByRole('link', { name: 'View decision' }).click();
  await linked.getByRole('heading', { name: resident.name + '’s decision' }).waitFor();
  await linked.getByText(frame.label, { exact: true }).waitFor();
  await linked.getByRole('button', { name: 'Close' }).click();
  await world.getByText('Decision mix by personality', { exact: true }).click();
  await world.getByRole('combobox', { name: 'Personality and decision source' }).waitFor();
  if (!decider) {
    await world.getByText('Past residents', { exact: true }).click();
    const past = world.locator('.past-residents');
    const entry = past.locator('.list button').first();
    await entry.click();
    const memorial = past.locator('.lifetime-view');
    await memorial.getByLabel('Browse by year').waitFor();
    assert.match(await memorial.innerText(), /died at (?:age )?\d+/i);
  }
  await page.locator('#close-world').click();
  assert.equal(await page.locator('#pause').getAttribute('aria-pressed'), 'true');
  assert.equal(await page.locator('#street-resident').textContent(), resident.name);
  for (const district of ['market', 'guild', 'square']) {
    await page.locator('#overview').click();
    const pin = page.locator(`#district-pins [data-district="${district}"]`);
    await pin.click();
    const panel = page.locator('#district-panel');
    await panel.getByRole('button', { name: 'Zoom to street' }).click();
    await stage.and(page.locator(`[data-drawn-artwork="street-${district}.jpg"]`)).waitFor();
  }
  const zoomOut = page.locator('#zoom-out');
  while (await zoomOut.isEnabled()) await zoomOut.click();
  const marker = page.locator('#place-markers').getByRole('button', { name: 'Schoolhouse' });
  await marker.click();
  const premises = page.getByRole('complementary', { name: 'Place details' });
  await premises.getByRole('heading', { name: 'Schoolhouse' }).waitFor();
  await premises.getByRole('button', { name: 'Look inside' }).click();
  await page.locator('#room-occupants').getByText(/Schoolhouse · \d+ here now/).waitFor();
  await premises.getByRole('button', { name: 'Step outside' }).click();
  await page.locator('#room-occupants').waitFor({ state: 'hidden' });
  await premises.getByRole('button', { name: 'Close place' }).click();
  const onErrand = frame.sims.find(sim => sim.errand && sim.move && sim.decision?.provider === resident.decision?.provider);
  assert(onErrand, 'The walkthrough needs a recorded errand');
  await page.locator('#ranking').click();
  await profile.locator(`button[data-focus-key="${onErrand.id}"]`).click();
  if (await follow.getAttribute('aria-pressed') === 'false') await follow.click();
  await profile.getByRole('button', { name: /close/i }).click();
  await page.locator('[data-speed="12"]').click();
  await page.locator('#pause').click();
  const streetDecision = page.locator('#street-decision');
  await streetDecision.waitFor();
  await page.locator('#inside').getByText('Step outside', { exact: true }).waitFor();
  await page.locator('#pause').click();
  await stage.focus();
  await page.keyboard.press('ArrowUp');
  assert.equal(await page.locator('#inside').textContent(), 'Step outside');
  assert.equal(await page.locator('#street-follow').textContent(), 'Stop following');
  assert.equal(await streetDecision.getAttribute('href'), '#decision/' + onErrand.id + '/' + frame.month);
  await streetDecision.click();
  await linked.getByRole('heading', { name: onErrand.name + '’s decision' }).waitFor();
  await linked.getByText('Recorded outcome', { exact: true }).waitFor();
  await linked.getByRole('button', { name: 'Close' }).click();
  assert.equal(await page.locator('#street-follow').textContent(), 'Stop following');
  type RoomTarget = { id: string; name: string; x: number; y: number };
  const target = await page.evaluate(id => {
    const targets = (window as Window & { roomTargets?: RoomTarget[] }).roomTargets ?? [];
    return targets.find(hit => hit.id !== id) ?? targets[0];
  }, onErrand.id);
  assert(target, 'The interior should have a visible resident to select');
  const position = { x: target.x, y: target.y };
  if ((page.viewportSize()?.width ?? 1000) < 500) await stage.tap({ position });
  else await stage.click({ position });
  await profile.getByRole('heading', { name: target.name, exact: true }).waitFor();
  await page.locator('#inside').getByText('Step outside', { exact: true }).waitFor();
  await profile.getByRole('button', { name: 'Close', exact: true }).click();
  assert.equal(await page.locator('#street-follow').textContent(), 'Stop following');
  const tracks = page.locator('#music-settings > summary');
  await tracks.click();
  const track = page.getByLabel('Track on repeat');
  assert.equal(await track.locator('option').count(), 5);
  assert.equal(await track.inputValue(), 'evening');
  await track.selectOption('waterfront');
  const volume = page.getByRole('slider', { name: 'Music volume' });
  await volume.press('End');
  assert.equal(await volume.inputValue(), '1');
  await volume.press('Escape');
  await track.waitFor({ state: 'hidden' });
  await page.locator('#sound').click();
  assert.equal(await page.locator('#sound').getAttribute('aria-pressed'), 'false');
  await page.goto(url + '/?watch=1' + decisionHash);
  await page.locator('#sound[aria-pressed="false"]').waitFor({ state: 'attached' });
  await linked.getByText(frame.label, { exact: true }).waitFor();
  await linked.getByRole('heading', { name: resident.name + '’s decision' }).waitFor();
  await linked.getByRole('button', { name: 'Close' }).click();
  await tracks.click();
  assert.equal(await track.inputValue(), 'waterfront');
  assert.equal(await volume.inputValue(), '1');
  assert.equal(new URL(page.url()).search, '?watch=1');
  await page.goto(url + '/#decision/' + resident.id + '/999999999');
  await linked.getByText('This decision is outside the retained timeline or the resident is unavailable.').waitFor();
  assert.deepEqual(errors, [], 'Town should have no uncaught browser errors');
}

let server: ChildProcess | undefined;
let browser: Browser | undefined;
try {
  await town(0);
  if (!decider) {
    // Give the isolated smoke world a published death to exercise past-resident browsing.
    assert(saved?.world.sims.length);
    saved.world.sims[0].deathMonth = saved.world.month + 1;
  }
  await town(1000);
  const frame = await town(DAY);
  await town(DAY + 1000);
  const fixture = saved;
  assert(fixture?.pending);
  const provider = decider ? 'kev' : 'heuristic';
  const candidates = frame.sims.filter(sim => sim.working && sim.hasProbe && sim.decision?.sampling
    && sim.decision.provider === provider && sim.decision.model === decider?.model && fixture.history?.[0].residents[sim.id]);
  const eventsByResident = new Map(fixture.current.sims.map(sim => [sim.id, sim.events]));
  const resident = candidates.find(sim => eventsByResident.get(sim.id)?.length) ?? candidates[0];
  assert(resident, `Seeded smoke world should contain a working resident with history and a ${decider?.model ?? provider} decision`);
  // Exercise a quiet legacy month before monthly reviews and cash flow recording.
  const earlier = fixture.history![0].residents[resident.id];
  earlier.move = undefined;
  delete earlier.decision;
  delete earlier.probabilities;
  delete earlier.draw;
  delete earlier.probe;
  delete earlier.cashFlow;
  delete earlier.events;
  server = spawn(process.execPath, ['--import', 'tsx', 'packages/town/src/server.ts'], {
    cwd: ROOT,
    env: {
      ...process.env, TOWN_PORT: '0', TOWN_HOST: '127.0.0.1', TOWN_DATA: work, TOWN_POP: String(population),
      TOWN_BUCKET: '', TOWN_ASSETS: join(ROOT, 'packages/town'), AWS_LAMBDA_FUNCTION_NAME: '',
      DECISION_URL: modelOptions?.url ?? '', DECISION_MODEL: modelOptions?.model ?? '',
    },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  const url = await endpoint(server);
  browser = options.webkit ? await webkit.launch()
    : await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : { channel: 'chrome' });
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }, { width: 320, height: 640 }]) {
    const now = Date.now();
    await writeFile(checkpointFile, JSON.stringify({ ...fixture, startedAt: now, lastSeenAt: now }));
    const mobile = viewport.width < 500;
    const page = await browser.newPage({ viewport, hasTouch: mobile, isMobile: mobile });
    page.setDefaultTimeout(8000);
    try {
      await verifyViewport(page, url, frame, resident, eventsByResident.get(resident.id) ?? []);
    } finally {
      await page.close();
    }
  }
  console.log(`Town smoke passed in ${options.webkit ? 'WebKit' : 'Chrome'} on desktop and 320/390-pixel phone viewports${decider ? ' with ' + decider.model : ''}`);
} finally {
  await browser?.close();
  if (server && server.exitCode === null && server.signalCode === null && server.pid !== undefined) {
    const exit = new Promise<void>(resolve => server?.once('exit', () => resolve()));
    server.kill();
    await exit;
  }
  await rm(work, { recursive: true, force: true });
}
