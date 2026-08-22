/* Coursedeck — pure data model. No browser APIs in this file so it can be unit-tested in node. */

/* NOTE: must be anchored. Canvas's "unsubmitted" contains the substring "submitted". */
export const DONE_STATES = /^(submitted|graded|pending_review|complete)$/;

/* Anything overdue by more than this is almost certainly last year's work that
   a rolling course (clubs especially) never cleared out. It goes to an archive
   group instead of screaming at the top of the list. Real tested case: a
   Mathletes course still listing 2024-25 rounds 639 days late. */
export const STALE_DAYS = 45;

export const LATE_POLICY = {
  strict:  { label: "No late work accepted", weight: 260 },
  penalty: { label: "Accepted with a penalty", weight: 90 },
  daily:   { label: "Percentage off per day", weight: 150 },
  none:    { label: "Not set", weight: 0 }
};

export const PALETTE = [
  "#c0362c", "#2c5aa0", "#2f7a4f", "#b06c12", "#6a4a9c",
  "#0f7b8a", "#a03d6e", "#5a6b1f", "#8a4b1f", "#3d5a80"
];

export function colorFor(id, i) {
  return PALETTE[(Number(id) + (i || 0)) % PALETTE.length];
}

/* ---------------------------------------------------------------- helpers */

export function shortName(name) {
  if (!name) return "Course";
  let n = String(name)
    .replace(/\s*[-–—]\s*[A-Z][a-z]+$/, "")        // trailing " - Teacher"
    .replace(/\b(AP|AICE|DE|Honors|Hon)\b\s*/gi, "")
    .replace(/\s*\([^)]*\)\s*/g, " ")
    .trim();
  if (n.length > 22) {
    const words = n.split(/\s+/);
    n = words.length > 2 ? words.slice(0, 2).join(" ") : n.slice(0, 22);
  }
  return n || String(name).slice(0, 22);
}

export function plainText(html) {
  if (!html) return "";
  return String(html)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, "\n")
    .replace(/<li>/gi, "• ")
    .replace(/<t[dh][^>]*>/gi, " | ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'").replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function submissionLabel(types) {
  const t = Array.isArray(types) ? types.join(",") : String(types || "");
  if (!t || t === "none") return "nothing to submit";
  if (t.includes("on_paper")) return "on paper — hand it in";
  if (t.includes("online_upload")) return "upload a file";
  if (t.includes("online_text_entry")) return "type into Canvas";
  if (t.includes("online_quiz")) return "online quiz";
  if (t.includes("discussion_topic")) return "discussion post";
  if (t.includes("online_url")) return "submit a link";
  if (t.includes("external_tool")) return "external tool — use a laptop";
  if (t.includes("media_recording")) return "record audio or video";
  return t.replace(/_/g, " ");
}

/* Canvas returns UTC. Everything downstream compares real instants, so we keep
   ISO strings and only localise at render time. */
export function dayKey(iso, tzOffsetMinutes) {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d)) return null;
  const shifted = new Date(d.getTime() - (tzOffsetMinutes ?? d.getTimezoneOffset()) * 60000);
  return shifted.toISOString().slice(0, 10);
}

export function daysUntil(iso, now) {
  if (!iso) return null;
  const d = new Date(iso), n = now ? new Date(now) : new Date();
  const a = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const b = new Date(n.getFullYear(), n.getMonth(), n.getDate());
  return Math.round((a - b) / 86400000);
}

export function hoursUntil(iso, now) {
  if (!iso) return null;
  return (new Date(iso) - (now ? new Date(now) : new Date())) / 3600000;
}

/* ------------------------------------------------------------ normalizers */

