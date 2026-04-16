// ═════════════════════════════════════════════════════════
// SETTINGS — appearance, sync, class colors, exports
// ═════════════════════════════════════════════════════════
const Settings = (() => {
  const LS = 'pl3_settings';

  const defaults = {
    sTheme: 'auto',
    sNowLine: true,
    sAutoScroll: true,
    sFocusBar: true,
    sBlockDue: true,
    sAIEnabled: true,
    sStartHour: 5,
    sSlotH: 28,
    sWeekStart: 0,
    sNotify: false,
    sCrossSync: true,
  };

  let state = { ...defaults };
  try {
    const saved = JSON.parse(localStorage.getItem(LS));
    if (saved) state = { ...defaults, ...saved };
  } catch {}

  function get(key, fallback) {
    return state[key] !== undefined ? state[key] : (fallback !== undefined ? fallback : defaults[key]);
  }

  function set(key, val) {
    state[key] = val;
    try { localStorage.setItem(LS, JSON.stringify(state)); } catch {}
  }

  function applyTheme() {
    const theme = get('sTheme', 'auto');
    const html = document.documentElement;
    if (theme === 'auto') html.removeAttribute('data-theme');
    else html.setAttribute('data-theme', theme);
  }

  function applyLayoutVars() {
    document.documentElement.style.setProperty('--slot-h', get('sSlotH', 28) + 'px');
  }

  function applyVisibility() {
    const fb = document.getElementById('focusBar');
    if (fb) fb.style.display = get('sFocusBar', true) ? '' : 'none';
    const ab = document.getElementById('aiBubble');
    if (ab) ab.style.display = get('sAIEnabled', true) ? '' : 'none';
    if (!get('sAIEnabled', true)) {
      const p = document.getElementById('aiPanel');
      if (p) p.classList.remove('open');
    }
  }

  function init() {
    applyTheme();
    applyLayoutVars();
    applyVisibility();
    try {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      mq.addEventListener('change', () => { if (get('sTheme') === 'auto') applyTheme(); });
    } catch {}
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const el = document.getElementById('tzDisplay');
      if (el) el.textContent = tz;
    } catch {}
  }

  function open() {
    Object.keys(defaults).forEach(k => {
      const el = document.getElementById(k);
      if (!el) return;
      if (el.type === 'checkbox') el.checked = !!get(k);
      else el.value = String(get(k));
    });
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const el = document.getElementById('tzDisplay');
      if (el) el.textContent = tz;
    } catch {}
    document.getElementById('settingsOverlay').classList.add('open');
  }

  function close() { document.getElementById('settingsOverlay').classList.remove('open'); }
  function overlayClick(e) { if (e.target.id === 'settingsOverlay') close(); }

  function save() {
    Object.keys(defaults).forEach(k => {
      const el = document.getElementById(k);
      if (!el) return;
      if (el.type === 'checkbox') { set(k, el.checked); return; }
      if (k === 'sTheme' || k === 'sWeekStart') { set(k, el.value); return; }
      if (k === 'sStartHour' || k === 'sSlotH') { set(k, Number(el.value)); return; }
      set(k, el.value);
    });
    applyTheme();
    applyLayoutVars();
    applyVisibility();
    if (typeof App !== 'undefined') App.refresh();
  }

  function toggleDark() {
    const cur = get('sTheme', 'auto');
    const next = cur === 'dark' ? 'light' : 'dark';
    set('sTheme', next);
    applyTheme();
    Store.toast(`Switched to ${next} mode`);
  }

  async function toggleNotify() {
    const el = document.getElementById('sNotify');
    if (!el) return;
    if (el.checked) {
      const ok = await Notify.requestPermission();
      if (!ok) { el.checked = false; set('sNotify', false); return; }
      set('sNotify', true);
    } else {
      set('sNotify', false);
      Notify.stop();
    }
  }

  function forcePull() {
    Store.pull().then(changed => {
      if (changed) App.refresh();
      Store.toast(changed ? 'Pulled latest changes' : 'Already up to date');
    });
  }

  function clearSchedule() {
    if (!confirm('Clear all schedule data? This removes all blocks from all dates. Cannot be undone.')) return;
    Store.clearSchedule();
    App.refresh();
    Store.toast('Schedule cleared');
  }
  function clearTemplates() {
    if (!confirm('Reset all templates to defaults?')) return;
    Store.clearTemplates();
    Store.toast('Templates reset');
  }

  function exportICal() {
    const lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Planner//EN',
      'CALSCALE:GREGORIAN',
    ];
    Object.entries(Store.schedule).forEach(([dk, blocks]) => {
      blocks.forEach((b, i) => {
        if (!b.start || !b.end) return;
        const [y, mo, d] = dk.split('-').map(Number);
        const [sh, sm] = b.start.split(':').map(Number);
        const [eh, em] = b.end.split(':').map(Number);
        let endDay = d;
        if (eh * 60 + em < sh * 60 + sm) endDay = d + 1;
        const fmt = (y, mo, d, h, min) =>
          `${y}${String(mo).padStart(2,'0')}${String(d).padStart(2,'0')}T${String(h).padStart(2,'0')}${String(min).padStart(2,'0')}00`;
        lines.push('BEGIN:VEVENT');
        lines.push(`UID:${dk}-${i}-${Date.now()}@planner`);
        lines.push(`DTSTAMP:${fmt(y, mo, d, sh, sm)}`);
        lines.push(`DTSTART:${fmt(y, mo, d, sh, sm)}`);
        lines.push(`DTEND:${fmt(y, mo, endDay, eh, em)}`);
        lines.push(`SUMMARY:${(b.label||'').replace(/[,;]/g, ' ')}`);
        if (b.type) lines.push(`CATEGORIES:${b.type}`);
        if (b.recur === 'daily')    lines.push('RRULE:FREQ=DAILY');
        if (b.recur === 'weekly')   lines.push('RRULE:FREQ=WEEKLY');
        if (b.recur === 'weekdays') lines.push('RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR');
        lines.push('END:VEVENT');
      });
    });
    lines.push('END:VCALENDAR');
    const ics = lines.join('\r\n');
    const blob = new Blob([ics], { type: 'text/calendar' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `planner-${Store.todayStr()}.ics`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    Store.toast('Exported .ics file');
  }

  return {
    get, set, init, open, close, overlayClick, save,
    toggleDark, toggleNotify,
    forcePull, clearSchedule, clearTemplates,
    exportICal,
  };
})();
