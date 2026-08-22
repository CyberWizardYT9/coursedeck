/* Boots ui/dashboard.html in jsdom with a fake chrome API and realistic
   payloads, to prove the page renders and degrades sensibly.
   Run: npm install jsdom && node test/ui.test.mjs */

import { JSDOM } from "jsdom";
import fs from "node:fs";

const strip = s => s.replace(/^\s*import[\s\S]*?from\s+["'][^"']+["'];?$/gm, "").replace(/^export\s+/gm, "");
const bundle = ["src/model.js", "src/store.js", "ui/dashboard.js"]
  .map(f => strip(fs.readFileSync(f, "utf8"))).join("\n");
const html = fs.readFileSync("ui/dashboard.html", "utf8").replace(/<script[^>]*><\/script>/g, "");

const now = Date.now();
const iso = d => new Date(now + d * 864e5).toISOString();

const courses = [
  { id: 3528, name: "Cambr AICE Global Pers & Ind Res 1 AS - Mar", short: "Cambr Global", term: "26-27", teachers: ["Michele Mar"], url: "https://sta.instructure.com/courses/3528", score: 100, activity: false },
  { id: 3572, name: "Cambridge AICE English Lang AS - Sutherland", short: "Cambridge English", term: "26-27", teachers: ["Joanna Sutherland"], url: "https://sta.instructure.com/courses/3572", score: null, activity: false },
  { id: 3591, name: "AP Physics C: Mechanics - Davis", short: "Physics C: Mechanics", term: "26-27", teachers: ["Hunt Davis"], url: "https://sta.instructure.com/courses/3591", score: 100, activity: false },
  { id: 2754, name: "Aquinas Mathletes", short: "Aquinas Mathletes", term: "Continuous", teachers: [], url: "https://sta.instructure.com/courses/2754", score: 48, activity: true }
];

const items = [
  { uid: "a:239491", kind: "assignment", title: "Summer assignment", courseId: 3528, courseShort: "Cambr Global", due: iso(-1), points: 100, url: "https://x/1", submitLabel: "upload a file", done: false, bucket: "overdue", priority: 1400, reasons: ["overdue", "100 points"], description: "Follow directions on the STA website.", state: "unsubmitted" },
  { uid: "a:239259", kind: "assignment", title: "Genre Annotations", courseId: 3572, courseShort: "Cambridge English", due: iso(2), points: 25, url: "https://x/2", submitLabel: "on paper — hand it in", done: false, bucket: "week", priority: 600, reasons: ["no late work accepted"], description: "" },
  { uid: "a:9", kind: "quiz", title: "CML Round 1 of 4: Advanced Math 2024-25", courseId: 2754, courseShort: "Aquinas Mathletes", due: iso(-639), points: 25, url: "https://x/9", done: false, missing: true, bucket: "stale", priority: -0.5, reasons: ["639 days late"], description: "" },
  { uid: "a:1", kind: "assignment", title: "Syllabus Quiz", courseId: 3572, courseShort: "Cambridge English", due: iso(-4), points: 10, url: "https://x/3", done: true, bucket: "done", priority: -1, reasons: ["done"], state: "graded" }
];

/* mirrors fromGraded() output */
const grades = [
  { uid: "g:1", courseId: 3591, courseShort: "Physics C: Mechanics", title: "PHY-00-Q2 - Math Assessment", score: 10, possible: 10, pct: 100, grade: "10", passFail: null, gradedAt: iso(-1), url: "https://x/g1", late: false, missing: false, excused: false, deducted: null, comments: [{ author: "Hunt Davis", text: "Nice work on the vectors.", at: iso(-1) }] },
  { uid: "g:2", courseId: 3591, courseShort: "Physics C: Mechanics", title: "PHY-00-H1 - Safety Contract", score: 5, possible: 5, pct: 100, grade: "complete", passFail: "complete", gradedAt: iso(-2), url: "https://x/g2", late: false, missing: false, excused: false, deducted: null, comments: [] },
  { uid: "g:3", courseId: 3528, courseShort: "Cambr Global", title: "Reflection on The Danger of a Single Story", score: 88, possible: 100, pct: 88, grade: "88", passFail: null, gradedAt: iso(-3), url: "https://x/g3", late: true, missing: false, excused: false, deducted: 2, comments: [] },
  { uid: "g:4", courseId: 2754, courseShort: "Aquinas Mathletes", title: "Old club quiz", score: 12, possible: 25, pct: 48, grade: "12", passFail: null, gradedAt: iso(-300), url: "https://x/g4", late: false, missing: false, excused: false, deducted: null, comments: [] }
];

