// UX smoke test: drives the dashboard in a real browser the way a viewer would, and fails on console errors,
// failed requests, empty panels, broken interactions or horizontal overflow on a phone.
//   npm run ux                     self-contained: grows a small world, serves it on a free port, tests it
//   npm run ux -- --url <dashboard> [--shots <dir>]   test a dashboard that's already running
// Uses playwright-core with the installed Chrome (channel 'chrome'), or a Playwright Chromium when CHROMIUM_PATH is set.
import { chromium, type Page } from 'playwright-core';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

const ROOT = join(import.meta.dirname, '..');
const { values: a } = parseArgs({ options: { url: { type: 'string' }, shots: { type: 'string' } } });
const work = mkdtempSync(join(tmpdir(), 'dls-ux-'));
const shots = a.shots ?? join(work, 'shots');
mkdirSync(shots, { recursive: true });

// Self-contained mode: a 30-year, 80-sim heuristic world, served on a free port.
let server: ChildProcess | undefined;
let url = a.url ?? '';
if (!url) {
  const sim = spawnSync('npx', ['tsx', 'packages/worker/src/cli.ts', '--months', '360', '--pop', '80', '--out', join(work, 'world'), '--quiet'], { cwd: ROOT, encoding: 'utf8' });
  if (sim.status !== 0) { console.error(sim.stdout + sim.stderr); process.exit(1); }
  const port = 5300 + Math.floor(Math.random() * 600);
  url = `http://127.0.0.1:${port}`;
  server = spawn('node', ['packages/dashboard/serve.mjs'], { cwd: ROOT, env: { ...process.env, PORT: String(port), WORLD_DIR: join(work, 'world') }, stdio: 'ignore' });
  for (let i = 0; i < 50; i++) { try { if ((await fetch(url)).ok) break; } catch { /* not up yet */ } await new Promise((r) => setTimeout(r, 100)); }
}
process.on('exit', () => server?.kill());

const problems: string[] = [];
const passed: string[] = [];
const check = (name: string, ok: boolean, detail = '') => (ok ? passed : problems).push(ok ? name : `${name}${detail ? `: ${detail}` : ''}`);

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : { channel: 'chrome' });
async function watch(page: Page, tag: string) {
  page.on('console', (m) => { if (m.type() === 'error') problems.push(`[${tag}] console error: ${m.text().slice(0, 200)}`); });
  page.on('pageerror', (e) => problems.push(`[${tag}] page error: ${e.message.slice(0, 200)}`));
  page.on('response', (r) => { if (r.status() >= 400) problems.push(`[${tag}] HTTP ${r.status()} ${r.url().replace(url, '')}`); });
}

// ---- desktop ----
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
await watch(page, 'desktop');
await page.goto(url);
await page.waitForSelector('#leaders tr.click', { timeout: 15_000 }).catch(() => {});
await page.screenshot({ path: join(shots, '0-first-visit.png'), fullPage: true });
await page.screenshot({ path: join(shots, '1-home.png'), fullPage: true });

check('first visit shows the intro', await page.locator('#intro.show').isVisible());
check('header speaks plain language', /Stocks [+-]?\d+% this year|Mortgages/.test(await page.locator('#kpis').innerText()) && !/index \d/.test(await page.locator('#kpis').innerText()));
await page.locator('#gotit').click();
check('"Got it" hides the intro', !(await page.locator('#intro.show').isVisible()));
await page.reload();
await page.waitForSelector('#leaders tr.click', { timeout: 15_000 }).catch(() => {});
check('the intro stays dismissed after a reload', !(await page.locator('#intro.show').isVisible()));
await page.locator('#help').click();
check('the ? button reopens the intro', await page.locator('#intro.show').isVisible());
await page.locator('#gotit').click();
check('world selector has a world', (await page.locator('#world option').count()) > 0);
check('headline KPIs render', ((await page.locator('#kpis').innerText()).trim().length) > 20);
check('archetype chart draws', (await page.locator('#chart svg, #chart canvas').count()) > 0 && (await page.locator('#chart svg *, #chart canvas').count()) > 3);
const ticks = await page.locator('#chart svg > text[text-anchor="end"]').evaluateAll((els) => els.map((e) => e.textContent ?? ''));   // innerText is empty for SVG text
const val = (t: string) => { const m = /\$([\d.]+)([kM]?)/.exec(t); return m ? Number(m[1]) * (m[2] === 'M' ? 1e6 : m[2] === 'k' ? 1e3 : 1) : NaN; };
const vs = ticks.map(val), step = vs[1] - vs[0], mant = step / 10 ** Math.floor(Math.log10(step));
check('chart ticks are round and evenly spaced', vs.length >= 3 && vs.every((v, i) => Math.abs(v - i * step) < step * 0.02) && [1, 2, 2.5, 5].some((f) => Math.abs(mant - f) < 0.01), ticks.join(' '));
const chartBox = await page.locator('#chart').boundingBox();
if (chartBox) await page.mouse.move(chartBox.x + chartBox.width * 0.6, chartBox.y + chartBox.height * 0.5);
await page.waitForTimeout(150);
const tipText = (await page.locator('#tip').isVisible()) ? await page.locator('#tip').innerText() : '';
check('hovering the chart shows every archetype that year', /Year \d+/.test(tipText) && tipText.split('\n').length >= 6, tipText.slice(0, 80));
await page.screenshot({ path: join(shots, '1b-chart-hover.png') });
await page.mouse.move(1, 1);
check('chart legend lists archetypes', (await page.locator('#legend').innerText()).split(/\n|  /).filter(Boolean).length >= 5);
const leaders = await page.locator('#leaders tr.click').count();
check('leaderboard has rows', leaders >= 5, `${leaders} rows`);
const decRows = await page.locator('#decisions tr.click').count();
check('decision explorer lists decisions', decRows >= 1, `${decRows} rows`);

