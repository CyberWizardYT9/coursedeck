/* Coursedeck — Canvas REST client.
   School-agnostic: everything is derived from the host the user signs in to.
   Auth is the user's own logged-in session cookie. No API tokens: many schools
   disable them, and asking students to paste tokens around is a bad idea. */

import {
  shortName, fromAssignment, fromEvent, fromPlannerNote, fromGraded,
  plainText, parseAgenda, pickAgendaPage
} from "./model.js";

export class CanvasError extends Error {
  constructor(msg, code) { super(msg); this.code = code; }
}

/* The service worker can usually fetch with cookies directly. When a school's
   cookie policy blocks that, we fall back to running the same request inside a
   real Canvas tab, where it is unambiguously first-party. */
export class Transport {
  constructor(host) { this.host = host; this.mode = "direct"; }

  base() { return `https://${this.host}`; }

  async direct(path, init) {
    const res = await fetch(this.base() + path, {
      credentials: "include",
      redirect: "follow",
      ...init,
      headers: { Accept: "application/json", ...(init && init.headers) }
    });
    const text = await res.text();
    if (!res.ok) throw new CanvasError(`HTTP ${res.status} on ${path}`, res.status);
    if (/^\s*<!doctype html|^\s*<html/i.test(text)) throw new CanvasError("got a login page", 401);
    return { body: text ? JSON.parse(text) : null, link: res.headers.get("Link") || "" };
  }

  /* Runs fetch inside a Canvas tab. Requires chrome.scripting. */
  async viaTab(path, init) {
    const tabId = await ensureCanvasTab(this.host);
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId },
      world: "MAIN",
      args: [path, init || null],
      func: async (p, i) => {
        const r = await fetch(p, {
          credentials: "same-origin",
          ...(i || {}),
          headers: { Accept: "application/json", ...((i && i.headers) || {}) }
        });
        const t = await r.text();
        return { ok: r.ok, status: r.status, text: t, link: r.headers.get("Link") || "" };
      }
    });
    if (!result) throw new CanvasError("tab fetch produced nothing", 0);
    if (!result.ok) throw new CanvasError(`HTTP ${result.status} on ${path}`, result.status);
    if (/^\s*<!doctype html|^\s*<html/i.test(result.text)) throw new CanvasError("got a login page", 401);
    return { body: result.text ? JSON.parse(result.text) : null, link: result.link };
  }

  async request(path, init) {
    if (this.mode === "tab") return this.viaTab(path, init);
    try {
      return await this.direct(path, init);
    } catch (err) {
      // Anything that smells like "the cookie did not come along" gets one
      // retry inside a real Canvas tab, where the request is unambiguously
      // first-party. A plain network TypeError has no .code, so catch that too.
      const retryable = err.code === 401 || err.code === 403 || err.code === 0 || err.code === undefined;
      if (retryable && this.mode !== "tab") {
        this.mode = "tab";
        try { return await this.viaTab(path, init); }
        catch (err2) { throw err2; }
      }
      throw err;
    }
  }
}