/* layout B, verbatim from a real Physics page */
const PHYSICS_TEXT = `|
 |

 | Mon
 | ${new Date(now).getMonth() + 1}/${new Date(now).getDate()}
 | 01 - Kinematics
Lab - Constant Velocity (01-L1)

Notes

• Bring your dedicated lab notebook.`;

const APUSH_TEXT = `|
 |

 | Date
 | Day
 | Topic

 | 10/5
 | Monday
 |`;

const state = {
  host: "sta.instructure.com", courseCfg: {}, localEvents: [], doneLocal: [], dismissed: [],
  settings: { syncMinutes: 30, notifyHoursAhead: 24, notifications: true, showActivities: false },
  cache: {
    user: { id: 10122, name: "Lucas Segelnick" }, courses, items, grades,
    agenda: {
      3591: {
        pages: [
          { title: "Q1 Week 9", pageUrl: "w9", text: APUSH_TEXT, parsed: null },
          { title: "Q1 Week 2", pageUrl: "w2", text: PHYSICS_TEXT, parsed: null }
        ],
        currentPageUrl: "w2"
      }
    },
    groups: [{ id: 7662, name: "Period 3" }],
    announcements: [{ id: 1, title: "Bring your book", courseId: 2754, posted: iso(-1), url: "https://x/a", text: "Bring it tomorrow." }],
    syncedAt: new Date(now - 60000).toISOString()
  },
  lastError: null
};

function run(label, payload, checks) {
  const dom = new JSDOM(html, { url: "https://localhost/ui/dashboard.html", runScripts: "outside-only" });
  const w = dom.window;
  const errs = [];
  w.onerror = m => errs.push(String(m));
  w.addEventListener("unhandledrejection", e => errs.push("unhandled: " + ((e.reason && e.reason.message) || e.reason)));
  w.chrome = {
    runtime: {
      sendMessage: (msg, cb) => cb(msg.type === "stream" ? payload : { ok: true }),
      getURL: p => p, getManifest: () => ({ version: "2.1.0" }), openOptionsPage: () => {}
    },
    tabs: { create: () => {} },
    storage: {
      local: {
        get: (k, cb) => { const v = JSON.parse(JSON.stringify(state)); return cb ? cb(v) : Promise.resolve(v); },
        set: (o, cb) => (cb ? cb() : Promise.resolve())
      }
    }
  };
  w.alert = () => {};
  try { w.eval(bundle); } catch (e) { errs.push("eval: " + e.message); }

  return new Promise(res => setTimeout(() => {
    const d = w.document;
    const ctx = {
      errs, d, w,
      groups: [...d.querySelectorAll(".group")].map(g => ({
        key: g.dataset.g, n: Number(g.querySelector(".n").textContent), closed: g.classList.contains("closed")
      })),
      banner: d.querySelector("#banner").classList.contains("on")
        ? d.querySelector("#banner").querySelector("b").textContent.trim() : null
    };
    console.log(`\n--- ${label}`);
    console.log("  errors :", errs.length ? errs : "none");
    console.log("  banner :", ctx.banner || "(hidden)");
    let ok = errs.length === 0;
    for (const [name, fn] of Object.entries(checks || {})) {
      let good = false, why = "";
      try { good = !!fn(ctx); } catch (e) { why = " (" + e.message + ")"; }
      console.log(`  ${good ? "ok  " : "FAIL"} ${name}${good ? "" : why}`);
      if (!good) ok = false;
    }
    res(ok);
  }, 400));
}

