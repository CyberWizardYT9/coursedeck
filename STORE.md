# Publishing Coursedeck to the Chrome Web Store

Everything the listing form asks for, pre-written. Copy and paste.

---

## Before you start

- [ ] A Google account you're happy to have as the public developer identity
- [ ] **$5** one-time developer registration fee (covers up to 20 extensions, never renews)
- [ ] A **public URL** for the privacy policy — Google requires one, a file in the zip does not count
- [ ] `manifest.json` → set `homepage_url` to your real repo before uploading
- [ ] Screenshots (see below)

Fastest way to get a privacy policy URL: push this folder to a public GitHub repo, turn on
**Settings → Pages**, and link to the rendered `PRIVACY.md`. A public Gist also works.

---

## Listing copy

**Name:** `Coursedeck`

**Short description** (132 char max):

> All your Canvas classes in one place. See every assignment, due date and club — sorted by what actually matters next.

**Category:** Productivity → Education
**Language:** English

**Detailed description:**

> Canvas makes you open each class one at a time to find out what you owe. Coursedeck puts all of it on one page.
>
> • Every assignment from every class in a single list, ordered by what is actually urgent
> • A grades tab showing everything handed back — score, percentage, late penalties and teacher comments
> • Tells you WHY something is near the top — how soon it is due, what it is worth, whether that teacher takes late work
> • Finds homework hiding on weekly module pages that never became a real assignment, so Canvas never reminds you about it
> • Tick off paper hand-ins that Canvas leaves marked "unsubmitted" forever
> • Work from last year stops shouting — anything months overdue moves to an archive
> • Clubs and homerooms get their own tab instead of cluttering your homework
> • Add your own reminders; they save into your Canvas planner so they show up on your phone too
> • Export everything to Google Calendar or Apple Calendar
> • Your school's holidays, early dismissals and exam weeks alongside your work
>
> Works with any school that uses Canvas. Type your school's address once and you're done.
>
> No account. No password. No API token. Coursedeck reads Canvas using the login you already have open in your browser, and everything stays on your own computer — there is no Coursedeck server.
>
> Coursedeck is an independent student project. It is not affiliated with or endorsed by Instructure, Inc. Canvas is a trademark of Instructure, Inc.

---

## Permission justifications

Paste each into the matching box. Reviewers reject vague answers, so each one names the feature.

**`storage`**
> Saves the user's dashboard locally: their cached course list, per-class settings such as late-work policy, their own reminders, and which items they have ticked off. Nothing is sent anywhere.

**`alarms`**
> Refreshes the Canvas data in the background every 30 minutes so the dashboard and toolbar badge are current when the user opens them.

**`notifications`**
> Optional reminders before an assignment is due. The user can turn these off in settings.

**`tabs`**
> Used to locate an already-open Canvas tab so the extension can read data first-party, and to open the dashboard when a notification is clicked. The extension does not read browsing history or monitor tabs on other sites.

**`scripting`**
> Some schools' cookie settings block a background request from carrying the Canvas session. In that case the extension runs the same read-only Canvas API request inside a Canvas tab, where it is unambiguously first-party. Also used to read the CSRF token Canvas requires in order to save a to-do into the user's own Canvas planner. Scripts are only ever injected into the user's own Canvas domain.

**`host_permissions: https://*.instructure.com/*`**
> This is the extension's entire purpose: reading the signed-in user's own courses, assignments, calendar and grades from their school's Canvas instance. Canvas is hosted per-school on instructure.com subdomains, so the subdomain cannot be known in advance.

**`optional_host_permissions: https://*/*`** ← *expect a question about this one*
> Not requested at install. Some schools host Canvas on their own domain (for example canvas.university.edu) instead of an instructure.com subdomain. Because that domain differs per school and cannot be known in advance, the extension asks the user for permission to that single domain at setup time, only after they type it in. Users at instructure.com schools are never prompted. No host permission is ever requested automatically or in the background.

**Remote code:** No. All JavaScript is included in the package; nothing is fetched or evaluated at runtime.

---

## Privacy tab answers

**Single purpose:**
> Show a student their own Canvas coursework — assignments, due dates, calendar events and grades — from every class in one prioritised dashboard.

**Data collection:** tick only **Personally identifiable information** and **Website content**, then in the notes:
> Course and assignment data is read from the user's own Canvas account and cached in local browser storage so the dashboard works offline. It is never transmitted anywhere — the extension has no server and makes no network requests to any domain other than the user's own school Canvas.

Then certify all three:
- [x] Not being sold to third parties
- [x] Not used or transferred for purposes unrelated to the single purpose
- [x] Not used to determine creditworthiness or for lending

---

## Screenshots

Five slots, **1280×800**. Take them with a real account, then blur or rename anything private —
your full name, teacher names, and grades all appear on screen.

1. **To do** tab with a few groups open — this is the whole pitch, make it slot one
2. A row expanded, showing "Ranked here because…" and Open in Canvas
3. **Week plans** with the day cards
4. **Calendar** with a day selected
5. **Grades** showing returned work and class averages

Small promo tile: **440×280** — wordmark on the dark card colour is enough.

Tip: set your browser window to exactly 1280×800 before capturing, and use the Classes tab's
Hide checkbox to trim anything you'd rather not show.

---

## Choosing a visibility

| | Who can install | Shows in search | Needs review |
|---|---|---|---|
| **Public** | anyone | yes | yes |
| **Unlisted** | anyone with the link | no | yes — same standard |
| **Private** | only accounts you list, or your Google Workspace domain | no | yes |

**Unlisted is the right first move.** Same review, but you can hand the link to a few friends,
watch it work on their schools, and fix things before it's searchable. Flip it to Public later
without resubmitting.

---

## What to expect

Review times vary a lot. A simple extension with narrow permissions can clear in under an hour;
anything requesting broad host access goes to human review, and as of mid-2026 the queue has been
running long — community reports of multi-week waits are common. Coursedeck asks for a broad
optional host permission, so plan for the slow path, not the fast one.

If it comes back rejected, it will name a policy section. The two likely ones here:

- **Broad host permissions** — point them at the justification above. The key sentence is that
  `https://*/*` is *optional*, requested per-domain at setup, and never granted automatically.
- **Privacy policy** — usually means the URL 404s, or doesn't mention every permission. Ours does;
  make sure the link actually resolves publicly.

Fix and resubmit. There's no penalty for a rejection.

---

## Updating later

Bump `version` in `manifest.json` (Chrome refuses an upload that doesn't increase it), zip the
folder again, upload as a new package. Existing users update automatically within a few hours.
Their settings and reminders survive — `chrome.storage.local` is not cleared by an update.

Run the tests before every upload:

```bash
echo '{"type":"module"}' > package.json
node test/model.test.mjs && node test/validate.mjs && node test/ui.test.mjs
rm -rf package.json node_modules
```

---

## If you'd rather not use the store at all

Sharing the zip and having people **Load unpacked** works fine and costs nothing. The trade-offs:

- Chrome nags about developer-mode extensions on every restart
- No automatic updates — you re-send the folder each time
- Some school-managed Chromebooks block unpacked extensions entirely

For more than a handful of people, the $5 is worth it.
