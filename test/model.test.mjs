/* Coursedeck model tests. Run: node test/model.test.mjs
   Uses real payload shapes captured from a live Canvas instance. */

import assert from "node:assert/strict";
import {
  DONE_STATES, STALE_DAYS, shortName, plainText, submissionLabel, daysUntil, hoursUntil,
  fromAssignment, fromEvent, fromPlannerNote, fromLocalEvent, expandRepeats,
  priority, bucketOf, buildStream, dedupe, toICS, counts
} from "../src/model.js";

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; console.log("  ok   " + name); }
  catch (e) { fail++; console.log("  FAIL " + name + "\n       " + e.message); }
}

const NOW = "2026-08-19T19:00:00-04:00";
const course = { id: 3528, name: "Cambr AICE Global Pers & Ind Res 1 AS - Mar", short: "Global Pers" };

console.log("\nstate matching");
t("unsubmitted is NOT done (substring trap)", () => {
  assert.equal(DONE_STATES.test("unsubmitted"), false);
  assert.equal(DONE_STATES.test("submitted"), true);
  assert.equal(DONE_STATES.test("graded"), true);
  assert.equal(DONE_STATES.test("pending_review"), true);
});

console.log("\nnaming");
t("strips teacher suffix and course-type prefixes", () => {
  assert.equal(shortName("AP Physics C: Mechanics - Davis"), "Physics C: Mechanics");
  assert.equal(shortName("AP Calculus BC - Hoang"), "Calculus BC");
  assert.equal(shortName("Cambridge AICE English Lang AS - Sutherland"), "Cambridge English");
});
t("truncates names that would break the layout", () => {
  assert.ok(shortName("Introduction To Advanced Interdisciplinary Studies Seminar").length <= 22);
});
t("never returns empty", () => {
  assert.ok(shortName("").length > 0);
  assert.ok(shortName(null).length > 0);
});

console.log("\nhtml");
t("plainText unwraps Canvas markup", () => {
  const out = plainText("<p>Bring these to class by <b>Friday</b>.</p><ul><li>One</li><li>Two</li></ul>");
  assert.ok(out.includes("Friday"));
  assert.ok(out.includes("• One"));
  assert.ok(!out.includes("<"));
});
t("plainText decodes entities", () => {
  assert.equal(plainText("Tom &amp; Jerry&#39;s"), "Tom & Jerry's");
});

console.log("\nsubmission labels");
t("maps the types Canvas actually returns", () => {
  assert.equal(submissionLabel(["on_paper"]), "on paper — hand it in");
  assert.equal(submissionLabel(["online_upload"]), "upload a file");
  assert.equal(submissionLabel(["external_tool"]), "external tool — use a laptop");
  assert.equal(submissionLabel(["none"]), "nothing to submit");
  assert.equal(submissionLabel([]), "nothing to submit");
});

console.log("\nnormalizing (real Canvas payloads)");
const rawAssign = {
  id: 239491, name: "Summer assignment", due_at: "2026-08-21T03:59:59Z",
  points_possible: 100, html_url: "https://sta.instructure.com/courses/3528/assignments/239491",
  submission_types: ["online_upload"], published: true,
  description: "<p>Please follow directions on the STA website.</p>",
  submission: { workflow_state: "unsubmitted", missing: false, late: false }
};
t("assignment keeps its identity and stays not-done", () => {
  const it = fromAssignment(rawAssign, course);
  assert.equal(it.uid, "a:239491");
  assert.equal(it.done, false);
  assert.equal(it.points, 100);
  assert.equal(it.submitLabel, "upload a file");
  assert.ok(it.url.startsWith("https://"));
  assert.ok(!it.description.includes("<p>"));
});
t("graded assignment is done", () => {
  const it = fromAssignment({ ...rawAssign, submission: { workflow_state: "graded", score: 95 } }, course);
  assert.equal(it.done, true);
  assert.equal(it.score, 95);
});
t("quiz detected from submission types", () => {
  const it = fromAssignment({ ...rawAssign, submission_types: ["online_quiz"] }, course);
  assert.equal(it.kind, "quiz");
});
t("school calendar event flagged as school source", () => {
  const it = fromEvent({ id: 9, title: "No School- Labor Day", start_at: "2026-09-07T04:00:00Z", context_code: "account_1" }, null);
  assert.equal(it.source, "school");
  assert.equal(it.kind, "event");
});
t("planner note round-trips", () => {
  const it = fromPlannerNote({ id: 7964, title: "Study kinematics", todo_date: "2026-08-20T20:00:00Z", workflow_state: "active", course_id: 3591 }, { id: 3591, name: "Physics", short: "Physics" });
  assert.equal(it.uid, "n:7964");
  assert.equal(it.source, "manual");
  assert.equal(it.done, false);
});

