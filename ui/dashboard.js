import {
  LATE_POLICY, colorFor, toICS, counts, daysUntil,
  parseAgenda, pickAgendaPage, agendaCoversToday, bucketOf,
  gradeStats, gradeLetter, gradeTone, shiftMonth, dayKey, isActionable, needsCompletionCheck
} from "../src/model.js";
import { getState, setState, setCourseCfg, toggleDone, dismiss, restoreDismissed, removeLocalEvent, keepActive } from "../src/store.js";
import { sendMessage, safeHref, applyTheme, downloadFile, setupDialogs, drawIcons } from "./shared.js";

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const send = sendMessage;
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const fmtNum = n => (Math.round(n * 10) / 10).toString();

const GROUPS = [
  ["overdue", "Overdue", "var(--red)"],
  ["today", "Due today", "var(--blue)"],
  ["tomorrow", "Due tomorrow", "var(--amber)"],
  ["week", "Later this week", "var(--green)"],
  ["later", "Coming up", "var(--mute)"],
  ["undated", "No date given", "var(--mute)"],
  ["review", "Check status", "var(--mute)"],
  ["past", "Past events", "var(--mute)"],
  ["pastReminders", "Past reminders", "var(--mute)"],
  ["stale", "Older assignments", "var(--mute)"],
  ["done", "Finished", "var(--mute)"]
];
const CLOSED_BY_DEFAULT = new Set(["later", "undated", "review", "past", "pastReminders", "stale", "done"]);
const dialogs = setupDialogs();
let SEARCH = "", COURSE_FILTER = "all", SORT = "priority", UNDATED = false;

let ITEMS = [], STATE = null, ACTIVITY = new Set(), FILTER = "all", BUSY = false;
let autoSyncTried = false;
let calCursor = new Date(), selectedDay = null;
let openGroups = null, openItems = new Set();
let wpCourse = null, wpPage = null;
let gFilter = "all";
/* Reminders written to Canvas take a few seconds. They appear here first so the
   row shows up instantly and the dialog can close straight away. */
let PENDING = [];
/* Rows the user has just deleted. Hidden immediately, restored if the delete
   turns out to fail, so the button always does something visible. */
let REMOVED = new Set();
let progressTimer = null;

/* --------------------------------------------------------------- loading */

async function load() {
  try {
    const r = await send({ type: "stream" });
    if (!r || !r.ok) return showFatal("Coursedeck could not read its own saved data.");

    ITEMS = Array.isArray(r.items) ? r.items : [];
    for (const uid of [...REMOVED]) if (!ITEMS.some(i => i.uid === uid)) REMOVED.delete(uid);
    STATE = r.state || {};
    applyTheme(STATE.settings);
    ACTIVITY = new Set(Array.isArray(r.activityIds) ? r.activityIds : []);
    if (!STATE.host) { location.href = "setup.html"; return; }

    if (!openGroups) openGroups = new Set(GROUPS.map(g => g[0]).filter(k => !CLOSED_BY_DEFAULT.has(k)));

    paintHeader(); paintNow(); paintGrades(); paintClasses(); paintClubs(); paintPlans(); paintCal();
    const mix = $("#mixClubs"); if (mix) mix.checked = !!(STATE.settings && STATE.settings.showActivities);

    if (!BUSY && !autoSyncTried && (!STATE.cache || staleMinutes() > 30)) {
      autoSyncTried = true;
      doSync(!!STATE.cache);
    }
  } catch (err) {
    showFatal("Something went wrong drawing the page.", err);
  }
}

const cache = () => (STATE && STATE.cache) || null;
const courses = () => (cache() && Array.isArray(cache().courses)) ? cache().courses : [];
const staleMinutes = () => cache() ? (Date.now() - new Date(cache().syncedAt)) / 60000 : Infinity;

function showFatal(msg, err) {
  const b = $("#banner");
  b.className = "banner bad on";
  b.innerHTML = `<b>${esc(msg)}</b><p>Try closing this tab and opening Coursedeck again.</p>
    ${err ? `<p class="sub" style="font-size:12px">Detail: ${esc(String(err.message || err))}</p>` : ""}`;
}

function paintHeader() {
  const c = cache();
  const first = c && c.user && c.user.name ? c.user.name.split(" ")[0] : null;
  const b = $("#banner"), e = STATE.lastError;

  const date = new Date().toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" });
  $("#greeting").textContent = first ? `HELLO, ${first.toUpperCase()} · ${date.toUpperCase()}` : date.toUpperCase();
  const mins = staleMinutes();
  const age = mins < 2 ? "just now" : mins < 60 ? `${Math.floor(mins)} min ago` : mins < 1440 ? `${Math.floor(mins / 60)} hr ago` : `${Math.floor(mins / 1440)} days ago`;
  $("#who").textContent = c ? `${courses().filter(x => !ACTIVITY.has(String(x.id))).length} classes · ${e ? "Showing saved work" : "Updated " + age}` : "Connecting your coursework, one class at a time.";
  $("#schoolName").textContent = STATE.host;
  $("#connectionDot").className = "dot " + (e ? "err" : BUSY ? "busy" : "ok");
  $("#connectionLabel").textContent = e ? "Using saved data" : BUSY ? "Updating from Canvas" : "Connected to Canvas";
  $("#themeToggle").title = `Theme: ${STATE.settings?.theme || "system"}`;
  $("#themeToggle").setAttribute("aria-label", `Color theme: ${STATE.settings?.theme || "system"}. Click to change.`);

  if (BUSY) {
    b.className = "banner warn on";
    const firstRun = !c;
    b.innerHTML = `<b><span class="spin"></span> Getting everything from Canvas…</b>
      <p style="margin-bottom:4px">${firstRun
        ? "The first sync reads every class, its assignments, its weekly pages, your calendar and your grades. On a full timetable that takes about <b>30 to 45 seconds</b>. Later refreshes are much quicker."
        : "This usually takes a few seconds."}</p>
      <div class="syncbar">
        <div class="track indet" id="pTrack"><i id="pFill"></i></div>
        <div class="meta"><b id="pLabel">Starting…</b><span id="pTime"></span></div>
      </div>
      <p class="sub" style="margin:9px 0 0">You can keep using the rest of the app while this runs.</p>`;
    return;
  }
  if (e && /401|sign|login|not signed/i.test(e.message || "")) {
    b.className = "banner bad on";
    b.innerHTML = `<b>You are signed out of Canvas</b>
      <p>Coursedeck reads Canvas using your own login.</p>
      <ol><li>Open Canvas and log in.</li><li>Come back and press <b>Refresh</b>.</li></ol>
      <a class="btn" target="_blank" rel="noopener" href="https://${esc(STATE.host)}">Open Canvas</a>`;
    return;
  }
  if (e) {
    b.className = "banner bad on";
    b.innerHTML = `<b>Could not reach Canvas</b>
      <p>Check you are online and that <b>${esc(STATE.host)}</b> is your school's address.</p>
      <button class="btn" id="retry">Try again</button>
      <p class="sub" style="font-size:12px;margin-top:9px">Detail: ${esc(e.message || "")}</p>`;
    const r = $("#retry"); if (r) r.onclick = () => doSync();
    return;
  }
  if (c?.warnings?.length) {
    b.className = "banner warn on";
    b.innerHTML = `<b>Some information could not be refreshed</b><p>${c.warnings.map(w => esc(w.message)).join("<br>")}</p><button class="btn alt sm" id="retry">Try again</button>`;
    $("#retry").onclick = () => doSync();
    return;
  }
  if (c && !c.courses.length) {
    b.className = "banner info on";
    b.innerHTML = `<b>No active classes found</b>
      <p>Coursedeck connected fine, but ${esc(STATE.host)} is not showing any current courses for your account.
      That is normal between terms. It will pick them up once your school publishes them.</p>`;
    return;
  }
  b.className = "banner";
}

