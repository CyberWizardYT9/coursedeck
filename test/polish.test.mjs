import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { JSDOM } from 'jsdom';
import { makeFixture, fixtureStream } from '../dev/fixture.js';

const strip = s => s.replace(/^\s*import[\s\S]*?from\s+["'][^"']+["'];?$/gm, '').replace(/^export\s+/gm, '');
const tick = () => new Promise(r => setTimeout(r, 15));
async function boot(t, page = 'dashboard', configure = () => {}) {
  let state = makeFixture(); configure(state);
  const dom = new JSDOM(fs.readFileSync(`ui/${page}.html`, 'utf8'), { url: `https://extension.test/ui/${page}.html`, runScripts: 'outside-only' });
  const w = dom.window, d = w.document, errors = [], messages = [];
  t.after(() => { dom.window.close(); assert.deepEqual(errors, []); });
  w.scrollTo = () => {}; w.TextEncoder = TextEncoder;
  w.addEventListener('error', e => errors.push(e.message));
  w.chrome = {
    runtime: { getManifest: () => ({ version: '2.5.0' }), getURL: p => 'https://extension.test/' + p, openOptionsPage: () => {}, sendMessage: (m, cb) => { messages.push(m); cb(m.type === 'stream' ? fixtureStream(state) : { ok: true }); } },
    storage: { local: { get: async () => structuredClone(state), set: async patch => { state = { ...state, ...patch }; } } },
    tabs: { create() {} }, permissions: { request: async () => true }
  };
  w.eval(['src/model.js', 'src/store.js', 'ui/shared.js', `ui/${page}.js`].map(p => strip(fs.readFileSync(p, 'utf8'))).join('\n'));
  await tick(); assert.deepEqual(errors, []);
  const input = (selector, value, type = 'input') => { const el = d.querySelector(selector); el.value = value; el.dispatchEvent(new w.Event(type, { bubbles: true })); };
  return { w, d, state: () => state, input, messages, errors };
}