const results = [];

results.push(await run("full load", { ok: true, items, state, activityIds: ["2754"] }, {
  "to-do renders": c => c.d.querySelectorAll("#list .item").length >= 4,
  "archive collapsed, overdue open": c => {
    const s = c.groups.find(g => g.key === "stale"), o = c.groups.find(g => g.key === "overdue");
    return s && s.closed && o && !o.closed;
  },

  /* ---- grades ---- */
  "grades tab exists": c => !!c.d.querySelector("#p-grades"),
  "one summary card per class with returned work": c =>
    c.d.querySelectorAll("#gSummary .gcard").length === 2,   // Mathletes excluded as a club
  "club grades excluded by default": c =>
    !c.d.querySelector("#gSummary").textContent.includes("Mathletes"),
  "returned work listed newest first": c => {
    const rows = [...c.d.querySelectorAll("#gRecent .grow .gname")].map(e => e.textContent);
    return rows[0].includes("Math Assessment") && rows.length === 3;
  },
  "shows score out of possible": c =>
    /10\/10/.test(c.d.querySelector("#gRecent .gscore").textContent),
  "pass/fail work never shows a percentage": c => {
    const rows = [...c.d.querySelectorAll("#gRecent .grow")];
    const safety = rows.find(r => /Safety Contract/.test(r.textContent));
    const score = safety.querySelector(".gscore").textContent;
    return /5\/5/.test(score) && !/%/.test(score);
  },
  "numeric work does show a percentage": c => {
    const rows = [...c.d.querySelectorAll("#gRecent .grow")];
    const q = rows.find(r => /Math Assessment/.test(r.textContent));
    return /100%/.test(q.querySelector(".gscore").textContent);
  },
  "teacher comment surfaces": c =>
    /Nice work on the vectors/.test(c.d.querySelector("#gRecent").textContent),
  "late penalty is called out": c =>
    /late penalty/.test(c.d.querySelector("#gRecent").textContent),
  "class average computed from returned work": c => {
    const t = c.d.querySelector("#gSummary").textContent;
    return t.includes("100%") && t.includes("88%");
  },
  "does not claim to be the official grade": c =>
    /not your official grade/i.test(c.d.querySelector("#gNote").textContent),

  /* ---- week plans ---- */
  "week plans open the week covering today, not week 9": c => {
    const on = c.d.querySelector("#wpBody .chip.on");
    return on && on.textContent.includes("Week 2");
  },
  "day-first layout parses into a day card": c =>
    c.d.querySelectorAll("#wpBody .day-card").length >= 1,
  "topic and homework split apart": c => {
    const t = c.d.querySelector("#wpBody .day-card").textContent;
    return t.includes("01 - Kinematics") && t.includes("Constant Velocity");
  },
  "teacher notes surface": c => /lab notebook/i.test(c.d.querySelector("#wpBody").textContent),
  "today's card is marked": c => !!c.d.querySelector("#wpBody .day-card.today"),

  /* ---- structure ---- */
  "seven tabs including Grades and Credits": c => {
    const t = [...c.d.querySelectorAll("nav button")].map(b => b.textContent);
    return t.length === 7 && t.includes("Grades") && t.includes("Credits");
  },
  "credits keep all four handles": c => {
    const t = c.d.querySelector("#p-credits").textContent;
    return ["cyberwizard_official", "cyberwizard_", "cyberwizard_yt", "CyberWiz_YT"].every(h => t.includes(h));
  },
  "calendar grid intact": c => c.d.querySelectorAll("#cal .d").length >= 28
}));

results.push(await run("brand new account, nothing anywhere", {
  ok: true, items: [],
  state: { ...state, cache: { ...state.cache, courses: [], items: [], grades: [], agenda: {} } },
  activityIds: []
}, {
  "no crash": c => c.errs.length === 0,
  "explains there are no classes": c => /no active classes/i.test(c.banner || ""),
  "grades tab says nothing returned": c => /nothing has been returned/i.test(c.d.querySelector("#gRecent").textContent),
  "week plans explains itself": c => /no weekly pages/i.test(c.d.querySelector("#wpBody").textContent)
}));