/* --------------------------------------------------------------- toasts */

function toast(msg, { kind = "", ms = 4200, action, spinner = false } = {}) {
  const host = $("#toasts");
  if (!host) return;
  const el = document.createElement("div");
  el.className = "toast " + kind;
  el.innerHTML = `${spinner ? '<span class="tspin"></span>' : ""}<span class="tmsg"></span>`;
  el.querySelector(".tmsg").textContent = msg;
  if (action) {
    const b = document.createElement("button");
    b.textContent = action.label;
    b.onclick = () => { el.remove(); action.run(); };
    el.appendChild(b);
  }
  host.appendChild(el);
  const kill = () => { el.style.opacity = "0"; setTimeout(() => el.remove(), 200); };
  if (ms) setTimeout(kill, ms);
  return kill;
}

/* --------------------------------------------------------------- to-do */

function whenLabel(it) {
  if (!it.due) return { t: "no date", c: "w-mute" };
  if (it.allDay) return { t: daysUntil(it.allDayDate ? `${it.allDayDate}T12:00:00` : it.due) === 0 ? "All day" : new Date(it.allDayDate ? `${it.allDayDate}T12:00:00` : it.due).toLocaleDateString([], { month: "short", day: "numeric" }) + " · all day", c: "w-mute" };
  const d = daysUntil(it.due), dt = new Date(it.due);
  const time = dt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (!isActionable(it)) return { t: dt.toLocaleDateString([], { month: "short", day: "numeric" }), c: "w-mute" };
  if (d < 0) return { t: d === -1 ? "1 day late" : `${Math.abs(d)} days late`, c: "w-red" };
  if (d === 0) return { t: time, c: "w-red" };
  if (d === 1) return { t: `Tomorrow ${time}`, c: "w-amber" };
  if (d <= 6) return { t: `${dt.toLocaleDateString([], { weekday: "short" })} ${time}`, c: "w-green" };
  return { t: dt.toLocaleDateString([], { month: "short", day: "numeric" }), c: "w-mute" };
}

const courseColor = id => ((STATE.courseCfg || {})[String(id)] || {}).color || colorFor(id || 0);

/* A reminder that has been typed but not yet confirmed by Canvas. Shown in
   the list straight away so nothing looks lost while the write is in flight. */
function pendingHTML(it) {
  const w = whenLabel(it);
  const failed = it.pendingState === "failed";
  return `<div class="item b-${it.bucket} pending ${failed ? "failed" : ""}" data-uid="${esc(it.uid)}">
    <div class="ih">
      ${failed ? `<span style="width:19px;text-align:center;color:var(--amber);font-weight:700">!</span>`
               : `<span class="savingdot" title="Saving to Canvas"></span>`}
      <div class="imain">
        <span class="it">${esc(it.title)}</span>
        <span class="pill" style="--course-color:${courseColor(it.courseId)}">${esc(it.courseShort || "—")}</span>
        <span class="badge ${failed ? "warn" : "saving"}">${failed ? "NOT SAVED" : it.localOnly ? "SAVING LOCALLY" : "SAVING TO CANVAS"}</span>
      </div>
      <div class="iside"><span class="when ${w.c}">${w.t}</span></div>
    </div>
  </div>`;
}

function itemHTML(it) {
  if (it.pending) return pendingHTML(it);
  const w = whenLabel(it);
  const canvasDone = it.canvasComplete;
  const detail = (it.description || "").trim();
  return `<div class="item b-${it.bucket} ${it.done ? "done" : ""} ${it.bucket === "stale" ? "stale" : ""} ${openItems.has(it.uid) ? "open" : ""}" data-uid="${esc(it.uid)}">
    <div class="ih">
      <input type="checkbox" ${it.done ? "checked" : ""} ${canvasDone ? "disabled" : ""}
        aria-label="${esc((it.done ? "Mark incomplete: " : "Mark complete: ") + it.title)}" title="${canvasDone ? "Canvas already has this handed in" : "Tick when done"}">
      <div class="imain">
        <button class="item-toggle" aria-expanded="${openItems.has(it.uid)}" aria-label="Details: ${esc(it.title)}"><span class="it">${esc(it.title)}</span></button>
        <span class="pill" style="--course-color:${courseColor(it.courseId)}">${esc(it.courseShort || "—")}</span>
        ${it.missing && isActionable(it) ? `<span class="badge warn">Canvas: missing</span>` : ""}
        ${canvasDone ? `<span class="badge">${it.excused ? "excused" : it.graded ? "graded" : "handed in"}</span>` : ""}
        ${it.keepActive && !it.done ? `<span class="badge">kept in list</span>` : ""}
        ${it.local ? `<span class="badge info">${it.repeat ? "Repeating · local" : "Saved locally"}</span>` : ""}
      </div>
      <div class="iside">
        ${it.points ? `<span class="tnum">${it.points}p</span>` : ""}
        <span class="when ${w.c}">${w.t}</span>
        <span class="caretx">▸</span>
      </div>
    </div>
    <div class="detail">
      ${!it.done && needsCompletionCheck(it) ? `<p class="status-explanation">Canvas has not confirmed completion of this paper or external-tool work.${it.canvasMissing ? " Canvas currently flags it as missing, which may not reflect work completed in class." : ""} If you have finished, tick it off here. This changes your CourseDeck list only.</p>` : ""}
      ${it.reasons && it.reasons.length && !it.done ? `<div class="why">Ranked here because: ${esc(it.reasons.slice(0, 3).join(", "))}</div>` : ""}
      ${it.submitLabel ? `<div class="why">How to hand it in: <b>${esc(it.submitLabel)}</b></div>` : ""}
      ${detail ? `<p>${esc(detail)}</p>` : ""}
      <div class="acts">
        ${!it.done && it.kind !== "event" ? `<button class="btn alt sm act-keep">${it.keepActive ? "Use automatic grouping" : "Keep in my list"}</button>` : ""}
        ${it.url ? `<a class="btn sm" target="_blank" rel="noopener" href="${esc(safeHref(it.url))}">Open in Canvas ↗</a>` : ""}
        ${it.source === "manual" ? `<button class="btn alt sm act-del">${it.repeat ? "Delete series" : "Delete"}</button>`
                                 : `<button class="btn alt sm act-hide">Hide this</button>`}
      </div>
    </div>
  </div>`;
}