console.log("\nrepeating events");
t("weekly repeat expands inside the window only", () => {
  const base = fromLocalEvent({ id: "x", title: "Robotics", due: "2026-08-03T22:00:00Z", repeat: "weekly" });
  const out = expandRepeats(base, "2026-08-17T00:00:00Z", "2026-09-14T00:00:00Z");
  assert.ok(out.length >= 4 && out.length <= 5, "got " + out.length);
  assert.ok(out.every(o => new Date(o.due) >= new Date("2026-08-17T00:00:00Z")));
  assert.equal(new Set(out.map(o => o.uid)).size, out.length, "uids must be unique");
});
t("non-repeating passes through untouched", () => {
  const base = fromLocalEvent({ id: "y", title: "One off", due: "2026-08-20T22:00:00Z" });
  assert.equal(expandRepeats(base, "2026-08-01T00:00:00Z", "2026-09-01T00:00:00Z").length, 1);
});

console.log("\npriority");
t("overdue outranks everything", () => {
  const a = priority({ due: "2026-08-10T12:00:00Z", points: 5, missing: true }, {}, NOW);
  const b = priority({ due: "2026-08-20T12:00:00Z", points: 100 }, { latePolicy: "strict" }, NOW);
  assert.ok(a.score > b.score, `${a.score} !> ${b.score}`);
  assert.ok(a.reasons.includes("overdue"));
});
t("a strict no-late class outranks an equal lenient one", () => {
  const item = { due: "2026-08-21T20:00:00Z", points: 25 };
  const strict = priority(item, { latePolicy: "strict" }, NOW);
  const lenient = priority(item, { latePolicy: "penalty" }, NOW);
  assert.ok(strict.score > lenient.score);
  assert.ok(strict.reasons.some(r => /no late work/i.test(r)));
});
t("sooner beats later at equal points", () => {
  const soon = priority({ due: "2026-08-20T20:00:00Z", points: 10 }, {}, NOW);
  const later = priority({ due: "2026-09-08T20:00:00Z", points: 10 }, {}, NOW);
  assert.ok(soon.score > later.score);
});
t("bigger points win at equal deadline", () => {
  const big = priority({ due: "2026-08-21T20:00:00Z", points: 100 }, {}, NOW);
  const small = priority({ due: "2026-08-21T20:00:00Z", points: 10 }, {}, NOW);
  assert.ok(big.score > small.score);
});
t("done items sort out entirely", () => {
  assert.equal(priority({ done: true, due: "2026-08-20T00:00:00Z" }, {}, NOW).score, -1);
});
t("events are de-emphasised vs real work", () => {
  const ev = priority({ due: "2026-08-20T20:00:00Z", kind: "event" }, {}, NOW);
  const hw = priority({ due: "2026-08-20T20:00:00Z", kind: "assignment", points: 10 }, {}, NOW);
  assert.ok(hw.score > ev.score);
});
t("reasons are always explainable", () => {
  const p = priority({ due: "2026-08-20T12:00:00Z", points: 100 }, { latePolicy: "strict" }, NOW);
  assert.ok(p.reasons.length > 0);
  assert.ok(p.reasons.every(r => typeof r === "string" && r.length));
});

