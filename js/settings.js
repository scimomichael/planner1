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
    sBlockDesc: true,
    sBlockPriority: true,
    sBlockLocation: true,
    sBlockLink: true,
    sConflictWarn: true,
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
    renderCalSubs();
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

  // ── Calendar Subscriptions ─────────────────────────────
  const TYPE_OPTIONS = [
    ['class','Class'], ['exam','Exam'], ['meeting','Meeting'], ['study','Study'],
    ['ec','Extracurricular'], ['free','Free'], ['meal','Meal'],
    ['sleep','Sleep'], ['work','Work'], ['other','Other'],
  ];
  function _typeLabel(id) {
    const row = TYPE_OPTIONS.find(t => t[0] === id);
    return row ? row[1] : id;
  }
  function _fmtAgo(ts) {
    if (!ts) return 'Never synced';
    const diff = Date.now() - ts;
    if (diff < 60000) return 'Synced just now';
    if (diff < 3600000) return `Synced ${Math.round(diff/60000)} min ago`;
    if (diff < 86400000) return `Synced ${Math.round(diff/3600000)} hr ago`;
    return `Synced ${Math.round(diff/86400000)} days ago`;
  }
  function renderCalSubs() {
    const host = document.getElementById('calSubsList');
    if (!host) return;
    const subs = Store.getCalSubs();
    if (!subs.length) {
      host.innerHTML = `<div class="calsub-empty">No calendar subscriptions yet.</div>`;
      return;
    }
    host.innerHTML = subs.map(s => {
      const optsHTML = TYPE_OPTIONS.map(([v,l]) =>
        `<option value="${v}"${s.defaultType===v?' selected':''}>${l}</option>`
      ).join('');
      const err = s.lastError ? `<div class="calsub-err">${Store.esc(s.lastError)}</div>` : '';
      const cnt = s.lastCount ? ` · ${s.lastCount} event${s.lastCount===1?'':'s'}` : '';
      return `
      <div class="calsub-row" data-calsub="${s.id}">
        <div class="calsub-main">
          <div class="calsub-label">${Store.esc(s.label)}</div>
          <div class="calsub-meta">${_fmtAgo(s.lastSynced)}${cnt}</div>
          ${err}
          <div class="calsub-type">
            <span class="calsub-type-lbl">Default type</span>
            <select class="calsub-select" onchange="Settings.changeCalSubType('${s.id}', this.value)">${optsHTML}</select>
          </div>
        </div>
        <div class="calsub-actions">
          <button class="calsub-btn" onclick="Settings.syncCalSub('${s.id}')">Sync</button>
          <button class="calsub-btn calsub-btn-danger" onclick="Settings.removeCalSub('${s.id}')">Remove</button>
        </div>
      </div>`;
    }).join('');
  }
  function showAddCalSub() {
    document.getElementById('calSubLabel').value = '';
    document.getElementById('calSubUrl').value = '';
    document.getElementById('calSubType').value = 'other';
    document.getElementById('addCalOverlay').classList.add('open');
    setTimeout(() => { const el = document.getElementById('calSubLabel'); if (el) el.focus(); }, 50);
  }
  function closeAddCalSub() {
    document.getElementById('addCalOverlay').classList.remove('open');
  }
  function addCalOverlayClick(e) {
    if (e.target.id === 'addCalOverlay') closeAddCalSub();
  }
  async function commitAddCalSub() {
    const label = (document.getElementById('calSubLabel').value || '').trim();
    const url = (document.getElementById('calSubUrl').value || '').trim();
    const defaultType = document.getElementById('calSubType').value;
    if (!url) { Store.toast('URL is required'); return; }
    if (!/^(https?:|webcal:)/i.test(url)) {
      Store.toast('URL must start with https://, http://, or webcal://');
      return;
    }
    const sub = Store.addCalSub({ url, label: label || 'Calendar', defaultType });
    closeAddCalSub();
    renderCalSubs();
    Store.toast('Subscribing…');
    const res = await Cal.syncSub(sub.id);
    if (res.ok) {
      Store.toast(`Imported ${res.added + res.updated} events`);
    } else {
      Store.toast('Import failed: ' + (res.error || 'unknown'));
    }
    renderCalSubs();
  }
  async function syncCalSub(id) {
    Store.toast('Syncing…');
    const res = await Cal.syncSub(id);
    if (res.ok) {
      const parts = [];
      if (res.added)   parts.push(`${res.added} added`);
      if (res.updated) parts.push(`${res.updated} updated`);
      if (res.removed) parts.push(`${res.removed} removed`);
      Store.toast(parts.length ? parts.join(', ') : 'No changes');
    } else {
      Store.toast('Sync failed: ' + (res.error || 'unknown'));
    }
    renderCalSubs();
  }
  function removeCalSub(id) {
    const sub = Store.getCalSub(id);
    if (!sub) return;
    const msg = `Remove "${sub.label}"?\n\nThis will delete imported events you haven't edited. Events you've changed (type or class) will be kept.`;
    if (!confirm(msg)) return;
    Store.removeCalSub(id, true);
    renderCalSubs();
    Store.toast('Subscription removed');
  }
  function changeCalSubType(id, newType) {
    Store.updateCalSub(id, { defaultType: newType });
    Store.toast('Default type updated. New events will use this type.');
  }

  return {
    get, set, init, open, close, overlayClick, save,
    toggleDark, toggleNotify,
    forcePull, clearSchedule, clearTemplates,
    exportICal,
    renderCalSubs, showAddCalSub, closeAddCalSub, addCalOverlayClick,
    commitAddCalSub, syncCalSub, removeCalSub, changeCalSubType,
  };
})();
