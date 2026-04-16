// ══════════════════════════════════════════════════════════
// STORE — all state, persistence, helpers
// ══════════════════════════════════════════════════════════
const Store = (() => {
  const K = k => `pl_${k}`;
  const rd = k => { try { return JSON.parse(localStorage.getItem(K(k))); } catch { return null; } };
  const wr = (k,v) => { try { localStorage.setItem(K(k), JSON.stringify(v)); } catch {} };

  let tasks    = rd('tasks')    || [];
  let schedule = rd('schedule') || {};
  let focusMap = rd('focus')    || {};

  const undo_ = [], redo_ = [];

  function snapshot() {
    undo_.push(JSON.stringify(tasks));
    if (undo_.length > 60) undo_.shift();
    redo_.length = 0;
  }
  function undo() {
    if (!undo_.length) return;
    redo_.push(JSON.stringify(tasks));
    tasks = JSON.parse(undo_.pop());
    persist(); App.refresh(); toast('Undone');
  }
  function redo() {
    if (!redo_.length) return;
    undo_.push(JSON.stringify(tasks));
    tasks = JSON.parse(redo_.pop());
    persist(); App.refresh(); toast('Redone');
  }

  function persist() {
    wr('tasks', tasks);
    wr('schedule', schedule);
    wr('focus', focusMap);
  }
  function saveFocus() {
    focusMap[todayStr()] = document.getElementById('focusInput').value;
    wr('focus', focusMap);
  }
  function loadFocus() {
    const el = document.getElementById('focusInput');
    if (el) el.value = focusMap[todayStr()] || '';
  }

  // ── Dates ─────────────────────────────────────────────
  const today   = () => { const d=new Date(); d.setHours(0,0,0,0); return d; };
  const toStr   = d => d.toISOString().slice(0,10);
  const todayStr= () => toStr(today());

  function daysUntil(str) {
    if (!str) return null;
    return Math.round((new Date(str+'T00:00:00') - today()) / 86400000);
  }
  function fmtDate(str) {
    if (!str) return '';
    return new Date(str+'T00:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'});
  }
  function weekDays(offset=0) {
    const s = today();
    s.setDate(s.getDate() - s.getDay() + offset*7);
    return Array.from({length:7},(_,i)=>{ const d=new Date(s); d.setDate(s.getDate()+i); return d; });
  }

  // ── Due chip ──────────────────────────────────────────
  function duePill(str) {
    const n = daysUntil(str);
    if (n===null) return '';
    if (n<0)  return `<span class="due-chip d-over">Overdue</span>`;
    if (n===0) return `<span class="due-chip d-today">Today</span>`;
    if (n===1) return `<span class="due-chip d-tmrw">Tomorrow</span>`;
    if (n<=5) return `<span class="due-chip d-soon">In ${n}d</span>`;
    return `<span class="due-chip d-ok">${fmtDate(str)}</span>`;
  }

  // ── Class chip ────────────────────────────────────────
  const CLS = {
    'AP Language':'cc-apl','AP Biology':'cc-bio','AP US History':'cc-hist',
    'Honors Spanish IV':'cc-spa','Precalculus':'cc-pre',
    'Congressional Debate':'cc-deb','Harvard Pre-College':'cc-hpc',
  };
  function clsPill(cls) {
    if (!cls) return '';
    return `<span class="cls-chip ${CLS[cls]||''}">${esc(cls)}</span>`;
  }

  // ── Guesses ───────────────────────────────────────────
  function guessClass(n='') {
    if (/ap lang|english|essay|gatsby|vocab|rhetoric|appreciat|synthesis/i.test(n)) return 'AP Language';
    if (/bio|gel|meiosis|punnett|dna|mutation|electrophoresis/i.test(n)) return 'AP Biology';
    if (/apush|history|iran|jefferson|cold war|civil|wwii|korea|vietnam|dbq|saq|leq|period\s*\d/i.test(n)) return 'AP US History';
    if (/spanish|español|talkabroad/i.test(n)) return 'Honors Spanish IV';
    if (/precalc|rational|polar|ferris|calc|trig|unit\s*\d+/i.test(n)) return 'Precalculus';
    if (/debate|congress/i.test(n)) return 'Congressional Debate';
    return '';
  }
  function guessCat(n='') {
    if (/quiz|test|exam|midterm|final|summative|ap classroom/i.test(n)) return 'test';
    if (/debate|extracurr|club|sport/i.test(n)) return 'ec';
    return 'hw';
  }

  function esc(s) {
    return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  function toast(msg) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.style.opacity = '1';
    clearTimeout(el._t);
    el._t = setTimeout(()=>{ el.style.opacity='0'; }, 1900);
  }

  return {
    get tasks(){return tasks}, set tasks(v){tasks=v},
    get schedule(){return schedule},
    persist, snapshot, undo, redo,
    saveFocus, loadFocus,
    today, toStr, todayStr, daysUntil, fmtDate, weekDays,
    duePill, clsPill, guessClass, guessCat, esc, toast,
  };
})();
