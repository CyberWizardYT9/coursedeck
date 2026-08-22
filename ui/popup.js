import { daysUntil, colorFor } from "../src/model.js";

const $ = s => document.querySelector(s);
const send = m => new Promise(r => chrome.runtime.sendMessage(m, r));
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

function when(it) {
  if (!it.due) return "no due date";
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
  if (!r.state.host) {
    $("#body").innerHTML = `<div class="sub">Not set up yet.</div>
      <div style="margin-top:9px"><button class="btn sm" id="go">Set up Coursedeck</button></div>`;
    $("#go").onclick = () => chrome.tabs.create({ url: chrome.runtime.getURL("ui/setup.html") });
    return;
  }
  if (r.state.lastError) {
    const e = r.state.lastError.message || "";
    if (/401|sign|login/i.test(e)) {
      $("#body").innerHTML = `<div class="sub">You're signed out of Canvas. Sign in, then press Sync.</div>
        <div style="margin-top:9px"><a class="btn sm" target="_blank" href="https://${esc(r.state.host)}">Open Canvas ↗</a></div>`;
      return;
    }
  }

  // hide the archive bucket here too — a phone-sized list has no room for last year
  const open = r.items.filter(i => !i.done && i.bucket !== "stale");
  const soon = open.filter(i => i.due && daysUntil(i.due) <= 7).slice(0, 8);
  const overdue = open.filter(i => i.due && daysUntil(i.due) < 0).length;

  $("#body").innerHTML =
    `<div class="sub" style="margin-bottom:10px">${open.length} open${overdue ? ` · <b style="color:var(--red)">${overdue} overdue</b>` : ""}</div>` +
    (soon.length ? soon.map(it => `
      <div class="mini b-${it.bucket}">
        <a target="_blank" rel="noopener" href="${esc(it.url || "#")}">
          <div class="t">${esc(it.title)}</div>
          <div class="m"><span class="pill" style="background:${colorFor(it.courseId || 0)};font-size:9.5px">${esc(it.courseShort || "—")}</span>
            ${when(it)}${it.points ? " · " + it.points + " pts" : ""}</div>
        </a>
      </div>`).join("")
      : `<div class="sub">Nothing due in the next week.</div>`);
}

$("#open").onclick = () => chrome.tabs.create({ url: chrome.runtime.getURL("ui/dashboard.html") });
$("#sync").onclick = async () => {
  $("#sync").disabled = true;
  $("#sync").textContent = "…";
  await send({ type: "sync" });
  $("#sync").disabled = false;
  $("#sync").textContent = "Sync";
  paint();
};
paint();