export function fromAssignment(a, course) {
  const sub = a.submission || {};
  const state = sub.workflow_state || null;
  const done = DONE_STATES.test(state || "");
  return {
    uid: `a:${a.id}`,
    kind: a.is_quiz_assignment || (a.submission_types || []).includes("online_quiz") ? "quiz" : "assignment",
    canvasId: a.id,
    title: a.name || "Untitled assignment",
    courseId: course.id,
    courseName: course.name,
    courseShort: course.short,
    due: a.due_at || null,
    lockAt: a.lock_at || null,
    unlockAt: a.unlock_at || null,
    points: typeof a.points_possible === "number" ? a.points_possible : null,
    url: a.html_url || null,
    submitLabel: submissionLabel(a.submission_types),
    submissionTypes: a.submission_types || [],
    description: plainText(a.description).slice(0, 1200),
    state,
    done,
    missing: !!sub.missing,
    late: !!sub.late,
    score: typeof sub.score === "number" ? sub.score : null,
    source: "canvas",
    graded: state === "graded"
  };
}

export function fromEvent(e, ctx) {
  return {
    uid: `e:${e.id}`,
    kind: "event",
    canvasId: e.id,
    title: e.title || "Event",
    courseId: ctx ? ctx.id : null,
    courseName: ctx ? ctx.name : (e.context_name || "School"),
    courseShort: ctx ? ctx.short : (e.context_name ? shortName(e.context_name) : "School"),
    due: e.start_at || null,
    endAt: e.end_at || null,
    allDay: !!e.all_day,
    location: e.location_name || null,
    points: null,
    url: e.html_url || null,
    description: plainText(e.description).slice(0, 800),
    done: false,
    source: e.context_code && e.context_code.startsWith("account_") ? "school" : "canvas",
    submitLabel: null
  };
}

export function fromPlannerNote(n, course) {
  return {
    uid: `n:${n.id}`,
    kind: "note",
    canvasId: n.id,
    title: n.title || "To-do",
    courseId: n.course_id || null,
    courseName: course ? course.name : "Personal",
    courseShort: course ? course.short : "Personal",
    due: n.todo_date || null,
    points: null,
    url: null,
    description: n.details || "",
    done: n.workflow_state === "completed",
    source: "manual",
    submitLabel: "your own to-do"
  };
}

export function fromLocalEvent(ev) {
  return {
    uid: `l:${ev.id}`,
    kind: ev.kind || "note",
    canvasId: null,
    title: ev.title,
    courseId: ev.courseId || null,
    courseName: ev.courseName || "Personal",
    courseShort: ev.courseShort || "Personal",
    due: ev.due || null,
    endAt: ev.endAt || null,
    points: null,
    url: ev.url || null,
    description: ev.details || "",
    done: !!ev.done,
    source: "manual",
    local: true,
    repeat: ev.repeat || null,
    submitLabel: ev.kind === "event" ? "event" : "your own to-do"
  };
}

/* Expand a weekly/daily repeating local event into concrete instances. */
export function expandRepeats(ev, fromISO, toISO) {
  if (!ev.repeat || !ev.due) return [ev];
  const start = new Date(ev.due);
  const from = new Date(fromISO), to = new Date(toISO);
  const stepDays = ev.repeat === "daily" ? 1 : ev.repeat === "weekly" ? 7 : ev.repeat === "biweekly" ? 14 : 0;
  if (!stepDays) return [ev];
  const out = [];
  const cur = new Date(start);
  while (cur < from) cur.setDate(cur.getDate() + stepDays);
  let guard = 0;
  while (cur <= to && guard++ < 400) {
    out.push({ ...ev, uid: `${ev.uid}@${cur.toISOString().slice(0, 10)}`, due: cur.toISOString(), instance: true });
    cur.setDate(cur.getDate() + stepDays);
  }
  return out;
}

/* --------------------------------------------------------------- priority */

/* Returns { score, reasons[] }. Higher = more urgent. Deliberately explainable:
   the UI shows the reasons so the ranking is never a black box. */
