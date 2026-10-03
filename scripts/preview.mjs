import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript', '.png': 'image/png' };
http.createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (pathname === '/') { res.writeHead(302, { Location: '/ui/dashboard.html' }); res.end(); return; }
    const file = path.resolve(root, '.' + (pathname === '/' ? '/ui/dashboard.html' : pathname));
    if (!file.startsWith(root) || !types[path.extname(file)]) throw new Error('Not found');
    let body = await fs.readFile(file);
    if (file.endsWith('.html')) body = body.toString().replace('<script type="module"', '<script type="module" src="/dev/mock.js"></script>\n<script type="module"');
    res.writeHead(200, { 'Content-Type': types[path.extname(file)], 'Cache-Control': 'no-store' });
    res.end(body);
  } catch { res.writeHead(404); res.end('Not found'); }
}).listen(4173, '127.0.0.1', () => console.log('CourseDeck preview: http://127.0.0.1:4173 — fictional data; no Canvas requests'));
