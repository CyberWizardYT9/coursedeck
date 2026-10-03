# Coursedeck

A simple Canvas student planner. See assignments, homework, grades, calendar events and reminders in one place.

Connect your school's Canvas using your existing browser sign-in. No separate CourseDeck account or API token is needed. School access policies and course content can affect what is available.

Version 2.6 keeps old reminders and uncertain test statuses out of your active list, with searchable history and adjustable grouping. It includes the redesigned workspace and sync improvements from 2.5. See [CHANGELOG.md](CHANGELOG.md).

---

## Install (5 minutes)

1. Download the `coursedeck` folder (or unzip `coursedeck.zip`).
2. Open Chrome and go to `chrome://extensions`.
3. Turn on **Developer mode** (top right).
4. Click **Load unpacked** and pick the `coursedeck` folder.
5. A setup tab opens. Type your school's Canvas address — the part of the URL before the first `/`, like `myschool.instructure.com` — and press **Connect**.

That's it. Pin the icon to your toolbar for one-click access, or press `Alt+Shift+C`.

Works in Chrome, Edge, Brave, Opera and any other Chromium browser. Not Firefox or Safari (different extension formats).

---

## How it reads your Canvas

Coursedeck uses the Canvas session **you are already signed in to in your browser**. It's the same thing that happens when you click around Canvas normally — the same cookies, the same permissions, the same data you can already see.

It deliberately does **not** use API access tokens, for two reasons: plenty of schools disable them outright, and getting students in the habit of generating and pasting long-lived credentials is a bad idea.

If you're signed out of Canvas, Coursedeck says so and stops. Sign back in and press Sync.

---

## What it does that Canvas doesn't

**Everything in one list.** Canvas makes you visit each course to see what's there. Coursedeck merges every class into a single stream sorted by urgency, with the class colour-coded on each row.

**It reads the weekly agenda pages.** This is the big one. Many teachers put the real homework on a "Week 5" page inside Modules and never create a Canvas assignment for it — so Canvas never reminds you, and it never appears on your to-do list. Coursedeck finds those pages, parses them into day-by-day cards, highlights today, and **opens the week that actually covers today** rather than the highest-numbered one.

Teachers lay these pages out however they like. Coursedeck handles the three layouts seen in one school alone:

| Layout | Looks like | Handled |
|---|---|---|
| Date first | `Date · Day · Topic · Homework` | day cards |
| Day first | `Mon · 8/17 · Topic + homework in one cell` | day cards, topic split from homework |
| Week blocks | `Week 1: … Week 2: …`, no dates at all | week list |

Anything it cannot parse falls back to the page's plain text rather than showing you a blank tab. Bullet notes underneath the table ("bring your lab notebook") are pulled out and shown as teacher notes.

**Grades and returned work.** A tab showing everything a teacher has handed back, newest first — the score, the percentage, any late penalty, and the teacher's comment if they left one. Plus a card per class with your average across returned work and whether your recent scores are trending up or down. It is labelled as *work returned so far*, not your official grade, because Canvas weights categories in ways this cannot see.

**Less clutter.** Past reminders move to a collapsed group the next day. Assignments more than 14 days overdue move to Older assignments. Everything remains searchable. Choose **Keep in my list** for work you still need to do, or adjust these windows in Settings.

**Everything fits on a screen.** Rows are one line each: tick box, title, class, when, points. Click a row for the description, how to hand it in, and why it's ranked where it is. Groups collapse, and the ones that are reference rather than work start collapsed.

**Clearer completion status.** Canvas may not know that you have completed a paper test or work in another tool. Past items with these submission types go to **Check status**, rather than being presented as definitely missing. Tick off completed work yourself; this changes CourseDeck only. Online assignments flagged missing by Canvas retain a **Canvas: missing** label.

**Choose what to do next.** Sort by priority, due date or title. Priority considers deadlines, points, and your class preferences, with the reasons shown in the item details.

**Your own to-dos, synced.** Items you add are written to your Canvas planner, so they show up on your phone, in the Canvas app, and in Coursedeck on any other computer. Repeating items (practice, rehearsals, a weekly club) are stored locally, because Canvas has no repeat feature.

**Clubs and activities.** Courses that are really clubs, homerooms or info shells get their own tab with recent announcements, and are kept out of your homework list by default. Coursedeck guesses which ones; you can correct it with one checkbox, or mix them back in.

**The school calendar.** Holidays, early dismissals, exam weeks and quarter-end dates come from your school's account calendar, alongside your coursework.

**Export to any calendar app.** The `.ics` export drops every upcoming item into Google Calendar, Apple Calendar or Outlook.

---

## Phones and tablets — read this before you promise anyone

**Chrome on Android and iOS does not run extensions, and Google has said it is not adding it to the phone browser.** No extension can work around that. So Coursedeck cannot install on a normal phone browser.

What actually works on a phone:

- **Your own reminders sync.** Anything you add in Coursedeck is written into your Canvas planner, so it appears in the official Canvas app on your phone, no extension needed.
- **Calendar export.** The `.ics` file drops your due dates into your phone's calendar app.
- **Android, if you want the full thing.** Chromium forks such as Kiwi Browser, or Edge Canary, can install desktop Chrome extensions. Coursedeck's layout is fully responsive and works down to about 360px, so it is usable there.
- **Tablets and Chromebooks** run it normally.

