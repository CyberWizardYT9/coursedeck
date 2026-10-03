# Changelog

## 2.5.0

### A clearer workspace

- Persistent navigation, a daily focus card, and an interactive seven-day workload view.
- Search assignment titles, class names and descriptions; combine class and time filters; sort within due-date groups.
- Refined light and dark appearances across the dashboard, popup, setup and settings. Choose a theme or follow the device.
- Accessible task disclosures, labeled calendar buttons, modal focus management, and keyboard shortcuts (`/` to search, `N` to add a reminder).
- Undo completion and hiding; restore hidden items in Settings. Repeating reminders clearly explain that they stay on this computer.
- Choose Sunday or Monday as the first calendar day.

### More dependable data

- Partial refreshes retain saved assignments, grades, notes and weekly plans where available, with an explicit notice.
- Overlapping refreshes share one request. Reminder additions and deletions made during a refresh survive the final cache update.
- Fetch weekly plans beyond the first 16 pages; fetch module items separately when Canvas omits them.
- Past events no longer appear as overdue homework. All-day events retain their date in calendar exports.
- Month navigation cannot skip a short month. Weekly plans respect explicitly supplied years and reject impossible dates.
- Network reads have timeouts. Failed writes are not automatically replayed.
- Validate pasted school addresses and backups before saving. Switching schools keeps local reminders and preferences in separate, recoverable profiles.
- Popup keeps saved coursework visible when Canvas is unavailable. Personal reminders open the workspace.

### Development

- Reproducible `npm test`, local fixture preview (`npm run dev`), and runtime-only packaging (`npm run package`).
- Windows-compatible structural validation and automated checks on Windows and Linux.
- No added extension permissions, external fonts, analytics, runtime dependencies, or remote code.

Validation uses fictional fixture data and mocked Canvas responses. Real school sign-in, tab-based cookie fallback, Chrome notifications, and a Chrome Web Store update require a live extension check before release.
