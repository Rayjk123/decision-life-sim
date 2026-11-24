import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, extname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { gzipSync, gunzipSync } from 'node:zlib';
import { chromium } from 'playwright-core';
import { heuristicDecider } from '../packages/sim-core/src/index.ts';
import { DAY, sharedWorld } from '../packages/town/src/world.ts';
import { buildReplay, monthFile } from './build-town-replay.mjs';

const {values} = parseArgs({options: {source:{type:'string'}, evidence:{type:'string'}, site:{type:'string'}}});
const temp = await mkdtemp(join(tmpdir(), 'maple-hollow-release-'));
const evidence = resolve(values.evidence ?? join(temp, 'evidence'));
await mkdir(dirname(evidence), {recursive:true});
await mkdir(evidence);
const report = {result: 'FAIL', createdAt: new Date().toISOString(), node: process.version, commit: execFileSync('git', ['rev-parse','HEAD'], {encoding:'utf8'}).trim(),
  workingTree: execFileSync('git', ['status','--porcelain'], {encoding:'utf8'}).trim() ? 'modified' : 'clean',
  source: values.source ? 'recorded run' : 'deterministic test fixture', checks: []};
const start = performance.now();
const epoch = Date.now();
let server, browser, context, page;

async function check(name, run, screenshot) {
  const step = {name, result:'FAIL'};
  report.checks.push(step);
  const before = performance.now();
  try {
    await run();
    if (screenshot) {
      await page.screenshot({path:join(evidence,screenshot), animations:'disabled'});
      step.screenshot = screenshot;
    }
    step.result = 'PASS';
    console.log('PASS',name);
  } finally {
    step.seconds = Number(((performance.now() - before) / 1000).toFixed(2));
  }
}

async function fixture(directory) {
  const model = 'fixture-model';
  const decider = {name:'kev', model, async decide(request) {
    return {...await heuristicDecider.decide(request), provider:'kev', model};
  }};
  const population = 32, months = 3;
  let saved, firstMonth, decisions = 0;
  const town = sharedWorld({
    async load() { return saved ? {value:saved, version:'fixture'} : null; },
    async save(value) { saved = value; return true; },
  }, {pop:population,decider});
  await mkdir(join(directory,'months'),{recursive:true});
  for (let i = 0; i < months; i++) {
    if (saved) await town(saved.startedAt + 1);
    const {startedAt, serverTime, ...frame} = await town(i * DAY);
    for (const resident of frame.sims) resident.hasProbe = false;
    firstMonth ??= frame.month;
    decisions += frame.sims.filter(sim => sim.decision?.provider === 'kev').length;
    const rows = saved.current.sims.map(({probe,...row}) => row);
    await writeFile(join(directory,monthFile(i+1)),gzipSync(JSON.stringify({frame,rows})));
  }
  // Give one demo resident a completed life in the archive so this fixture covers the past-resident browser.
  const resident = saved.current.sims[0];
  const pastResidents = [{simId:resident.id, name:resident.name, ageAtDeath:resident.age,
    diedMonth:saved.current.month, finalNetWorth:resident.nw}];
  await writeFile(join(directory,'lifetime.json.gz'),gzipSync(JSON.stringify({lifetimes:saved.lifetimes,pastResidents})));
  await writeFile(join(directory,'manifest.json'),JSON.stringify({version:1, model, population, months,
    published:months, firstMonth, decisions, latest:monthFile(months)}));
}

async function serve(site) {
  const mime = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8',
    '.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.gz':'application/gzip'};
  server=createServer(async (request,response) => {
    const path = new URL(request.url,'http://localhost').pathname;
    const file = path === '/' ? 'index.html' : path.slice(1);
    try {
      if (!/^[\w./-]+$/.test(file) || file.split('/').includes('..')) throw Error('Unknown file');
      const bytes=await readFile(join(site,file));
      const type=mime[extname(file)];
      const headers={'content-type':type,'x-content-type-options':'nosniff'};
      // Cover both origin configurations. Browsers decode this file automatically.
      if (file === 'replay/lifetime.json.gz') {
        headers['content-type']='application/json';
        headers['content-encoding']='gzip';
      }
      response.writeHead(200,headers).end(bytes);
    } catch { response.writeHead(404).end('Not found'); }
  });
  await new Promise((ok,fail) => { server.once('error',fail); server.listen(0,'127.0.0.1',ok); });
  return 'http://127.0.0.1:'+server.address().port;
}