function paintNow() {
  const active = ITEMS.filter(i => !REMOVED.has(i.uid));
  const c = counts(active);
  const nextWeek = active.filter(i => !i.done && i.bucket !== "past" && i.due && daysUntil(i.due) >= 0 && daysUntil(i.due) < 7).length;
  const cards = [
    ["late", "Overdue", c.overdue, "var(--red)"], ["today", "Today", c.today, "var(--blue)"],
    ["tomorrow", "Tomorrow", c.tomorrow, "var(--amber)"], ["soon", "Next 7 days", nextWeek, "var(--green)"],
    ["all", "All open", c.open, "var(--ink)"]
  ];
  $("#stats").innerHTML = cards.map(([k, l, n, col]) =>
    `<button class="stat ${FILTER === k ? "on" : ""}" data-f="${k}" aria-pressed="${FILTER === k}" style="--stat-color:${col}"><b style="color:${col}">${n}</b><span>${l}</span><i class="stat-mark" aria-hidden="true"></i></button>`).join("");
  $("#navCount").textContent = c.overdue + c.today || "";

  const cs = courses().filter(x => !ACTIVITY.has(String(x.id)) && !STATE.courseCfg?.[x.id]?.hidden);
  const chips = [["all", "All classes"]]
    .concat(cs.map(x => [String(x.id), x.short]));
  $("#filters").innerHTML = chips.map(([k, l]) =>
    `<button class="chip ${COURSE_FILTER === k ? "on" : ""}" data-course-filter="${k}" aria-pressed="${COURSE_FILTER === k}">${esc(l)}</button>`).join("");

  const shown = ITEMS.concat(PENDING).filter(i => !REMOVED.has(i.uid)).filter(i => {
    if (COURSE_FILTER !== "all" && String(i.courseId) !== COURSE_FILTER) return false;
    if (UNDATED && i.due) return false;
    if (SEARCH && !`${i.title} ${i.courseShort || ""} ${i.courseName || ""} ${i.description || ""}`.toLocaleLowerCase().includes(SEARCH.toLocaleLowerCase())) return false;
    if (FILTER === "all") return true;
    if (FILTER === "soon") return !i.done && i.bucket !== "past" && i.due && daysUntil(i.due) < 7 && daysUntil(i.due) >= 0;
    if (FILTER === "nodate") return !i.due;
    if (FILTER === "late") return i.bucket === "overdue";
    if (FILTER === "today") return i.bucket === "today";
    if (FILTER === "tomorrow") return i.bucket === "tomorrow";
    return String(i.courseId) === FILTER;
  });
  $("#resultCount").textContent = `${shown.filter(isActionable).length} open items`;
  $("#clearFilters").hidden = !SEARCH && COURSE_FILTER === "all" && FILTER === "all" && !UNDATED;
  if (SORT === "due") shown.sort((a, b) => (a.due || "9999").localeCompare(b.due || "9999"));
  if (SORT === "title") shown.sort((a, b) => a.title.localeCompare(b.title));

  const groups = {};
  for (const it of shown) (groups[it.bucket] ||= []).push(it);

  let html = "";
  for (const [key, label, col] of GROUPS) {
    const g = groups[key];
    if (!g || !g.length) continue;
    if (key === "done" && g.length > 30) g.length = 30;
    const note = ["stale", "pastReminders"].includes(key) ? ` <span class="n">· saved for reference</span>` : key === "review" ? ` <span class="n">· completion unconfirmed</span>` : "";
    const expanded = !!SEARCH || openGroups.has(key);
    html += `<div class="group ${expanded ? "" : "closed"}" data-g="${key}">
      <button class="ghead" aria-expanded="${expanded}"><span class="caret">▾</span><span class="accent" style="background:${col}"></span>
        <span class="group-title">${label}</span><span class="n">${g.length}</span>${note}</button>
      <div class="glist">${key === "review" ? '<p class="sub quiet-explainer">These items may have been completed in class or outside Canvas. Tick off anything you finished, or choose “Keep in my list” if it still needs doing.</p>' : ""}${g.map(itemHTML).join("")}</div>
    </div>`;
  }

  $("#list").innerHTML = html || (cache()
    ? `<div class="empty"><b>${SEARCH || FILTER !== "all" || COURSE_FILTER !== "all" || UNDATED ? "No matching coursework." : "A little breathing room."}</b><br>${SEARCH || FILTER !== "all" || COURSE_FILTER !== "all" || UNDATED ? "Try another search or clear your filters." : "Your assignments will appear here when your teachers post them."}</div>`
    : `<div class="empty">Loading your classes…</div>`);
  wireList();
  paintInsights(active);
}