export function priority(item, courseCfg, now) {
  const cfg = courseCfg || {};
  const reasons = [];
  let score = 0;

  if (item.done) return { score: -1, reasons: ["done"] };

  const overdueDays = item.due ? -daysUntil(item.due, now) : 0;
  if (overdueDays > STALE_DAYS) {
    // months late — keep it findable, stop it shouting
    return { score: -0.5, reasons: [`${overdueDays} days late — probably last year's`] };
  }
  if (item.missing || (item.due && hoursUntil(item.due, now) < 0 && item.kind !== "event")) {
    score += 1000; reasons.push("overdue");
  }

  const h = hoursUntil(item.due, now);
  if (h === null) {
    score += 5; reasons.push("no due date");
  } else if (h >= 0) {
    // 400 at due-now, decaying to ~0 two weeks out
    score += Math.max(0, 400 - Math.min(h, 336) * (400 / 336));
    if (h <= 24) reasons.push("due within a day");
    else if (h <= 72) reasons.push("due within 3 days");
  }

  if (item.points) {
    score += Math.min(200, Math.log2(item.points + 1) * 28);
    if (item.points >= 50) reasons.push(`${item.points} points`);
  }

  const pol = LATE_POLICY[cfg.latePolicy] || LATE_POLICY.none;
  if (pol.weight) {
    // a strict-no-late class only matters while the work is still on time
    if (h === null || h >= 0) { score += pol.weight; reasons.push(pol.label.toLowerCase()); }
  }

  const effort = cfg.effort || item.effort;
  if (effort === "high") {
    score += 70;
    if (h !== null && h > 72) reasons.push("needs real hours — start early");
  } else if (effort === "low") score -= 30;

  if (item.kind === "event") score -= 60;
  if (item.source === "school") score -= 40;
  if (cfg.pinned) { score += 500; reasons.push("pinned"); }

  return { score: Math.round(score), reasons };
}

export function bucketOf(item, now) {
  if (item.done) return "done";
  const d = daysUntil(item.due, now);
  if (d === null) return "undated";
  if (d < -STALE_DAYS) return "stale";
  if (d < 0) return "overdue";
  if (d === 0) return "today";
  if (d === 1) return "tomorrow";
  if (d <= 7) return "week";
  return "later";
}

export const BUCKET_ORDER = ["overdue", "today", "tomorrow", "week", "later", "undated", "stale", "done"];
export const BUCKET_LABEL = {
  overdue: "Overdue", today: "Today", tomorrow: "Tomorrow", week: "This week",
  later: "Later", undated: "No due date", stale: "From a while ago", done: "Done"
};

/* ------------------------------------------------------------------ merge */

export function dedupe(items) {
  const seen = new Map();
  for (const it of items) {
    const key = it.uid;
    const prev = seen.get(key);
    if (!prev) { seen.set(key, it); continue; }
    // prefer the record that carries a submission state
    seen.set(key, prev.state ? prev : it);
  }
  return [...seen.values()];
}

export function buildStream(raw, cfgByCourse, opts) {
  const now = (opts && opts.now) || new Date().toISOString();
  const hidden = new Set((opts && opts.hiddenCourses) || []);
  const dismissed = new Set((opts && opts.dismissed) || []);
  const done = new Set((opts && opts.doneLocal) || []);

  let items = dedupe(raw).filter(it => {
    if (it.courseId && hidden.has(String(it.courseId))) return false;
    if (dismissed.has(it.uid)) return false;
    return true;
  });

  items = items.map(it => {
    const cfg = cfgByCourse[String(it.courseId)] || {};
    const isDone = it.done || done.has(it.uid);
    const p = priority({ ...it, done: isDone }, cfg, now);
    return { ...it, done: isDone, priority: p.score, reasons: p.reasons, bucket: bucketOf({ ...it, done: isDone }, now) };
  });

  items.sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    const ai = BUCKET_ORDER.indexOf(a.bucket), bi = BUCKET_ORDER.indexOf(b.bucket);
    if (ai !== bi) return ai - bi;
    return b.priority - a.priority;
  });

  return items;
}

/* -------------------------------------------------------------------- ICS */

