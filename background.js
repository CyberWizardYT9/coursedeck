/* Coursedeck — service worker. Owns syncing, the badge and reminders. */

import { fullSync, Canvas } from "./src/canvas.js";
import { getState, setState, addLocalEvent } from "./src/store.js";
import { buildStream, fromLocalEvent, fromPlannerNote, expandRepeats, counts } from "./src/model.js";

const ALARM_SYNC = "coursedeck-sync";
const ALARM_NUDGE = "coursedeck-nudge";

chrome.runtime.onInstalled.addListener(async (details) => {
  const s = await getState();
  await scheduleAlarms(s.settings.syncMinutes);
  if (details.reason === "install" || !s.host) {
    chrome.tabs.create({ url: chrome.runtime.getURL("ui/setup.html") });
  }
});

chrome.runtime.onStartup.addListener(async () => {
  const s = await getState();
  await scheduleAlarms(s.settings.syncMinutes);
  if (s.host) sync().catch(() => {});
});

async function scheduleAlarms(minutes) {
  await chrome.alarms.clear(ALARM_SYNC);
  await chrome.alarms.clear(ALARM_NUDGE);
  chrome.alarms.create(ALARM_SYNC, { periodInMinutes: Math.max(15, minutes || 30), delayInMinutes: 1 });
  chrome.alarms.create(ALARM_NUDGE, { periodInMinutes: 60, delayInMinutes: 5 });
}

chrome.alarms.onAlarm.addListener(async (a) => {
  if (a.name === ALARM_SYNC) sync().catch(() => {});
  if (a.name === ALARM_NUDGE) nudge().catch(() => {});
});

/* ------------------------------------------------------------------ sync */

let syncing = null;

export async function sync(force) {
  if (syncing && !force) return syncing;
  syncing = (async () => {
    const s = await getState();
    if (!s.host) throw new Error("No Canvas host configured yet.");
    const startedAt = Date.now();
    try {
      const data = await fullSync(s.host, {
        /* Written to storage rather than messaged, so a dashboard opened
           part-way through a sync still sees where it has got to. */
        onProgress: p => {
          chrome.storage.local.set({
            syncProgress: { ...p, startedAt, at: Date.now(), running: true }
          }).catch(() => {});
        }
      });
      await chrome.storage.local.set({
        syncProgress: { done: 1, total: 1, pct: 100, label: "Done", startedAt, at: Date.now(), running: false }
      }).catch(() => {});
      await setState({ cache: data, lastError: null });
      await refreshBadge();
      return data;
    } catch (err) {
      await chrome.storage.local.set({
        syncProgress: { pct: 0, label: "Failed", startedAt, at: Date.now(), running: false }
      }).catch(() => {});
      await setState({
        lastError: { message: String(err && err.message || err), at: new Date().toISOString(), code: err && err.code }
      });
      await refreshBadge();
      throw err;
    } finally {
      syncing = null;
    }
  })();
  return syncing;
}

/* Assemble the merged stream the UI and badge both read. */
export async function stream() {
  const s = await getState();
  if (!s.cache) return { items: [], state: s, activityIds: [] };
  const now = new Date().toISOString();
  const horizonStart = new Date(Date.now() - 7 * 864e5).toISOString();
  const horizonEnd = new Date(Date.now() + 120 * 864e5).toISOString();

  const local = [];
  for (const ev of s.localEvents) {
    const base = fromLocalEvent(ev);
    if (ev.repeat) local.push(...expandRepeats(base, horizonStart, horizonEnd));
    else local.push(base);
  }

  const hidden = Object.entries(s.courseCfg).filter(([, c]) => c.hidden).map(([id]) => id);
  const activityIds = new Set(
    s.cache.courses.filter(c => {
      const cfg = s.courseCfg[String(c.id)] || {};
      return cfg.activity !== undefined ? cfg.activity : c.activity;
    }).map(c => String(c.id))
  );

  let raw = [...s.cache.items, ...local];
  if (!s.settings.showActivities) raw = raw.filter(i => !activityIds.has(String(i.courseId)));

  const items = buildStream(raw, s.courseCfg, {
    now, hiddenCourses: hidden, dismissed: s.dismissed, doneLocal: s.doneLocal
  });
  /* IMPORTANT: everything returned here crosses chrome.runtime.sendMessage,
     which serialises via JSON. A Set arrives on the other side as {} and blows
     up any `new Set(...)`. Always send a plain array. */
  return { items, state: s, activityIds: [...activityIds] };
}

async function refreshBadge() {
  try {
    const { items } = await stream();
    const c = counts(items);
    const n = c.overdue + c.today;
    await chrome.action.setBadgeText({ text: n ? String(n) : "" });
    await chrome.action.setBadgeBackgroundColor({ color: c.overdue ? "#c0362c" : "#b06c12" });
  } catch { /* badge is cosmetic */ }
}

/* --------------------------------------------------------------- reminders */

