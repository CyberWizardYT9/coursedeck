/* Local preview only. This file is never included in the extension package. */
import { makeFixture, fixtureStream } from './fixture.js';
let state = makeFixture();
const scenario = new URLSearchParams(location.search).get('scenario');
if (scenario === 'empty') { state.cache.items = []; state.cache.grades = []; state.cache.agenda = {}; }
if (scenario === 'offline') state.lastError = { message: 'Network unavailable' };
if (scenario === 'partial') state.cache.warnings = [{ section: 'assignments', courseId: 101, message: 'Biology: showing saved assignments because Canvas could not be reached.' }];
if (scenario === 'dark') state.settings.theme = 'dark';
const listeners = new Set();
window.chrome = {
  runtime: {
    getURL: p => '/' + p, getManifest: () => ({ version: '2.5.0' }), openOptionsPage: () => { location.href = '/ui/settings.html'; },
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