results.push(await run("signed out", {
  ok: true, items: [], state: { ...state, cache: null, lastError: { message: "HTTP 401 not signed in" } }, activityIds: []
}, {
  "plain-English banner": c => /signed out/i.test(c.banner || ""),
  "offers a way back": c => !!c.d.querySelector("#banner a[href^='https://']")
}));

results.push(await run("legacy cache shape (agenda as bare array)", {
  ok: true, items,
  state: { ...state, cache: { ...state.cache, agenda: { 3591: [{ title: "Q1 Week 2", pageUrl: "w2", text: PHYSICS_TEXT }] }, grades: undefined } },
  activityIds: ["2754"]
}, {
  "old agenda shape still renders": c => c.d.querySelectorAll("#wpBody .day-card").length >= 1,
  "missing grades array does not crash": c => c.errs.length === 0
}));

/* ------------------------------------------------------------------------
   Adding a reminder writes to Canvas, which takes seconds. The dialog must
   not block on it. These drive the real click handler with a deliberately
   slow (and then failing) background, and watch what the user sees.
   ------------------------------------------------------------------------ */
function boot(addNoteBehaviour, handler) {
  const dom = new JSDOM(html, { url: "https://localhost/ui/dashboard.html", runScripts: "outside-only" });
  const w = dom.window;
  const errs = [];
  w.onerror = m => errs.push(String(m));
  w.addEventListener("unhandledrejection", e => errs.push("unhandled: " + ((e.reason && e.reason.message) || e.reason)));
  w.chrome = {
    runtime: {
      sendMessage: (msg, cb) => {
        if (handler) { const handled = handler(msg, cb); if (handled !== false) return handled; }
        if (msg.type === "stream") return cb({ ok: true, items, state, activityIds: ["2754"] });
        if (msg.type === "addNote") return addNoteBehaviour(cb);
        cb({ ok: true });
      },
      getURL: p => p, getManifest: () => ({ version: "2.1.0" }), openOptionsPage: () => {}
    },
    tabs: { create: () => {} },
    storage: {
      local: {
        get: (k, cb) => {
          const v = JSON.parse(JSON.stringify(state));
          if (k === "syncProgress") { const r = { syncProgress: w.__progress }; return cb ? cb(r) : Promise.resolve(r); }
          return cb ? cb(v) : Promise.resolve(v);
        },
        set: (o, cb) => (cb ? cb() : Promise.resolve())
      }
    }
  };
  w.alert = () => {};
  try { w.eval(bundle); } catch (e) { errs.push("eval: " + e.message); }
  return { w, d: w.document, errs };
}

const wait = ms => new Promise(r => setTimeout(r, ms));