function wireList() {
  $$("#list .act-keep").forEach(b => b.onclick = async () => {
    const item = ITEMS.find(i => i.uid === b.closest(".item").dataset.uid);
    if (!item) return;
    const active = !item.keepActive;
    try {
      await keepActive(item.uid, active); await send({ type: "badge" }); await load();
      toast(active ? "Kept in your list until you finish it." : "Automatic grouping restored.", { action: { label: "Undo", run: async () => { await keepActive(item.uid, !active); await send({ type: "badge" }); await load(); } } });
    } catch { toast("Could not save that change. Try again.", { kind: "err" }); }
  });
  $$("#p-now [data-f]").forEach(b => b.onclick = () => { FILTER = b.dataset.f; paintNow(); });
  $$("[data-course-filter]").forEach(b => b.onclick = () => { COURSE_FILTER = b.dataset.courseFilter; paintNow(); });
  $$(".ghead").forEach(h => h.onclick = () => {
    const g = h.closest(".group"), k = g.dataset.g;
    if (openGroups.has(k)) openGroups.delete(k); else openGroups.add(k);
    g.classList.toggle("closed");
    h.setAttribute("aria-expanded", !g.classList.contains("closed"));
  });
  $$("#list .item .ih").forEach(h => h.onclick = e => {
    if (e.target.closest("input,a,button:not(.item-toggle)")) return;
    const it = h.closest(".item"), uid = it.dataset.uid;
    it.classList.toggle("open");
    if (openItems.has(uid)) openItems.delete(uid); else openItems.add(uid);
    h.querySelector(".item-toggle")?.setAttribute("aria-expanded", it.classList.contains("open"));
  });
  $$("#list .item input[type=checkbox]").forEach(cb => cb.onchange = async () => {
    const uid = cb.closest(".item").dataset.uid, checked = cb.checked;
    try {
      await toggleDone(uid, checked);
      if (checked) toast("Marked complete. Nice progress.", { action: { label: "Undo", run: async () => { await toggleDone(uid, false); await send({ type: "badge" }); load(); } } });
      await send({ type: "badge" }); await load();
    } catch { cb.checked = !checked; toast("Could not save that change. Try again.", { kind: "err" }); }
  });
  $$("#list .act-hide").forEach(b => b.onclick = async () => {
    const uid = b.closest(".item").dataset.uid;
    await dismiss(uid); await send({ type: "badge" }); load();
    toast("Hidden from your workspace.", { action: { label: "Undo", run: async () => { await restoreDismissed(uid); await send({ type: "badge" }); load(); } } });
  });
  $$("#list .act-del").forEach(b => b.onclick = async () => {
    const uid = b.closest(".item").dataset.uid;
    const it = ITEMS.find(x => x.uid === uid) || PENDING.find(x => x.uid === uid);
    if (!it) return;

    // hide it now; the network call happens behind the scenes
    REMOVED.add(uid);
    paintNow(); paintCal();
    const done = toast(`Deleting “${it.title}”…`, { ms: 0 });

    let ok = true, why = "";
    try {
      if (it.local) {
        await removeLocalEvent(String(uid).replace(/^l:/, "").split("@")[0]);
      } else if (it.canvasId) {
        const r = await send({ type: "deleteNote", canvasId: it.canvasId });
        if (!r || !r.ok) { ok = false; why = (r && r.error) || "Canvas refused"; }
      } else {
        // no id to delete against — hide it for good rather than doing nothing
        await dismiss(uid);
      }
    } catch (err) { ok = false; why = String((err && err.message) || err); }

    if (done) done();
    if (ok) {
      toast("Deleted.");
    } else {
      REMOVED.delete(uid);
      toast("Could not delete that. " + why, { kind: "err", ms: 6000 });
    }
    await send({ type: "badge" });
    load();
  });
}

$("#expandAll").onclick = () => { openGroups = new Set(GROUPS.map(g => g[0])); paintNow(); };
$("#collapseAll").onclick = () => { openGroups = new Set(); openItems.clear(); paintNow(); };

function paintInsights(active) {
  const focus = active.find(i => isActionable(i) && i.kind !== "event");
  $("#focusCard").innerHTML = focus ? `<section class="focus-card"><p class="eyebrow"><span class="focus-dot"></span>A GOOD PLACE TO START</p><h2>${esc(focus.title)}</h2><div class="focus-course">${esc(focus.courseShort || "Personal")} <span>·</span> ${esc(whenLabel(focus).t)}</div><p class="focus-why">${esc(focus.reasons?.length ? focus.reasons.slice(0, 2).join(" · ") : "Based on your upcoming work")}.</p><button id="focusOpen">View assignment <span data-icon="arrow"></span></button></section>` : `<section class="focus-card"><p class="eyebrow"><span class="focus-dot"></span>LOOKING GOOD</p><h2>Room to breathe.</h2><p class="focus-why">No open coursework right now. Check your week plans for anything your teachers shared there.</p><button id="focusPlans">View week plans <span data-icon="arrow"></span></button></section>`;
  if (focus) $("#focusOpen").onclick = () => {
    SEARCH = ""; COURSE_FILTER = "all"; FILTER = "all"; UNDATED = false;
    $("#search").value = ""; $("#undatedOnly").checked = false;
    openGroups.add(focus.bucket); openItems.add(focus.uid); paintNow();
    const row = $$("#list .item").find(el => el.dataset.uid === focus.uid);
    row?.querySelector(".item-toggle")?.focus();
    row?.scrollIntoView?.({ block: "center", behavior: "smooth" });
  };
  else $("#focusPlans").onclick = () => selectPanel("p-plans");
  const dates = Array.from({ length: 7 }, (_, offset) => { const d = new Date(); d.setDate(d.getDate() + offset); return d; });
  const workload = dates.map(d => active.filter(i => !i.done && i.kind !== "event" && dayKey(i.due) === dayKey(d)).length);
  const max = Math.max(1, ...workload);
  $("#weekStrip").innerHTML = dates.map((d, i) => `<button class="week-day ${i === 0 ? "today" : ""}" data-week-day="${i}" aria-label="${esc(d.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" }))}: ${workload[i]} due"><span class="bar-slot"><i style="height:${workload[i] ? Math.max(12, workload[i] / max * 100) : 4}%"></i></span><span class="day-letter">${d.toLocaleDateString([], { weekday: "short" }).slice(0, 1)}</span><span class="day-number">${d.getDate()}</span></button>`).join("");
  const total = workload.reduce((a, b) => a + b, 0);
  $("#weekCaption").textContent = total ? `${total} deadline${total === 1 ? "" : "s"} ahead. ${dates[workload.indexOf(max)].toLocaleDateString([], { weekday: "long" })} is your busiest day.` : "No deadlines in the next seven days.";
  $$("[data-week-day]").forEach(b => b.onclick = () => { calCursor = dates[Number(b.dataset.weekDay)]; selectedDay = calCursor.toDateString(); paintCal(); selectPanel("p-cal"); });
  drawIcons();
}

$("#search").oninput = e => { SEARCH = e.target.value.trim(); paintNow(); };
$("#sort").onchange = e => { SORT = e.target.value; paintNow(); };
$("#undatedOnly").onchange = e => { UNDATED = e.target.checked; paintNow(); };
$("#clearFilters").onclick = () => { SEARCH = ""; COURSE_FILTER = "all"; FILTER = "all"; UNDATED = false; $("#search").value = ""; $("#undatedOnly").checked = false; paintNow(); };
$("#viewCalendar").onclick = () => selectPanel("p-cal");
$("#viewPlans").onclick = () => selectPanel("p-plans");
$("#settingsNav").onclick = () => chrome.runtime.openOptionsPage();
$("#themeToggle").onclick = async () => {
  const s = await getState(), modes = ["system", "light", "dark"];
  const theme = modes[(modes.indexOf(s.settings.theme || "system") + 1) % modes.length];
  await setState({ settings: { ...s.settings, theme } });
  applyTheme({ theme }); await load(); toast(`Theme: ${theme}`);
};

/* --------------------------------------------------------------- grades */

