import test from 'node:test';
import assert from 'node:assert/strict';
import { Canvas, Transport, CanvasError, fullSync } from '../src/canvas.js';

test('concurrent unauthorized reads each retry through the Canvas tab', async () => {
  const t = new Transport('school.instructure.com');
  t.direct = async () => { await new Promise(r => setTimeout(r, 5)); throw new CanvasError('login', 401); };
  let tabCalls = 0; t.viaTab = async () => { tabCalls++; return { body: [] }; };
  await Promise.all([t.request('/one'), t.request('/two')]); assert.equal(tabCalls, 2);
});
test('failed writes are never automatically replayed', async () => {
  const t = new Transport('school.instructure.com'); let repeats = 0;
  t.direct = async () => { throw new TypeError('connection lost'); };
  t.viaTab = async () => { repeats++; };
  await assert.rejects(t.request('/notes', { method: 'POST' })); assert.equal(repeats, 0);
});
test('pagination refuses malformed or silently truncated responses', async () => {
  const c = new Canvas('school.instructure.com');
  c.t.request = async () => ({ body: { error: 'oops' }, link: '' });
  await assert.rejects(c.getAll('/test'));
  c.t.request = async () => ({ body: [{ id: 1 }], link: '<https://school.instructure.com/api/next>; rel="next"' });
  await assert.rejects(c.getAll('/test', 1));
  assert.equal((await c.getAll('/test', 1, true)).length, 1);
});
test('large modules fetch omitted items and deduplicate pages', async () => {
  const c = new Canvas('school.instructure.com'); let extra = false;
  c.getAll = async path => {
    if (path.includes('/modules/2/items')) { extra = true; return [{ type: 'Page', page_url: 'week-20', title: 'Week 20' }]; }
    return [{ id: 1, items_count: 1, items: [{ type: 'Page', page_url: 'week-20', title: 'Week 20' }] }, { id: 2, items_count: 1 }];
  };
  const pages = await c.agendaPages(1); assert.ok(extra); assert.equal(pages.length, 1);
});
test('full sync keeps saved work for a failed class and loads weekly pages beyond 16', async t => {
  const p = Canvas.prototype;
  for (const [method, result] of Object.entries({ me: { id: 1, name: 'Student' }, courses: [{ id: 1, name: 'Biology', short: 'Bio', term: 'Fall' }, { id: 2, name: 'Math', short: 'Math', term: 'Fall' }], accountCalendars: [], events: [], plannerNotes: [], groups: [], announcements: [], gradedSubmissions: [] })) t.mock.method(p, method, async () => result);
  t.mock.method(p, 'assignments', async id => { if (id === 1) throw new Error('offline'); return [{ id: 22, name: 'Fresh work' }]; });
  t.mock.method(p, 'agendaPages', async id => id === 2 ? Array.from({ length: 20 }, (_, i) => ({ title: 'Week ' + (i + 1), pageUrl: 'week-' + (i + 1) })) : []);
  t.mock.method(p, 'page', async (_id, page) => ({ text: page, title: page }));
  const previous = { host: 'school.instructure.com', user: { id: 1 }, items: [{ uid: 'a:11', courseId: 1, title: 'Keep this work' }] };
  const result = await fullSync('school.instructure.com', { previous });
  assert.ok(result.items.some(i => i.uid === 'a:11'));
  assert.ok(result.items.some(i => i.uid === 'a:22'));
  assert.ok(result.warnings.some(w => w.courseId === 1));
  assert.equal(result.agenda[2].pages.length, 20);
  const otherUser = await fullSync('school.instructure.com', { previous: { ...previous, user: { id: 99 } } });
  assert.ok(!otherUser.items.some(i => i.uid === 'a:11'));
});
