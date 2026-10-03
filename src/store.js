/* Coursedeck — storage layer. Everything lives in chrome.storage.local on the
   student's own machine. Nothing is sent anywhere. */
import { normalizeHost } from "./model.js";

const DEFAULTS = {
  host: null,                 // e.g. "sta.instructure.com"
  courseCfg: {},              // courseId -> {latePolicy, effort, nickname, color, hidden, activity, pinned}
  localEvents: [],            // manual items that failed to write to Canvas, or repeating ones
  doneLocal: [],              // uids ticked off by hand (on-paper work Canvas never marks)
  dismissed: [],              // uids hidden for good
  keptActive: [],             // dated items explicitly kept in the main list
  settings: {
    syncMinutes: 30,
    notifyHoursAhead: 24,
    notifications: true,
    showActivities: false,   // clubs get their own tab; they used to flood the list
    weekStart: 0,
    density: "compact",
    theme: "system",
    assignmentArchiveDays: 14,
    reminderArchiveDays: 0
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

export async function keepActive(uid, active) {
  const s = await getState(), ids = new Set(s.keptActive);
  if (active) ids.add(uid); else ids.delete(uid);
  await chrome.storage.local.set({ keptActive: [...ids] });
}

/* Keep local work separate and recoverable when moving between schools. */
export async function switchSchool(host) {
  const target = normalizeHost(host), state = await getState();
  if (state.host === target) return setState({ host: target, lastError: null });
  const profiles = { ...(state.schoolProfiles || {}) };
  if (state.host) profiles[state.host] = { courseCfg: state.courseCfg, localEvents: state.localEvents, doneLocal: state.doneLocal, dismissed: state.dismissed, keptActive: state.keptActive };
  const profile = { courseCfg: {}, localEvents: [], doneLocal: [], dismissed: [], keptActive: [], ...(profiles[target] || {}) };
  return setState({ ...profile, schoolProfiles: profiles, host: target, cache: null, lastError: null, notified: [], syncProgress: null });
}

export async function restoreDismissed(uid) {
  const s = await getState();
  await chrome.storage.local.set({ dismissed: s.dismissed.filter(id => id !== uid) });
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
    doneLocal: s.doneLocal, dismissed: s.dismissed, keptActive: s.keptActive, settings: s.settings
  }, null, 2);
}

export async function importBackup(json) {
  const d = validateBackup(json);
  await chrome.storage.local.set({ ...d, cache: null, lastError: null, notified: [], syncProgress: null });
}

export function validateBackup(json) {
  const d = JSON.parse(json);
  if (!d || d.version !== 1) throw new Error("Not a Coursedeck backup file");
  const record = x => x && typeof x === "object" && !Array.isArray(x);
  if (!record(d.courseCfg || {}) || !record(d.settings || {}) ||
      ![d.localEvents || [], d.doneLocal || [], d.dismissed || [], d.keptActive || []].every(Array.isArray)) throw new Error("Invalid backup structure");
  if (![...(d.doneLocal || []), ...(d.dismissed || []), ...(d.keptActive || [])].every(x => typeof x === "string")) throw new Error("Invalid saved item IDs");
  for (const [id, cfg] of Object.entries(d.courseCfg || {})) {
    if (!/^\d+$/.test(id) || !record(cfg) || (cfg.color && !/^#[a-f\d]{6}$/i.test(cfg.color))) throw new Error("Invalid course settings");
  }
  for (const item of d.localEvents || []) {
    if (!record(item) || typeof item.id !== "string" || typeof item.title !== "string" ||
      (item.due && isNaN(new Date(item.due))) ||
      (item.repeat && (!item.due || !["daily", "weekly", "biweekly"].includes(item.repeat)))) throw new Error("Invalid reminder");
  }
  const settings = { ...DEFAULTS.settings, ...(d.settings || {}) };
  if (![15, 30, 60, 180].includes(Number(settings.syncMinutes)) || ![6, 12, 24, 48].includes(Number(settings.notifyHoursAhead))) throw new Error("Invalid reminder settings");
  settings.theme = ["light", "dark"].includes(settings.theme) ? settings.theme : "system";
  if (![7, 14, 30, 45, -1].includes(settings.assignmentArchiveDays) || ![0, 3, 7, 14, -1].includes(settings.reminderArchiveDays)) throw new Error("Invalid archive settings");
  return {
    host: d.host ? normalizeHost(d.host) : null,
    courseCfg: d.courseCfg || {},
    localEvents: d.localEvents || [],
    doneLocal: d.doneLocal || [],
    dismissed: d.dismissed || [],
    keptActive: d.keptActive || [],
    settings
  };
}