async function ensureCanvasTab(host) {
  const tabs = await chrome.tabs.query({ url: `https://${host}/*` });
  if (tabs.length) return tabs[0].id;
  const tab = await chrome.tabs.create({ url: `https://${host}/`, active: false });
  await new Promise(res => {
    const listener = (id, info) => {
      if (id === tab.id && info.status === "complete") {
        chrome.tabs.onUpdated.removeListener(listener); res();
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
    setTimeout(res, 12000);
  });
  return tab.id;
}

function nextLink(link) {
  const m = /<([^>]+)>\s*;\s*rel="next"/.exec(link || "");
  return m ? m[1] : null;
}

export class Canvas {
  constructor(host) {
    this.host = host;
    this.t = new Transport(host);
  }

  async get(path) { return (await this.t.request(path)).body; }

  async getAll(path, cap = 10) {
    let out = [], p = path, n = 0;
    while (p && n++ < cap) {
      const { body, link } = await this.t.request(p);
      if (!Array.isArray(body)) return Array.isArray(out) && out.length ? out : body;
      out = out.concat(body);
      const nx = nextLink(link);
      p = nx ? nx.replace(/^https?:\/\/[^/]+/, "") : null;
    }
    return out;
  }

  async csrf() {
    if (this._csrf) return this._csrf;
    const tabId = await ensureCanvasTab(this.host);
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId }, world: "MAIN",
      func: () => {
        const m = document.cookie.match(/_csrf_token=([^;]+)/);
        return m ? decodeURIComponent(m[1]) : null;
      }
    });
    this._csrf = result;
    return result;
  }

  async write(path, method, payload) {
    const token = await this.csrf();
    if (!token) throw new CanvasError("no CSRF token — open Canvas and sign in", 401);
    return (await this.t.request(path, {
      method,
      headers: { "Content-Type": "application/json", "X-CSRF-Token": token },
      body: payload ? JSON.stringify(payload) : undefined
    })).body;
  }

  /* ------------------------------------------------------------ identity */
  async me() {
    const u = await this.get("/api/v1/users/self");
    if (!u || !u.id) throw new CanvasError("not signed in", 401);
    return u;
  }

  /* ------------------------------------------------------------- courses */
  async courses() {
    const raw = await this.getAll(
      "/api/v1/courses?enrollment_state=active&include[]=term&include[]=teachers&include[]=total_scores&per_page=100"
    );
    if (!Array.isArray(raw)) return [];
    const seen = new Set();
    return raw.filter(c => {
      if (!c || !c.id || c.access_restricted_by_date) return false;
      if (seen.has(c.id)) return false;
      seen.add(c.id); return true;
    }).map(c => ({
      id: c.id,
      name: c.name || `Course ${c.id}`,
      short: shortName(c.name),
      code: c.course_code || "",
      term: (c.term && c.term.name) || "",
      teachers: (c.teachers || []).map(t => t.display_name).filter(Boolean),
      url: `${this.t.base()}/courses/${c.id}`,
      score: c.enrollments && c.enrollments[0] ? c.enrollments[0].computed_current_score : null,
      grade: c.enrollments && c.enrollments[0] ? c.enrollments[0].computed_current_grade : null
    }));
  }

  /* A course with no graded work and an open-ended term is almost always a
     club, homeroom or information shell rather than a class. We guess, and the
     user can flip it in settings. */
  static looksLikeActivity(course, assignmentCount) {
    const namey = /club|portal|orientation|counsel|advis|homeroom|class of \d|parent|helpdesk|passport|mathlete|athletic|team|society|band|choir|orchestra|yearbook|student council|ministry|retreat/i;
    if (namey.test(course.name || "")) return true;
    // Real classes sit in a dated term. Clubs and info shells run open-ended.
    const openEnded = /continuous|default term/i.test(course.term || "");
    if (openEnded && assignmentCount <= 12) return true;
    return false;
  }

  async assignments(courseId) {
    const raw = await this.getAll(
      `/api/v1/courses/${courseId}/assignments?per_page=100&include[]=submission&order_by=due_at`
    );
    return Array.isArray(raw) ? raw.filter(a => a && a.published !== false) : [];
  }

  async announcements(courseIds, sinceISO) {
    if (!courseIds.length) return [];
    const chunks = [];
    for (let i = 0; i < courseIds.length; i += 10) chunks.push(courseIds.slice(i, i + 10));
    const out = [];
    for (const chunk of chunks) {
      const q = chunk.map(id => `context_codes[]=course_${id}`).join("&");
      try {
        const r = await this.getAll(`/api/v1/announcements?${q}&start_date=${sinceISO}&per_page=40`, 2);
        if (Array.isArray(r)) out.push(...r);
      } catch { /* a single bad context shouldn't kill the sync */ }
    }
    return out;
  }

  /* --------------------------------------------------------- calendaring */
  async accountCalendars() {
    try {
      const r = await this.get("/api/v1/account_calendars?per_page=50");
      const list = (r && r.account_calendars) || r;
      return Array.isArray(list) ? list.map(a => ({ id: a.id, name: a.name })) : [];
    } catch { return []; }
  }

  /* Pulls the school-wide calendar (holidays, exam weeks, early dismissals)
     plus every course calendar, in one normalized list. */
  async events(contextCodes, startISO, endISO) {
    const out = [];
    const chunks = [];
    for (let i = 0; i < contextCodes.length; i += 10) chunks.push(contextCodes.slice(i, i + 10));
    for (const chunk of chunks) {
      const q = chunk.map(c => `context_codes[]=${encodeURIComponent(c)}`).join("&");
      try {
        const r = await this.getAll(
          `/api/v1/calendar_events?type=event&start_date=${startISO}&end_date=${endISO}&per_page=100&${q}`, 4
        );
        if (Array.isArray(r)) out.push(...r);
      } catch { /* skip unreadable contexts */ }
    }
    return out;
  }

  async groups() {
    try {
      const r = await this.getAll("/api/v1/users/self/groups?per_page=50", 2);
      return Array.isArray(r) ? r.map(g => ({ id: g.id, name: g.name, courseId: g.course_id || null })) : [];
    } catch { return []; }
  }

  /* ------------------------------------------------- planner notes (write) */
  /* Canvas never auto-completes a planner note, so accounts accumulate years of
     them — a real account tested against this had 1,430 going back to 2024.
     Pulling them all would bury the actual homework, so we window the request.
     Verified: the endpoint honours start_date/end_date. */
  async plannerNotes(sinceISO) {
    const since = sinceISO || new Date(Date.now() - 21 * 864e5).toISOString();
    const r = await this.getAll(
      `/api/v1/planner_notes?start_date=${encodeURIComponent(since)}&per_page=100`, 3
    );
    if (!Array.isArray(r)) return [];
    // belt and braces: if a school's Canvas ignores the filter, clamp locally
    return r.filter(n => !n.todo_date || new Date(n.todo_date) >= new Date(since));
  }
  async createNote({ title, details, todo_date, course_id }) {
    return this.write("/api/v1/planner_notes", "POST",
      { title, details: details || "", todo_date, ...(course_id ? { course_id } : {}) });
  }
  async updateNote(id, patch) { return this.write(`/api/v1/planner_notes/${id}`, "PUT", patch); }
  async deleteNote(id) { return this.write(`/api/v1/planner_notes/${id}`, "DELETE"); }

  /* ------------------------------------------------------------- grades
     One endpoint returns every graded submission across every course the
     user is enrolled in, newest first — including courses from previous
     years, so the caller must filter to the current course list. */
  async gradedSubmissions(limit = 100) {
    try {
      const r = await this.getAll(
        `/api/v1/users/self/graded_submissions?per_page=${Math.min(100, limit)}` +
        `&include[]=assignment&include[]=submission_comments`, 2
      );
      return Array.isArray(r) ? r : [];
    } catch { return []; }
  }

  /* -------------------------------------- weekly agenda pages (the good bit)
     Many teachers put the real homework on a "Week N" page in Modules and never
     create a Canvas assignment for it. Canvas itself will never show you that
     work. We surface those pages so it stops disappearing. */
  async agendaPages(courseId) {
    let mods;
    try { mods = await this.getAll(`/api/v1/courses/${courseId}/modules?include[]=items&per_page=25`, 2); }
    catch { return []; }
    if (!Array.isArray(mods)) return [];
    const hits = [];
    for (const m of mods) {
      for (const it of (m.items || [])) {
        if (it.type === "Page" && it.page_url && /week\s*\d+|agenda|lesson plan/i.test(it.title || "")) {
          hits.push({ title: it.title, pageUrl: it.page_url, htmlUrl: it.html_url });
        }
      }
    }
    return hits;
  }

  async page(courseId, pageUrl) {
    try {
      const p = await this.get(`/api/v1/courses/${courseId}/pages/${encodeURIComponent(pageUrl)}`);
      return { title: p.title, text: plainText(p.body), url: p.html_url, updated: p.updated_at };
    } catch { return null; }
  }
}

