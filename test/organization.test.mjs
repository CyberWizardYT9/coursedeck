import test from 'node:test';
import assert from 'node:assert/strict';
import { fromAssignment, fromPlannerNote, fromEvent, buildStream, counts, isActionable } from '../src/model.js';
import { validateBackup } from '../src/store.js';

const now = '2026-10-03T12:00:00Z';
const course = { id: 1, name: 'Math', short: 'Math' };
const assignment = (id, days, types = ['online_upload'], submission = {}) => fromAssignment({
  id, name: `Assignment ${id}`, submission_types: types,
  due_at: new Date(Date.parse(now) + days * 864e5).toISOString(),
  submission: { workflow_state: 'unsubmitted', ...submission }
}, course);
const stream = (items, opts = {}) => buildStream(items, {}, { now, ...opts });

test('past reminders stay available without increasing overdue counts', () => {
  const item = fromPlannerNote({ id: 1, title: 'Chess meeting', todo_date: '2026-10-02T12:00:00Z' });
  const [result] = stream([item]);
  assert.equal(result.bucket, 'pastReminders'); assert.equal(result.done, false);
  assert.equal(counts([result], now).overdue, 0); assert.equal(counts([result], now).open, 0);
  assert.equal(item.done, false, 'organizing must not mutate the source');
});
test('reminders today still appear in the active list', () => {
  const [result] = stream([fromPlannerNote({ id: 1, todo_date: now })]);
  assert.equal(result.bucket, 'today'); assert.ok(isActionable(result));
});
test('paper tests with a Canvas missing flag go to Check status', () => {
  const [result] = stream([assignment(1, -2, ['on_paper'], { missing: true })]);
  assert.equal(result.bucket, 'review'); assert.equal(result.missing, false);
  assert.equal(result.canvasMissing, true); assert.equal(result.done, false);
  assert.equal(counts([result], now).open, 0);
});
test('external-tool and no-submission work are not assumed missing', () => {
  for (const type of ['external_tool', 'none', 'not_graded']) {
    const [result] = stream([assignment(1, -1, [type], { missing: true })]);
    assert.equal(result.bucket, 'review', type); assert.equal(result.missing, false, type);
  }
});
test('an actual missing online assignment remains actionable', () => {
  const [result] = stream([assignment(1, -2, ['online_upload'], { missing: true })]);
  assert.equal(result.bucket, 'overdue'); assert.equal(result.missing, true);
  assert.equal(counts([result], now).overdue, 1);
});
test('an online option keeps mixed submission types actionable', () => {
  assert.equal(stream([assignment(1, -2, ['on_paper', 'online_upload'])])[0].bucket, 'overdue');
});
test('submission evidence wins over a stale missing flag, without waiting for grades', () => {
  for (const submission of [
    { workflow_state: 'submitted', missing: true },
    { workflow_state: 'pending_review', missing: true },
    { submitted_at: '2026-10-01T12:00:00Z', missing: true },
    { excused: true, missing: true }
  ]) {
    const [result] = stream([assignment(1, -2, ['online_quiz'], submission)]);
    assert.equal(result.bucket, 'done'); assert.equal(result.missing, false);
  }
});
test('a requested resubmission is not completed just because an old timestamp exists', () => {
  const [result] = stream([assignment(1, -2, ['online_upload'], { workflow_state: 'submitted', submitted_at: now, redo_request: true })]);
  assert.equal(result.done, false);
  const [local] = stream([assignment(1, -2, ['online_upload'], { submitted_at: now, redo_request: true })], { doneLocal: ['a:1'] });
  assert.equal(local.canvasComplete, false, 'local completion must remain reversible');
});
test('two-week archive boundary is reversible and independent of Canvas completion', () => {
  const items = stream([assignment(1, -14), assignment(2, -15)]);
  assert.equal(items.find(i => i.uid === 'a:1').bucket, 'overdue');
  assert.equal(items.find(i => i.uid === 'a:2').bucket, 'stale');
  assert.equal(items.find(i => i.uid === 'a:2').done, false);
  assert.equal(stream([assignment(2, -15)], { settings: { assignmentArchiveDays: 30 } })[0].bucket, 'overdue');
});
test('Never preferences keep old assignments and reminders active', () => {
  const items = stream([assignment(1, -90), fromPlannerNote({ id: 2, todo_date: '2026-06-01T12:00:00Z' })], { settings: { assignmentArchiveDays: -1, reminderArchiveDays: -1 } });
  assert.ok(items.every(isActionable)); assert.equal(counts(items, now).overdue, 2);
});
test('Keep in my list restores old items and uncertain work without inventing a missing status', () => {
  const items = stream([assignment(1, -90), assignment(2, -2, ['on_paper'], { missing: true })], { keptActive: ['a:1', 'a:2'] });
  assert.ok(items.every(isActionable)); assert.equal(counts(items, now).overdue, 2);
  assert.equal(items.find(i => i.uid === 'a:2').missing, false);
});
test('marking a paper test finished overrides Check status across refreshes', () => {
  const [result] = stream([assignment(1, -2, ['on_paper'], { missing: true })], { doneLocal: ['a:1'] });
  assert.equal(result.bucket, 'done'); assert.equal(result.missing, false);
});
test('past calendar events never become overdue assignments', () => {
  const [result] = stream([fromEvent({ id: 1, start_at: '2026-10-02T12:00:00Z' })]);
  assert.equal(result.bucket, 'past'); assert.equal(counts([result], now).open, 0);
});
test('cached paper records receive new grouping before the next Canvas sync', () => {
  const [result] = stream([{ uid: 'a:1', kind: 'assignment', source: 'canvas', due: '2026-10-01T12:00:00Z', missing: true, submitLabel: 'on paper — hand it in' }]);
  assert.equal(result.bucket, 'review'); assert.equal(result.missing, false);
});
test('backup validation migrates old preferences and preserves explicitly kept items', () => {
  const old = validateBackup(JSON.stringify({ version: 1 }));
  assert.equal(old.settings.assignmentArchiveDays, 14); assert.equal(old.settings.reminderArchiveDays, 0);
  const restored = validateBackup(JSON.stringify({ version: 1, keptActive: ['a:1'], settings: { assignmentArchiveDays: -1, reminderArchiveDays: 7 } }));
  assert.deepEqual(restored.keptActive, ['a:1']); assert.equal(restored.settings.assignmentArchiveDays, -1);
  assert.throws(() => validateBackup(JSON.stringify({ version: 1, keptActive: [12] })));
  assert.throws(() => validateBackup(JSON.stringify({ version: 1, settings: { assignmentArchiveDays: '14' } })));
});