function icsEscape(s) {
  return String(s || "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}
function icsStamp(iso) {
  const d = new Date(iso);
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}
function fold(line) {
  if (line.length <= 73) return line;
  const parts = [];
  let s = line;
  parts.push(s.slice(0, 73));
  s = s.slice(73);
  while (s.length) { parts.push(" " + s.slice(0, 72)); s = s.slice(72); }
  return parts.join("\r\n");
}

export function toICS(items, calName) {
  const out = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Coursedeck//EN", "CALSCALE:GREGORIAN",
    `X-WR-CALNAME:${icsEscape(calName || "Coursedeck")}`
  ];
  const stamp = icsStamp(new Date().toISOString());
  for (const it of items) {
    if (!it.due) continue;
    const start = icsStamp(it.due);
    const end = icsStamp(it.endAt || new Date(new Date(it.due).getTime() + 30 * 60000).toISOString());
    out.push("BEGIN:VEVENT");
    out.push(`UID:${icsEscape(it.uid)}@coursedeck`);
    out.push(`DTSTAMP:${stamp}`);
    out.push(`DTSTART:${start}`);
    out.push(`DTEND:${end}`);
    out.push(fold(`SUMMARY:${icsEscape((it.courseShort ? it.courseShort + " — " : "") + it.title)}`));
    const desc = [it.points ? `${it.points} points` : null, it.submitLabel, it.url].filter(Boolean).join(" · ");
    if (desc) out.push(fold(`DESCRIPTION:${icsEscape(desc)}`));
    if (it.url) out.push(fold(`URL:${icsEscape(it.url)}`));
    if (it.location) out.push(fold(`LOCATION:${icsEscape(it.location)}`));
    out.push("END:VEVENT");
  }
  out.push("END:VCALENDAR");
  return out.join("\r\n");
}

/* ------------------------------------------------------------- summarising */

export function counts(items, now) {
  const c = { overdue: 0, today: 0, tomorrow: 0, week: 0, open: 0, stale: 0 };
  for (const it of items) {
    if (it.done) continue;
    const b = bucketOf(it, now);
    if (b === "stale") { c.stale++; continue; }   // archived work is not "open"
    c.open++;
    if (c[b] !== undefined) c[b]++;
  }
  return c;
}


/* ==================================================================
   WEEKLY AGENDA PARSING

   Teachers lay these pages out in whatever way suits them. Three real
   layouts, all seen in one school:

     A  | Date | Day | Topic | Homework      (date in column 1)
     B  | Day  | Date | Topic                (day in column 1)
     C  Week 1:\n  ...tasks...\n\nWeek 2:    (prose, no dates at all)

   Anything unrecognised falls back to the raw text rather than
   pretending the page is empty.
   ================================================================== */

const DATE_CELL = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/;
const DAY_CELL = /^(mon|tue|tues|wed|weds|thu|thur|thurs|fri|sat|sun)/i;
const WEEK_HEAD = /^\s*week\s+(\d+)\s*:?\s*$/i;

function splitBullets(chunk) {
  return String(chunk)
    .split(/\n|(?=•)/)
    .map(l => l.replace(/^[•\-*\s]+/, "").trim())
    .filter(l => l.length > 1);
}

/* Pages write "8/24" with no year. Pick the year that puts the date
   closest to today, so a January page read in December resolves forward
   rather than eleven months back. */
export function resolveAgendaDate(month, day, now) {
  const n = now ? new Date(now) : new Date();
  let best = null, bestGap = Infinity;
  for (const y of [n.getFullYear() - 1, n.getFullYear(), n.getFullYear() + 1]) {
    const d = new Date(y, month - 1, day);
    const gap = Math.abs(d - n);
    if (gap < bestGap) { bestGap = gap; best = d; }
  }
  return best;
}

export function parseAgenda(text, now) {
  const raw = String(text || "").trim();
  if (!raw) return null;

  /* ---- Format C: "Week N:" prose ---- */
  const lines = raw.split(/\r?\n/);
  const weekStarts = [];
  lines.forEach((l, i) => { const m = WEEK_HEAD.exec(l); if (m) weekStarts.push({ i, n: Number(m[1]) }); });
  if (weekStarts.length >= 2) {
    const weeks = weekStarts.map((w, k) => {
      const end = k + 1 < weekStarts.length ? weekStarts[k + 1].i : lines.length;
      const body = lines.slice(w.i + 1, end).map(l => l.trim()).filter(Boolean);
      return { week: w.n, tasks: body };
    }).filter(w => w.tasks.length);
    // uniform shape: every caller can read .days/.weeks/.notes without guarding
    if (weeks.length) return { kind: "weeks", days: [], weeks, notes: [], raw };
  }

  /* ---- Formats A and B: pipe-separated table rows ---- */
  const chunks = raw.split(/\n\s*\n/).map(c => c.trim()).filter(Boolean);
  const days = [], notes = [];
  let sawDay = false, inNotes = false;

  for (const chunk of chunks) {
    if (/^notes\b/i.test(chunk)) {
      inNotes = true;
      const rest = chunk.replace(/^notes\b\s*:?/i, "").trim();
      if (rest) notes.push(...splitBullets(rest));
      continue;
    }
    if (inNotes) { notes.push(...splitBullets(chunk)); continue; }

    const cells = chunk.split(/\n?\s*\|\s*/).map(c => c.trim()).filter(Boolean);
    if (!cells.length) continue;

    // the date must be in the first or second column, else it is not a day row
    let di = -1;
    for (let i = 0; i < Math.min(2, cells.length); i++) if (DATE_CELL.test(cells[i])) { di = i; break; }

    if (di === -1) {
      // a standalone banner row after the table started, e.g. "END OF QUARTER 1"
      if (sawDay && cells.length <= 2 && cells[0].length > 3 && !DAY_CELL.test(cells[0])) {
        notes.push(cells[0]);
      }
      continue;
    }

    const m = DATE_CELL.exec(cells[di]);
    const other = di === 0 ? cells[1] : cells[0];
    const dayName = other && DAY_CELL.test(other) ? other : "";
    const body = cells.filter((c, i) => i !== di && c !== dayName);

    /* Layout B crams the topic and the homework into one cell separated by a
       newline, where layout A gives them separate columns. Normalise. */
    let topic = body[0] || "", work = body.slice(1).join("\n").trim();
    if (body.length === 1 && topic.includes("\n")) {
      const [head, ...tail] = topic.split("\n");
      topic = head.trim();
      work = tail.join("\n").trim();
    }

    const date = resolveAgendaDate(Number(m[1]), Number(m[2]), now);
    days.push({
      month: Number(m[1]),
      day: Number(m[2]),
      label: cells[di],
      date: date ? date.toISOString() : null,
      dayName: dayName.replace(/\s+/g, " ").trim(),
      topic, work,
      empty: !body.length
    });
    sawDay = true;
  }

  if (days.length) return { kind: "days", days, weeks: [], notes, raw };
  return { kind: "raw", days: [], weeks: [], notes, raw };
}

/* Does this parsed page cover today? Used to pick which week to open. */
export function agendaCoversToday(parsed, now) {
  if (!parsed || parsed.kind !== "days") return false;
  const n = now ? new Date(now) : new Date();
  const today = new Date(n.getFullYear(), n.getMonth(), n.getDate()).getTime();
  return parsed.days.some(d => {
    if (!d.date) return false;
    const x = new Date(d.date);
    return new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime() === today;
  });
}

/* Rank agenda pages so the one containing today opens first, then the
   nearest upcoming, then everything else. Prevents "Week 9" opening in
   week 2 just because 9 is the largest number. */
export function pickAgendaPage(pages, now) {
  if (!Array.isArray(pages) || !pages.length) return null;
  const n = now ? new Date(now) : new Date();
  let best = pages[0], bestScore = -Infinity;
  for (const p of pages) {
    const parsed = p.parsed || (p.text ? parseAgenda(p.text, now) : null);
    let score = 0;
    if (parsed && parsed.kind === "days") {
      if (agendaCoversToday(parsed, now)) score = 1e9;
      else {
        const dated = parsed.days.filter(d => d.date).map(d => new Date(d.date));
        if (dated.length) {
          const gap = Math.min(...dated.map(d => Math.abs(d - n)));
          score = 1e8 - gap / 36e5;                 // nearer is better
        }
      }
    } else if (parsed && parsed.kind === "weeks") {
      score = 1;                                     // whole-term plan, no date to match
    }
    if (score > bestScore) { bestScore = score; best = p; }
  }
  return best;
}

/* ==================================================================
   GRADES
   ================================================================== */

export function fromGraded(s, course) {
  const a = s.assignment || {};
  const possible = typeof a.points_possible === "number" ? a.points_possible : null;
  const score = typeof s.score === "number" ? s.score : null;
  const passFail = /^(complete|incomplete)$/i.test(String(s.grade || ""));
  return {
    uid: `g:${s.id}`,
    assignmentId: a.id || null,
    courseId: a.course_id != null ? a.course_id : (course ? course.id : null),
    courseName: course ? course.name : "",
    courseShort: course ? course.short : "",
    title: a.name || "Assignment",
    score, possible,
    grade: s.grade != null ? String(s.grade) : null,
    passFail: passFail ? String(s.grade).toLowerCase() : null,
    pct: (score != null && possible) ? (score / possible) * 100 : null,
    gradedAt: s.graded_at || s.posted_at || null,
    url: a.html_url || null,
    late: !!s.late, missing: !!s.missing, excused: !!s.excused,
    deducted: typeof s.points_deducted === "number" && s.points_deducted > 0 ? s.points_deducted : null,
    comments: (s.submission_comments || [])
      .filter(c => c && c.comment)
      .map(c => ({ author: c.author_name || "Teacher", text: String(c.comment).slice(0, 600), at: c.created_at }))
  };
}

export function gradeLetter(pct) {
  if (pct == null) return null;
  if (pct >= 90) return "A";
  if (pct >= 80) return "B";
  if (pct >= 70) return "C";
  if (pct >= 60) return "D";
  return "F";
}

export function gradeTone(pct) {
  if (pct == null) return "mute";
  if (pct >= 90) return "green";
  if (pct >= 80) return "blue";
  if (pct >= 70) return "amber";
  return "red";
}

/* Per-class roll-up from returned work only. Deliberately not presented as
   the official grade — Canvas weights categories in ways the API does not
   expose here, so this is "what you have scored so far", not a prediction. */
export function gradeStats(list) {
  const by = {};
  for (const g of list) {
    if (g.excused) continue;
    const k = String(g.courseId);
    (by[k] ||= { courseId: g.courseId, courseShort: g.courseShort, courseName: g.courseName, n: 0, earned: 0, possible: 0, items: [] });
    by[k].n++;
    by[k].items.push(g);
    if (g.score != null && g.possible) { by[k].earned += g.score; by[k].possible += g.possible; }
  }
  for (const k of Object.keys(by)) {
    const c = by[k];
    c.pct = c.possible > 0 ? (c.earned / c.possible) * 100 : null;
    c.letter = gradeLetter(c.pct);
    c.items.sort((a, b) => String(b.gradedAt || "").localeCompare(String(a.gradedAt || "")));
    // trend: the most recent five against the five before them
    const scored = c.items.filter(i => i.pct != null);
    if (scored.length >= 4) {
      const recent = scored.slice(0, Math.min(5, Math.floor(scored.length / 2)));
      const older = scored.slice(recent.length, recent.length * 2);
      const avg = xs => xs.reduce((s, i) => s + i.pct, 0) / xs.length;
      c.trend = older.length ? avg(recent) - avg(older) : 0;
    } else c.trend = 0;
  }
  return Object.values(by).sort((a, b) => (b.n - a.n));
}
