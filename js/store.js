// ═════════════════════════════════════════════════════════
// STORE — state, persistence, cross-device sync
// ═════════════════════════════════════════════════════════
const Store = (() => {
  const LS = k => `pl3_${k}`;
  const ls = {
    get: k => { try { return JSON.parse(localStorage.getItem(LS(k))); } catch { return null; } },
    set: (k, v) => { try { localStorage.setItem(LS(k), JSON.stringify(v)); } catch {} },
  };

  let tasks     = ls.get('tasks')     || [];
  let schedule  = ls.get('schedule')  || {};   // { "YYYY-MM-DD": [blocks...] }
  let focusMap  = ls.get('focus')     || {};
  let templates = ls.get('templates') || _defaultTemplates();
  let classClr  = ls.get('classClr')  || {};
  let meta      = ls.get('meta')      || { lastPull: 0, lastPush: 0 };

  function _defaultTemplates() {
    return [
      { id: 't_' + Math.random().toString(36).slice(2), name: 'Morning Routine', label: 'Morning routine', type: 'free', start: '07:00', end: '08:00' },
      { id: 't_' + Math.random().toString(36).slice(2), name: 'Study Block (90min)', label: 'Study', type: 'study', start: '16:00', end: '17:30' },
      { id: 't_' + Math.random().toString(36).slice(2), name: 'Dinner', label: 'Dinner', type: 'meal', start: '18:00', end: '19:00' },
      { id: 't_' + Math.random().toString(36).slice(2), name: 'Sleep', label: 'Sleep', type: 'sleep', start: '22:30', end: '06:00' },
    ];
  }

  const undoStack = [], redoStack = [];
  function snapshot() {
    undoStack.push(JSON.stringify({ tasks, schedule }));
    if (undoStack.length > 60) undoStack.shift();
    redoStack.length = 0;
  }
  function undo() {
    if (!undoStack.length) return;
    redoStack.push(JSON.stringify({ tasks, schedule }));
    const s = JSON.parse(undoStack.pop());
    tasks = s.tasks; schedule = s.schedule;
    persist();
    if (typeof App !== 'undefined') App.refresh();
    toast('Undone');
  }
  function redo() {
    if (!redoStack.length) return;
    undoStack.push(JSON.stringify({ tasks, schedule }));
    const s = JSON.parse(redoStack.pop());
    tasks = s.tasks; schedule = s.schedule;
    persist();
    if (typeof App !== 'undefined') App.refresh();
    toast('Redone');
  }

  function persist() {
    ls.set('tasks', tasks);
    ls.set('schedule', schedule);
    ls.set('focus', focusMap);
    ls.set('templates', templates);
    ls.set('classClr', classClr);
    ls.set('meta', meta);
    _queuePush();
  }

  function saveFocus() {
    const el = document.getElementById('focusInput');
    if (!el) return;
    focusMap[todayStr()] = el.value;
    ls.set('focus', focusMap);
    _queuePush();
  }
  function loadFocus() {
    const el = document.getElementById('focusInput');
    if (el) el.value = focusMap[todayStr()] || '';
  }

  // ── Cross-device sync ────────────────────────────────
  let _pushTimer = null;
  function _queuePush() {
    if (typeof Settings !== 'undefined' && Settings.get && !Settings.get('sCrossSync', true)) return;
    clearTimeout(_pushTimer);
    _pushTimer = setTimeout(_doPush, 1200);
    _setSync('syncing', 'Syncing…');
  }
  async function _doPush() {
    try {
      const res = await fetch('/api/sync?action=push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ schedule, tasks, focus: focusMap, templates, classClr, meta }),
      });
      if (res.ok) {
        const d = await res.json();
        meta.lastPush = d.updatedAt || Date.now();
        ls.set('meta', meta);
        _setSync('ok', 'Synced');
      } else _setSync('err', 'Sync failed');
    } catch (e) {
      _setSync('err', 'Offline');
    }
  }
  async function pull() {
    try {
      const res = await fetch('/api/sync?action=pull');
      if (!res.ok) return false;
      const r = await res.json();
      if (!r || r._err) return false;
      const rTime = r.updatedAt || 0;
      const lTime = meta.lastPush || 0;
      const hasLocal = Object.keys(schedule).length > 0 || tasks.length > 0;
      if (!hasLocal || rTime > lTime) {
        if (r.schedule && typeof r.schedule === 'object') { schedule = r.schedule; ls.set('schedule', schedule); }
        if (Array.isArray(r.tasks)) { tasks = r.tasks; ls.set('tasks', tasks); }
        if (r.focus && typeof r.focus === 'object') { focusMap = { ...focusMap, ...r.focus }; ls.set('focus', focusMap); }
        if (Array.isArray(r.templates) && r.templates.length) { templates = r.templates; ls.set('templates', templates); }
        if (r.classClr && typeof r.classClr === 'object') { classClr = r.classClr; ls.set('classClr', classClr); }
        meta.lastPull = rTime; ls.set('meta', meta);
        _setSync('ok', 'Synced');
        return true;
      }
      _setSync('ok', 'Up to date');
      return false;
    } catch (e) {
      _setSync('err', 'Offline');
      return false;
    }
  }
  function _setSync(cls, label) {
    const d = document.getElementById('syncDot');
    const l = document.getElementById('syncLabel');
    if (d) d.className = `sync-dot ${cls}`;
    if (l) l.textContent = label;
  }

  // ── Date helpers ──────────────────────────────────────
  const today = () => { const d = new Date(); d.setHours(0,0,0,0); return d; };
  const toStr = d => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2,'0');
    const da = String(d.getDate()).padStart(2,'0');
    return `${y}-${m}-${da}`;
  };
  const todayStr = () => toStr(today());
  function daysUntil(str) {
    if (!str) return null;
    const [y, m, d] = str.split('-').map(Number);
    const dt = new Date(y, m-1, d); dt.setHours(0,0,0,0);
    return Math.round((dt - today()) / 86400000);
  }
  function fmtDate(str) {
    if (!str) return '';
    const [y, m, d] = str.split('-').map(Number);
    return new Date(y, m-1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
  function weekDays(offset = 0, startDay = 0) {
    const s = today();
    const dow = s.getDay();
    const diff = (dow - startDay + 7) % 7;
    s.setDate(s.getDate() - diff + offset * 7);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(s); d.setDate(s.getDate() + i); return d;
    });
  }
  function monthDays(year, month, startDay = 0) {
    // Returns 6-week grid (42 days) for given year+month
    const first = new Date(year, month, 1);
    const dow = first.getDay();
    const diff = (dow - startDay + 7) % 7;
    const start = new Date(year, month, 1 - diff);
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start); d.setDate(start.getDate() + i); return d;
    });
  }

  function duePill(str) {
    const n = daysUntil(str);
    if (n === null) return '';
    if (n < 0)  return `<span class="due-chip d-over">Overdue</span>`;
    if (n === 0) return `<span class="due-chip d-today">Today</span>`;
    if (n === 1) return `<span class="due-chip d-tmrw">Tomorrow</span>`;
    if (n <= 5)  return `<span class="due-chip d-soon">In ${n}d</span>`;
    return `<span class="due-chip d-ok">${fmtDate(str)}</span>`;
  }

  const CLS_CSS = {
    'AP Language':'cc-apl','AP Biology':'cc-bio','AP US History':'cc-hist',
    'Honors Spanish IV':'cc-spa','Precalculus':'cc-pre',
    'Congressional Debate':'cc-deb','Harvard Pre-College':'cc-hpc',
  };
  function clsPill(cls) {
    if (!cls) return '';
    const custom = classClr[cls];
    if (custom) {
      return `<span class="cls-chip" style="background:${custom}22;color:${custom}">${esc(cls)}</span>`;
    }
    return `<span class="cls-chip ${CLS_CSS[cls]||''}">${esc(cls)}</span>`;
  }

  function esc(s) {
    return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }

  function toast(msg) {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.style.opacity = '1';
    clearTimeout(el._t);
    el._t = setTimeout(() => { el.style.opacity = '0'; }, 1800);
  }

  function clearSchedule() { schedule = {}; persist(); }
  function clearTasks()    { tasks = []; persist(); }
  function clearTemplates() { templates = _defaultTemplates(); persist(); }

  // Template helpers
  function addTemplate(tpl) {
    tpl.id = tpl.id || 't_' + Date.now() + Math.random().toString(36).slice(2);
    templates.push(tpl);
    persist();
  }
  function removeTemplate(id) {
    templates = templates.filter(t => t.id !== id);
    persist();
  }
  function getTemplates() { return templates; }

  // Class color helpers
  function getClassColor(cls) { return classClr[cls] || null; }
  function setClassColor(cls, color) {
    if (color) classClr[cls] = color;
    else delete classClr[cls];
    persist();
  }

  return {
    get tasks() { return tasks; },
    set tasks(v) { tasks = v; },
    get schedule() { return schedule; },
    set schedule(v) { schedule = v; },
    persist, snapshot, undo, redo,
    saveFocus, loadFocus, pull,
    today, toStr, todayStr, daysUntil, fmtDate, weekDays, monthDays,
    duePill, clsPill, esc, toast,
    clearSchedule, clearTasks, clearTemplates,
    addTemplate, removeTemplate, getTemplates,
    getClassColor, setClassColor,
  };
})();
