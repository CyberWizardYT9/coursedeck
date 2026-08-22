/* Static checks that would otherwise only surface when Chrome refuses to load
   the extension: bad manifest paths, unresolved imports, undeclared chrome APIs,
   message types sent but never handled. Run: node test/validate.mjs */

import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
let problems = [];
const fail = m => problems.push(m);
const read = p => fs.readFileSync(path.join(ROOT, p), "utf8");
const exists = p => fs.existsSync(path.join(ROOT, p));

/* ------------------------------------------------------------- manifest */
let mf;
try { mf = JSON.parse(read("manifest.json")); }
catch (e) { fail("manifest.json is not valid JSON: " + e.message); }

if (mf) {
  if (mf.manifest_version !== 3) fail("manifest_version must be 3");
  if (!/^\d+\.\d+\.\d+$/.test(mf.version || "")) fail("version must look like 1.0.0");

  const refs = [
    mf.background && mf.background.service_worker,
    mf.action && mf.action.default_popup,
    mf.options_page,
    ...Object.values((mf.action && mf.action.default_icon) || {}),
    ...Object.values(mf.icons || {})
  ].filter(Boolean);
  for (const r of refs) if (!exists(r)) fail(`manifest points at missing file: ${r}`);

  if (mf.background && mf.background.type !== "module") fail("service worker must be type:module (it uses import)");
}

/* -------------------------------------------------- imports resolve + exist */
const jsFiles = [];
(function walk(dir) {
  for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = path.join(dir, e.name);
    if (e.isDirectory()) { if (!/node_modules/.test(e.name)) walk(rel); }
    else if (/\.(js|mjs)$/.test(e.name)) jsFiles.push(path.posix.normalize(rel.replace(/\\/g, "/")));
  }
})(".");

const exportsOf = {};
for (const f of jsFiles) {
  const src = read(f);
  const names = new Set();
  for (const m of src.matchAll(/^export\s+(?:async\s+)?(?:function|class|const|let|var)\s+([A-Za-z0-9_$]+)/gm)) names.add(m[1]);
  for (const m of src.matchAll(/^export\s*\{([^}]+)\}/gm))
    m[1].split(",").forEach(n => names.add(n.trim().split(/\s+as\s+/).pop().trim()));
  exportsOf[f] = names;
}

for (const f of jsFiles) {
  const src = read(f);
  for (const m of src.matchAll(/import\s+([^;]*?)\s+from\s+["']([^"']+)["']/g)) {
    const spec = m[2];
    if (!spec.startsWith(".")) continue;
    const target = path.posix.normalize(path.posix.join(path.posix.dirname(f), spec));
    if (!exists(target)) { fail(`${f}: imports missing file ${spec}`); continue; }
    const named = /\{([^}]*)\}/.exec(m[1]);
    if (named) {
      for (const raw of named[1].split(",")) {
        const n = raw.trim().split(/\s+as\s+/)[0].trim();
        if (!n) continue;
        if (!exportsOf[target] || !exportsOf[target].has(n)) fail(`${f}: imports { ${n} } which ${target} does not export`);
      }
    }
  }
}