console.log("\nbuckets");
t("bucket boundaries", () => {
  assert.equal(bucketOf({ due: "2026-08-15T12:00:00Z" }, NOW), "overdue");
  assert.equal(bucketOf({ due: "2026-08-19T23:00:00-04:00" }, NOW), "today");
  assert.equal(bucketOf({ due: "2026-08-20T23:00:00-04:00" }, NOW), "tomorrow");
  assert.equal(bucketOf({ due: "2026-08-23T23:00:00-04:00" }, NOW), "week");
  assert.equal(bucketOf({ due: "2026-09-30T23:00:00-04:00" }, NOW), "later");
  assert.equal(bucketOf({ due: null }, NOW), "undated");
  assert.equal(bucketOf({ due: "2026-08-15T12:00:00Z", done: true }, NOW), "done");
});
t("the UTC midnight trap: 03:59Z is the previous evening locally", () => {
  // Canvas says 2026-08-21T03:59:59Z, which is 11:59pm Aug 20 in New York.
  const d = new Date("2026-08-21T03:59:59Z");
  const ny = new Date(d.toLocaleString("en-US", { timeZone: "America/New_York" }));
  assert.equal(ny.getDate(), 20);
});

console.log("\nmerge + stream");
t("dedupe prefers the record with submission state", () => {
  const out = dedupe([{ uid: "a:1", state: null }, { uid: "a:1", state: "graded" }]);
  assert.equal(out.length, 1);
  assert.equal(out[0].state, "graded");
});
t("hidden courses and dismissed items drop out", () => {
  const raw = [
    fromAssignment(rawAssign, course),
    fromAssignment({ ...rawAssign, id: 2, name: "Hidden one" }, { id: 999, name: "Gym", short: "Gym" })
  ];
  const out = buildStream(raw, {}, { now: NOW, hiddenCourses: ["999"], dismissed: [] });
  assert.equal(out.length, 1);
  const out2 = buildStream(raw, {}, { now: NOW, hiddenCourses: [], dismissed: ["a:2"] });
  assert.equal(out2.length, 1);
});
t("locally ticked items count as done", () => {
  const raw = [fromAssignment(rawAssign, course)];
  const out = buildStream(raw, {}, { now: NOW, doneLocal: ["a:239491"] });
  assert.equal(out[0].done, true);
  assert.equal(out[0].bucket, "done");
});
t("stream sorts overdue first, done last", () => {
  const raw = [
    fromAssignment({ ...rawAssign, id: 1, name: "Later", due_at: "2026-09-30T20:00:00Z" }, course),
    fromAssignment({ ...rawAssign, id: 2, name: "Overdue", due_at: "2026-08-01T20:00:00Z" }, course),
    fromAssignment({ ...rawAssign, id: 3, name: "Finished", submission: { workflow_state: "graded" } }, course)
  ];
  const out = buildStream(raw, {}, { now: NOW });
  assert.equal(out[0].title, "Overdue");
  assert.equal(out[out.length - 1].title, "Finished");
});
t("counts ignore completed work", () => {
  const raw = [
    fromAssignment({ ...rawAssign, id: 1, due_at: "2026-08-01T20:00:00Z" }, course),
    fromAssignment({ ...rawAssign, id: 2, submission: { workflow_state: "graded" } }, course)
  ];
  const c = counts(buildStream(raw, {}, { now: NOW }), NOW);
  assert.equal(c.open, 1);
  assert.equal(c.overdue, 1);
});

console.log("\nics export");
const icsItems = [
  { uid: "a:1", title: "Current Event analysis", courseShort: "Global Pers", due: "2026-08-24T03:59:59Z", points: 100, url: "https://x/y", submitLabel: "upload a file" },
  { uid: "a:2", title: "No due date", courseShort: "X", due: null }
];
t("valid VCALENDAR envelope", () => {
  const ics = toICS(icsItems, "Coursedeck");
  assert.ok(ics.startsWith("BEGIN:VCALENDAR\r\n"));
  assert.ok(ics.trimEnd().endsWith("END:VCALENDAR"));
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 1, "undated items must be skipped");
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, (ics.match(/END:VEVENT/g) || []).length);
});
t("CRLF line endings as RFC5545 requires", () => {
  const ics = toICS(icsItems);
  assert.ok(ics.includes("\r\n"));
  assert.ok(!/[^\r]\n/.test(ics), "found a bare LF");
});
t("escapes commas and semicolons", () => {
  const ics = toICS([{ uid: "a:3", title: "Read ch. 1, 2; annotate", courseShort: "Eng", due: "2026-08-24T12:00:00Z" }]);
  assert.ok(ics.includes("\\,"));
  assert.ok(ics.includes("\\;"));
});
t("folds long lines under 75 octets", () => {
  const long = "x".repeat(300);
  const ics = toICS([{ uid: "a:4", title: long, courseShort: "Eng", due: "2026-08-24T12:00:00Z" }]);
  for (const line of ics.split("\r\n")) assert.ok(line.length <= 75, "line too long: " + line.length);
});

