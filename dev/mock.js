/* Local preview only. This file is never included in the extension package. */
import { makeFixture, fixtureStream } from './fixture.js';
let state = makeFixture();
const scenario = new URLSearchParams(location.search).get('scenario');
// Deterministic marketing/test captures of the same UI, after its final layout.
if (new URLSearchParams(location.search).has('capture')) {
  const style = document.createElement('style');
  style.textContent = '* { animation: none !important; transition: none !important; scroll-behavior: auto !important; }';
  document.head.append(style);
}
if (scenario === 'empty') { state.cache.items = []; state.cache.grades = []; state.cache.agenda = {}; }
if (scenario === 'offline') state.lastError = { message: 'Network unavailable' };
if (scenario === 'partial') state.cache.warnings = [{ section: 'assignments', courseId: 101, message: 'Biology: showing saved assignments because Canvas could not be reached.' }];
if (scenario === 'dark') state.settings.theme = 'dark';
if (scenario === 'clutter') {
  const date = days => new Date(Date.now() + days * 864e5).toISOString();
  state.cache.items.push(
    { uid: 'a:paper', title: 'Calculus test · taken in class', kind: 'quiz', source: 'canvas', courseId: 103, courseShort: 'Calculus', due: date(-2), submissionTypes: ['on_paper'], missing: true, done: false },
    { uid: 'a:old', title: 'August reading notes', kind: 'assignment', source: 'canvas', courseId: 102, courseShort: 'Literature', due: date(-40), submissionTypes: ['online_upload'], missing: true, done: false },
    { uid: 'n:meeting', title: 'Chess club meeting', kind: 'note', source: 'manual', courseShort: 'Personal', due: date(-1), done: false },
    ...Array.from({ length: 60 }, (_, i) => ({ uid: `n:old-${i}`, title: `Past reminder ${i + 1}`, kind: 'note', source: 'manual', courseShort: 'Personal', due: date(-2 - i), done: false }))
  );
}
const listeners = new Set();
window.chrome = {
  runtime: {
    getURL: p => '/' + p, getManifest: () => ({ version: '2.6.0' }), openOptionsPage: () => { location.href = '/ui/settings.html'; },
    sendMessage: (m, cb) => {
      const work = async () => {
        if (m.type === 'stream') return fixtureStream(state);
        if (m.type === 'state') return { ok: true, state };
        if (m.type === 'verify') return { ok: true, user: state.cache.user };
        if (m.type === 'sync') { await new Promise(r => setTimeout(r, 900)); state.lastError = null; state.cache.syncedAt = new Date().toISOString(); return { ok: true, data: state.cache }; }
        if (m.type === 'addNote') {
          await new Promise(r => setTimeout(r, 650));
          const id = Date.now();
          state.cache.items.push({ uid: 'n:' + id, canvasId: id, kind: 'note', source: 'manual', ...m, description: m.details, done: false });
          return { ok: true, synced: !m.repeat, id };
        }
        if (m.type === 'deleteNote') state.cache.items = state.cache.items.filter(i => i.canvasId !== m.canvasId);
        return { ok: true };
      };
      if (cb) { work().then(cb); return; }
      return work();
    }
  },
  storage: {
    onChanged: { addListener: f => listeners.add(f), removeListener: f => listeners.delete(f) },
    local: {
      get: async key => key === 'syncProgress' ? { syncProgress: { pct: 65, label: 'Reading your classes', startedAt: Date.now() - 500 } } : structuredClone(state),
      set: async patch => { const changes = Object.fromEntries(Object.keys(patch).map(k => [k, { oldValue: state[k], newValue: patch[k] }])); state = { ...state, ...patch }; for (const f of listeners) f(changes, 'local'); },
      clear: async () => { state = makeFixture(); }
    }
  },
  tabs: { create: ({ url }) => { if (url.startsWith('/')) location.href = url; } },
  permissions: { request: async () => true }
};
document.documentElement.dataset.preview = 'true';
const label = document.createElement('div'); label.className = 'preview-notice'; label.textContent = 'PREVIEW · Fictional student data · No Canvas connection'; document.body.prepend(label);
