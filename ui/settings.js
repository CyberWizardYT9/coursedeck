import { getState, setState, switchSchool, exportBackup, importBackup, validateBackup } from "../src/store.js";
import { normalizeHost } from "../src/model.js";
import { sendMessage, applyTheme, downloadFile } from "./shared.js";

const $ = s => document.querySelector(s);
const send = sendMessage;

let S;
async function paintSettings() {
  S = await getState();
  applyTheme(S.settings);
  $("#theme").value = S.settings.theme || "system";
  $("#weekStart").value = String(S.settings.weekStart || 0);
  $("#assignmentArchiveDays").value = String(S.settings.assignmentArchiveDays ?? 14);
  $("#reminderArchiveDays").value = String(S.settings.reminderArchiveDays ?? 0);
  $("#hostline").textContent = S.host ? `Connected to ${S.host}` : "Not connected to a school yet";
  $("#host").value = S.host || "";
  $("#syncMinutes").value = String(S.settings.syncMinutes);
  $("#notifyHoursAhead").value = String(S.settings.notifyHoursAhead);
  $("#notifications").checked = !!S.settings.notifications;
  $("#showActivities").checked = !!S.settings.showActivities;
}
paintSettings();

async function saveSettings(patch) {
  S = await getState();
  await setState({ settings: { ...S.settings, ...patch } });
  applyTheme({ ...S.settings, ...patch });
  if (patch.syncMinutes) await send({ type: "setSchedule", minutes: Number(patch.syncMinutes) });
  await send({ type: "badge" });
  $("#savedStatus").textContent = "Preferences saved.";
}

$("#theme").onchange = e => saveSettings({ theme: e.target.value });
$("#weekStart").onchange = e => saveSettings({ weekStart: Number(e.target.value) });
$("#assignmentArchiveDays").onchange = e => saveSettings({ assignmentArchiveDays: Number(e.target.value) });
$("#reminderArchiveDays").onchange = e => saveSettings({ reminderArchiveDays: Number(e.target.value) });
$("#restoreHidden").onclick = async () => { await setState({ dismissed: [] }); await send({ type: "badge" }); $("#dmsg").textContent = "Hidden items restored. Hidden classes can be restored from the Classes tab."; };

$("#syncMinutes").onchange = e => saveSettings({ syncMinutes: Number(e.target.value) });
$("#notifyHoursAhead").onchange = e => saveSettings({ notifyHoursAhead: Number(e.target.value) });
$("#notifications").onchange = e => saveSettings({ notifications: e.target.checked });
$("#showActivities").onchange = e => saveSettings({ showActivities: e.target.checked });

$("#saveHost").onclick = async () => {
  let host;
  try { host = normalizeHost($("#host").value); }
  catch (error) { $("#dmsg").textContent = error.message; return; }
  $("#saveHost").disabled = true;
  try {
  if (!/\.instructure\.com$/.test(host)) {
    const ok = await chrome.permissions.request({ origins: [`https://${host}/*`] });
    if (!ok) { $("#dmsg").textContent = "Permission denied for that address."; return; }
  }
  $("#dmsg").textContent = "Checking your Canvas connection…";
  const verified = await send({ type: "verify", host });
  if (!verified?.ok) { $("#dmsg").textContent = "Could not verify that school. Sign in to Canvas and try again. Your current school is unchanged."; return; }
  await switchSchool(host);
  const result = await send({ type: "sync" });
  await paintSettings();
  $("#dmsg").textContent = result?.ok ? "Connected. Your workspace is ready." : "School connected. Refresh in the dashboard to finish loading your classes.";
  } catch { $("#dmsg").textContent = "Could not change school. Please try again."; }
  finally { $("#saveHost").disabled = false; }
};

$("#export").onclick = async () => {
  const json = await exportBackup();
  downloadFile(json, `coursedeck-backup-${new Date().toISOString().slice(0, 10)}.json`, "application/json");
};

$("#importBtn").onclick = () => $("#importFile").click();
$("#importFile").onchange = async e => {
  const f = e.target.files[0];
  if (!f) return;
  try {
    const text = await f.text(), backup = validateBackup(text);
    if (backup.host && !/\.instructure\.com$/.test(backup.host)) {
      const allowed = await chrome.permissions.request({ origins: [`https://${backup.host}/*`] });
      if (!allowed) { $("#dmsg").textContent = "Backup not imported. Allow access to its Canvas school first."; return; }
    }
    await importBackup(text);
    $("#dmsg").textContent = "Backup restored. Syncing…";
    const result = await send({ type: "sync" });
    await paintSettings();
    $("#dmsg").textContent = result?.ok ? "Backup restored and refreshed." : "Backup restored. Sign in to Canvas and refresh to load your coursework.";
  } catch (err) {
    $("#dmsg").textContent = "That file didn't look like a Coursedeck backup.";
  }
  finally { e.target.value = ""; }
};

$("#reset").onclick = async () => {
  if (!confirm("Erase all Coursedeck data on this computer? Your Canvas account is not touched.")) return;
  await chrome.storage.local.clear();
  location.href = "setup.html";
};