/* -------------------------------------------- html script/style references */
for (const f of fs.readdirSync(path.join(ROOT, "ui"))) {
  if (!f.endsWith(".html")) continue;
  const src = read("ui/" + f);
  for (const m of src.matchAll(/(?:src|href)="([^"]+)"/g)) {
    const r = m[1];
    if (/^https?:|^#|^data:/.test(r)) continue;
    if (!exists(path.posix.join("ui", r))) fail(`ui/${f}: references missing ${r}`);
  }
  if (/<script(?![^>]*type="module")[^>]*src=/.test(src)) fail(`ui/${f}: script tag must be type="module"`);
  if (/\son\w+\s*=\s*"/.test(src)) fail(`ui/${f}: inline event handler will be blocked by extension CSP`);
}

/* ------------------------------------------- chrome APIs vs declared perms */
const declared = new Set(mf ? mf.permissions || [] : []);
const API_PERM = {
  storage: "storage", alarms: "alarms", scripting: "scripting",
  tabs: "tabs", notifications: "notifications"
};
const usedApis = new Set();
for (const f of jsFiles) {
  if (f.startsWith("./test") || f.includes("/test/")) continue;
  for (const m of read(f).matchAll(/chrome\.([a-zA-Z]+)\./g)) usedApis.add(m[1]);
}
for (const api of usedApis) {
  const need = API_PERM[api];
  if (need && !declared.has(need)) fail(`chrome.${api} used but "${need}" is not in manifest permissions`);
}

/* ------------------------------- messages sent vs messages handled */
const handled = new Set();
for (const m of read("background.js").matchAll(/case\s+"([a-zA-Z]+)"\s*:/g)) handled.add(m[1]);
const sent = new Set();
for (const f of jsFiles) {
  if (f === "background.js" || f.startsWith("test/")) continue;
  for (const m of read(f).matchAll(/sendMessage\(\s*\{[^}]*?type:\s*"([a-zA-Z]+)"/gs)) sent.add(m[1]);
  for (const m of read(f).matchAll(/send\(\s*\{\s*type:\s*"([a-zA-Z]+)"/g)) sent.add(m[1]);
}
for (const s of sent) if (!handled.has(s)) fail(`message "${s}" is sent by the UI but background.js has no case for it`);

/* ------------------------------------------- small-screen sanity checks
   These are cheap and catch the things that make a page unusable on a phone
   or in a narrow window, which is otherwise only visible by eyeballing it. */
{
  for (const f of fs.readdirSync(path.join(ROOT, "ui"))) {
    if (!f.endsWith(".html") || f === "popup.html") continue;
    const src = read("ui/" + f);
    if (!/<meta[^>]+name="viewport"/i.test(src)) fail(`ui/${f}: missing a viewport meta tag — it will render zoomed out on phones`);
    for (const m of src.matchAll(/style="[^"]*\bwidth:\s*(\d+)px/gi)) {
      if (Number(m[1]) > 420) fail(`ui/${f}: hard-coded width:${m[1]}px will overflow a phone screen`);
    }
    for (const m of src.matchAll(/min-width:\s*(\d+)px/gi)) {
      if (Number(m[1]) > 360) fail(`ui/${f}: min-width:${m[1]}px will force horizontal scrolling on a phone`);
    }
  }
  const css = read("ui/app.css");
  if (!/@media\s*\(max-width/.test(css)) fail("app.css has no max-width media query — nothing adapts to narrow screens");
  if (!/prefers-reduced-motion/.test(css)) fail("app.css should honour prefers-reduced-motion");
  if (!/prefers-color-scheme/.test(css)) fail("app.css should honour dark mode");
}

/* ---------------------------------- message payloads must survive JSON
   chrome.runtime.sendMessage serialises. A Set or Map arrives on the other side
   as {} — silently, and the receiver explodes on `new Set(...)`. This cost a
   real debugging session, so it is now a build error. */
{
  const bg = read("background.js");
  const setVars = new Set();
  for (const m of bg.matchAll(/(?:const|let|var)\s+([A-Za-z0-9_$]+)\s*=\s*new\s+(Set|Map)\s*\(/g)) setVars.add(m[1]);
  for (const m of bg.matchAll(/(?:return|reply\()\s*\{([^}]*)\}/gs)) {
    const body = m[1];
    for (const v of setVars) {
      // shorthand `{ foo }` or `foo: foo` — but `[...foo]` is fine
      const shorthand = new RegExp(`(^|[,{\\s])${v}\\s*(,|$)`).test(body);
      const asValue = new RegExp(`:\\s*${v}\\s*(,|$)`).test(body);
      if (shorthand || asValue) {
        fail(`background.js returns "${v}" (a Set/Map) across sendMessage — it will arrive as {}. Spread it: [...${v}]`);
      }
    }
  }
}

/* ---------------------------------------------------------- syntax check */
import { execSync } from "node:child_process";
for (const f of jsFiles) {
  try { execSync(`node --input-type=module --check < ${JSON.stringify(path.join(ROOT, f))}`, { stdio: "pipe" }); }
  catch (e) { fail(`${f}: syntax error — ${String(e.stderr || e).split("\n").slice(0, 3).join(" ")}`); }
}

/* ------------------------------------------------------------------ done */
console.log(`checked ${jsFiles.length} scripts, ${Object.keys(exportsOf).length} modules`);
console.log(`chrome APIs used: ${[...usedApis].sort().join(", ")}`);
console.log(`messages: sent ${[...sent].sort().join(", ")}`);
console.log(`          handled ${[...handled].sort().join(", ")}`);
if (problems.length) {
  console.log("\nPROBLEMS:");
  problems.forEach(p => console.log("  ✗ " + p));
  process.exit(1);
}
console.log("\nno structural problems found");