test('old reminders and unconfirmed paper tests remain collapsed without overdue badges', async t => {
  const { d } = await boot(t, 'dashboard', s => {
    const due = new Date(Date.now() - 2 * 864e5).toISOString();
    s.cache.items.push({ uid: 'a:paper', title: 'Paper test', source: 'canvas', kind: 'quiz', submissionTypes: ['on_paper'], missing: true, due });
    s.cache.items.push(...Array.from({ length: 100 }, (_, i) => ({ uid: 'n:old' + i, title: 'Old reminder', kind: 'note', source: 'manual', due })));
  });
  assert.ok(d.querySelector('[data-g="review"]').classList.contains('closed'));
  assert.ok(d.querySelector('[data-g="pastReminders"]').classList.contains('closed'));
  assert.equal(d.querySelector('[data-uid="a:paper"] .badge.warn'), null);
  assert.match(d.querySelector('[data-f="late"]').textContent, /^1/);
  assert.match(d.querySelector('#resultCount').textContent, /^12 /);
});
test('search finds old work and Keep in my list restores it with undo', async t => {
  const { d, input, state } = await boot(t, 'dashboard', s => {
    s.cache.items.push({ uid: 'n:old', title: 'Call my tutor', source: 'manual', kind: 'note', due: new Date(Date.now() - 50 * 864e5).toISOString() });
  });
  input('#search', 'Call my tutor');
  assert.ok(!d.querySelector('[data-g="pastReminders"]').classList.contains('closed'));
  d.querySelector('[data-uid="n:old"] .act-keep').click(); await tick();
  assert.ok(state().keptActive.includes('n:old'));
  assert.ok(d.querySelector('[data-g="overdue"] [data-uid="n:old"]'));
  d.querySelector('.toast button').click(); await tick();
  assert.ok(!state().keptActive.includes('n:old'));
  assert.ok(d.querySelector('[data-g="pastReminders"] [data-uid="n:old"]'));
});
test('quiet items stay out of popup and expired club announcements stay out of summaries', async t => {
  const configure = s => {
    s.cache.items.push({ uid: 'n:old', title: 'Expired meeting', kind: 'note', source: 'manual', due: new Date(Date.now() - 864e5).toISOString() });
    s.cache.announcements.push({ courseId: 106, title: 'August club news', posted: new Date(Date.now() - 60 * 864e5).toISOString() });
  };
  const popup = await boot(t, 'popup', configure);
  assert.ok(!popup.d.querySelector('#body').textContent.includes('Expired meeting'));
  const dashboard = await boot(t, 'dashboard', configure);
  assert.ok(!dashboard.d.querySelector('#clubs').textContent.includes('August club news'));
});
test('organization preferences save and survive a settings repaint', async t => {
  const { d, input, state } = await boot(t, 'settings');
  assert.equal(d.querySelector('#assignmentArchiveDays').value, '14');
  assert.equal(d.querySelector('#reminderArchiveDays').value, '0');
  input('#assignmentArchiveDays', '30', 'change'); await tick();
  input('#reminderArchiveDays', '-1', 'change'); await tick();
  assert.equal(state().settings.assignmentArchiveDays, 30);
  assert.equal(state().settings.reminderArchiveDays, -1);
});
test('search, class and time filters compose, and clear resets them all', async t => {
  const { d, input } = await boot(t);
  input('#search', 'integration'); assert.equal(d.querySelectorAll('#list .item').length, 2);
  d.querySelector('[data-course-filter="103"]').click();
  d.querySelector('[data-f="today"]').click(); assert.equal(d.querySelectorAll('#list .item').length, 1);
  assert.match(d.querySelector('#list').textContent, /Integration by parts/);
  input('#search', 'no match'); assert.match(d.querySelector('#list').textContent, /No matching coursework/);
  d.querySelector('#clearFilters').click(); assert.equal(d.querySelector('#search').value, ''); assert.ok(d.querySelectorAll('#list .item').length > 10);
});
test('next seven days excludes overdue and completed work', async t => {
  const { d } = await boot(t); d.querySelector('[data-f="soon"]').click();
  assert.equal(d.querySelectorAll('#list .b-overdue, #list .done').length, 0);
  assert.equal(d.querySelector('[data-f="soon"] b').textContent, String(d.querySelectorAll('#list .item').length));
});
test('date sorting works within a due-date group', async t => {
  const { d, input } = await boot(t); input('#sort', 'due', 'change');
  const names = [...d.querySelectorAll('[data-g="week"] .it')].map(n => n.textContent);
  assert.ok(names.indexOf('Chapter 6 reading notes') < names.indexOf('Applications of integration quiz'));
});
test('task details and groups expose keyboard-operable expanded states', async t => {
  const { d } = await boot(t);
  const task = d.querySelector('.item-toggle'); assert.equal(task.tagName, 'BUTTON');
  task.click(); assert.equal(task.getAttribute('aria-expanded'), 'true');
  const group = d.querySelector('.ghead'); group.click(); assert.equal(group.getAttribute('aria-expanded'), 'false');
});
test('complete and hide actions provide working undo', async t => {
  const { d, state } = await boot(t);
  d.querySelector('[data-uid="a:1"] input').click(); await tick();
  assert.ok(state().doneLocal.includes('a:1'));
  d.querySelector('.toast button').click(); await tick(); assert.ok(!state().doneLocal.includes('a:1'));
  d.querySelector('[data-uid="a:1"] .act-hide').click(); await tick(); assert.ok(state().dismissed.includes('a:1'));
  d.querySelector('.toast button').click(); await tick(); assert.ok(!state().dismissed.includes('a:1'));
});
test('reminder dialog traps focus and Escape returns it to its opener', async t => {
  const { w, d } = await boot(t);
  const add = d.querySelector('#add'); add.focus(); add.click();
  assert.equal(d.activeElement.id, 'f-title');
  d.querySelector('#f-save').focus(); d.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
  assert.equal(d.activeElement.id, 'f-title');
  d.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert.ok(!d.querySelector('#modal').classList.contains('on')); assert.equal(d.activeElement, add);
});
test('repeating reminders require a start date and report local persistence accurately', async t => {
  const { d, input, messages } = await boot(t);
  d.querySelector('#add').click(); input('#f-title', 'Practice'); input('#f-repeat', 'daily', 'change'); input('#f-due', '');
  d.querySelector('#f-save').click(); assert.ok(!messages.some(m => m.type === 'addNote')); assert.match(d.querySelector('#f-hint').textContent, /starting date/);
  input('#f-due', '2026-10-03T16:00'); d.querySelector('#f-save').click(); await tick();
  assert.match(d.querySelector('#toasts').textContent, /Repeating reminder saved/); assert.doesNotMatch(d.querySelector('#toasts').textContent, /would not accept/);
});
test('hidden classes stay hidden in grades and week plans', async t => {
  const { d } = await boot(t, 'dashboard', s => { s.courseCfg[101].hidden = true; });
  assert.ok(!d.querySelector('#gSummary').textContent.includes('Biology'));
  assert.equal(d.querySelectorAll('#wpTabs button').length, 0);
});
test('week start preference is reflected in accessible calendar controls', async t => {
  const { d } = await boot(t, 'dashboard', s => { s.settings.weekStart = 1; });
  assert.equal(d.querySelector('#cal .h').textContent, 'Mon');
  assert.equal(d.querySelector('#cal [data-day]').tagName, 'BUTTON');
  assert.ok(d.querySelector('#cal [aria-current="date"]'));
});
test('partial sync warnings keep saved assignments visible', async t => {
  const { d } = await boot(t, 'dashboard', s => { s.cache.warnings = [{ message: 'Biology: saved assignments shown.' }]; });
  assert.match(d.querySelector('#banner').textContent, /could not be refreshed/); assert.ok(d.querySelector('#list .item'));
});
test('all companion surfaces boot with the saved appearance preference', async t => {
  for (const page of ['popup', 'settings', 'setup']) {
    const { d } = await boot(t, page, s => { s.settings.theme = 'dark'; });
    assert.equal(d.documentElement.dataset.theme, 'dark', page);
  }
});
test('popup retains cached work after sign-out and opens manual notes in the workspace', async t => {
  const { d } = await boot(t, 'popup', s => { s.lastError = { message: '401 signed out' }; });
  assert.ok(d.querySelector('.popup-notice')); assert.ok(d.querySelectorAll('.mini').length > 0);
  const note = [...d.querySelectorAll('.mini a')].find(a => a.textContent.includes('Study for'));
  assert.match(note.href, /ui\/dashboard.html$/);
});
test('host validation rejects markup before permissions or storage writes', async t => {
  const { d, input, state, messages } = await boot(t, 'setup');
  input('#host', 'school.com"><img>'); d.querySelector('#check').click(); await tick();
  assert.equal(state().host, 'example.instructure.com'); assert.ok(!messages.some(m => m.type === 'verify'));
  assert.equal(d.querySelectorAll('#msg img').length, 0);
});