async function addReminderTests() {
  console.log("\n--- adding a reminder (slow Canvas)");
  const checks = [];
  const ok = (name, cond) => { console.log(`  ${cond ? "ok  " : "FAIL"} ${name}`); checks.push(!!cond); };

  // Canvas takes 1.2s to answer, then succeeds
  const { w, d, errs } = boot(cb => setTimeout(() => cb({ ok: true, synced: true }), 1200));
  await wait(350);

  d.querySelector("#add").click();
  await wait(60);
  ok("dialog opens", d.querySelector("#modal").classList.contains("on"));

  d.querySelector("#f-title").value = "Study for the kinematics quiz";
  d.querySelector("#f-save").click();
  await wait(80);

  ok("dialog closes immediately, does not wait for Canvas",
    !d.querySelector("#modal").classList.contains("on"));

  const pendingRow = d.querySelector("#list .item.pending");
  ok("the reminder appears straight away", !!pendingRow);
  ok("it is labelled as saving, not as done",
    pendingRow && /saving/i.test(pendingRow.textContent));
  ok("it shows the title you typed",
    pendingRow && /kinematics quiz/i.test(pendingRow.textContent));
  ok("a progress toast is shown", !!d.querySelector("#toasts .toast"));
  ok("the toast names the item", /kinematics quiz/i.test(d.querySelector("#toasts").textContent));

  // the rest of the app must stay usable while it saves
  d.querySelector('nav button[data-t="p-grades"]').click();
  await wait(30);
  ok("you can switch tabs while it saves", d.querySelector("#p-grades").classList.contains("on"));
  d.querySelector("#add").click();
  await wait(30);
  ok("you can even open the dialog again", d.querySelector("#modal").classList.contains("on"));
  d.querySelector("#f-cancel").click();

  await wait(1500);
  ok("pending row clears once Canvas confirms", !d.querySelector("#list .item.pending"));
  ok("progress toast is replaced by a result", /Saved/i.test(d.querySelector("#toasts").textContent));
  ok("no errors thrown", errs.length === 0);

  console.log("\n--- adding a reminder (Canvas refuses)");
  const b = boot(cb => setTimeout(() => cb({ ok: false, error: "network" }), 300));
  await wait(350);
  b.d.querySelector("#add").click();
  await wait(50);
  b.d.querySelector("#f-title").value = "Buy foam board";
  b.d.querySelector("#f-save").click();
  await wait(900);

  const failed = b.d.querySelector("#list .item.failed");
  ok("failed reminder stays visible instead of vanishing", !!failed);
  ok("it is marked not saved", failed && /not saved/i.test(failed.textContent));
  const errToast = b.d.querySelector("#toasts .toast.err");
  ok("an error toast appears", !!errToast);
  ok("the error toast offers a retry", errToast && !!errToast.querySelector("button"));
  ok("nothing is silently lost", /Buy foam board/i.test(b.d.querySelector("#list").textContent));
  ok("no errors thrown", b.errs.length === 0);

  console.log("\n--- saved locally only (Canvas write blocked)");
  const c = boot(cb => setTimeout(() => cb({ ok: true, synced: false }), 200));
  await wait(350);
  c.d.querySelector("#add").click();
  await wait(50);
  c.d.querySelector("#f-title").value = "Robotics meeting";
  c.d.querySelector("#f-save").click();
  await wait(700);
  ok("user is told it will not reach their phone",
    /not appear on your phone/i.test(c.d.querySelector("#toasts").textContent));
  ok("no errors thrown", c.errs.length === 0);

  return checks.every(Boolean);
}

results.push(await addReminderTests());

/* ------------------------------------------------------------------------
   Deleting must never look like nothing happened, and a 40-second first sync
   must show real progress rather than an unlabelled spinner.
   ------------------------------------------------------------------------ */
