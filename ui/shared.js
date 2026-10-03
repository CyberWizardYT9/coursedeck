/* Shared, dependency-free UI primitives. Safe for the extension's CSP. */
export function sendMessage(message) {
  return new Promise(resolve => {
    try {
      chrome.runtime.sendMessage(message, response => {
        const error = chrome.runtime.lastError;
        resolve(error ? { ok: false, error: error.message } : response || { ok: false, error: 'No response from Coursedeck. Please reopen the extension.' });
      });
    } catch (error) { resolve({ ok: false, error: error.message }); }
  });
}

export function safeHref(value) {
  try { const url = new URL(value); return /^https?:$/.test(url.protocol) ? url.href : '#'; }
  catch { return '#'; }
}

export function applyTheme(settings = {}) {
  const theme = ['light', 'dark'].includes(settings.theme) ? settings.theme : 'system';
  document.documentElement.dataset.theme = theme;
  return theme;
}

export function downloadFile(contents, filename, type) {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const link = document.createElement('a'); link.href = url; link.download = filename; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function setupDialogs() {
  let opener = null;
  const close = modal => {
    modal.classList.remove('on');
    document.body.classList.remove('dialog-open');
    if (opener?.isConnected) opener.focus();
  };
  const open = (modal, focus) => {
    opener = document.activeElement;
    modal.classList.add('on'); document.body.classList.add('dialog-open');
    (focus || modal.querySelector('input,button,a,select,textarea'))?.focus();
  };
  document.querySelectorAll('.modal').forEach(modal => modal.addEventListener('click', e => { if (e.target === modal) close(modal); }));
  document.addEventListener('keydown', e => {
    const modal = document.querySelector('.modal.on');
    if (!modal) return;
    if (e.key === 'Escape') { e.preventDefault(); close(modal); }
    if (e.key !== 'Tab') return;
    const focusable = [...modal.querySelectorAll('input,select,textarea,button,a[href],[tabindex="0"]')].filter(x => !x.disabled && !x.hidden);
    const first = focusable[0], last = focusable.at(-1);
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
  });
  return { open, close };
}

export function drawIcons() {
  const paths = {
    tasks: '<rect x="4" y="4" width="16" height="16" rx="4"/><path d="m8 12 3 3 5-6"/>',
    grades: '<path d="M5 20V10m7 10V4m7 16v-7"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4m10-4v4M3 11h18m-13 5h2m4 0h2"/>',
    plans: '<path d="M12 6v15M3 4h5a4 4 0 0 1 4 3 4 4 0 0 1 4-3h5v15h-5a4 4 0 0 0-4 2 4 4 0 0 0-4-2H3z"/>',
    classes: '<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
    clubs: '<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3m2-16a3 3 0 0 1 0 6m2 10v-3a6 6 0 0 0-2-4"/>',
    heart: '<path d="M20.5 4.5a5 5 0 0 0-7 0L12 6l-1.5-1.5a5 5 0 0 0-7 7L12 20l8.5-8.5a5 5 0 0 0 0-7Z"/>',
    settings: '<path d="M4 7h16M4 17h16"/><circle cx="8" cy="7" r="3"/><circle cx="16" cy="17" r="3"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/>',
    refresh: '<path d="M20 7v5h-5M4 17v-5h5M6 6a8 8 0 0 1 13 2M5 16a8 8 0 0 0 13 2"/>',
    arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
    download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1 1m12 12 1 1M5 19l1-1M18 6l1-1"/>',
    chevron: '<path d="m9 5 7 7-7 7"/>'
  };
  document.querySelectorAll('[data-icon]').forEach(el => {
    el.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[el.dataset.icon] || paths.tasks}</svg>`;
  });
}