function gradeRow(g) {
  const tone = gradeTone(g.pct);
  /* Pass/fail work carries a grade of "complete" and often a full score too.
     Show the points when they exist, the word otherwise — but never a
     percentage, because "Complete 100%" reads like a mark that was never given. */
  const scoreText = g.score != null && g.possible
    ? `${fmtNum(g.score)}/${fmtNum(g.possible)}`
    : g.passFail ? (g.passFail === "complete" ? "Complete" : "Incomplete")
    : (g.grade || "—");
  const showPct = !g.passFail && g.pct != null;
  const when = g.gradedAt ? new Date(g.gradedAt) : null;
  const days = when ? daysUntil(g.gradedAt) : null;
  const whenText = !when ? "" : days === 0 ? "today" : days === -1 ? "yesterday"
    : days > -7 ? `${Math.abs(days)} days ago` : when.toLocaleDateString([], { month: "short", day: "numeric" });
  return `<div class="grow">
    <div class="gscore g-${tone}">${esc(scoreText)}${showPct ? `<span class="gletter">${fmtNum(g.pct)}%</span>` : ""}</div>
    <div class="gmain">
      <div class="gname">${esc(g.title)}</div>
      <div class="sub"><span class="pill" style="background:${courseColor(g.courseId)}">${esc(g.courseShort || "—")}</span>
        ${whenText ? " returned " + whenText : ""}
        ${g.late ? ' <span class="badge warn">late</span>' : ""}
        ${g.excused ? ' <span class="badge info">excused</span>' : ""}
        ${g.deducted ? ` <span class="badge warn">−${fmtNum(g.deducted)} late penalty</span>` : ""}</div>
      ${g.comments.length ? g.comments.slice(0, 2).map(c =>
        `<div class="gcomment"><b>${esc(c.author)}</b><br>${esc(c.text)}</div>`).join("") : ""}
    </div>
    ${g.url ? `<a class="btn alt sm" target="_blank" rel="noopener" href="${esc(g.url)}">Open</a>` : ""}
  </div>`;
}

function paintGrades() {
  const all = (cache() && Array.isArray(cache().grades)) ? cache().grades : [];
  const visible = all.filter(g => !STATE.courseCfg?.[g.courseId]?.hidden && (!ACTIVITY.has(String(g.courseId)) || (STATE.settings && STATE.settings.showActivities)));

  if (!visible.length) {
    $("#gSummary").innerHTML = "";
    $("#gFilters").innerHTML = "";
    $("#gNote").textContent = "";
    $("#gRecent").innerHTML = cache()
      ? `<div class="empty"><b>Nothing has been returned yet.</b><br>As soon as a teacher posts a grade it shows up here, newest first.</div>`
      : `<div class="empty">Loading…</div>`;
    return;
  }

  const stats = gradeStats(visible);
  $("#gSummary").innerHTML = stats.filter(c => gFilter === "all" || String(c.courseId) === gFilter).map(c => {
    const tone = gradeTone(c.pct);
    const trendTxt = Math.abs(c.trend) < 1.5 ? "" :
      `<span class="sub g-${c.trend > 0 ? "green" : "red"}">${c.trend > 0 ? "▲" : "▼"} ${fmtNum(Math.abs(c.trend))} pts recently</span>`;
    return `<div class="gcard">
      <div class="gtop">
        <div>
          <span class="pill" style="background:${courseColor(c.courseId)}">${esc(c.courseShort || "—")}</span>
          <div class="sub" style="margin-top:6px">${c.n} returned</div>
        </div>
        <div style="text-align:right">
          <div class="gpct g-${tone}">${c.pct != null ? fmtNum(c.pct) + "%" : "—"}${c.letter ? `<span class="gletter">${c.letter}</span>` : ""}</div>
        </div>
      </div>
      <div class="gmeter"><i class="bg-${tone}" style="width:${c.pct != null ? Math.max(2, Math.min(100, c.pct)) : 0}%"></i></div>
      <div class="sub">${c.possible ? `${fmtNum(c.earned)} of ${fmtNum(c.possible)} points` : "no scored points yet"}</div>
      ${trendTxt}
    </div>`;
  }).join("");

  const chips = [["all", "All classes"]].concat(stats.map(c => [String(c.courseId), c.courseShort]));
  $("#gFilters").innerHTML = chips.map(([k, l]) =>
    `<button class="chip ${gFilter === k ? "on" : ""}" data-gf="${k}">${esc(l)}</button>`).join("");

  $("#gNote").textContent = "Based on work returned so far, not your official grade";

  const list = visible.filter(g => gFilter === "all" || String(g.courseId) === gFilter).slice(0, 60);
  $("#gRecent").innerHTML = list.length ? list.map(gradeRow).join("")
    : `<div class="empty">Nothing returned in this class yet.</div>`;

  $$("[data-gf]").forEach(b => b.onclick = () => { gFilter = b.dataset.gf; paintGrades(); });
}

/* -------------------------------------------------------------- classes */

function classCard(c) {
  const cfg = (STATE.courseCfg || {})[String(c.id)] || {};
  const open = ITEMS.filter(i => String(i.courseId) === String(c.id) && isActionable(i));
  const next = open.filter(i => i.due).sort((a, b) => a.due.localeCompare(b.due))[0];
  const pol = cfg.latePolicy || "none";
  return `<div class="card" data-course="${c.id}">
    <div class="spread" style="align-items:center">
      <span class="pill" style="background:${courseColor(c.id)};font-size:11px">${esc(c.short)}</span>
      ${c.score != null ? `<b style="font-size:18px" class="tnum">${c.score}%${c.grade ? " " + esc(c.grade) : ""}</b>` : ""}
    </div>
    <div style="font-size:14px;font-weight:600;margin:9px 0 2px">${esc(c.name)}</div>
    <div class="sub">${c.teachers && c.teachers.length ? esc(c.teachers.join(", ")) : "&nbsp;"}</div>
    <div class="sub" style="margin:7px 0 13px">${open.length} thing${open.length === 1 ? "" : "s"} to do${next ? ` · next ${new Date(next.due).toLocaleDateString([], { month: "short", day: "numeric" })}` : ""}</div>
    <label class="f"><span>Late work</span>
      <select class="cfg-late">${Object.entries(LATE_POLICY).map(([k, v]) =>
        `<option value="${k}" ${pol === k ? "selected" : ""}>${v.label}</option>`).join("")}</select></label>
    <label class="f"><span>Workload</span>
      <select class="cfg-effort">
        <option value="" ${!cfg.effort ? "selected" : ""}>Normal</option>
        <option value="high" ${cfg.effort === "high" ? "selected" : ""}>Heavy — warn me early</option>
        <option value="low" ${cfg.effort === "low" ? "selected" : ""}>Light</option>
      </select></label>
    <div class="row">
      <label class="inline"><input type="checkbox" class="cfg-hidden" ${cfg.hidden ? "checked" : ""}> Hide</label>
      <label class="inline"><input type="checkbox" class="cfg-activity"
        ${(cfg.activity !== undefined ? cfg.activity : c.activity) ? "checked" : ""}> It's a club</label>
      <a class="btn alt sm" style="margin-left:auto" target="_blank" rel="noopener" href="${esc(c.url)}">Open</a>
    </div>
  </div>`;
}