async function deleteAndProgressTests() {
  console.log("\n--- deleting a reminder");
  const checks = [];
  const ok = (name, cond) => { console.log(`  ${cond ? "ok  " : "FAIL"} ${name}`); checks.push(!!cond); };

  const noteItem = {
    uid: "n:7964", kind: "note", canvasId: 7964, title: "test", courseId: null,
    courseShort: "Personal", due: iso(1), done: false, source: "manual",
    bucket: "tomorrow", priority: 300, reasons: ["due within 3 days"], submitLabel: "your own to-do"
  };
  const withNote = items.concat([noteItem]);

  // Canvas takes 1.5s to confirm the delete
  let deleteCalls = 0;
  const b1 = boot(cb => cb({ ok: true, synced: true }), (msg, cb) => {
    if (msg.type === "stream") return cb({ ok: true, items: withNote, state, activityIds: ["2754"] });
    if (msg.type === "deleteNote") { deleteCalls++; setTimeout(() => cb({ ok: true }), 1500); return; }
    return false;
  });
  await wait(400);
  const rowBefore = [...b1.d.querySelectorAll("#list .item")].find(r => /test/.test(r.textContent));
  ok("the reminder is listed", !!rowBefore);
  const delBtn = rowBefore && rowBefore.querySelector(".act-del");
  ok("it has a Delete button", !!delBtn);

  delBtn.click();
  await wait(120);
  ok("row disappears immediately, does not wait for Canvas",
    ![...b1.d.querySelectorAll("#list .item")].some(r => r.querySelector(".it").textContent.trim() === "test"));
  ok("a toast confirms something is happening", /Deleting/i.test(b1.d.querySelector("#toasts").textContent));
  ok("the delete actually reached the background", deleteCalls === 1);

  await wait(1800);
  ok("toast reports success", /Deleted/i.test(b1.d.querySelector("#toasts").textContent));
  ok("no errors", b1.errs.length === 0);

  console.log("\n--- delete refused by Canvas");
  const b2 = boot(cb => cb({ ok: true }), (msg, cb) => {
    if (msg.type === "stream") return cb({ ok: true, items: withNote, state, activityIds: ["2754"] });
    if (msg.type === "deleteNote") { setTimeout(() => cb({ ok: false, error: "network" }), 300); return; }
    return false;
  });
  await wait(400);
  const row2 = [...b2.d.querySelectorAll("#list .item")].find(r => r.querySelector(".it").textContent.trim() === "test");
  row2.querySelector(".act-del").click();
  await wait(900);
  ok("the row comes back when the delete fails",
    [...b2.d.querySelectorAll("#list .item")].some(r => r.querySelector(".it").textContent.trim() === "test"));
  ok("an error toast explains why", !!b2.d.querySelector("#toasts .toast.err"));
  ok("no errors", b2.errs.length === 0);

  console.log("\n--- first sync progress");
  let syncDone = null;
  const b3 = boot(cb => cb({ ok: true }), (msg, cb) => {
    if (msg.type === "stream") return cb({ ok: true, items: [], state: { ...state, cache: null }, activityIds: [] });
    if (msg.type === "sync") { syncDone = cb; return; }   // deliberately never resolves
    return false;
  });
  await wait(500);
  ok("a progress bar is shown, not just a spinner", !!b3.d.querySelector("#pTrack"));
  ok("it warns the first sync takes 30-45 seconds",
    /30 to 45 seconds/i.test(b3.d.querySelector("#banner").textContent));
  ok("it says the app stays usable", /keep using/i.test(b3.d.querySelector("#banner").textContent));

  b3.w.__progress = { pct: 42, label: "Reading assignments (3 of 7 classes)", startedAt: Date.now() - 12000, running: true };
  await wait(600);
  ok("the bar reflects real progress", b3.d.querySelector("#pFill").style.width === "42%");
  ok("it names what it is doing now",
    /Reading assignments \(3 of 7 classes\)/.test(b3.d.querySelector("#pLabel").textContent));
  ok("it shows elapsed time", /\d+s/.test(b3.d.querySelector("#pTime").textContent));
  ok("the indeterminate stripe is dropped once a real number arrives",
    !b3.d.querySelector("#pTrack").classList.contains("indet"));
  ok("no errors", b3.errs.length === 0);
  if (syncDone) syncDone({ ok: true });

  console.log("\n--- saving indication is loud");
  const b4 = boot(cb => setTimeout(() => cb({ ok: true, synced: true }), 1500));
  await wait(400);
  b4.d.querySelector("#add").click();
  await wait(60);
  b4.d.querySelector("#f-title").value = "Study kinematics";
  b4.d.querySelector("#f-save").click();
  await wait(120);
  const pend = b4.d.querySelector("#list .item.pending");
  ok("pending row is clearly badged", pend && /SAVING TO CANVAS/.test(pend.textContent));
  ok("pending row has a spinner", pend && !!pend.querySelector(".savingdot"));
  ok("the toast is a busy toast with a spinner",
    !!b4.d.querySelector("#toasts .toast.busy") && !!b4.d.querySelector("#toasts .tspin"));
  ok("no errors", b4.errs.length === 0);

  return checks.every(Boolean);
}

results.push(await deleteAndProgressTests());

const ok = results.every(Boolean);
console.log("\n" + (ok ? "ALL UI CHECKS PASSED" : "SOME CHECKS FAILED"));
process.exit(ok ? 0 : 1);