---

## Setting up your classes (worth two minutes)

Open the **Classes** tab and set each course's **late-work policy**:

| Setting | Use it when |
|---|---|
| No late work accepted | The teacher means it. Ranks these highest while they're still on time. |
| Percentage off per day | e.g. −10%/day. |
| Accepted with a penalty | Vague or lenient. |
| Not set | Leave it and priority ignores the policy. |

Then set **typical effort** — "Heavy" pushes long assignments up the list days before they're due, so a two-week project doesn't ambush you.

This is the part that makes the ordering good, and it's why the app doesn't ship with anyone's teachers hardcoded.

---

## Privacy

- Everything is stored in your browser on your own computer.
- There is no Coursedeck server or analytics. Reminders you create can be saved to your own Canvas planner.
- The only site it ever talks to is your school's Canvas.
- Uninstalling deletes everything. **Settings → Export backup** saves your class settings and to-dos to a file if you're moving computers.

See `PRIVACY.md`.

---

## Sharing it with friends

Send them the folder or the zip and point them at the install steps above. Each person connects their own Canvas login. There's nothing shared between users, and nothing for you to run or host.

Students at other schools just type their own Canvas address at setup. If their school uses a custom domain like `canvas.school.edu` instead of `*.instructure.com`, Chrome asks them to approve that one site.

---

## If something breaks

**"Load unpacked" refuses the folder** — make sure you picked the folder that directly contains `manifest.json`, not its parent.

**Setup says you're not signed in** — open your Canvas in another tab, log in, then press Connect again.

**Nothing appears after syncing** — open `chrome://extensions`, find Coursedeck, click **service worker** to open its console, then press Sync and read the error. Most first-run problems are either a wrong Canvas address or being logged out.

**Sync works but a course is missing** — check the Classes tab; it may be hidden, or flagged as a club. Concluded or unpublished courses are skipped on purpose.

**Something old and irrelevant is in my list** — use Settings to adjust automatic grouping. Past reminders and older assignments stay in collapsed, searchable groups. You can also hide an individual item, or hide a whole class on the Classes tab.

**It's slow the first time** — the first sync reads every course, its assignments, the calendar and the module pages. Later syncs are quicker, and it re-syncs by itself every 30 minutes.

---

## Developing

```
coursedeck/
  manifest.json        Chrome MV3 manifest
  background.js        service worker — syncing, badge, reminders, messaging
  src/model.js         pure logic: normalizing, priority, buckets, ICS  (no browser APIs)
  src/canvas.js        Canvas REST client + full-sync orchestration
  src/store.js         chrome.storage wrapper
  ui/                  dashboard, popup, setup, settings
  test/                model tests, agenda + grade tests, structural validation, jsdom UI test
```

Use Node.js 22 or newer. There are no runtime dependencies; development dependencies support tests and packaging.

```bash
cd coursedeck
npm ci
npm test
npm run dev
# Open http://127.0.0.1:4173/ui/dashboard.html
npm run package
```

The preview injects fictional student data and an in-memory Chrome API adapter. It never contacts Canvas. Preview states are available at `?scenario=dark`, `?scenario=empty`, `?scenario=offline`, and `?scenario=partial`. Reminder changes in the preview reset on reload. It supports the dashboard, popup, settings and setup pages.

Packaging writes `dist/coursedeck-2.6.0.zip` and an unpacked folder beside it. Only extension runtime files, required icons, the license and privacy information are included. Tests, demo data, development packages and promotional assets stay out of the extension. Load the unpacked folder at `chrome://extensions` for a live check.

Automated checks cover the original model and agenda behavior, dashboard interactions, partial Canvas failures, simultaneous reminder writes, school profiles, all-day dates, UTF-8 exports and backup validation. The GitHub workflow runs on Windows and Linux. Before publishing, verify sign-in, Canvas tab fallback, custom-domain permission prompts, planner writes and notifications in a real Chrome profile.

Use `/` to search and `N` to add a reminder when you are not typing in another field. Theme and calendar week-start preferences are in Settings. Completion and hiding offer Undo; Settings can restore hidden items.

Traps worth knowing about if you extend this:

- Canvas's `unsubmitted` state **contains the substring** `submitted`. Match it anchored or you'll silently hide work that's still owed. There's a test for it.
- Canvas returns UTC. A due date of `2026-08-21T03:59:59Z` is **11:59pm on the 20th** in New York. Convert before you show a date to anyone.
- `chrome.runtime.sendMessage` serialises through JSON. A `Set` arrives on the other side as `{}`, and `new Set({})` throws — which takes the whole page down before it can even show you the error. `validate.mjs` fails the build if the service worker tries to return one.
- `load()` can start a sync, and a finished sync calls `load()` again. Keep the latch, or a failing first sync becomes an infinite request loop.
- Weekly agenda pages are parsed at **sync** time, not render time, so the app knows which week covers today before you open the tab. Sorting pages by the number in the title is wrong — "Week 9" is not the current week in September.
- Pass/fail submissions come back with `grade: "complete"` *and* a full numeric score. Never render a percentage for them; "Complete 100%" reads like a mark nobody gave.

---

## Naming

Coursedeck is an independent student project. It isn't affiliated with, endorsed by, or connected to Instructure, and "Canvas" is Instructure's trademark — referenced here only to say what the tool works with.

MIT licensed. Do what you like with it.
