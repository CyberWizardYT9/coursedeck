import { daysUntil, colorFor, isActionable } from "../src/model.js";
import { sendMessage, applyTheme, safeHref, drawIcons } from "./shared.js";

const $ = s => document.querySelector(s);
const send = sendMessage;
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

function when(it) {
  if (!it.due) return "no due date";
  if (it.allDay) return new Date(it.allDayDate ? `${it.allDayDate}T12:00:00` : it.due).toLocaleDateString([], { month: "short", day: "numeric" }) + " · all day";
  const d = daysUntil(it.due);
  const t = new Date(it.due).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (d < 0) return `${Math.abs(d)}d overdue`;
  if (d === 0) return `today ${t}`;
  if (d === 1) return `tomorrow ${t}`;
  if (d <= 6) return new Date(it.due).toLocaleDateString([], { weekday: "long" });
  return new Date(it.due).toLocaleDateString([], { month: "short", day: "numeric" });
}

async function paint() {
  const r = await send({ type: "stream" });
  if (!r || !r.ok) { $("#body").innerHTML = `<div class="sub">Something went wrong.</div>`; return; }
  applyTheme(r.state.settings);
  if (!r.state.host) {
    $("#body").innerHTML = `<div class="sub">Not set up yet.</div>
      <div style="margin-top:9px"><button class="btn sm" id="go">Set up Coursedeck</button></div>`;
    $("#go").onclick = () => chrome.tabs.create({ url: chrome.runtime.getURL("ui/setup.html") });
    return;
  }
  let notice = "";
  if (r.state.lastError) {
    const e = r.state.lastError.message || "";
    if (/401|sign|login/i.test(e)) {
      notice = `<div class="popup-notice">You're signed out of Canvas. Your saved work is below. Sign in, then refresh.
        <div style="margin-top:9px"><a class="btn sm" target="_blank" href="https://${esc(r.state.host)}">Open Canvas ↗</a></div>`;
      notice += '</div>';
    }
    else notice = '<div class="popup-notice">Canvas could not be refreshed. Showing your saved work.</div>';
  }
  if (!notice && r.state.cache?.warnings?.length) notice = '<div class="popup-notice">Some information could not be refreshed. Open your workspace for details.</div>';

  // hide the archive bucket here too — a phone-sized list has no room for last year
  const open = r.items.filter(isActionable);
  const soon = open.filter(i => i.due && daysUntil(i.due) <= 7).slice(0, 8);
  const overdue = open.filter(i => i.bucket === "overdue").length;
  const today = open.filter(i => i.bucket === "today").length;

  $("#body").innerHTML =
    notice + `<div class="popup-stats"><div><b>${today}</b><span>Due today</span></div><div><b>${overdue}</b><span>Overdue</span></div><div><b>${open.length}</b><span>All open</span></div></div>` +
    (soon.length ? soon.map(it => `
      <div class="mini b-${it.bucket}">
        <a target="_blank" rel="noopener" href="${esc(it.url ? safeHref(it.url) : chrome.runtime.getURL("ui/dashboard.html"))}">
          <div class="t">${esc(it.title)}</div>
          <div class="m"><span class="mini-course" style="color:${r.state.courseCfg?.[it.courseId]?.color || colorFor(it.courseId || 0)}">${esc(it.courseShort || "—")}</span>
            ${when(it)}${it.points ? " · " + it.points + " pts" : ""}</div>
        </a>
      </div>`).join("")
      : `<div class="popup-empty">A little breathing room.<span>Nothing due in the next week.</span></div>`);
}

$("#open").onclick = () => chrome.tabs.create({ url: chrome.runtime.getURL("ui/dashboard.html") });
$("#sync").onclick = async () => {
  $("#sync").disabled = true;
  $("#sync").innerHTML = '<span class="spin"></span>';
  const result = await send({ type: "sync" });
  $("#sync").disabled = false;
  $("#sync").innerHTML = '<span data-icon="refresh"></span>';
  await paint(); drawIcons();
  if (!result?.ok && !document.querySelector('.popup-notice')) $("#body").insertAdjacentHTML('afterbegin', '<div class="popup-notice">Refresh could not finish. Reopen the extension to try again.</div>');
};
drawIcons();
paint();