function paintClasses() {
  const cs = courses().filter(c => !ACTIVITY.has(String(c.id)));
  $("#classes").innerHTML = cs.length ? cs.map(classCard).join("")
    : `<div class="empty">Your classes appear here once Coursedeck has loaded them.</div>`;
  wireCfg("#classes");
}

function paintClubs() {
  const cs = courses().filter(c => ACTIVITY.has(String(c.id)));
  const ann = (cache() && cache().announcements) || [];
  const groups = (cache() && cache().groups) || [];
  let html = cs.map(c => {
    const recent = ann.filter(a => String(a.courseId) === String(c.id) && a.posted && daysUntil(a.posted) >= -14 && daysUntil(a.posted) <= 0).sort((a, b) => b.posted.localeCompare(a.posted)).slice(0, 3);
    const work = ITEMS.filter(i => String(i.courseId) === String(c.id) && isActionable(i)).length;
    return `<div class="card" data-course="${c.id}">
      <div style="font-size:14.5px;font-weight:650">${esc(c.name)}</div>
      <div class="sub" style="margin-bottom:9px">${esc(c.term || "activity")}${work ? ` · ${work} open item${work === 1 ? "" : "s"}` : ""}</div>
      ${recent.length ? recent.map(a =>
        `<div style="font-size:13.5px;margin-bottom:9px"><a target="_blank" rel="noopener" href="${esc(a.url)}"><b>${esc(a.title)}</b></a>
         <div class="sub">${new Date(a.posted).toLocaleDateString()} — ${esc((a.text || "").slice(0, 120))}</div></div>`
      ).join("") : `<div class="sub">No announcements in the last two weeks.</div>`}
      <div class="row" style="margin-top:10px">
        <label class="inline"><input type="checkbox" class="cfg-activity" checked> Treat as a club</label>
        <a class="btn alt sm" style="margin-left:auto" target="_blank" rel="noopener" href="${esc(c.url)}">Open</a>
      </div>
    </div>`;
  }).join("");
  if (groups.length) {
    html += `<div class="card"><div style="font-size:14.5px;font-weight:650;margin-bottom:6px">Groups you are in</div>` +
      groups.map(g => `<div class="sub">${esc(g.name)}</div>`).join("") + `</div>`;
  }
  $("#clubs").innerHTML = html ||
    `<div class="empty">Nothing marked as a club.<br>On <b>Classes</b>, tick "It's a club" on anything that is not a real class.</div>`;
  wireCfg("#clubs");
}

function wireCfg(root) {
  $$(`${root} [data-course]`).forEach(card => {
    const id = card.dataset.course;
    const save = async patch => { await setCourseCfg(id, patch); await send({ type: "badge" }); load(); };
    const l = card.querySelector(".cfg-late"); if (l) l.onchange = () => save({ latePolicy: l.value });
    const e = card.querySelector(".cfg-effort"); if (e) e.onchange = () => save({ effort: e.value || null });
    const h = card.querySelector(".cfg-hidden"); if (h) h.onchange = () => save({ hidden: h.checked });
    const a = card.querySelector(".cfg-activity"); if (a) a.onchange = () => save({ activity: a.checked });
  });
}

const mixEl = $("#mixClubs");
if (mixEl) mixEl.onchange = async e => {
  const s = await getState();
  await setState({ settings: { ...s.settings, showActivities: e.target.checked } });
  await send({ type: "badge" }); load();
};

/* ----------------------------------------------------------- week plans */

/* Sync stores { pages:[{title,pageUrl,text,parsed}], currentPageUrl }.
   Older caches stored a bare array, so tolerate both. */
function agendaFor(courseId) {
  const ag = (cache() && cache().agenda) || {};
  const entry = ag[courseId];
  if (!entry) return null;
  if (Array.isArray(entry)) return { pages: entry, currentPageUrl: entry[0] && entry[0].pageUrl };
  return entry;
}

function paintPlans() {
  const ag = (cache() && cache().agenda) || {};
  const byId = new Map(courses().map(c => [String(c.id), c]));
  const ids = Object.keys(ag).filter(id => byId.has(String(id)) && !STATE.courseCfg?.[id]?.hidden && (agendaFor(id) || {}).pages && agendaFor(id).pages.length);

  if (!ids.length) {
    $("#wpTabs").innerHTML = "";
    $("#wpBody").innerHTML = `<div class="empty"><b>No weekly pages found.</b><br>None of your teachers use them, or they have not made any yet.</div>`;
    return;
  }
  if (!wpCourse || !ids.includes(String(wpCourse))) { wpCourse = ids[0]; wpPage = null; }

  $("#wpTabs").innerHTML = ids.map(id =>
    `<button class="chip ${String(id) === String(wpCourse) ? "on" : ""}" data-wp="${id}">${esc(byId.get(String(id)).short)}</button>`).join("");
  $$("[data-wp]").forEach(b => b.onclick = () => { wpCourse = b.dataset.wp; wpPage = null; paintPlans(); });

  const entry = agendaFor(wpCourse);
  const pages = entry.pages;
  if (!wpPage) wpPage = entry.currentPageUrl || (pages[0] && pages[0].pageUrl);
  const page = pages.find(p => p.pageUrl === wpPage) || pages[0];
  const c = byId.get(String(wpCourse));

  const picker = pages.length > 1
    ? `<div class="chips" style="margin-bottom:12px">${pages.map(p => {
        const isNow = p.parsed && agendaCoversToday(p.parsed);
        return `<button class="chip ${p.pageUrl === wpPage ? "on" : ""}" data-pg="${esc(p.pageUrl)}">${esc(p.title)}${isNow ? " ·" : ""}</button>`;
      }).join("")}</div>` : "";

  $("#wpBody").innerHTML = picker + renderPlan(page, c);
  $$("[data-pg]").forEach(b => b.onclick = () => { wpPage = b.dataset.pg; paintPlans(); });
}