async function nudge() {
  const s = await getState();
  if (!s.settings.notifications) return;
  const { items } = await stream();
  const horizon = s.settings.notifyHoursAhead || 24;
  const soon = items.filter(i =>
    !i.done && i.due && i.kind !== "event" &&
    (new Date(i.due) - Date.now()) / 3600000 <= horizon &&
    new Date(i.due) > Date.now()
  );
  if (!soon.length) return;

  const seen = new Set((await chrome.storage.local.get("notified")).notified || []);
  const fresh = soon.filter(i => !seen.has(i.uid)).slice(0, 3);
  if (!fresh.length) return;

  for (const i of fresh) {
    const when = new Date(i.due).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" });
    chrome.notifications.create(`cd:${i.uid}`, {
      type: "basic",
      iconUrl: chrome.runtime.getURL("icons/128.png"),
      title: `${i.courseShort} — due ${when}`,
      message: i.title + (i.points ? ` · ${i.points} pts` : ""),
      priority: 1
    });
    seen.add(i.uid);
  }
  await chrome.storage.local.set({ notified: [...seen].slice(-300) });
}

chrome.notifications.onClicked.addListener((id) => {
  chrome.tabs.create({ url: chrome.runtime.getURL("ui/dashboard.html") });
  chrome.notifications.clear(id);
});

/* ------------------------------------------------------------- messaging */

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  (async () => {
    try {
      switch (msg.type) {
        case "sync":        reply({ ok: true, data: await sync(true) }); break;
        case "stream":      reply({ ok: true, ...(await stream()) }); break;
        case "state":       reply({ ok: true, state: await getState() }); break;
        case "badge":       await refreshBadge(); reply({ ok: true }); break;
        case "setSchedule": await scheduleAlarms(msg.minutes); reply({ ok: true }); break;

        case "addNote": {
          const s = await getState();
          // Try Canvas first so the item shows up on every device and in the
          // official Canvas app. Fall back to local storage if that fails.
          if (!msg.repeat && s.host) {
            try {
              const api = new Canvas(s.host);
              const note = await api.createNote({
                title: msg.title, details: msg.details || "",
                todo_date: msg.due, course_id: msg.courseId || undefined
              });
              /* Splice it into the cache directly. A full re-sync here is what
                 made adding a reminder feel like it had hung. */
              const cur = await getState();
              if (cur.cache && Array.isArray(cur.cache.items)) {
                const course = (cur.cache.courses || []).find(c => String(c.id) === String(msg.courseId));
                await setState({ cache: { ...cur.cache, items: [
                  ...cur.cache.items,
                  fromPlannerNote({ id: note.id, title: msg.title, details: msg.details || "",
                    todo_date: msg.due, workflow_state: "active", course_id: msg.courseId || null },
                    course ? { id: course.id, name: course.name, short: course.short } : null)
                ] } });
              }
              await refreshBadge();
              reply({ ok: true, synced: true, id: note.id });
              return;
            } catch (e) { /* fall through to local */ }
          }
          const item = await addLocalEvent({
            title: msg.title, details: msg.details || "", due: msg.due,
            courseId: msg.courseId || null, courseName: msg.courseName || "Personal",
            courseShort: msg.courseShort || "Personal", kind: msg.kind || "note", repeat: msg.repeat || null
          });
          await refreshBadge();
          reply({ ok: true, synced: false, id: item.id });
          break;
        }

        case "agenda": {
          const s = await getState();
          if (!s.host) { reply({ ok: false, error: "no host" }); break; }
          const page = await new Canvas(s.host).page(msg.courseId, msg.pageUrl);
          reply({ ok: true, page });
          break;
        }

        case "verify": {
          await scheduleAlarms((await getState()).settings.syncMinutes);
          // used by setup: confirm a host is reachable and the user is signed in
          const api = new Canvas(msg.host);
          const user = await api.me();
          reply({ ok: true, user: { id: user.id, name: user.name } });
          break;
        }

        case "deleteNote": {
          const s = await getState();
          if (!msg.canvasId || !s.host) { reply({ ok: false, error: "nothing to delete" }); break; }
          try {
            await new Canvas(s.host).deleteNote(msg.canvasId);
          } catch (e) {
            reply({ ok: false, error: String((e && e.message) || e) });
            break;
          }
          /* Drop it from the cache instead of re-running a 40-second full sync.
             That delay was why deleting looked like it did nothing at all. */
          if (s.cache && Array.isArray(s.cache.items)) {
            const uid = "n:" + msg.canvasId;
            await setState({ cache: { ...s.cache, items: s.cache.items.filter(i => i.uid !== uid) } });
          }
          await refreshBadge();
          reply({ ok: true });
          break;
        }

        default: reply({ ok: false, error: "unknown message " + msg.type });
      }
    } catch (err) {
      reply({ ok: false, error: String((err && err.message) || err) });
    }
  })();
  return true;   // async reply
});
