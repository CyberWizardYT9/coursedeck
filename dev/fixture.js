import { buildStream, parseAgenda } from '../src/model.js';

export function makeFixture() {
  const date = (days, hour = 23, minute = 59) => {
    const d = new Date(); d.setDate(d.getDate() + days); d.setHours(hour, minute, 0, 0); return d.toISOString();
  };
  const courses = [
    { id: 101, name: 'AP Biology', short: 'Biology', teachers: ['Dr. Morgan'], score: 94.2 },
    { id: 102, name: 'English Literature', short: 'Literature', teachers: ['Ms. Rivera'], score: 91.5 },
    { id: 103, name: 'AP Calculus BC', short: 'Calculus', teachers: ['Mr. Ellis'], score: 88.7 },
    { id: 104, name: 'World History', short: 'History', teachers: ['Ms. Chen'], score: 96 },
    { id: 105, name: 'Studio Art', short: 'Studio Art', teachers: ['Mr. Brooks'], score: 97 },
    { id: 106, name: 'Environmental Club', short: 'Eco Club', teachers: [], activity: true }
  ].map(c => ({ ...c, activity: !!c.activity, term: 'Fall semester', url: 'https://example.instructure.com/courses/' + c.id }));
  const spec = [
    ['Cell respiration lab report', 101, -1, 50, 'Explain your observations, include a labeled graph, and connect your results to the role of ATP. Submit your report as a PDF.'],
    ['The Great Gatsby · close reading', 102, 0, 30, 'Choose a passage from chapter 4. Annotate the imagery and write a 400-word response about how Fitzgerald develops the theme of identity.'],
    ['Integration by parts practice', 103, 0, 20, 'Complete questions 1–12. Show your steps and bring your work to class.'],
    ['Study for the biology quiz', null, 0, null, 'Review cellular respiration, photosynthesis, and the study guide.'],
    ['Revolutions: compare & contrast', 104, 1, 100, 'Compare two revolutions in a structured essay. Include a clear thesis and evidence from primary sources.'],
    ['Sketchbook · light and shadow', 105, 1, 25, 'Create three tonal studies using different light sources.'],
    ['Chapter 6 reading notes', 102, 3, 15, 'Read chapter 6 and bring two discussion questions.'],
    ['Applications of integration quiz', 103, 4, 40, 'Review area between curves and volumes of revolution.'],
    ['Ecosystems research proposal', 101, 6, 75, 'Propose a testable research question and a method for collecting data.'],
    ['Portfolio review', 105, 12, 100, 'Select five pieces and write a short artist statement.'],
    ['Organize history source notes', 104, null, null, 'Review and label the primary sources in your notebook.'],
    ['Course introduction', 102, -3, 10, 'Completed introduction.']
  ];
  const items = spec.map(([title, cid, days, points, description], index) => {
    const c = courses.find(c => c.id === cid);
    return { uid: 'a:' + (index + 1), canvasId: index + 1, title, courseId: cid, courseShort: c?.short || 'Personal', courseName: c?.name || 'Personal', due: days === null ? null : date(days, index === 3 ? 18 : 23), points, description, kind: points ? 'assignment' : 'note', source: points ? 'canvas' : 'manual', state: index === 11 ? 'graded' : 'unsubmitted', done: index === 11, submitLabel: index === 2 ? 'on paper — hand it in' : points ? 'upload a file' : 'your own to-do', url: points ? c.url + '/assignments/' + (index + 1) : null };
  });
  items.push({ uid: 'e:99', title: 'Fall break', kind: 'event', source: 'school', courseShort: 'School', due: date(5, 0, 0), allDay: true, allDayDate: date(5, 12, 0).slice(0, 10), done: false });
  const grades = [101, 102, 103, 104, 105].flatMap((cid, i) => [0, 1].map((n) => ({
    uid: 'g:' + cid + n, courseId: cid, courseShort: courses[i].short, title: [ 'Cell structure assessment', 'Literary analysis · imagery', 'Limits and continuity', 'Primary source analysis', 'Observational drawing' ][i] + (n ? ' · practice' : ''), score: [47, 46, 44, 48, 49][i] - n, possible: 50, pct: [94, 92, 88, 96, 98][i] - n * 2, grade: String([47, 46, 44, 48, 49][i]), gradedAt: date(-2 - i - n), comments: i === 0 && !n ? [{ author: 'Dr. Morgan', text: 'Thoughtful explanations. Your labeled diagrams make the process easy to follow.' }] : [], url: courses[i].url, late: false, excused: false, passFail: null
  })));
  const d = new Date();
  const agendaText = Array.from({ length: 5 }, (_, i) => {
    const x = new Date(d); x.setDate(x.getDate() + i);
    return `| ${x.getMonth() + 1}/${x.getDate()} | ${x.toLocaleDateString('en-US', { weekday: 'long' })} | ${['Energy in living systems', 'Photosynthesis', 'Cellular respiration', 'Comparing pathways', 'Lab discussion'][i]} | ${['Review chapter 7', 'Complete the diagram', 'Prepare your lab report', 'Practice questions 1–8', 'Bring your lab notebook'][i]}`;
  }).join('\n\n');
  const page = { title: 'This week · Energy & ecosystems', pageUrl: 'energy', text: agendaText, parsed: parseAgenda(agendaText) };
  return {
    host: 'example.instructure.com', courseCfg: { '101': { color: '#397960' }, '102': { color: '#7b5eae' }, '103': { color: '#4168b0' }, '104': { color: '#ae7331' }, '105': { color: '#b35f73' } },
    localEvents: [], doneLocal: [], dismissed: [], settings: { syncMinutes: 30, notifications: false, notifyHoursAhead: 24, showActivities: false, theme: 'system', weekStart: 0 }, lastError: null,
    cache: { host: 'example.instructure.com', user: { id: 1, name: 'Alex Taylor' }, courses, items, grades, agenda: { '101': { pages: [page], currentPageUrl: 'energy' } }, announcements: [{ courseId: 106, title: 'Saturday campus cleanup', posted: date(-1), text: 'Meet by the library at 10 a.m. Supplies provided.', url: courses[5].url }], groups: [], syncedAt: new Date().toISOString() }
  };
}

export function fixtureStream(state) {
  const activityIds = state.cache.courses.filter(c => state.courseCfg[c.id]?.activity ?? c.activity).map(c => String(c.id));
  const raw = state.cache.items.filter(i => state.settings.showActivities || !activityIds.includes(String(i.courseId)));
  return { ok: true, state, activityIds, items: buildStream(raw, state.courseCfg, { doneLocal: state.doneLocal, dismissed: state.dismissed, keptActive: state.keptActive, settings: state.settings, hiddenCourses: Object.keys(state.courseCfg).filter(id => state.courseCfg[id].hidden) }) };
}