function renderPlan(page, course) {
  if (!page) return `<div class="empty">Nothing to show.</div>`;
  const parsed = page.parsed || (page.text ? parseAgenda(page.text) : null);
  const link = course ? `<div class="row" style="margin-top:12px">
      <a class="btn ghost sm" target="_blank" rel="noopener" href="${esc(safeHref(page.htmlUrl || page.url || course.url + '/modules'))}">Open in Canvas ↗</a></div>` : "";

  if (page.unavailable) return `<div class="empty"><b>This page could not be loaded.</b><br>Open it in Canvas, or refresh to try again.</div>` + link;
  if (!parsed) return `<div class="empty">That page is empty.</div>` + link;

  const notes = parsed.notes && parsed.notes.length
    ? `<div class="noteslist"><b style="font-size:13.5px">Notes from your teacher</b>
       <ul>${parsed.notes.map(n => `<li>${esc(n)}</li>`).join("")}</ul></div>` : "";

  if (parsed.kind === "days") {
    const today = new Date();
    const body = parsed.days.map(d => {
      const isToday = d.date && new Date(d.date).toDateString() === today.toDateString();
      return `<div class="day-card ${isToday ? "today" : ""} ${d.empty ? "blank" : ""}">
        <div class="dh"><span class="dd">${esc(d.label)}</span>
          ${d.dayName ? `<span class="dn">${esc(d.dayName)}</span>` : ""}
          ${isToday ? `<span class="badge warn">today</span>` : ""}</div>
        ${d.topic ? `<div class="tp">${esc(d.topic)}</div>` : ""}
        ${d.work ? `<div class="wk">${esc(d.work)}</div>` : ""}
        ${d.empty ? `<div class="sub">Nothing written for this day.</div>` : ""}
      </div>`;
    }).join("");
    return notes + body + link;
  }

  if (parsed.kind === "weeks") {
    return notes + `<p class="sub" style="margin-bottom:11px">This teacher plans by week rather than by day.</p>` +
      parsed.weeks.map(w => `<div class="wkblock"><h4>Week ${w.week}</h4>
        <ul>${w.tasks.map(t => `<li>${esc(t)}</li>`).join("")}</ul></div>`).join("") + link;
  }

  return notes + `<div class="rawtext">${esc(parsed.raw)}</div>` + link;
}

/* -------------------------------------------------------------- calendar */

function paintCal() {
  const first = new Date(calCursor.getFullYear(), calCursor.getMonth(), 1);
  const days = new Date(calCursor.getFullYear(), calCursor.getMonth() + 1, 0).getDate();
  $("#monthlabel").textContent = first.toLocaleDateString([], { month: "long", year: "numeric" });

  const byDay = {};
  for (const it of ITEMS) {
    if (!it.due || it.done || it.bucket === "stale" || REMOVED.has(it.uid)) continue;
    (byDay[new Date(it.allDay && it.allDayDate ? `${it.allDayDate}T12:00:00` : it.due).toDateString()] ||= []).push(it);
  }

  const weekStart = Number(STATE.settings?.weekStart) === 1 ? 1 : 0;
  const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  let html = Array.from({ length: 7 }, (_, i) => `<div class="h">${names[(i + weekStart) % 7]}</div>`).join("");
  for (let i = 0; i < (first.getDay() - weekStart + 7) % 7; i++) html += `<div class="d off" aria-hidden="true"></div>`;
  const today = new Date().toDateString();
  for (let d = 1; d <= days; d++) {
    const key = new Date(calCursor.getFullYear(), calCursor.getMonth(), d).toDateString();
    const all = byDay[key] || [];
    html += `<button class="d ${key === today ? "today" : ""} ${key === selectedDay ? "sel" : ""}" data-day="${key}" aria-label="${key}: ${all.length} items" aria-pressed="${key === selectedDay}" ${key === today ? 'aria-current="date"' : ''}>
      <span class="n">${d}</span>
      ${all.slice(0, 3).map(it => `<span class="e" title="${esc(it.title)}" style="background:${courseColor(it.courseId)}">${esc(it.title)}</span>`).join("")}
      ${all.length > 3 ? `<span class="more">+${all.length - 3}</span>` : ""}
    </button>`;
  }
  $("#cal").innerHTML = html;
  $$("#cal .d[data-day]").forEach(el => el.onclick = () => {
    const key = el.dataset.day;
    selectedDay = el.dataset.day === selectedDay ? null : el.dataset.day;
    paintCal();
    $$("#cal [data-day]").find(day => day.dataset.day === key)?.focus();
  });
  paintDayPanel(byDay);
}

