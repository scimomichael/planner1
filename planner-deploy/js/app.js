// ── APP ───────────────────────────────────────────────────────────────

function nav(view) {
  document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b=>b.classList.remove('active'));
  document.getElementById('view-'+view).classList.add('active');
  document.querySelector(`[data-view="${view}"]`)?.classList.add('active');

  if (view==='today')   { renderSchedule(); renderDueSoon(); }
  if (view==='week')    renderWeek();
  if (view==='tasks')   renderTasksView();
}

function overlayClick(e, overlayId) {
  if (e.target.id === overlayId) {
    document.getElementById(overlayId).classList.remove('open');
    editTaskId = null;
  }
}

function refreshAll() {
  const active = document.querySelector('.view.active')?.id?.replace('view-','');
  if (active==='today')  { renderSchedule(); renderDueSoon(); }
  if (active==='week')   renderWeek();
  if (active==='tasks')  renderTasksView();
  // Always keep due-soon fresh if today is showing
  if (active==='today')  renderDueSoon();
}

// ── FOCUS ─────────────────────────────────────────────────────────────
function saveFocus() {
  focusMap[todayStr()] = document.getElementById('focus-in').value;
  write('focus', focusMap);
}
function initFocus() {
  document.getElementById('focus-in').value = focusMap[todayStr()] || '';
}

// ── TODAY HEADER ──────────────────────────────────────────────────────
function initTodayHeader() {
  const d = new Date();
  document.getElementById('today-date').textContent =
    d.toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric'});
}

// ── KEYBOARD SHORTCUTS ────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (e.key==='Escape') {
    document.querySelectorAll('.overlay.open').forEach(o=>o.classList.remove('open'));
    editTaskId = null;
  }
  if ((e.metaKey||e.ctrlKey) && e.key==='k') { e.preventDefault(); openTaskModal(); }
  if ((e.metaKey||e.ctrlKey) && e.key==='ArrowRight') { e.preventDefault(); shiftSchedule(1); }
  if ((e.metaKey||e.ctrlKey) && e.key==='ArrowLeft')  { e.preventDefault(); shiftSchedule(-1); }
});

// ── SEED DATA (first launch only) ────────────────────────────────────
function seedIfEmpty() {
  if (tasks.length) return;
  const add = (name, cat, cls, pri, daysOut, status='Not started', est='') => {
    const d = new Date(todayDate()); d.setDate(d.getDate()+daysOut);
    tasks.push({ id:'seed_'+Math.random().toString(36).slice(2), notion:false, name, category:cat, classLabel:cls, priority:pri, status, due:dateStr(d), est, description:'' });
  };
  add('DUE: AP Practice Multiple Choice', 'hw',   'AP Language',       'high',   0, 'In progress', '1h');
  add('DUE: Read Ch. 4-6 of The Great Gatsby', 'hw', 'AP Language',   'medium', 1, 'Not started', '2h');
  add('Iran Quiz prep',                      'test', 'AP US History',   'high',   2, 'Not started', '1.5h');
  add('Rational Functions quiz',             'test', 'Precalculus',     'high',   3, 'Not started', '1h');
  add('AP Bio lab report',                   'hw',   'AP Biology',      'medium', 4, 'Not started', '2h');
  add('Spanish TalkAbroad reflection',       'hw',   'Honors Spanish IV','low',   6, 'Not started', '1h');
  add('Debate – affirmative bill prep',      'ec',   'Congressional Debate','high',5,'Not started', '2h');
  add('APUSH Ch. 28-29 reading',             'hw',   'AP US History',   'medium', 7, 'Not started', '1.5h');
  persist();
}

// ── INIT ──────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  seedIfEmpty();
  initTodayHeader();
  initFocus();
  renderSchedule();
  renderDueSoon();

  // Auto-sync from Notion on every load
  syncFromNotion();
});
