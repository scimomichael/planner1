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
  let classes   = ls.get('classes')   || _defaultClasses(classClr);
  let calSubs   = ls.get('calSubs')   || [];   // iCal subscriptions
  let meta      = ls.get('meta')      || { lastPull: 0, lastPush: 0 };

  function _defaultClasses(legacyColors) {
    const base = [
      { name: 'AP Language',          color: '#ff3b30' },
      { name: 'AP Biology',           color: '#34c759' },
      { name: 'AP US History',        color: '#ff9500' },
      { name: 'Honors Spanish IV',    color: '#ffcc00' },
      { name: 'Precalculus',          color: '#007aff' },
      { name: 'Congressional Debate', color: '#af52de' },
      { name: 'Harvard Pre-College',  color: '#a2845e' },
      { name: 'Personal',             color: '#8e8e93' },
    ];
    // If legacy classClr had custom colors, respect them
    return base.map((c, i) => ({
      id: 'cls_' + Math.random().toString(36).slice(2) + i,
      name: c.name,
      color: (legacyColors && legacyColors[c.name]) || c.color,
      order: i,
    }));
  }

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
    ls.set('classes', classes);
    ls.set('calSubs', calSubs);
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
  function setFocus(date, text) {
    if (!date) return;
    focusMap[date] = text || '';
    ls.set('focus', focusMap);
    _queuePush();
    // If editing today's focus, update the visible input
    if (date === todayStr()) {
      const el = document.getElementById('focusInput');
      if (el) el.value = focusMap[date];
    }
  }
  function loadFocus() {
    const el = document.getElementById('focusInput');
    if (!el) return;
    // Don't clobber the user's typing if the focus input is currently active.
    // sync pulls or App.refresh() shouldn't erase a half-written focus note.
    if (document.activeElement === el) return;
    el.value = focusMap[todayStr()] || '';
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
        body: JSON.stringify({ schedule, tasks, focus: focusMap, templates, classClr, classes, calSubs, meta }),
      });
      if (!res.ok) {
        let msg = 'Sync failed';
        try { const j = await res.json(); if (j && j.message) msg = 'Sync: ' + j.message; } catch {}
        _setSync('err', msg);
        return;
      }
      const d = await res.json();
      if (!d || !d.ok) { _setSync('err', 'Sync failed'); return; }
      meta.lastPush = d.updatedAt || Date.now();
      ls.set('meta', meta);
      _setSync('ok', 'Synced');
    } catch (e) {
      _setSync('err', 'Offline');
    }
  }
  async function pull() {
    try {
      const res = await fetch('/api/sync?action=pull');
      if (!res.ok) {
        // Server returned a real error — do NOT overwrite local data.
        let msg = 'Sync failed';
        try { const j = await res.json(); if (j && j.message) msg = 'Sync: ' + j.message; } catch {}
        _setSync('err', msg);
        return false;
      }
      const r = await res.json();
      if (!r || r.error || r._err) { _setSync('err', 'Sync failed'); return false; }
      const rTime = r.updatedAt || 0;
      const lTime = Math.max(meta.lastPush || 0, meta.lastPull || 0);
      const hasLocal = Object.keys(schedule).length > 0 || tasks.length > 0;
      // If server has no data (updatedAt=0), never clobber local, no matter what.
      if (rTime === 0) { _setSync('ok', hasLocal ? 'Synced' : 'Ready'); return false; }
      // Only overwrite local if server is strictly newer.
      if (!hasLocal || rTime > lTime) {
        if (r.schedule && typeof r.schedule === 'object') { schedule = r.schedule; ls.set('schedule', schedule); }
        if (Array.isArray(r.tasks)) { tasks = r.tasks; ls.set('tasks', tasks); }
        if (r.focus && typeof r.focus === 'object') { focusMap = { ...focusMap, ...r.focus }; ls.set('focus', focusMap); }
        if (Array.isArray(r.templates) && r.templates.length) { templates = r.templates; ls.set('templates', templates); }
        if (r.classClr && typeof r.classClr === 'object') { classClr = r.classClr; ls.set('classClr', classClr); }
        if (Array.isArray(r.classes) && r.classes.length) { classes = r.classes; ls.set('classes', classes); }
        if (Array.isArray(r.calSubs)) { calSubs = r.calSubs; ls.set('calSubs', calSubs); }
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

  function getClassByName(name) {
    if (!name) return null;
    return classes.find(c => c.name === name) || null;
  }
  function clsPill(clsName) {
    if (!clsName) return '';
    const c = getClassByName(clsName);
    const color = (c && c.color) || classClr[clsName] || '#8e8e93';
    return `<span class="cls-chip" style="background:${color}1f;color:${color};border:1px solid ${color}33">${esc(clsName)}</span>`;
  }

  function esc(s) {
    return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }

  function toast(msg) {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(el._t);
    el._t = setTimeout(() => { el.classList.remove('show'); }, 1800);
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

  // ── Class CRUD ──────────────────────────────────────
  function getClasses() {
    return [...classes].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }
  function addClass(name, color) {
    name = (name || '').trim();
    if (!name) return null;
    if (classes.find(c => c.name.toLowerCase() === name.toLowerCase())) {
      toast(`"${name}" already exists`);
      return null;
    }
    const maxOrder = classes.reduce((m, c) => Math.max(m, c.order || 0), -1);
    const cls = {
      id: 'cls_' + Date.now() + Math.random().toString(36).slice(2),
      name,
      color: color || '#8e8e93',
      order: maxOrder + 1,
    };
    classes.push(cls);
    persist();
    return cls;
  }
  function updateClass(id, patch) {
    const c = classes.find(x => x.id === id);
    if (!c) return false;
    const oldName = c.name;
    if (patch.name !== undefined) c.name = patch.name.trim();
    if (patch.color !== undefined) c.color = patch.color;
    // Propagate rename to all tasks and blocks
    if (patch.name !== undefined && patch.name !== oldName) {
      tasks.forEach(t => { if (t.classLabel === oldName) t.classLabel = c.name; });
      Object.values(schedule).forEach(list => {
        list.forEach(b => { if (b.classLabel === oldName) b.classLabel = c.name; });
      });
    }
    persist();
    return true;
  }
  // Remove a class. Optionally reassign existing assignments to another class name.
  function removeClass(id, reassignTo) {
    const c = classes.find(x => x.id === id);
    if (!c) return false;
    const oldName = c.name;
    classes = classes.filter(x => x.id !== id);
    const newName = reassignTo || '';
    tasks.forEach(t => { if (t.classLabel === oldName) t.classLabel = newName; });
    Object.values(schedule).forEach(list => {
      list.forEach(b => { if (b.classLabel === oldName) b.classLabel = newName; });
    });
    persist();
    return true;
  }
  function countClassAssignments(name) {
    let n = 0;
    tasks.forEach(t => { if (t.classLabel === name) n++; });
    Object.values(schedule).forEach(list => {
      list.forEach(b => { if (b.classLabel === name) n++; });
    });
    return n;
  }
  function reorderClasses(orderedIds) {
    orderedIds.forEach((id, i) => {
      const c = classes.find(x => x.id === id);
      if (c) c.order = i;
    });
    persist();
  }

  // Legacy color helpers (retained for backward compat but now routed via classes array)
  function getClassColor(clsName) {
    const c = getClassByName(clsName);
    return (c && c.color) || classClr[clsName] || null;
  }
  function setClassColor(clsName, color) {
    const c = getClassByName(clsName);
    if (c) {
      c.color = color || '#8e8e93';
      persist();
    } else {
      if (color) classClr[clsName] = color;
      else delete classClr[clsName];
      persist();
    }
  }

  // ── Calendar subscriptions ────────────────────────────
  function getCalSubs() { return calSubs.slice(); }
  function getCalSub(id) { return calSubs.find(s => s.id === id) || null; }
  function addCalSub({ url, label, defaultType }) {
    const sub = {
      id: 'cal_' + Math.random().toString(36).slice(2),
      url: String(url || '').trim(),
      label: String(label || '').trim() || 'Calendar',
      defaultType: defaultType || 'other',
      lastSynced: 0,
      lastCount: 0,
      lastError: '',
      events: {}, // map of icalUid -> { dk, blockId, userEdited }
    };
    calSubs.push(sub);
    persist();
    return sub;
  }
  function updateCalSub(id, patch) {
    const s = getCalSub(id);
    if (!s) return;
    Object.assign(s, patch);
    persist();
  }
  function removeCalSub(id, alsoRemoveEvents = true) {
    const sub = getCalSub(id);
    if (!sub) return;
    if (alsoRemoveEvents) {
      // Remove any blocks that were imported from this subscription AND
      // have not been edited by the user. User-edited blocks are kept.
      for (const dk in schedule) {
        const list = schedule[dk];
        schedule[dk] = list.filter(b => {
          if (b.importSource !== id) return true;
          if (b.userEdited) return true;
          return false;
        });
        if (!schedule[dk].length) delete schedule[dk];
      }
    }
    calSubs = calSubs.filter(s => s.id !== id);
    persist();
    if (typeof App !== 'undefined') App.refresh();
  }
  function markBlockUserEdited(dk, blockId) {
    const list = schedule[dk];
    if (!list) return;
    const b = list.find(x => x.id === blockId);
    if (!b || !b.importSource) return;
    b.userEdited = true;
    persist();
  }
  // Tombstone a deleted imported event so syncSub() won't re-add it.
  function recordCalSubDeletion(subId, uid) {
    const sub = getCalSub(subId);
    if (!sub || !uid) return;
    if (!Array.isArray(sub.deletedUids)) sub.deletedUids = [];
    if (!sub.deletedUids.includes(uid)) sub.deletedUids.push(uid);
    // Also remove from events map if present
    if (sub.events && sub.events[uid]) delete sub.events[uid];
    persist();
  }


  async function showSyncDiag() {
    toast('Checking sync…');
    try {
      const res = await fetch('/api/sync?action=ping');
      const text = await res.text();
      let pretty = text;
      try { pretty = JSON.stringify(JSON.parse(text), null, 2); } catch {}
      // Use alert() — simple and unmistakable. Diagnostics aren't polish.
      alert('Sync diagnostics (status ' + res.status + '):\n\n' + pretty);
    } catch (e) {
      alert('Could not reach /api/sync. ' + (e.message || e));
    }
  }

  return {
    get schedule() { return schedule; },
    set schedule(v) { schedule = v; },
    persist, snapshot, undo, redo,
    saveFocus, loadFocus, setFocus, pull,
    today, toStr, todayStr, daysUntil, fmtDate, weekDays, monthDays,
    duePill, clsPill, esc, toast,
    clearSchedule, clearTemplates,
    addTemplate, removeTemplate, getTemplates,
    getClassColor, setClassColor,
    getClasses, getClassByName, addClass, updateClass, removeClass,
    countClassAssignments, reorderClasses,
    getCalSubs, getCalSub, addCalSub, updateCalSub, removeCalSub, markBlockUserEdited,
    recordCalSubDeletion,
    showSyncDiag,
  };
})();