/* ------------------------------------------------------------ orchestration */

/* Run async work a few at a time. Serial fetching was the reason a first sync
   took ~40 seconds: one course's assignments, then its 16 agenda pages, then
   the next course. Small batches keep it quick without hammering Canvas. */
async function inBatches(list, size, fn, tick) {
  const out = [];
  for (let i = 0; i < list.length; i += size) {
    const slice = list.slice(i, i + size);
    const done = await Promise.all(slice.map(fn));
    out.push(...done);
    if (tick) tick(Math.min(i + size, list.length), list.length);
  }
  return out;
}

export async function fullSync(host, opts = {}) {
  const api = new Canvas(host);
  /* Progress is reported as coarse weighted steps so the UI can show a real
     bar rather than an indeterminate spinner for 40 seconds. */
  const report = typeof opts.onProgress === "function" ? opts.onProgress : () => {};
  let done = 0, total = 6;
  const step = (label, add = 1) => { done += add; report({ done, total, pct: Math.min(99, Math.round(done / total * 100)), label }); };

  report({ done: 0, total, pct: 2, label: "Signing in to Canvas" });
  const user = await api.me();
  step("Reading your class list");

  const courses = await api.courses();
  total = 6 + courses.length;
  step(`Found ${courses.length} course${courses.length === 1 ? "" : "s"}`, 0);

  const now = new Date();
  const start = new Date(now.getTime() - 14 * 864e5).toISOString().slice(0, 10);
  const end = new Date(now.getTime() + 120 * 864e5).toISOString().slice(0, 10);

  const items = [];
  const courseMeta = {};
  const agenda = {};

  /* ---- assignments for every course, 4 at a time ---- */
  const asgByCourse = await inBatches(courses, 4, async c => {
    let asg = [];
    try { asg = await api.assignments(c.id); } catch { asg = []; }
    return { c, asg };
  }, (n, t) => report({ done: done + n * 0.5, total, pct: Math.min(99, Math.round((done + n * 0.5) / total * 100)), label: `Reading assignments (${n} of ${t} classes)` }));

  for (const { c, asg } of asgByCourse) {
    courseMeta[c.id] = { ...c, assignmentCount: asg.length, activity: Canvas.looksLikeActivity(c, asg.length) };
    for (const a of asg) items.push(fromAssignment(a, c));
  }
  done += courses.length * 0.5;

  /* ---- weekly agenda pages, only for real classes ---- */
  if (opts.withAgenda !== false) {
    const real = courses.filter(c => !courseMeta[c.id].activity);
    await inBatches(real, 3, async c => {
      try {
        const found = await api.agendaPages(c.id);
        if (!found.length) return;
        found.sort((x, y) => weekNum(x.title) - weekNum(y.title));
        const wanted = found.slice(0, 16);
        const loaded = (await Promise.all(wanted.map(async p => {
          const full = await api.page(c.id, p.pageUrl);
          const text = full ? full.text : "";
          return { title: p.title, pageUrl: p.pageUrl, htmlUrl: p.htmlUrl, courseId: c.id, text, parsed: text ? parseAgenda(text) : null };
        }))).filter(Boolean);
        // Parsed here rather than in the UI so we can open the page that
        // actually covers today instead of the highest week number.
        const current = pickAgendaPage(loaded);
        agenda[c.id] = { pages: loaded, currentPageUrl: current ? current.pageUrl : (loaded[0] && loaded[0].pageUrl) || null };
      } catch { /* non-fatal */ }
    }, (n, t) => report({ done: done + n * 0.5, total, pct: Math.min(99, Math.round((done + n * 0.5) / total * 100)), label: `Reading weekly plans (${n} of ${t} classes)` }));
    done += real.length * 0.5;
  }

  step("Reading your school calendar");
  const accountCals = await api.accountCalendars();
  const codes = [
    ...courses.map(c => `course_${c.id}`),
    ...accountCals.map(a => `account_${a.id}`),
    `user_${user.id}`
  ];
  const rawEvents = await api.events(codes, start, end);
  const byId = new Map(courses.map(c => [c.id, c]));
  for (const e of rawEvents) {
    const cid = /course_(\d+)/.exec(e.context_code || "");
    items.push(fromEvent(e, cid ? byId.get(Number(cid[1])) : null));
  }

  step("Reading your reminders");
  let notes = [];
  try { notes = await api.plannerNotes(); } catch { notes = []; }
  for (const n of notes) {
    if (n.workflow_state === "deleted") continue;
    items.push(fromPlannerNote(n, byId.get(n.course_id)));
  }

  step("Reading announcements");
  const groups = await api.groups();
  const since = new Date(now.getTime() - 7 * 864e5).toISOString().slice(0, 10);
  let announcements = [];
  try {
    announcements = (await api.announcements(courses.map(c => c.id), since)).map(a => ({
      id: a.id, title: a.title, courseId: Number(String(a.context_code || "").replace("course_", "")) || null,
      posted: a.posted_at, url: a.html_url, text: plainText(a.message).slice(0, 500)
    }));
  } catch { /* non-fatal */ }

  step("Reading your grades");
  /* Graded work, restricted to courses the user is currently enrolled in —
     the endpoint happily returns last year's classes too. */
  let grades = [];
  try {
    const raw = await api.gradedSubmissions();
    grades = raw
      .filter(s => s && s.assignment && byId.has(s.assignment.course_id))
      .map(s => fromGraded(s, byId.get(s.assignment.course_id)))
      .sort((a, b) => String(b.gradedAt || "").localeCompare(String(a.gradedAt || "")));
  } catch { grades = []; }

  report({ done: total, total, pct: 100, label: "Done" });
  return {
    host, user: { id: user.id, name: user.name },
    courses: Object.values(courseMeta),
    items, agenda, groups, announcements, grades,
    accountCalendars: accountCals,
    syncedAt: new Date().toISOString()
  };
}

function weekNum(title) {
  const m = /week\s*(\d+)/i.exec(title || "");
  return m ? Number(m[1]) : 0;
}
