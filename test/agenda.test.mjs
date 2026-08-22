/* Agenda + grades tests. Every fixture below is verbatim output from a real
   Canvas instance — teachers lay these pages out however they like, and the
   parser has to cope with all of it. Run: node test/agenda.test.mjs */

import assert from "node:assert/strict";
import {
  parseAgenda, agendaCoversToday, pickAgendaPage, resolveAgendaDate,
  fromGraded, gradeStats, gradeLetter, gradeTone
} from "../src/model.js";

let pass = 0, fail = 0;
const t = (name, fn) => {
  try { fn(); pass++; console.log("  ok   " + name); }
  catch (e) { fail++; console.log("  FAIL " + name + "\n       " + e.message); }
};

const NOW = "2026-08-19T19:00:00-04:00";

/* ---- Layout B: day in column one, topic and homework in one cell (Physics) */
const PHYSICS = `|
 |

 | Mon
 | 8/17
 | 00 - Orientation
Math Assessment (00-Q2)

 | Tue
 | 8/18
 | 00 - Orientation

 | Wed
 | 8/19
 | 01 - Kinematics

 | Thu
 | 8/20
 | 01 - Kinematics

 | Fri
 | 8/21
 | 01 - Kinematics
Lab - Constant Velocity (01-L1)

Notes

• Make sure you complete and submit your Safety Contracts and get your dedicated lab notebook.`;

/* ---- Layout A: date in column one, four columns (Global Perspectives) */
const GLOBAL = `|
 |

 | Date
 | Day
 | Topic
 | Activities and Homework

 | 8/24
 | Monday
 | Students will research for one articles, TED Talk, or news story from BBC or PPS.
 | Students will present the article and discussion and summary to class.

 | 8/25
 | Tuesday
 | Read Chapter 2 in Global Perspectives and Research, pages 18-46.
 | Students will work in small groups 2-4 students to answer the activities.`;

/* ---- Layout A but mostly blank, plus a banner row (APUSH week 9) */
const APUSH9 = `|
 |

 | Date
 | Day
 | Topic
 | Activities and Homework

 | 10/5
 | Monday
 |
 |

 | 10/9
 | Friday
 |
 |

 | 📅 END OF QUARTER 1

 |
 |`;

/* ---- Layout C: prose week blocks, no dates at all (AP CS A) */
const CS = `Week 1:
Read slides 1 to 14 of Lesson Part A, and install Netbeans (the newest version) in your home computer

Week 2:
Do programming exercises 2 -> 5 on slide 31
Do problem 1 -> 3 on slide 48 about String
MCQ Quiz 1 (everything until Average3Prices)

Week 3:
Type cast
Arithmetic operators
do problem 1 -> 6 on slide 59`;

console.log("\nlayout B — day first, topic and homework in one cell");
t("finds all five school days", () => {
  const p = parseAgenda(PHYSICS, NOW);
  assert.equal(p.kind, "days");
  assert.equal(p.days.length, 5);
});
t("reads the date from column two, not column one", () => {
  const d = parseAgenda(PHYSICS, NOW).days[0];
  assert.equal(d.label, "8/17");
  assert.equal(d.month, 8);
  assert.equal(d.day, 17);
  assert.equal(d.dayName, "Mon");
});
t("splits topic from homework inside one cell", () => {
  const d = parseAgenda(PHYSICS, NOW).days[0];
  assert.equal(d.topic, "00 - Orientation");
  assert.equal(d.work, "Math Assessment (00-Q2)");
});
t("keeps the lab on Friday", () => {
  const d = parseAgenda(PHYSICS, NOW).days[4];
  assert.equal(d.topic, "01 - Kinematics");
  assert.ok(/Constant Velocity/.test(d.work));
});
t("captures the Notes bullets under the table", () => {
  const p = parseAgenda(PHYSICS, NOW);
  assert.equal(p.notes.length, 1);
  assert.ok(/Safety Contracts/.test(p.notes[0]));
  assert.ok(!p.notes[0].startsWith("•"), "bullet glyph should be stripped");
});

console.log("\nlayout A — date first, four columns");
t("skips the header row", () => {
  const p = parseAgenda(GLOBAL, NOW);
  assert.equal(p.days.length, 2, "Date/Day/Topic header must not become a day");
});
t("keeps topic and homework in their own columns", () => {
  const d = parseAgenda(GLOBAL, NOW).days[1];
  assert.equal(d.dayName, "Tuesday");
  assert.ok(/Chapter 2/.test(d.topic));
  assert.ok(/small groups/.test(d.work));
});

console.log("\nlayout A — sparse, with a banner row");
t("blank days survive and are flagged empty", () => {
  const p = parseAgenda(APUSH9, NOW);
  assert.equal(p.days.length, 2);
  assert.ok(p.days.every(d => d.empty));
});
t("a banner row becomes a note, not a phantom day", () => {
  const p = parseAgenda(APUSH9, NOW);
  assert.ok(p.notes.some(n => /END OF QUARTER/.test(n)));
});

console.log("\nlayout C — prose week blocks");
t("splits into weeks", () => {
  const p = parseAgenda(CS, NOW);
  assert.equal(p.kind, "weeks");
  assert.equal(p.weeks.length, 3);
  assert.equal(p.weeks[0].week, 1);
});
t("keeps every task line", () => {
  const p = parseAgenda(CS, NOW);
  assert.equal(p.weeks[1].tasks.length, 3);
  assert.ok(/MCQ Quiz 1/.test(p.weeks[1].tasks[2]));
});
t("does not mistake a week plan for a day table", () => {
  assert.equal(parseAgenda(CS, NOW).days.length, 0);
});

