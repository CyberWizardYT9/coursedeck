import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { zipSync, unzipSync } from 'fflate';

const root = fileURLToPath(new URL('../', import.meta.url));
const manifest = JSON.parse(await fs.readFile(path.join(root, 'manifest.json'), 'utf8'));
if (!/^\d+\.\d+\.\d+$/.test(manifest.version)) throw new Error('Invalid extension version');
const files = ['manifest.json', 'background.js', 'LICENSE', 'PRIVACY.md'];
for (const dir of ['ui', 'src']) {
  for (const file of (await fs.readdir(path.join(root, dir))).sort()) {
    if (await fs.stat(path.join(root, dir, file)).then(s => s.isFile())) files.push(`${dir}/${file}`);
  }
}
files.push(...new Set([...Object.values(manifest.icons), ...Object.values(manifest.action.default_icon)]));
const entries = {};
for (const file of files) entries[file] = [await fs.readFile(path.join(root, file)), { mtime: new Date(2020, 0, 1) }];
const zip = zipSync(entries, { level: 9 });
const check = unzipSync(zip);
if (Object.keys(check).length !== files.length || !check['manifest.json']) throw new Error('Invalid extension archive');
for (const file of files) if (!Buffer.from(check[file]).equals(entries[file][0])) throw new Error(`Archive mismatch: ${file}`);
const dist = path.resolve(root, 'dist'), unpacked = path.resolve(dist, `coursedeck-${manifest.version}`);
if (path.dirname(unpacked) !== dist || !unpacked.startsWith(root)) throw new Error('Package output is outside dist');
await fs.rm(unpacked, { recursive: true, force: true });
await fs.mkdir(unpacked, { recursive: true });
for (const file of files) {
  const output = path.join(unpacked, file);
  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.writeFile(output, entries[file][0]);
}
const filename = `coursedeck-${manifest.version}.zip`;
await fs.writeFile(path.join(dist, filename), zip);
console.log(`Packaged ${files.length} runtime files: dist/${filename} (${Math.ceil(zip.length / 1024)} KB)`);
console.log(`Load unpacked in Chrome: dist/coursedeck-${manifest.version}`);
