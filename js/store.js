// ═══════════════════════════════════════════════════════
// STORE — all state, localStorage, helpers
// ═══════════════════════════════════════════════════════

const Store = (() => {
  const KEY = k => `planner_${k}`;
  const get = k => { try { return JSON.parse(localStorage.getItem(KEY(k))); } catch { return null; } };
  const set = (k,v) => { try { localStorage.setItem(KEY(k), JSON.stringify(v)); } catch {} };

  // State
  let tasks     = get('tasks')    || [];
  let schedule  = get('schedule') || {};
  let focusMap  = get('focus')    || {};

  // Undo/redo
  const undoStack = [];
  const redoStack = [];

  function snapshot() {
    undoStack.push(JSON.stringify(tasks));
    if (undoStack.length > 60) undoStack.shift();
    redoStack.length = 0;
  }

  function undo() {
    if (!undoStack.length) return;
    redoStack.push(JSON.stringify(tasks));
    tasks = JSON.parse(undoStack.pop());
    persist();
    App.refresh();
    toast('Undone');
  }

  function redo() {
    if (!redoStack.length) return;
    undoStack.push(JSON.stringify(tasks));
    tasks = JSON.parse(redoStack.pop());
    persist();
    App.refresh();
    toast('Redone');
  }

  function persist() {
    set('tasks', tasks);
    set('schedule', schedule);
    set('focus', focusMap);
  }

  function saveFocus() {
    focusMap[todayStr()] = document.getElementById('focusInput').value;
    set('focus', focusMap);
  }

  function loadFocus() {
    document.getElementById('focusInput').value = focusMap[todayStr()] || '';
  }

  // ── Dates ──────────────────────────────────────────────
  const today = () => { const d = new Date(); d.setHours(0,0,0,0); return d; };
  const toStr = d => d.toISOString().slice(0,10);
  const todayStr = () => toStr(today());

  function daysUntil(str) {
    if (!str) return null;
    return Math.round((new Date(str+'T00:00:00') - today()) / 86400000);
  }

  function fmtDate(str) {
    if (!str) return '';
    return new Date(str+'T00:00:00').toLocaleDateString('en-US', { month:'short', day:'numeric' });
  }

  function weekDays(offset = 0) {
    const s = today();
    s.setDate(s.getDate() - s.getDay() + offset * 7);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(s); d.setDate(s.getDate() + i); return d;
    });
  }

  // ── Due chip ───────────────────────────────────────────
  function duePill(str) {
    const n = daysUntil(str);
    if (n === null) return '';
    if (n < 0)  return `<span class="due-chip due-overdue">Overdue</span>`;
    if (n === 0) return `<span class="due-chip due-today">Today</span>`;
    if (n === 1) return `<span class="due-chip due-tmrw">Tomorrow</span>`;
    if (n <= 5)  return `<span class="due-chip due-soon">In ${n} days</span>`;
    return `<span class="due-chip due-ok">${fmtDate(str)}</span>`;
  }

  // ── Class chip ─────────────────────────────────────────
  const CLASS_CSS = {
    'AP Language':          'cc-apl',
    'AP Biology':           'cc-bio',
    'AP US History':        'cc-hist',
    'Honors Spanish IV':    'cc-spa',
    'Precalculus':          'cc-pre',
    'Congressional Debate': 'cc-deb',
    'Harvard Pre-College':  'cc-hpc',
  };
  function classPill(cls) {
    if (!cls) return '';
    const c = CLASS_CSS[cls] || '';
    return `<span class="class-chip ${c}">${esc(cls)}</span>`;
  }

  // ── Guess class ────────────────────────────────────────
  function guessClass(name = '') {
    if (/ap lang|english|essay|gatsby|vocab|rhetoric|appreciat|synthesis/i.test(name)) return 'AP Language';
    if (/bio|gel|meiosis|punnett|dna|mutation|electrophoresis/i.test(name)) return 'AP Biology';
    if (/apush|history|iran|jefferson|cold war|civil|wwii|korea|vietnam|chapter|period|dbq|saq|leq/i.test(name)) return 'AP US History';
    if (/spanish|español|talkabroad|bogot/i.test(name)) return 'Honors Spanish IV';
    if (/precalc|math|rational|polar|ferris|calc|trig|unit\s*\d+\s*(quiz|test|hw)/i.test(name)) return 'Precalculus';
    if (/debate|congress/i.test(name)) return 'Congressional Debate';
    return '';
  }

  function guessCategory(name = '') {
    if (/quiz|test|exam|midterm|final|summative|ap classroom/i.test(name)) return 'test';
    if (/debate|ec |extracurr|club|sport/i.test(name)) return 'ec';
    return 'hw';
  }

  // ── Esc HTML ───────────────────────────────────────────
  function esc(s) {
    return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  // ── Toast ──────────────────────────────────────────────
  function toast(msg) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.style.opacity = '1';
    clearTimeout(el._t);
    el._t = setTimeout(() => { el.style.opacity = '0'; }, 1800);
  }

  return {
    get tasks() { return tasks; },
    set tasks(v) { tasks = v; },
    get schedule() { return schedule; },
    get focusMap() { return focusMap; },
    persist, snapshot, undo, redo,
    saveFocus, loadFocus,
    today, toStr, todayStr, daysUntil, fmtDate, weekDays,
    duePill, classPill, guessClass, guessCategory, esc, toast,
  };
})();