console.log("\narchiving old work");
t("months-late work goes to the archive, not the top", () => {
  // real case: a rolling club course still listing 2024-25 rounds 639 days late
  const old = { due: "2024-11-19T05:00:00Z", points: 25, missing: true, kind: "quiz" };
  assert.equal(bucketOf(old, NOW), "stale");
  const p = priority(old, {}, NOW);
  assert.ok(p.score < 0, "stale work must not outrank live work, got " + p.score);
  assert.ok(/last year/i.test(p.reasons[0]));
});
t("recently late work still shouts", () => {
  const recent = { due: "2026-08-14T20:00:00Z", points: 25, missing: true };
  assert.equal(bucketOf(recent, NOW), "overdue");
  assert.ok(priority(recent, {}, NOW).score > 900);
});
t("the archive is excluded from the open count", () => {
  const raw = [
    fromAssignment({ ...rawAssign, id: 11, due_at: "2024-11-19T05:00:00Z" }, course),
    fromAssignment({ ...rawAssign, id: 12, due_at: "2026-08-21T20:00:00Z" }, course)
  ];
  const c = counts(buildStream(raw, {}, { now: NOW }), NOW);
  assert.equal(c.open, 1, "only the live item counts as open");
  assert.equal(c.stale, 1);
  assert.equal(c.overdue, 0);
});
t("STALE_DAYS is the boundary", () => {
  const justInside = new Date(new Date(NOW) - (STALE_DAYS - 2) * 864e5).toISOString();
  const wayOut = new Date(new Date(NOW) - (STALE_DAYS + 10) * 864e5).toISOString();
  assert.equal(bucketOf({ due: justInside }, NOW), "overdue");
  assert.equal(bucketOf({ due: wayOut }, NOW), "stale");
});

/* Agenda parsing moved to test/agenda.test.mjs — it now returns a shaped
   object rather than a bare array, and is tested against verbatim pages from
   three different teachers. */

console.log("\nclub detection (real course names)");
const { Canvas } = await import("../src/canvas.js");
const act = (name, term, n) => Canvas.looksLikeActivity({ name, term }, n);
t("dated-term academic courses are classes", () => {
  assert.equal(act("AP Physics C: Mechanics - Davis", "2027-STAHS 26-27/YR", 5), false);
  assert.equal(act("AP United States History - Jones", "2027-STAHS 26-27/YR", 58), false);
  assert.equal(act("DE Sacraments - Huck", "2027-STAHS 26-27/S1", 1), false);
});
t("open-ended shells are activities", () => {
  assert.equal(act("PrimeTime", "Continuous", 1), true);
  assert.equal(act("STA Parent Portal", "Continuous", 0), true);
  assert.equal(act("Passport to Canvas (Canvas Student Orientation)", "Default Term", 2), true);
});
t("a club with real assignments is still a club", () => {
  // regression: this one slipped through an earlier assignment-count-first rule
  assert.equal(act("Aquinas Mathletes", "Continuous", 8), true);
});
t("name alone is enough for obvious clubs", () => {
  assert.equal(act("Robotics Team", "2027-YR", 4), true);
  assert.equal(act("Marching Band", "2027-YR", 0), true);
});

console.log("\ntime helpers");
t("daysUntil / hoursUntil agree on sign", () => {
  assert.equal(daysUntil("2026-08-19T23:00:00-04:00", NOW), 0);
  assert.ok(hoursUntil("2026-08-20T19:00:00-04:00", NOW) > 23);
  assert.ok(daysUntil("2026-08-18T12:00:00-04:00", NOW) < 0);
});

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
