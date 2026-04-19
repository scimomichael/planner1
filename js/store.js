// store.js -- state, persistence, cross-device sync
// Fixes: toast uses classList, calSubs support, showSyncDiag, no em dashes
const Store = (() => {
  const LS = k => `pl3_${k}`;
  const ls = {
    get: k => { try { return JSON.parse(localStorage.getItem(LS(k))); } catch { return null; } },
    set: (k, v) => { try { localStorage.setItem(LS(k), JSON.stringify(v)); } catch {} },
  };

  let tasks     = ls.get('tasks')     || [];
  let schedule  = ls.get('schedule')  || {};
  let focusMap  = ls.get('focus')     || {};
  let templates = ls.get('templates') || _defaultTemplates();
  let classClr  = ls.get('classClr')  || {};
  let classes   = ls.get('classes')   || _defaultClasses(classClr);
  let calSubs   = ls.get('calSubs')   || [];
  let meta      = ls.get('meta')      || { lastPull: 0, lastPush: 0 };
  // Deletion tombstones: importUids that user deleted, so re-sync won't resurrect
  let calTombstones = ls.get('calTombstones') || [];

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
    ls.set('calTombstones', calTombstones);
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
    if (date === todayStr()) {
      const el = document.getElementById('focusInput');
      if (el && document.activeElement !== el) el.value = focusMap[date];
    }
  }
  function loadFocus() {
    const el = document.getElementById('focusInput');
    if (el && document.activeElement !== el) el.value = focusMap[todayStr()] || '';
  }

  // Cross-device sync
  let _pushTimer = null;
  function _queuePush() {
    if (typeof Settings !== 'undefined' && Settings.get && !Settings.get('sCrossSync', true)) return;
    clearTimeout(_pushTimer);
    _pushTimer = setTimeout(_doPush, 1200);
    _setSync('syncing', 'Syncing...');
  }
  async function _doPush() {
    try {
      const res = await fetch('/api/sync?action=push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ schedule, tasks, focus: focusMap, templates, classClr, classes, calSubs, calTombstones, meta }),
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
      if (rTime === 0) { _setSync('ok', hasLocal ? 'Synced' : 'Ready'); return false; }
      if (!hasLocal || rTime > lTime) {
        if (r.schedule && typeof r.schedule === 'object') { schedule = r.schedule; ls.set('schedule', schedule); }
        if (Array.isArray(r.tasks)) { tasks = r.tasks; ls.set('tasks', tasks); }
        if (r.focus && typeof r.focus === 'object') { focusMap = { ...focusMap, ...r.focus }; ls.set('focus', focusMap); }
        if (Array.isArray(r.templates) && r.templates.length) { templates = r.templates; ls.set('templates', templates); }
        if (r.classClr && typeof r.classClr === 'object') { classClr = r.classClr; ls.set('classClr', classClr); }
        if (Array.isArray(r.classes) && r.classes.length) { classes = r.classes; ls.set('classes', classes); }
        if (Array.isArray(r.calSubs)) { calSubs = r.calSubs; ls.set('calSubs', calSubs); }
        if (Array.isArray(r.calTombstones)) { calTombstones = r.calTombstones; ls.set('calTombstones', calTombstones); }
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

  function showSyncDiag() {
    const info = [
      `Local schedule keys: ${Object.keys(schedule).length}`,
      `Last push: ${meta.lastPush ? new Date(meta.lastPush).toLocaleString() : 'never'}`,
      `Last pull: ${meta.lastPull ? new Date(meta.lastPull).toLocaleString() : 'never'}`,
      `Classes: ${classes.length}`,
      `Calendar subs: ${calSubs.length}`,
      `Templates: ${templates.length}`,
      `Cross-sync: ${(typeof Settings !== 'undefined' && Settings.get) ? Settings.get('sCrossSync', true) : 'unknown'}`,
    ];
    alert('Sync Diagnostics\n\n' + info.join('\n'));
  }

  // Date helpers
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

  // FIX: toast uses classList instead of opacity style
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

  function addTemplate(tpl) {
    tpl.id = tpl.id || 't_' + Date.now() + Math.random().toString(36).slice(2);
    templates.push(tpl);
    persist();
  }
  function removeTemplate(id) { templates = templates.filter(t => t.id !== id); persist(); }
  function getTemplates() { return templates; }

  // Class CRUD
  function getClasses() { return [...classes].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)); }
  function addClass(name, color) {
    name = (name || '').trim();
    if (!name) return null;
    if (classes.find(c => c.name.toLowerCase() === name.toLowerCase())) { toast(`"${name}" already exists`); return null; }
    const maxOrder = classes.reduce((m, c) => Math.max(m, c.order || 0), -1);
    const cls = { id: 'cls_' + Date.now() + Math.random().toString(36).slice(2), name, color: color || '#8e8e93', order: maxOrder + 1 };
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
    if (patch.name !== undefined && patch.name !== oldName) {
      tasks.forEach(t => { if (t.classLabel === oldName) t.classLabel = c.name; });
      Object.values(schedule).forEach(list => {
        list.forEach(b => { if (b.classLabel === oldName) b.classLabel = c.name; });
      });
    }
    persist();
    return true;
  }
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
    orderedIds.forEach((id, i) => { const c = classes.find(x => x.id === id); if (c) c.order = i; });
    persist();
  }

  function getClassColor(clsName) {
    const c = getClassByName(clsName);
    return (c && c.color) || classClr[clsName] || null;
  }
  function setClassColor(clsName, color) {
    const c = getClassByName(clsName);
    if (c) { c.color = color || '#8e8e93'; persist(); }
    else { if (color) classClr[clsName] = color; else delete classClr[clsName]; persist(); }
  }

  // Calendar subscription CRUD
  function getCalSubs() { return calSubs; }
  function getCalSub(id) { return calSubs.find(s => s.id === id); }
  function addCalSub(sub) {
    sub.id = sub.id || 'csub_' + Date.now() + Math.random().toString(36).slice(2);
    calSubs.push(sub);
    persist();
    return sub;
  }
  function updateCalSub(id, patch) {
    const s = calSubs.find(x => x.id === id);
    if (!s) return;
    Object.assign(s, patch);
    persist();
  }
  function removeCalSub(id) {
    calSubs = calSubs.filter(x => x.id !== id);
    persist();
  }
  function recordCalSubDeletion(importUid) {
    if (importUid && !calTombstones.includes(importUid)) {
      calTombstones.push(importUid);
      ls.set('calTombstones', calTombstones);
    }
  }
  function isCalTombstoned(importUid) { return calTombstones.includes(importUid); }
  function markBlockUserEdited(dk, bi) {
    const list = schedule[dk];
    if (list && list[bi]) { list[bi].userEdited = true; persist(); }
  }

  // Remove a block and record its importUid as tombstone
  function removeBlock(dk, bi) {
    if (!schedule[dk]) return;
    const b = schedule[dk][bi];
    if (b && b.importUid) recordCalSubDeletion(b.importUid);
    schedule[dk].splice(bi, 1);
    persist();
  }

  return {
    get schedule() { return schedule; },
    set schedule(v) { schedule = v; },
    persist, snapshot, undo, redo,
    saveFocus, loadFocus, setFocus, pull, showSyncDiag,
    today, toStr, todayStr, daysUntil, fmtDate, weekDays, monthDays,
    duePill, clsPill, esc, toast,
    clearSchedule, clearTemplates,
    addTemplate, removeTemplate, getTemplates,
    getClassColor, setClassColor,
    getClasses, getClassByName, addClass, updateClass, removeClass,
    countClassAssignments, reorderClasses,
    getCalSubs, getCalSub, addCalSub, updateCalSub, removeCalSub,
    recordCalSubDeletion, isCalTombstoned, markBlockUserEdited, removeBlock,
  };
})();
