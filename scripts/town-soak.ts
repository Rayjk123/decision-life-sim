import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { heuristicAnswers, type Decider } from '../packages/sim-core/src/index.ts';
import { DAY, sharedWorld, type Checkpoint } from '../packages/town/src/world.ts';

// Serve the real UI assets without starting a town listener. The browser's API
// routes below run the shared-world code on a controllable simulation clock.
process.env.AWS_LAMBDA_FUNCTION_NAME = 'town-soak';
process.env.TOWN_BUCKET = '';
const { handler } = await import('../packages/town/src/server.ts');

let saved: Checkpoint | undefined;
let now = 0;
let modelDelay: Promise<void> | undefined;
let modelOffline = false;
let networkOffline = false;
const decider: Decider = {
  name: 'kev',
  async decide({ sim, world, moves, askRetire }) {
    await modelDelay;
    if (modelOffline) throw Error('Simulated model timeout');
    return { provider: 'kev', model: 'soak-model', answers: heuristicAnswers(sim, world, moves, askRetire), latencyMs: 0, tokens: 0 };
  },
};
const town = sharedWorld({
  async load() { return saved ? { value: structuredClone(saved), version: 'test' } : null; },
  async save(value) { saved = structuredClone(value); return true; },
}, { pop: 1000, decider });
const initial = await town(now);
assert.equal(initial.sims.length, 1000);
const followed = initial.sims.find(sim => sim.working && sim.decision?.sampling)!;
assert(followed);
assert(saved);
saved.world.sims.find(sim => sim.id === followed.id)!.deathMonth = initial.month + 1;

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : { channel: 'chrome' });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, reducedMotion: 'reduce' });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('http://maple-soak.test/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/town') {
      if (networkOffline) return route.fulfill({ status: 503 });
      return route.fulfill({ json: await town(now) });
    }
    if (path.startsWith('/api/town/history/')) {
      return route.fulfill({ json: { months: await town.residentHistory(path.split('/').at(-1)!) } });
    }
    const reply = await handler({ rawPath: path, requestContext: { http: { method: 'GET' } } });
    await route.fulfill({
      status: reply.statusCode, headers: reply.headers,
      body: reply.isBase64Encoded ? Buffer.from(reply.body, 'base64') : reply.body,
    });
  });

  // Delay the second month while the browser is still on the published one.
  // The initial read has already initialized the checkpoint.
  let resumeModel!: () => void;
  modelDelay = new Promise<void>(resolve => { resumeModel = resolve; });
  const waiting = page.waitForRequest('**/api/town');
  const pending = page.waitForResponse('**/api/town');
  await page.goto('http://maple-soak.test/', { waitUntil: 'domcontentloaded' });
  await waiting;
  assert.equal(saved.pending, null);
  resumeModel();
  await pending;
  await page.locator('#date').getByText(new RegExp(initial.label)).waitFor();
  await page.locator('#ranking').click();
  await page.locator(`#resident button[data-focus-key="${followed.id}"]`).click();
  const follow = page.locator('#resident').getByRole('button', { name: 'Follow', exact: true });
  if (await follow.getAttribute('aria-pressed') === 'false') await follow.click();
  await page.locator('#resident').getByRole('button', { name: 'Close' }).click();
  await page.locator('#pause').click();

  async function poll() {
    const next = page.waitForResponse('**/api/town', { timeout: 5000 });
    // Returning to a visible tab triggers the app's normal refresh path.
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    const response = await next;
    await response.finished();
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    return response;
  }

  now += DAY;
  networkOffline = true;
  assert.equal((await poll()).status(), 503);
  await page.locator('#phase').getByText('Reconnecting…').waitFor();
  networkOffline = false;
  const promoted = await (await poll()).json() as typeof initial;
  assert.equal(promoted.month, initial.month + 1);
  await page.locator('#phase').getByText(/^Paused/).waitFor();
  await page.locator('#street-resident').getByText(followed.name).waitFor();
  await page.locator('#live').click();
  await page.locator('#date').getByText(new RegExp(promoted.label)).waitFor();
  assert(!promoted.sims.some(sim => sim.id === followed.id));
  await page.locator('#street-story').waitFor({ state: 'hidden' });
  const pastDecision = '#decision/' + followed.id + '/' + initial.month;
  await page.evaluate(hash => { location.hash = hash; }, pastDecision);
  await page.getByRole('dialog').getByRole('heading', { name: followed.name + '’s decision' }).waitFor();
  await page.getByRole('dialog').getByRole('button', { name: 'Copy decision link' }).click();
  const savedLink = await page.getByRole('dialog').getByRole('textbox', { name: 'Decision link' }).inputValue();
  assert.match(savedLink, /\?saved=/);
  await page.getByRole('dialog').getByRole('button', { name: 'Close' }).click();

  const cdp = await page.context().newCDPSession(page);
  const heap: number[] = [];
  for (let month = 0; month < 16; month++) {
    now += 1000;
    modelOffline = month === 0;
    assert.equal((await poll()).status(), 200);
    now += DAY - 1000;
    const frame = await (await poll()).json() as typeof initial;
    assert.equal(frame.month, promoted.month + month + 1);
    await page.locator('#date').getByText(new RegExp(frame.label)).waitFor();
    if (modelOffline) {
      const fallback = frame.sims.find(sim => sim.decision?.provider === 'heuristic-fallback');
      assert(fallback?.decision?.sampling);
      assert.equal(fallback.decision.heuristicReplay, undefined);
      const link = '#decision/' + fallback.id + '/' + frame.month;
      await page.evaluate(hash => { location.hash = hash; }, link);
      const evidence = page.getByRole('dialog');
      await evidence.getByText('Heuristic fallback', { exact: true }).waitFor();
      assert.equal(await evidence.getByText('Model vs. heuristic', { exact: true }).count(), 0);
      await evidence.getByRole('button', { name: 'Close' }).click();
    }
    const timeline = await town.residentHistory(frame.sims.find(sim => sim.move)!.id);
    assert(timeline.length <= 12 && timeline.at(-1)?.month === frame.month);
    await cdp.send('HeapProfiler.collectGarbage');
    heap.push((await cdp.send('Runtime.getHeapUsage')).usedSize);
  }
  const early = Math.max(...heap.slice(3, 8));
  const late = Math.min(...heap.slice(-4));
  assert(late - early < 4 * 1024 * 1024, 'Post-GC heap kept growing: ' + heap.map(bytes => (bytes / 2 ** 20).toFixed(2)).join(', ') + ' MiB');
  assert(!(await town.residentHistory(followed.id)).some(row => row.month === initial.month));
  await page.evaluate(hash => { location.hash = hash; }, new URL(savedLink).hash);
  const evidence = page.getByRole('dialog');
  await evidence.getByText('Saved evidence from a shared link.', { exact: false }).waitFor();
  await evidence.getByRole('heading', { name: followed.name + '’s decision' }).waitFor();
  await evidence.getByText('Recorded outcome', { exact: true }).waitFor();
  await evidence.getByText('Model vs. heuristic', { exact: true }).waitFor();
  assert.deepEqual(errors, []);
  console.log('Town soak passed with 1,000 residents at start, 17 month changes, and post-GC heap ' +
    (early / 2 ** 20).toFixed(1) + ' → ' + (late / 2 ** 20).toFixed(1) + ' MiB');
} finally {
  await browser.close();
}