function paintDayPanel(byDay) {
  const p = $("#dayPanel");
  if (!selectedDay) { p.innerHTML = ""; return; }
  const list = byDay[selectedDay] || [];
  const d = new Date(selectedDay);
  p.innerHTML = `<div class="card">
    <div class="spread" style="align-items:center;margin-bottom:${list.length ? "11px" : "0"}">
      <b style="font-size:15px">${d.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })}</b>
      <button class="btn ghost sm" id="closeDay">Close</button>
    </div>
    ${list.length ? list.map(it => `
      <div class="item b-${it.bucket}" style="margin-bottom:5px">
        <div class="ih" style="cursor:default">
          <div class="imain"><span class="it">${esc(it.title)}</span>
            <span class="pill" style="background:${courseColor(it.courseId)}">${esc(it.courseShort || "—")}</span></div>
          <div class="iside">${it.points ? `<span class="tnum">${it.points}p</span>` : ""}
            <span>${it.allDay ? "All day" : new Date(it.due).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span>
            ${it.url ? `<a class="btn sm" target="_blank" rel="noopener" href="${esc(it.url)}">Open</a>` : ""}</div>
        </div></div>`).join("")
      : `<div class="sub">Nothing due this day.</div>`}
  </div>`;
  const c = $("#closeDay"); if (c) c.onclick = () => { selectedDay = null; paintCal(); };
}

$("#prev").onclick = () => { calCursor = shiftMonth(calCursor, -1); selectedDay = null; paintCal(); };
$("#next").onclick = () => { calCursor = shiftMonth(calCursor, 1); selectedDay = null; paintCal(); };
$("#today").onclick = () => { calCursor = new Date(); selectedDay = new Date().toDateString(); paintCal(); };

/* -------------------------------------------------------------- actions */

/* The service worker writes its progress to storage as it goes. Polling that
   is simpler than a message channel and works even if this page was opened
   half-way through a sync that was started by the alarm. */
function watchProgress() {
  clearInterval(progressTimer);
  progressTimer = setInterval(async () => {
    if (!BUSY) return;
    let p;
    try { p = (await chrome.storage.local.get("syncProgress")).syncProgress; } catch { return; }
    if (!p) return;
    const track = $("#pTrack"), fill = $("#pFill"), label = $("#pLabel"), time = $("#pTime");
    if (!track) return;
    if (typeof p.pct === "number" && p.pct > 0) {
      track.classList.remove("indet");
      fill.style.width = Math.max(3, Math.min(100, p.pct)) + "%";
    }
    if (label && p.label) label.textContent = p.label;
    if (time && p.startedAt) {
      const secs = Math.round((Date.now() - p.startedAt) / 1000);
      time.textContent = `${p.pct != null ? p.pct + "% · " : ""}${secs}s`;
    }
  }, 350);
}

async function doSync(quiet) {
  if (BUSY) return;
  BUSY = true;
  $("#sync").disabled = true; $("#sync").setAttribute("aria-label", "Updating from Canvas"); $("#sync").innerHTML = '<span class="spin"></span>';
  paintHeader();          // always show the bar; a silent 40s freeze is worse
  watchProgress();
  const result = await send({ type: "sync" });
  clearInterval(progressTimer);
  BUSY = false;
  $("#sync").disabled = false; $("#sync").setAttribute("aria-label", "Refresh Canvas"); $("#sync").innerHTML = '<span data-icon="refresh"></span>';
  await load(); drawIcons();
  if (!result?.ok) toast(result?.error || "Could not refresh Canvas. Your saved work is still here.", { kind: "err", ms: 6000 });
}
$("#sync").onclick = () => doSync();

const exportable = () => ITEMS.filter(i => isActionable(i) && i.due && !REMOVED.has(i.uid));
$("#ics").onclick = () => {
  const due = exportable();
  $("#icsCount").textContent = due.length
    ? `${due.length} items with a date will be included.`
    : "There is nothing with a date to export yet.";
  $("#ics-go").disabled = !due.length;
  dialogs.open($("#icsModal"));
};
$("#ics-cancel").onclick = () => dialogs.close($("#icsModal"));
$("#ics-go").onclick = () => {
  downloadFile(toICS(exportable(), "Coursedeck"), "coursedeck.ics", "text/calendar");
  dialogs.close($("#icsModal"));
};

$("#add").onclick = () => {
  const sel = $("#f-course");
  sel.innerHTML = `<option value="">Personal — not about a class</option>` +
    courses().map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join("");
  const d = new Date(Date.now() + 864e5); d.setHours(20, 0, 0, 0);
  $("#f-due").value = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  $("#f-title").value = ""; $("#f-details").value = ""; $("#f-repeat").value = ""; $("#f-hint").textContent = "";
  dialogs.open($("#modal"), $("#f-title"));
};
$("#f-cancel").onclick = () => dialogs.close($("#modal"));
$("#f-repeat").onchange = () => {
  $("#f-hint").textContent = $("#f-repeat").value
    ? "Repeating reminders stay on this computer — Canvas cannot repeat things." : "";
};
/* Writing to the Canvas planner is a round trip and can take several seconds.
   Blocking the dialog on it made the app look frozen, so: close immediately,
   show the row in a pending state, and report the outcome with a toast. The
   rest of the app stays usable throughout. */
$("#f-save").onclick = () => {
  const title = $("#f-title").value.trim();
  if (!title) { $("#f-title").focus(); return; }
  if (!$("#f-due").validity.valid || ($("#f-repeat").value && !$("#f-due").value)) {
    $("#f-hint").textContent = "Choose a valid starting date for this reminder.";
    $("#f-due").focus(); return;
  }

  const cid = $("#f-course").value;
  const course = courses().find(c => String(c.id) === cid);
  const payload = {
    type: "addNote", title,
    details: $("#f-details").value.trim(),
    due: $("#f-due").value ? new Date($("#f-due").value).toISOString() : null,
    courseId: cid ? Number(cid) : null,
    courseName: course ? course.name : "Personal",
    courseShort: course ? course.short : "Personal",
    repeat: $("#f-repeat").value || null
  };

  dialogs.close($("#modal"));
  saveReminder(payload);
};

async function saveReminder(payload) {
  const ghost = {
    uid: "pending:" + Math.random().toString(36).slice(2),
    pending: true, pendingState: "saving", localOnly: !!payload.repeat,
    title: payload.title, courseId: payload.courseId,
    courseShort: payload.courseShort, due: payload.due,
    done: false, source: "manual"
  };
  ghost.bucket = bucketOf(ghost);
  PENDING.push(ghost);
  paintNow(); paintCal();

  ghost.localOnly = !!payload.repeat;
  const dismiss = toast("Saving “" + payload.title + (payload.repeat ? "” on this computer…" : "” to Canvas…"), { ms: 0, kind: "busy", spinner: true });

  let r;
  try { r = await send(payload); }
  catch (err) { r = { ok: false, error: String((err && err.message) || err) }; }

  if (dismiss) dismiss();
  PENDING = PENDING.filter(p => p.uid !== ghost.uid);

  if (r && r.ok && r.synced) {
    toast("Saved. It will show in the Canvas app on your phone too.");
  } else if (r && r.ok) {
    toast(payload.repeat ? "Repeating reminder saved on this computer." : "Saved on this computer. Canvas would not accept it, so it will not appear on your phone.",
      { kind: payload.repeat ? "" : "warn", ms: 7000 });
  } else {
    ghost.pendingState = "failed";
    PENDING.push(ghost);
    paintNow();
    toast("Could not save that reminder.", {
      kind: "err", ms: 0,
      action: {
        label: "Try again",
        run: () => { PENDING = PENDING.filter(p => p.uid !== ghost.uid); saveReminder(payload); }
      }
    });
    return;
  }
  load();
}

document.addEventListener("keydown", e => {
  if (e.defaultPrevented || document.querySelector(".modal.on") || e.ctrlKey || e.metaKey || e.altKey || e.target.closest?.("input,select,textarea,[contenteditable]")) return;
  if (e.key === "/") { e.preventDefault(); selectPanel("p-now"); $("#search").focus(); }
  if (e.key.toLowerCase() === "n") { e.preventDefault(); $("#add").click(); }
});

function selectPanel(id) {
  const titles = { "p-now": "Your day, in focus.", "p-cal": "Your calendar.", "p-plans": "Your week plans.", "p-grades": "Your returned work.", "p-classes": "Your classes.", "p-clubs": "Clubs & activities.", "p-credits": "Made for students." };
  if (!titles[id]) return;
  $$("nav button").forEach(x => { x.classList.toggle("on", x.dataset.t === id); if (x.dataset.t === id) x.setAttribute("aria-current", "page"); else x.removeAttribute("aria-current"); });
  $$(".panel").forEach(p => p.classList.toggle("on", p.id === id));
  $("#pageTitle").textContent = titles[id];
  window.scrollTo({ top: 0 });
}
$$("nav button").forEach(b => b.onclick = () => selectPanel(b.dataset.t));
document.addEventListener("visibilitychange", () => { if (!document.hidden && STATE) load(); });

$("#openSettings").onclick = () => chrome.runtime.openOptionsPage();
$("#ver").textContent = "v" + (chrome.runtime.getManifest ? chrome.runtime.getManifest().version : "");

drawIcons();
load();