try {
  const fixtureSource=join(temp,'fixture');
  await fixture(fixtureSource);
  const source = values.source ? resolve(values.source) : fixtureSource;
  const site=values.site ? resolve(values.site) : join(temp,'site');
  await check('Package every month and verify chronological coverage, decision provenance and lifetime history',async () => {
    report.bundle=await buildReplay(source,site,epoch);
  });
  await check('Reject a replay with a corrupt month before exposing a site entry point',async () => {
    const path=join(fixtureSource,monthFile(2));
    const payload=JSON.parse(gunzipSync(await readFile(path)));
    payload.frame.month++;
    await writeFile(path,gzipSync(JSON.stringify(payload)));
    const invalid=join(temp,'invalid');
    await assert.rejects(buildReplay(fixtureSource,invalid,epoch),/month out of sequence/);
    await assert.rejects(access(join(invalid,'index.html')),{code:'ENOENT'});
  });
  const base=await serve(site);
  const manifest=JSON.parse(await readFile(join(site,'replay','manifest.json'),'utf8'));
  const firstMonth=manifest.firstMonth, lastMonth=firstMonth+manifest.published-1;
  const date=month => ({year:String(Math.ceil(month/12)), part:String((month-1)%12+1)});
  const firstLabel=JSON.parse(gunzipSync(await readFile(join(site,'replay',monthFile(1))))).frame.label;
  browser=await chromium.launch(process.env.CHROMIUM_PATH ? {executablePath:process.env.CHROMIUM_PATH} : {channel:'chrome'});
  report.browser='Chromium '+browser.version();
  context=await browser.newContext({viewport:{width:1440,height:900}});
  await context.tracing.start({screenshots:true,snapshots:true});
  page=await context.newPage();
  page.setDefaultTimeout(8000);
  const errors=[], dataRequests=[];
  context.on('request',request => dataRequests.push(new URL(request.url())));
  context.on('page',tab => tab.on('pageerror',error => errors.push(error.message)));
  page.on('pageerror',error => errors.push(error.message));
  let decisionHref, lastLabel;

  await check('Open the replay and inspect four districts through the published UI', async () => {
    await page.clock.setFixedTime(new Date(epoch+20_000));
    await page.goto(base);
    await page.locator('#market').getByText(/residents/).waitFor();
    await page.locator('#overview').click();
    const streets=page.locator('#district-pins button');
    await streets.first().waitFor();
    assert.equal(await streets.count(),4);
    await streets.first().click();
    await page.getByRole('heading',{name:'Who’s here'}).waitFor();
  }, 'overview.png');

  await check('Jump to the last month and inspect its saved decision, timeline and lifetime chart', async () => {
    const target=date(lastMonth);
    await page.getByLabel('Simulation year').selectOption(target.year);
    await page.getByLabel('Simulation month').selectOption(target.part);
    await page.getByRole('button',{name:'Go',exact:true}).click();
    await page.locator('#replay-position').getByText('Month '+manifest.published+' of '+manifest.published.toLocaleString(),{exact:true}).waitFor();
    await page.getByRole('button',{name:'Technical view',exact:true}).click();
    const world=page.locator('#world');
    await world.getByText(manifest.model,{exact:true}).first().waitFor();
    const link=world.getByRole('link',{name:'View decision'}).first();
    decisionHref=await link.getAttribute('href');
    assert(decisionHref?.endsWith('/'+lastMonth),'Decision link should point to the viewed month');
    lastLabel=(await world.getByText(/^Viewed month/).textContent()).replace('Viewed month · ','');
    await link.click();
    const dialog=page.getByRole('dialog');
    await dialog.getByText('Recorded outcome',{exact:true}).waitFor();
    await dialog.getByText(manifest.model,{exact:true}).first().waitFor();
    await page.screenshot({path:join(evidence,'decision.png'),animations:'disabled'});
    await page.keyboard.press('Escape');
    await world.getByText('Decision mix by personality',{exact:true}).click();
    await world.getByLabel('Personality and decision source').waitFor();
    await world.getByText('Past residents',{exact:true}).click();
    await world.locator('.past-residents .list button').first().click();
    await world.locator('.past-residents').getByRole('img',{name:/Net worth from/}).waitFor();
    await world.locator('[data-focus-key="'+decisionHref.split('/')[1]+'"]').first().click();
    const profile=page.locator('#resident');
    await profile.getByText('Monthly timeline',{exact:true}).click();
    await profile.locator('.timeline').getByText(lastLabel,{exact:true}).first().waitFor();
    const beginning=new URLSearchParams(date(firstMonth));
    await page.goto(base+'/?'+beginning+decisionHref);
    await dialog.getByText('Recorded outcome',{exact:true}).waitFor();
    await dialog.getByText(lastLabel,{exact:true}).waitFor();
  }, 'deep-link.png');

  await check('Roll over to the first month after a failed download, retaining the last good frame', async () => {
    const replay=await context.newPage();
    await replay.clock.setFixedTime(new Date(epoch+(manifest.published-1)*DAY+20_000));
    await replay.goto(base);
    await replay.locator('#date').getByText(new RegExp('^'+lastLabel)).waitFor();
    const firstPath='**/replay/'+monthFile(1);
    let failed=0;
    await replay.route(firstPath,async route => { failed++; await route.fulfill({status:503}); });
    await replay.clock.setFixedTime(new Date(epoch+manifest.published*DAY+10));
    const poll=() => replay.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await poll();
    await replay.locator('#phase').getByText('Reconnecting…',{exact:true}).waitFor();
    assert(failed>=1,'Expected failed static month download');
    await replay.locator('#date').getByText(new RegExp('^'+lastLabel)).waitFor();
    await replay.screenshot({path:join(evidence,'recovery-503.png'),animations:'disabled'});
    await replay.unroute(firstPath);
    await poll();
    await replay.locator('#replay-position').getByText('Month 1 of '+manifest.published.toLocaleString(),{exact:true}).waitFor();
    await replay.locator('#date').getByText(new RegExp('^'+firstLabel)).waitFor();
    await replay.screenshot({path:join(evidence,'recovery-restored.png'),animations:'disabled'});
    await replay.close();
  });

  await check('Use the phone layout and confirm static-only requests with private data excluded', async () => {
    await page.setViewportSize({width:390,height:844});
    await page.goto(base);
    await page.locator('#market').getByText(/residents/).waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth),390);
    assert(dataRequests.some(url => url.pathname === '/replay/'+monthFile(manifest.published)));
    assert(dataRequests.some(url => url.pathname === '/replay/lifetime.json.gz'));
    assert(dataRequests.every(url => url.origin === base && !url.pathname.startsWith('/api/')));
    for (const path of ['private-checkpoint.json.gz','generation.log','/api/town']) {
      assert.equal((await page.request.get(new URL(path,base).href)).status(),404);
    }
    assert.deepEqual(errors,[]);
  }, 'phone.png');

  report.result='PASS';
  await context.tracing.stop();
} catch (error) {
  report.error=error.message;
  if (page && !page.isClosed()) await page.screenshot({path:join(evidence,'failure.png')}).catch(()=>{});
  if (context) await context.tracing.stop({path:join(evidence,'failure-trace.zip')}).catch(()=>{});
  throw error;
} finally {
  await browser?.close();
  if (server) await new Promise(done=>server.close(done));
  report.seconds=Number(((performance.now()-start)/1000).toFixed(2));
  await writeFile(join(evidence,'report.json'),JSON.stringify(report,null,2)+'\n');
  const {bundle} = report;
  const rows=report.checks.map(step=> '| '+step.result+' | '+step.name+' | '+step.seconds+' s | '+
    (step.screenshot?'['+step.screenshot+'](./'+step.screenshot+')':'')+' |');
  await writeFile(join(evidence,'report.md'),[
    '# Maple Hollow replay verification', '', '**'+report.result+'** · '+report.source+' · '+report.seconds+' s',
    '', 'Source revision `'+report.commit+'` ('+report.workingTree+' working tree).', report.browser ?? '',
    ...(bundle?['','Bundle SHA-256 `'+bundle.bundleSha256+'`.','',
      bundle.months.toLocaleString()+' months · population '+bundle.minimumPopulation+'–'+bundle.population+' · '+
      bundle.decisions.toLocaleString()+' decisions from '+bundle.model+' · '+bundle.fallbacks+' fallbacks · '+
      bundle.lifetimeHistories.toLocaleString()+' lifetime histories.']:[]),
    '', '| Result | Check | Time | Evidence |','|---|---|---:|---|',...rows,
    '', ...(report.error?['Failure details are in [report.json](./report.json).']:[]),
    ...(report.result === 'PASS' ? ['', '[Decision details](./decision.png) · [Failed download](./recovery-503.png) · [Recovered first month](./recovery-restored.png)', ''] : []),
    'Scope covers loopback static delivery in Chromium. Model quality and deployed CDN behavior are separate checks.', '',
  ].join('\n'));
  if (values.evidence) await rm(temp,{recursive:true,force:true});
  else await Promise.all(['site','fixture','invalid'].map(name=>rm(join(temp,name),{recursive:true,force:true})));
  console.log('Evidence: '+evidence);
}
