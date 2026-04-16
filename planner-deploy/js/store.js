// ── STORE ────────────────────────────────────────────────────────────
const KEY = k => 'msp_' + k;
const read  = k => { try { return JSON.parse(localStorage.getItem(KEY(k))); } catch { return null; } };
const write = (k,v) => { try { localStorage.setItem(KEY(k), JSON.stringify(v)); } catch {} };

let tasks    = read('tasks')    || [];
let schedule = read('schedule') || {};
let focusMap = read('focus')    || {};

let schedOffset = 0;   // days from today for schedule view
let weekOffset  = 0;   // weeks from current
let activeCat   = 'hw';
let activePri   = 'medium';
let activeBlock = 'study';
let pendingBlock = { dk: null, h: null };
let editTaskId   = null;

function persist() {
  write('tasks', tasks);
  write('schedule', schedule);
  write('focus', focusMap);
}

// ── DATES ────────────────────────────────────────────────────────────
const todayDate = () => { const d=new Date(); d.setHours(0,0,0,0); return d; };
const dateStr   = d => d.toISOString().slice(0,10);
const todayStr  = () => dateStr(todayDate());

function daysUntil(str) {
  if (!str) return null;
  return Math.round((new Date(str+'T00:00:00') - todayDate()) / 86400000);
}
function fmtDate(str) {
  if (!str) return '';
  return new Date(str+'T00:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'});
}
function weekDays(offset=0) {
  const s = todayDate();
  s.setDate(s.getDate() - s.getDay() + offset*7);
  return Array.from({length:7}, (_,i)=>{ const d=new Date(s); d.setDate(s.getDate()+i); return d; });
}

// ── CLASS PILL HELPER ────────────────────────────────────────────────
const CLASS_MAP = {
  'AP Language':       'cls-apl',
  'AP Biology':        'cls-bio',
  'AP US History':     'cls-hist',
  'Honors Spanish IV': 'cls-spa',
  'Precalculus':       'cls-pre',
  'Congressional Debate':'cls-deb',
  'Harvard Pre-College':'cls-hpc',
  'Extracurricular':   'cls-ec',
};
function clsPill(cls) {
  if (!cls) return '';
  const c = CLASS_MAP[cls] || '';
  return `<span class="cls-pill ${c}">${esc(cls)}</span>`;
}

// ── DUE PILL ─────────────────────────────────────────────────────────
function duePill(n) {
  if (n === null) return '';
  if (n < 0)  return `<span class="due-pill d-urgent">Overdue</span>`;
  if (n === 0) return `<span class="due-pill d-urgent">Today</span>`;
  if (n === 1) return `<span class="due-pill d-urgent">Tomorrow</span>`;
  if (n <= 4)  return `<span class="due-pill d-soon">In ${n} days</span>`;
  return `<span class="due-pill d-ok">${fmtDate(tasks.find?.(x=>x)?._due||'')}</span>`;
}
function duePillStr(str) {
  const n = daysUntil(str);
  if (n === null) return '';
  if (n < 0)  return `<span class="due-pill d-urgent">Overdue</span>`;
  if (n === 0) return `<span class="due-pill d-urgent">Today</span>`;
  if (n === 1) return `<span class="due-pill d-urgent">Tomorrow</span>`;
  if (n <= 4)  return `<span class="due-pill d-soon">In ${n} days</span>`;
  return `<span class="due-pill d-ok">${fmtDate(str)}</span>`;
}

function esc(s) { return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

// ── GUESS CLASS FROM NAME ─────────────────────────────────────────────
function guessClass(name='') {
  if (/ap lang|english|essay|gatsby|vocab|appreciat|rhetoric|synthesis/i.test(name)) return 'AP Language';
  if (/ap bio|biology|gel|electrophoresis|meiosis|punnett/i.test(name)) return 'AP Biology';
  if (/apush|history|iran|jefferson|cold war|civil|wwii|korea|vietnam|chapter/i.test(name)) return 'AP US History';
  if (/spanish|español|talkabroad|bogot/i.test(name)) return 'Honors Spanish IV';
  if (/precalc|math|rational|polar|ferris|unit\s*\d|calc|trig/i.test(name)) return 'Precalculus';
  if (/debate|congress/i.test(name)) return 'Congressional Debate';
  return '';
}
