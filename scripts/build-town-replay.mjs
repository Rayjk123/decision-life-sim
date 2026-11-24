import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { gunzipSync } from 'node:zlib';

const assets = new URL('../packages/town/', import.meta.url);
export const monthFile = sequence => 'months/' + String(sequence).padStart(4, '0') + '.json.gz';

export async function buildReplay(source, output, epoch = Date.now()) {
  const manifest = JSON.parse(await readFile(join(source, 'manifest.json'), 'utf8'));
  const {version, model, population, months, published, firstMonth, decisions, latest} = manifest;
  assert.equal(version, 1, 'Unsupported replay version');
  assert(typeof model === 'string' && model.trim(), 'Replay needs a model name');
  assert(Number.isSafeInteger(epoch) && epoch >= 0, 'Invalid replay epoch');
  for (const [name, value] of Object.entries({population, months, firstMonth, decisions})) {
    assert(Number.isSafeInteger(value) && value > 0, 'Invalid replay ' + name);
  }
  assert.equal(published, months, 'Replay is incomplete');
  assert.equal(latest, monthFile(months), 'Latest frame does not match the manifest');
  const expected = Array.from({length: months}, (_, index) => monthFile(index + 1));
  const files = new Set(await readdir(join(source, 'months')));
  assert.equal(files.size, months, 'Unexpected files or missing files in months/');
  const digest = createHash('sha256');
  const write = async (path, content) => {
    await writeFile(join(output, path), content);
    digest.update(JSON.stringify([path, createHash('sha256').update(content).digest('hex')]));
  };

  // The output directory must be new. A failed build has no entry point.
  await mkdir(output);
  await mkdir(join(output, 'replay', 'months'), {recursive:true});
  let recorded = 0;
  let minimumPopulation = population;
  for (const [index, path] of expected.entries()) {
    assert(files.has(path.slice('months/'.length)), 'Missing ' + path);
    const content = await readFile(join(source, path));
    const {frame, rows} = JSON.parse(gunzipSync(content));
    assert.equal(frame.month, firstMonth + index, path + ': month out of sequence');
    assert.equal(frame.deciderModel, model, path + ': wrong configured model');
    const residents = new Map(frame.sims.map(sim => [sim.id, sim]));
    assert(residents.size > 0 && residents.size <= population, path + ': population out of range');
    assert.equal(residents.size, frame.sims.length, path + ': duplicate resident');
    assert.equal(rows.length, residents.size, path + ': incomplete timeline rows');
    const seen = new Set();
    for (const row of rows) {
      const sim = residents.get(row.id);
      assert(sim && !seen.has(row.id), path + ': bad timeline resident ' + row.id);
      seen.add(row.id);
      assert(!row.probe && !sim.probe && !sim.hasProbe, path + ': private probe or live probe reference');
      assert.equal(row.move, sim.move, path + ': timeline move differs from frame');
      assert.equal(row.decision?.model, sim.decision?.model, path + ': timeline model differs from frame');
      assert.equal(row.decision?.provider, sim.decision?.provider, path + ': timeline provider differs from frame');
      if (sim.decision) {
        assert(sim.decision.provider === 'kev' && sim.decision.model === model, path + ': unexpected decision source or fallback');
        recorded++;
      }
    }
    minimumPopulation = Math.min(minimumPopulation, residents.size);
    await write('replay/' + path, content);
  }
  assert.equal(recorded, decisions, 'Decision count differs from the manifest');
  const lifetime = await readFile(join(source, 'lifetime.json.gz'));
  const archive = JSON.parse(gunzipSync(lifetime));
  assert(archive.lifetimes && Object.keys(archive.lifetimes).length > 0 && Array.isArray(archive.pastResidents), 'Missing lifetime history');
  for (const resident of archive.pastResidents) {
    assert(Object.hasOwn(archive.lifetimes, resident.simId), 'Missing life for ' + resident.simId);
  }
  await write('replay/lifetime.json.gz', lifetime);
  await write('replay/manifest.json', JSON.stringify({version, model, population, months, published, firstMonth, decisions, latest, epoch}));

  await mkdir(join(output, 'art'));
  for (const name of (await readdir(new URL('art/', assets))).sort()) {
    if (/\.(png|jpg)$/.test(name)) await write('art/' + name, await readFile(new URL('art/' + name, assets)));
  }
  for (const name of ['audio.js', 'replay.js', 'town.css', 'town.js']) await write(name, await readFile(new URL(name, assets)));
  const html = (await readFile(new URL('index.html', assets), 'utf8')).replace('<html lang="en">', '<html lang="en" data-replay>');
  assert(html.includes('data-replay'), 'Missing replay entry point');
  await write('index.html', html);
  return {model, epoch, months, population, minimumPopulation, decisions:recorded, fallbacks:0,
    lifetimeHistories:Object.keys(archive.lifetimes).length, bundleSha256:digest.digest('hex')};
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [source, output, epoch] = process.argv.slice(2);
  if (!source || !output) throw Error('Usage: npm run town:replay:build -- <run-dir> <new-site-dir> [epoch-milliseconds]');
  console.log(JSON.stringify(await buildReplay(source, output, epoch === undefined ? undefined : Number(epoch)), null, 2));
}