if (decRows) {
  await page.locator('#decisions tr.click').first().click();
  await page.waitForTimeout(300);
  const card = await page.locator('#card').innerText();
  check('decision card shows options with probabilities', /\d+%/.test(card) && card.length > 80);
  check('decision card shows the dice roll', /dice|draw/i.test(card));
  check('decision card shows the spend level', /spending: .*\/10/.test(card));
  check('decision card names who decided', (await page.locator('#who').count()) > 0);
  await page.screenshot({ path: join(shots, '2-decision.png'), fullPage: true });
  if (await page.locator('#who').count()) {
    await page.locator('#who').click();
    await page.waitForTimeout(400);
    const open = await page.locator('#person.open').count();
    check('clicking the sim opens the life panel', open > 0);
    const person = await page.locator('#person').innerText();
    check('life panel shows money and a story', /net worth/i.test(person) && person.length > 200, `${person.length} chars`);
    check('life panel shows a milestone timeline by age', (await page.locator('#person .timeline li').count()) >= 2 && /Life so far/.test(person));
    check('life panel groups this year', /This year/.test(person));
    await page.screenshot({ path: join(shots, '3-person.png'), fullPage: true });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    check('Escape closes the life panel', (await page.locator('#person.open').count()) === 0);
  }
}

for (const b of await page.locator('#filters button').all()) {
  const label = (await b.innerText()).trim();
  await b.click();
  await page.waitForTimeout(250);
  check(`filter "${label}" works`, (await page.locator('#decisions').count()) > 0);
}

const slider = page.locator('#month');
const [min, max] = [Number(await slider.getAttribute('min') ?? 0), Number(await slider.getAttribute('max') ?? 0)];
for (const v of [min, Math.round((min + max) / 2), max]) {
  await slider.evaluate((el, val) => { (el as HTMLInputElement).value = String(val); el.dispatchEvent(new Event('input')); }, v);
  await page.waitForTimeout(300);
}
check('month slider scrubs without errors', max > min, `range ${min}-${max}`);

if (leaders) {
  await page.locator('#leaders tr.click').first().click();
  await page.waitForTimeout(400);
  check('leaderboard row opens the life panel', (await page.locator('#person.open').count()) > 0);
  await page.keyboard.press('Escape');
}

// ---- phone ----
const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
await watch(phone, 'phone');
await phone.goto(url);
await phone.waitForSelector('#leaders tr.click', { timeout: 15_000 }).catch(() => {});
const overflow = await phone.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
check('no horizontal scroll on a phone', overflow <= 1, `${overflow}px wider than the screen`);
await phone.screenshot({ path: join(shots, '4-phone.png'), fullPage: true });

await browser.close();
for (const p of passed) console.log(`✅ ${p}`);
for (const p of problems) console.log(`❌ ${p}`);
console.log(problems.length ? `\nux FAILED: ${problems.length} problem(s); screenshots in ${shots}` : `\nux passed (${passed.length} checks); screenshots in ${shots}`);
process.exit(problems.length ? 1 : 0);
