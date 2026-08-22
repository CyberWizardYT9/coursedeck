# Coursedeck privacy

Source code: https://github.com/CyberWizardYT9/coursedeck  
Last updated: 2026-08-21

Short version: your data never leaves your computer, because there is nowhere for it to go.

## What Coursedeck reads

Using the Canvas session you are already logged in to, it reads:

- your name and Canvas user id
- your active courses, teachers and current grades
- assignments, due dates, points and your own submission status
- calendar events from your courses and your school's calendar
- announcements from the last week
- module pages that look like weekly agendas
- your Canvas planner notes

This is the same information you can already see by clicking around Canvas. Coursedeck cannot see anything your account can't.

## What it writes

One thing: to-do items you create yourself are saved to **your own Canvas planner**, so they appear on your phone and in the Canvas app. Nothing else in Canvas is ever modified. Coursedeck never submits work, posts, messages anyone, or changes a grade.

## Where it's stored

In `chrome.storage.local` — your browser's own storage, on your own machine. Specifically: cached Canvas data, your per-class settings, manual to-dos, and which items you've ticked off.

## What is sent anywhere

Nothing. There is no Coursedeck account, server, database or analytics. The only network requests the extension makes are to your school's Canvas domain.

## Permissions, and why

| Permission | Why |
|---|---|
| `host_permissions` for your Canvas site | To read the Canvas API. This is the whole app. |
| `storage` | To keep your dashboard and settings on your machine. |
| `alarms` | To re-sync in the background every 30 minutes. |
| `notifications` | Optional reminders before something is due. Turn them off in Settings. |
| `tabs` + `scripting` | Fallback path: if your school's cookie settings block background requests, Coursedeck runs the same read inside a Canvas tab, where it's unambiguously first-party. Also used to read the CSRF token needed to save a planner note. |

It requests no permission for any site other than your Canvas.

## Deleting your data

**Settings → Erase everything**, or just uninstall the extension. Both remove all local data. Your Canvas account is untouched, except that planner notes you created stay in Canvas — delete those from Canvas or from Coursedeck before uninstalling if you want them gone.

## For parents, teachers and IT

Coursedeck is read-only against Canvas apart from a student's own planner notes. It runs entirely client-side under the student's existing authenticated session and grants no access that the student does not already have. There is no backend, no telemetry and no third-party code. The source is readable in full in the extension folder.
