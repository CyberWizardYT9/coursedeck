import { getState, setState, exportBackup, importBackup } from "../src/store.js";

const $ = s => document.querySelector(s);
const send = m => new Promise(r => chrome.runtime.sendMessage(m, r));

let S;
(async () => {
  S = await getState();
  $("#hostline").textContent = S.host ? `Connected to ${S.host}` : "Not connected to a school yet";
  $("#host").value = S.host || "";
  $("#syncMinutes").value = String(S.settings.syncMinutes);
  $("#notifyHoursAhead").value = String(S.settings.notifyHoursAhead);
  $("#notifications").checked = !!S.settings.notifications;
  $("#showActivities").checked = !!S.settings.showActivities;
})();

async function saveSettings(patch) {
  S = await getState();
  await setState({ settings: { ...S.settings, ...patch } });
  if (patch.syncMinutes) await send({ type: "setSchedule", minutes: Number(patch.syncMinutes) });
  await send({ type: "badge" });
}

$("#syncMinutes").onchange = e => saveSettings({ syncMinutes: Number(e.target.value) });
$("#notifyHoursAhead").onchange = e => saveSettings({ notifyHoursAhead: Number(e.target.value) });
$("#notifications").onchange = e => saveSettings({ notifications: e.target.checked });
$("#showActivities").onchange = e => saveSettings({ showActivities: e.target.checked });

$("#saveHost").onclick = async () => {
  const host = $("#host").value.trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "").toLowerCase();
  if (!host) return;
  if (!/\.instructure\.com$/.test(host)) {
    const ok = await chrome.permissions.request({ origins: [`https://${host}/*`] });
    if (!ok) { $("#dmsg").textContent = "Permission denied for that address."; return; }
  }
  await setState({ host, cache: null, lastError: null });
  await send({ type: "sync" });
  $("#dmsg").textContent = "Switched. Open the dashboard to see it.";
};

$("#export").onclick = async () => {
  const json = await exportBackup();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([json], { type: "application/json" }));
  a.download = `coursedeck-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
};

$("#importBtn").onclick = () => $("#importFile").click();
$("#importFile").onchange = async e => {
  const f = e.target.files[0];
  if (!f) return;
  try {
    await importBackup(await f.text());
    $("#dmsg").textContent = "Backup restored. Syncing…";
    await send({ type: "sync" });
    $("#dmsg").textContent = "Backup restored.";
  } catch (err) {
    $("#dmsg").textContent = "That file didn't look like a Coursedeck backup.";
  }
};

$("#reset").onclick = async () => {
  if (!confirm("Erase all Coursedeck data on this computer? Your Canvas account is not touched.")) return;
  await chrome.storage.local.clear();
  location.href = "setup.html";
};
