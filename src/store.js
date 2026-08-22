/* Coursedeck — storage layer. Everything lives in chrome.storage.local on the
   student's own machine. Nothing is sent anywhere. */

const DEFAULTS = {
  host: null,                 // e.g. "sta.instructure.com"
  courseCfg: {},              // courseId -> {latePolicy, effort, nickname, color, hidden, activity, pinned}
  localEvents: [],            // manual items that failed to write to Canvas, or repeating ones
  doneLocal: [],              // uids ticked off by hand (on-paper work Canvas never marks)
  dismissed: [],              // uids hidden for good
  settings: {
    syncMinutes: 30,
    notifyHoursAhead: 24,
    notifications: true,
    showActivities: false,   // clubs get their own tab; they used to flood the list
    weekStart: 0,
    density: "compact"
  },
  cache: null,                // last fullSync payload
  lastError: null
};

export async function getState() {
  const got = await chrome.storage.local.get(null);
  return {
    ...DEFAULTS, ...got,
    settings: { ...DEFAULTS.settings, ...(got.settings || {}) },
    courseCfg: { ...(got.courseCfg || {}) }
  };
}

export async function setState(patch) {
  await chrome.storage.local.set(patch);
  return getState();
}

export async function setCourseCfg(courseId, patch) {
  const s = await getState();
  const cfg = { ...s.courseCfg };
  cfg[String(courseId)] = { ...(cfg[String(courseId)] || {}), ...patch };
  await chrome.storage.local.set({ courseCfg: cfg });
  return cfg;
}

export async function toggleDone(uid, done) {
  const s = await getState();
  const set = new Set(s.doneLocal);
  if (done) set.add(uid); else set.delete(uid);
  await chrome.storage.local.set({ doneLocal: [...set] });
  return [...set];
}

export async function dismiss(uid) {
  const s = await getState();
  const set = new Set(s.dismissed);
  set.add(uid);
  await chrome.storage.local.set({ dismissed: [...set] });
  return [...set];
}

export async function addLocalEvent(ev) {
  const s = await getState();
  const item = { id: crypto.randomUUID(), created: new Date().toISOString(), ...ev };
  await chrome.storage.local.set({ localEvents: [...s.localEvents, item] });
  return item;
}

export async function updateLocalEvent(id, patch) {
  const s = await getState();
  const list = s.localEvents.map(e => (e.id === id ? { ...e, ...patch } : e));
  await chrome.storage.local.set({ localEvents: list });
  return list;
}

export async function removeLocalEvent(id) {
  const s = await getState();
  await chrome.storage.local.set({ localEvents: s.localEvents.filter(e => e.id !== id) });
}

export async function exportBackup() {
  const s = await getState();
  return JSON.stringify({
    version: 1, exported: new Date().toISOString(),
    host: s.host, courseCfg: s.courseCfg, localEvents: s.localEvents,
    doneLocal: s.doneLocal, dismissed: s.dismissed, settings: s.settings
  }, null, 2);
}

export async function importBackup(json) {
  const d = JSON.parse(json);
  if (!d || d.version !== 1) throw new Error("Not a Coursedeck backup file");
  await chrome.storage.local.set({
    host: d.host || null,
    courseCfg: d.courseCfg || {},
    localEvents: d.localEvents || [],
    doneLocal: d.doneLocal || [],
    dismissed: d.dismissed || [],
    settings: { ...DEFAULTS.settings, ...(d.settings || {}) }
  });
}
