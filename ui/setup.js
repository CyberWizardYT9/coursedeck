import { setState, getState } from "../src/store.js";

const $ = s => document.querySelector(s);
const send = msg => new Promise(res => chrome.runtime.sendMessage(msg, res));

function cleanHost(v) {
  return String(v || "").trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/.*$/, "")
    .replace(/^www\./i, "")
    .toLowerCase();
}

/* Pre-fill only if this browser has already been connected before.
   Otherwise the field stays empty with a placeholder as a hint — we never
   guess a school on someone's behalf. */
(async () => {
  const s = await getState();
  if (s.host) $("#host").value = s.host;
})();

$("#host").addEventListener("keydown", e => { if (e.key === "Enter") $("#check").click(); });

$("#check").onclick = async () => {
  const host = cleanHost($("#host").value);
  const msg = $("#msg");

  if (!host || !host.includes(".")) {
    msg.innerHTML = `<span class="bad">That does not look like a web address. It should look like <b>yourschool.instructure.com</b>.</span>`;
    return;
  }

  $("#check").disabled = true;
  msg.innerHTML = `<span class="spin"></span> Checking…`;

  if (!/\.instructure\.com$/.test(host)) {
    const granted = await chrome.permissions.request({ origins: [`https://${host}/*`] });
    if (!granted) {
      msg.innerHTML = `<span class="bad">Coursedeck needs your permission to read ${host}. Press Connect and choose Allow.</span>`;
      $("#check").disabled = false;
      return;
    }
  }

  await setState({ host });
  const r = await send({ type: "verify", host });

  if (!r || !r.ok) {
    const err = (r && r.error) || "could not reach it";
    msg.innerHTML = /401|sign|login|not signed/i.test(err)
      ? `<span class="bad">Found your school, but you are not signed in to Canvas.</span><br>
         Open Canvas in another tab, log in, then come back and press Connect again.
         <br><br><a class="btn" target="_blank" rel="noopener" href="https://${host}">Open Canvas</a>`
      : `<span class="bad">Could not reach ${host}.</span><br>
         Check the spelling, and make sure you are online. The address should look like
         <b>yourschool.instructure.com</b>.`;
    $("#check").disabled = false;
    return;
  }

  /* connected — start the first sync straight away */
  msg.textContent = "";
  $("#connectbox").style.display = "none";
  $("#donebox").style.display = "block";
  $("#hello").textContent = `Hi ${String(r.user.name || "").split(" ")[0]}!`;
  $("#doneMsg").innerHTML = `<span class="spin"></span> Loading your classes and homework. This takes 10–20 seconds.`;
  $("#prog").style.width = "45%";

  const res = await send({ type: "sync" });
  $("#prog").style.width = "100%";

  if (res && res.ok) {
    const n = res.data && res.data.courses ? res.data.courses.length : 0;
    $("#doneMsg").textContent = `All set — ${n} classes loaded. Coursedeck will keep itself up to date from now on.`;
    $("#open").disabled = false;
    $("#open").textContent = "Show me my work";
  } else {
    $("#doneMsg").innerHTML = `<span class="bad">Connected, but loading your classes did not finish.</span><br>
      Open the dashboard and press <b>Refresh now</b> — it will tell you what went wrong.`;
    $("#open").disabled = false;
    $("#open").textContent = "Open Coursedeck anyway";
  }
};

$("#open").onclick = () => { location.href = "dashboard.html"; };
