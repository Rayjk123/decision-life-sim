// Zero-dependency local server for the dashboard.
//   npm run dashboard            serves http://localhost:5173 over ./world (or WORLD_DIR)
import { createServer } from 'node:http';
import { readFile, readdir, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const worldRoot = resolve(process.env.WORLD_DIR ?? 'world');
const port = Number(process.env.PORT ?? 5173);
const types = { '.html': 'text/html; charset=utf-8', '.json': 'application/json', '.js': 'text/javascript', '.css': 'text/css' };

createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (url.pathname === '/api/worlds') {
      const names = (await readdir(worldRoot).catch(() => [])).filter((n) => !n.startsWith('.'));
      const worlds = [];
      for (const n of names) {
        try { worlds.push({ name: n, latest: JSON.parse(await readFile(join(worldRoot, n, 'public', 'latest.json'), 'utf8')) }); } catch { /* not a world */ }
      }
      res.writeHead(200, { 'content-type': types['.json'] }).end(JSON.stringify(worlds));
      return;
    }
    let file;
    if (url.pathname.startsWith('/world/')) {
      file = normalize(join(worldRoot, decodeURIComponent(url.pathname.slice('/world/'.length))));
      if (!file.startsWith(worldRoot)) { res.writeHead(403).end(); return; }
    } else {
      file = join(here, url.pathname === '/' ? 'index.html' : normalize(url.pathname));
      if (!file.startsWith(here)) { res.writeHead(403).end(); return; }
    }
    if (!(await stat(file)).isFile()) throw new Error('not a file');
    res.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(await readFile(file));
  } catch {
    res.writeHead(404).end('not found');
  }
}).listen(port, () => console.log(`Dashboard on http://localhost:${port} (worlds from ${worldRoot})`));
