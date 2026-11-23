import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { chromium, type Browser, type Page } from 'playwright-core';
import { DAY, sharedWorld, type Checkpoint } from '../packages/town/src/world.ts';
import { kevDecider } from '../packages/worker/src/kev.ts';

const ROOT = join(import.meta.dirname, '..');
const { values: options } = parseArgs({ options: { 'live-model': { type: 'boolean' } } });
const modelOptions = options['live-model'] ? {
  url: process.env.DECISION_URL, model: process.env.DECISION_MODEL, apiKey: process.env.KEV_API_KEY,
} : undefined;
if (modelOptions && (!modelOptions.url || !modelOptions.model)) {
  throw new Error('--live-model requires DECISION_URL and DECISION_MODEL');
}
const decider = modelOptions?.url ? kevDecider({ ...modelOptions, url: modelOptions.url, timeoutMs: 10_000, retries: 0 }) : undefined;
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
  const atlas = page.waitForResponse(response => response.url() === url + '/art/resident-walk.png');
  await page.goto(url);
  assert((await atlas).ok(), 'Walk atlas should load');
  const profile = page.locator('#resident');
  await page.locator('#street-resident').waitFor();
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
  await current.getByRole('heading', { name: 'Selected cash flows', exact: true }).waitFor();
  await current.getByText('Cash change also reflects purchases, investments, and transfers between accounts.', { exact: true }).waitFor();
  assert.equal(await rows.count(), 2, 'Timeline should show both retained months');
  const earlier = rows.last();
  await earlier.locator(':scope > details > summary').click();
  await earlier.getByText('Income and outgoings were not retained for this month.', { exact: true }).waitFor();
  await earlier.getByText('Life events were not retained for this month.', { exact: true }).waitFor();
  await profile.getByText('Advanced decision details', { exact: true }).click();
  const source = resident.decision?.model ?? 'Heuristic';
  const evidence = profile.locator('.decision-details').filter({ hasText: 'Advanced decision details' }).first();
  await evidence.getByText(source, { exact: true }).waitFor();
  const exact = evidence.locator('.exact-sampling');
  if (await exact.getAttribute('open') === null) await exact.getByText('Exact sampling values', { exact: true }).click();
  await exact.getByText(String(resident.draw), { exact: true }).waitFor();
  await profile.getByText('What changes the odds?', { exact: true }).click();
  const response = page.waitForResponse(r => r.url() === `${url}/api/town/probe/${resident.id}/${frame.month}`);
  await profile.getByRole('button', { name: 'Try twice the coin' }).click();
  const probe = await (await response).json();
  assert.equal(probe.status, 'ready');
  assert.equal(probe.afterCoin, 2 * probe.beforeCoin);
  assert.equal(probe.provider, resident.decision?.provider);
  assert.equal(probe.model, resident.decision?.model);
  assert.deepEqual(probe.base, resident.probabilities);
  const variant = Object.values(probe.variant) as number[];
  assert(variant.length > 0 && variant.every(weight => Number.isFinite(weight) && weight >= 0));
  assert(Math.abs(variant.reduce((sum, weight) => sum + weight, 0) - 1) < 1e-8, 'The variant odds should sum to one');
  await profile.getByText('With twice the coin', { exact: true }).waitFor();

  await page.locator('#toggle').click();
  const world = page.locator('#world-live');
  await world.getByText('Viewed month · ' + frame.label, { exact: true }).waitFor();
  await world.getByText(source, { exact: true }).waitFor();
  await world.getByText('Decision mix by personality', { exact: true }).click();
  await world.getByRole('combobox').waitFor();
  await page.locator('#close-world').click();
  assert.equal(await page.locator('#pause').getAttribute('aria-pressed'), 'true');
  assert.equal(await page.locator('#street-resident').textContent(), resident.name);
  assert.deepEqual(errors, [], 'Town should have no uncaught browser errors');
}

let server: ChildProcess | undefined;
let browser: Browser | undefined;
try {
  await town(0);
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
  // The older row represents a checkpoint written before cash flow and events were captured.
  const earlier = fixture.history![0].residents[resident.id];
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
  browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : { channel: 'chrome' });
  for (const viewport of [{ width: 1440, height: 900 }, { width: 320, height: 640 }]) {
    const now = Date.now();
    await writeFile(checkpointFile, JSON.stringify({ ...fixture, startedAt: now, lastSeenAt: now }));
    const page = await browser.newPage({ viewport, hasTouch: viewport.width === 320, isMobile: viewport.width === 320 });
    page.setDefaultTimeout(8000);
    try {
      await verifyViewport(page, url, frame, resident, eventsByResident.get(resident.id) ?? []);
    } finally {
      await page.close();
    }
  }
  console.log(`Town smoke passed on desktop and 320-pixel phone${decider ? ' with ' + decider.model : ''}`);
} finally {
  await browser?.close();
  if (server && server.exitCode === null && server.signalCode === null && server.pid !== undefined) {
    const exit = new Promise<void>(resolve => server?.once('exit', () => resolve()));
    server.kill();
    await exit;
  }
  await rm(work, { recursive: true, force: true });
}
