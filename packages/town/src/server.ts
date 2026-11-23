import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';
import { sharedWorld, type Storage } from './world.ts';
import { kevDecider } from '../../worker/src/kev.ts';

const assets = new Map([['/', ['index.html', 'text/html']], ['/audio.js', ['audio.js', 'text/javascript']], ['/town.js', ['town.js', 'text/javascript']], ['/town.css', ['town.css', 'text/css']]]);
for (const name of ['street-day.png', 'street-evening.png', 'bakery.png', 'cast.png', 'red-coat-walk.png',
  'work-infirmary.png', 'work-guildhall.png', 'work-market.png', 'work-workshop.png',
  'work-land-office.png', 'work-watchhall.png', 'work-schoolhouse.png']) {
  assets.set('/art/' + name, ['art/' + name, 'image/png']);
}
const assetDir = process.env.TOWN_ASSETS ?? fileURLToPath(new URL('../', import.meta.url));
const decider = process.env.DECISION_URL ? kevDecider({
  url: process.env.DECISION_URL, model: process.env.DECISION_MODEL ?? 'kev-latest', apiKey: process.env.KEV_API_KEY,
}) : undefined;
const pop = Number(process.env.TOWN_POP ?? 1000);
if (!Number.isInteger(pop) || pop < 1 || pop > 1000) throw new Error('TOWN_POP must be an integer from 1 to 1000');

function localStorage(): Storage {
  const dir = resolve(process.env.TOWN_DATA ?? 'world/pixel-town');
  const path = join(dir, 'checkpoint.json');
  return {
    async load() {
      try { return { value: JSON.parse(await readFile(path, 'utf8')), version: 'local' }; }
      catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
    },
    async save(value) {
      await mkdir(dir, { recursive: true });
      await writeFile(path + '.next', JSON.stringify(value));
      await rename(path + '.next', path);
      return true;
    },
  };
}

async function cloudStorage(bucket: string): Promise<Storage> {
  const moduleName = '@aws-sdk/client-s3'; // supplied by the Lambda Node.js runtime
  const { S3Client, GetObjectCommand, PutObjectCommand } = await import(moduleName);
  const client = new S3Client({});
  const object = { Bucket: bucket, Key: 'world/checkpoint.json' };
  return {
    async load() {
      try {
        const result = await client.send(new GetObjectCommand(object));
        return { value: JSON.parse(await result.Body.transformToString()), version: result.ETag };
      } catch (error) { if ((error as Error).name === 'NoSuchKey') return null; throw error; }
    },
    async save(value, version) {
      try {
        await client.send(new PutObjectCommand({ ...object, Body: JSON.stringify(value), ...(version ? { IfMatch: version } : { IfNoneMatch: '*' }) }));
        return true;
      } catch (error) {
        if (['PreconditionFailed', 'ConditionalRequestConflict'].includes((error as Error).name)) return false;
        throw error;
      }
    },
  };
}

const world = (process.env.TOWN_BUCKET ? cloudStorage(process.env.TOWN_BUCKET) : Promise.resolve(localStorage()))
  .then(storage => sharedWorld(storage, { pop, decider }));

export async function handler(event: { rawPath: string; requestContext?: { http?: { method?: string } } }) {
  const headers = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'content-type': 'text/plain; charset=utf-8' };
  if (event.requestContext?.http?.method !== 'GET') return { statusCode: 405, headers, body: 'Method not allowed' };
  if (event.rawPath === '/api/town') {
    try { return { statusCode: 200, headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify(await (await world)()) }; }
    catch (error) { console.error(error); return { statusCode: 503, headers, body: 'Town temporarily unavailable' }; }
  }
  const asset = assets.get(event.rawPath);
  if (!asset) return { statusCode: 404, headers, body: 'Not found' };
  const binary = asset[1] === 'image/png';
  const data = await readFile(join(assetDir, asset[0]));
  return {
    statusCode: 200,
    headers: { ...headers, 'content-type': binary ? asset[1] : asset[1] + '; charset=utf-8' },
    body: data.toString(binary ? 'base64' : 'utf8'),
    isBase64Encoded: binary,
  };
}

if (!process.env.AWS_LAMBDA_FUNCTION_NAME) {
  const port = Number(process.env.TOWN_PORT ?? 5192);
  createServer(async (req, res) => {
    try {
      const reply = await handler({ rawPath: new URL(req.url ?? '/', 'http://localhost').pathname, requestContext: { http: { method: req.method } } });
      res.writeHead(reply.statusCode, reply.headers).end(reply.isBase64Encoded ? Buffer.from(reply.body, 'base64') : reply.body);
    } catch (error) { console.error(error); res.writeHead(500).end('Town temporarily unavailable'); }
  }).listen(port, process.env.TOWN_HOST ?? '127.0.0.1', () => console.log(`Maple Hollow on port ${port}`));
}
