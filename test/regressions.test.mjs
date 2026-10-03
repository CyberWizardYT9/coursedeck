import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeHost, shiftMonth, toICS, fromEvent, bucketOf, counts, parseAgenda, resolveAgendaDate, expandRepeats } from '../src/model.js';
import { validateBackup, importBackup, switchSchool } from '../src/store.js';

test('pasted Canvas URLs normalize without stripping valid www subdomains', () => {
  assert.equal(normalizeHost(' HTTPS://WWW.CANVAS.SCHOOL.EDU/courses/4?x=1 '), 'www.canvas.school.edu');
  assert.equal(normalizeHost('school.instructure.com'), 'school.instructure.com');
  for (const input of ['javascript:alert(1)', 'school.com"><img', 'user:pass@school.com', 'school.com:8443', 'localhost', 'school.com <b>']) assert.throws(() => normalizeHost(input));
});
test('month navigation cannot skip February on the 31st', () => {
  const next = shiftMonth(new Date(2026, 0, 31), 1);
  assert.equal(next.getMonth(), 1); assert.equal(next.getDate(), 1);
  assert.equal(shiftMonth(new Date(2026, 2, 31), -1).getMonth(), 1);
  assert.equal(shiftMonth(new Date(2026, 11, 31), 1).getFullYear(), 2027);
});
test('all-day events preserve Canvas calendar date in export', () => {
  const event = fromEvent({ id: 1, title: 'School closed', start_at: '2026-10-03T00:00:00Z', all_day: true, all_day_date: '2026-10-03' });
  const ics = toICS([event]);
  assert.match(ics, /DTSTART;VALUE=DATE:20261003/);
  assert.match(ics, /DTEND;VALUE=DATE:20261004/);
  assert.doesNotMatch(ics, /DTSTART:2026/);
});
test('calendar export folds UTF-8 without splitting characters', () => {
  const title = '🧪 Révision 日本語 '.repeat(40);
  const ics = toICS([{ uid: 'a:1', title, due: '2026-10-03T10:00:00Z' }]);
  for (const line of ics.split('\r\n')) assert.ok(Buffer.byteLength(line, 'utf8') <= 75, line);
  assert.ok(ics.replace(/\r\n /g, '').includes(title));
  assert.doesNotMatch(ics, /�/);
});
test('past events do not become overdue coursework or inflate open counts', () => {
  const event = { kind: 'event', due: '2026-10-02T09:00:00Z', endAt: '2026-10-02T10:00:00Z' };
  const now = '2026-10-03T12:00:00Z';
  assert.equal(bucketOf(event, now), 'past');
  assert.equal(counts([event], now).open, 0);
  assert.equal(counts([event], now).overdue, 0);
});
test('agenda honors explicit years and rejects impossible dates', () => {
  const parsed = parseAgenda('| 10/3/2024 | Thursday | Historical plan | Read chapter 1', '2026-10-03T12:00:00Z');
  assert.equal(new Date(parsed.days[0].date).getFullYear(), 2024);
  assert.equal(resolveAgendaDate(2, 30, '2026-01-01'), null);
  assert.equal(parseAgenda('| 2/30 | Monday | Impossible date', '2026-01-01').kind, 'raw');
});
test('invalid repeat dates cannot trap expansion in a loop', () => {
  assert.deepEqual(expandRepeats({ repeat: 'daily', due: 'invalid' }, '2026-01-01', '2026-02-01'), []);
});
test('backup validation rejects corrupt data before writes', async () => {
  let writes = 0;
  globalThis.chrome = { storage: { local: { set: async () => { writes++; } } } };
  await assert.rejects(importBackup(JSON.stringify({ version: 1, localEvents: 'broken' })));
  await assert.rejects(importBackup(JSON.stringify({ version: 1, courseCfg: { 1: { color: 'red;display:none' } } })));
  await assert.rejects(importBackup(JSON.stringify({ version: 1, host: 'x.com"><img' })));
  assert.equal(writes, 0);
  assert.equal(validateBackup(JSON.stringify({ version: 1, host: 'school.instructure.com' })).host, 'school.instructure.com');
});
test('backup restore invalidates old school cache', async () => {
  let patch;
  globalThis.chrome = { storage: { local: { set: async p => { patch = p; } } } };
  await importBackup(JSON.stringify({ version: 1, host: 'school.instructure.com' }));
  assert.equal(patch.cache, null); assert.equal(patch.lastError, null);
});
test('switching schools keeps local reminders separate and restores them on return', async () => {
  let state = { host: 'one.instructure.com', localEvents: [{ id: 'one', title: 'Personal reminder' }], courseCfg: { 1: { hidden: true } }, doneLocal: ['a:1'], dismissed: [] };
  globalThis.chrome = { storage: { local: { get: async () => structuredClone(state), set: async patch => { state = { ...state, ...patch }; } } } };
  await switchSchool('two.instructure.com'); assert.equal(state.localEvents.length, 0);
  await switchSchool('one.instructure.com'); assert.equal(state.localEvents[0].id, 'one'); assert.deepEqual(state.doneLocal, ['a:1']);
});