console.log("\nunparseable pages");
t("falls back to raw rather than pretending it is empty", () => {
  const p = parseAgenda("Just some prose about the week ahead. Bring a pencil.", NOW);
  assert.equal(p.kind, "raw");
  assert.ok(p.raw.length > 0);
});
t("empty input is null", () => {
  assert.equal(parseAgenda("", NOW), null);
  assert.equal(parseAgenda(null, NOW), null);
  assert.equal(parseAgenda("   \n  ", NOW), null);
});

console.log("\nyear inference and week picking");
t("a bare M/D resolves to the nearest year", () => {
  // read in August, "1/5" belongs to next January, not last
  const d = resolveAgendaDate(1, 5, "2026-12-20T12:00:00-05:00");
  assert.equal(d.getFullYear(), 2027);
  const d2 = resolveAgendaDate(8, 17, NOW);
  assert.equal(d2.getFullYear(), 2026);
});
t("knows which page covers today", () => {
  assert.equal(agendaCoversToday(parseAgenda(PHYSICS, NOW), NOW), true);
  assert.equal(agendaCoversToday(parseAgenda(GLOBAL, NOW), NOW), false);
});
t("opens the current week, not the highest-numbered one", () => {
  // the exact bug: nine APUSH pages, and Week 9 opened during week 2
  const pages = [
    { title: "Q1 Week 9", text: APUSH9 },
    { title: "Q1 Week 2", text: PHYSICS },
    { title: "Q1 Week 3", text: GLOBAL }
  ];
  assert.equal(pickAgendaPage(pages, NOW).title, "Q1 Week 2");
});
t("with no dated page it still returns something", () => {
  assert.ok(pickAgendaPage([{ title: "Plan", text: CS }], NOW));
  assert.equal(pickAgendaPage([], NOW), null);
  assert.equal(pickAgendaPage(null, NOW), null);
});

console.log("\ngrades");
const sub = {
  id: 5001, score: 10, grade: "10", graded_at: "2026-08-18T16:30:20Z",
  workflow_state: "graded", late: false, missing: false, excused: false,
  submission_comments: [{ author_name: "Hunt Davis", comment: "Nice work on the vectors.", created_at: "2026-08-18T17:00:00Z" }],
  assignment: { id: 235925, course_id: 3591, name: "PHY-00-Q2 - Math Assessment", points_possible: 10, html_url: "https://sta.instructure.com/courses/3591/assignments/235925" }
};
const course = { id: 3591, name: "AP Physics C: Mechanics", short: "Physics" };

t("normalises a graded submission", () => {
  const g = fromGraded(sub, course);
  assert.equal(g.uid, "g:5001");
  assert.equal(g.courseId, 3591);
  assert.equal(g.pct, 100);
  assert.equal(g.comments.length, 1);
  assert.equal(g.comments[0].author, "Hunt Davis");
  assert.ok(g.url.startsWith("https://"));
});
t("handles pass/fail grades without inventing a percentage", () => {
  const g = fromGraded({ ...sub, id: 2, score: null, grade: "complete", assignment: { ...sub.assignment, points_possible: 0 } }, course);
  assert.equal(g.passFail, "complete");
  assert.equal(g.pct, null);
  assert.equal(g.score, null);
});
t("survives a submission with no assignment attached", () => {
  const g = fromGraded({ id: 3, score: 5 }, null);
  assert.equal(g.title, "Assignment");
  assert.equal(g.pct, null);
  assert.equal(g.comments.length, 0);
});
t("rolls up per class and ignores excused work", () => {
  const list = [
    fromGraded(sub, course),
    fromGraded({ ...sub, id: 6, score: 8, assignment: { ...sub.assignment, id: 2, name: "Quiz", points_possible: 10 } }, course),
    fromGraded({ ...sub, id: 7, score: null, excused: true, assignment: { ...sub.assignment, id: 3, name: "Excused", points_possible: 10 } }, course)
  ];
  const [c] = gradeStats(list);
  assert.equal(c.n, 2, "excused work must not count");
  assert.equal(c.earned, 18);
  assert.equal(c.possible, 20);
  assert.equal(c.pct, 90);
  assert.equal(c.letter, "A");
});
t("no scored work gives null rather than 0%", () => {
  const [c] = gradeStats([fromGraded({ ...sub, id: 9, score: null, grade: "complete", assignment: { ...sub.assignment, points_possible: 0 } }, course)]);
  assert.equal(c.pct, null);
  assert.equal(c.letter, null);
});
t("letters and tones line up with the STA scale", () => {
  assert.equal(gradeLetter(90), "A");
  assert.equal(gradeLetter(89.9), "B");
  assert.equal(gradeLetter(59), "F");
  assert.equal(gradeLetter(null), null);
  assert.equal(gradeTone(95), "green");
  assert.equal(gradeTone(65), "red");
  assert.equal(gradeTone(null), "mute");
});
t("returned work sorts newest first", () => {
  const older = { ...sub, id: 20, graded_at: "2026-08-01T10:00:00Z" };
  const [c] = gradeStats([fromGraded(older, course), fromGraded(sub, course)]);
  assert.equal(c.items[0].uid, "g:5001");
});

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
