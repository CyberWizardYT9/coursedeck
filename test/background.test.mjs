import test from 'node:test';
import assert from 'node:assert/strict';
import { Canvas } from '../src/canvas.js';

let state, messageHandler;
const event = { addListener() {} };
globalThis.chrome = {
  runtime: { onInstalled: event, onStartup: event, onMessage: { addListener(fn) { messageHandler = fn; } }, getURL: p => p },
  alarms: { onAlarm: event, clear: async () => {}, create: () => {} },
  notifications: { onClicked: event },
  action: { setBadgeText: async () => {}, setBadgeBackgroundColor: async () => {} },
  storage: { local: { get: async () => structuredClone(state), set: async patch => { state = { ...state, ...patch }; } } }
};
const { sync } = await import('../background.js');
const send = message => new Promise(resolve => messageHandler(message, {}, resolve));
const seed = () => ({ host: 'school.instructure.com', courseCfg: {}, localEvents: [], doneLocal: [], dismissed: [], settings: {}, cache: { host: 'school.instructure.com', user: { id: 1 }, courses: [{ id: 1 }], items: [{ uid: 'n:1', canvasId: 1, source: 'manual', title: 'Delete me' }] } });

test('overlapping refreshes share one request and retain concurrent note additions/deletions', async t => {
  state = seed(); let release, entered, reads = 0, id = 10;
  const enteredPromise = new Promise(r => { entered = r; });
  const gate = new Promise(r => { release = r; });
  for (const [method, result] of Object.entries({ me: { id: 1, name: 'Student' }, courses: [{ id: 1, name: 'Math', short: 'Math', term: 'Fall' }], agendaPages: [], accountCalendars: [], events: [], groups: [], announcements: [], gradedSubmissions: [] })) t.mock.method(Canvas.prototype, method, async () => result);
  t.mock.method(Canvas.prototype, 'assignments', async () => { reads++; entered(); await gate; return []; });
  t.mock.method(Canvas.prototype, 'plannerNotes', async () => [{ id: 1, title: 'Delete me' }]);
  t.mock.method(Canvas.prototype, 'createNote', async () => ({ id: ++id }));
  t.mock.method(Canvas.prototype, 'deleteNote', async () => ({}));
  const first = sync(true); await enteredPromise;
  const second = sync(true);
  const changes = await Promise.all([send({ type: 'addNote', title: 'One', due: null }), send({ type: 'addNote', title: 'Two', due: null }), send({ type: 'deleteNote', canvasId: 1 })]);
  changes.forEach(result => assert.ok(result.ok));
  release(); await Promise.all([first, second]);
  assert.equal(reads, 1);
  assert.ok(state.cache.items.some(i => i.title === 'One'));
  assert.ok(state.cache.items.some(i => i.title === 'Two'));
  assert.ok(!state.cache.items.some(i => i.uid === 'n:1'));
});
test('a refresh for the previous school cannot overwrite the new school', async t => {
  state = seed(); let release, entered;
  const enteredPromise = new Promise(r => { entered = r; }), gate = new Promise(r => { release = r; });
  t.mock.method(Canvas.prototype, 'me', async () => { entered(); await gate; throw new Error('Old school failed'); });
  const pending = sync(true); await enteredPromise;
  state = { ...state, host: 'new.instructure.com', cache: null, lastError: null };
  release(); await assert.rejects(pending);
  assert.equal(state.cache, null); assert.equal(state.lastError, null);
});
test('a missing host releases the refresh latch so setup can retry', async t => {
  state = { ...seed(), host: null };
  await assert.rejects(sync());
  state = seed(); let called = false;
  t.mock.method(Canvas.prototype, 'me', async () => { called = true; throw new Error('expected'); });
  await assert.rejects(sync()); assert.ok(called);
});
