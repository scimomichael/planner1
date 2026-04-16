// ═══════════════════════════════════════════════════════
// APP — routing, init, keyboard shortcuts
// ═══════════════════════════════════════════════════════

const App = (() => {
  function nav(view) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
    document.getElementById(`view-${view}`).classList.add('active');
    document.querySelector(`[data-view="${view}"]`)?.classList.add('active');

    if (view === 'today')    { Schedule.render('scheduleGrid', Schedule.getOffset(), 'scheduleLabel'); Tasks.renderDueSoon(); }
    if (view === 'schedule') { Schedule.render('scheduleFullGrid', Schedule.getFullOffset(), 'scheduleFullLabel'); }
    if (view === 'week')     Week.render();
    if (view === 'tasks')    Tasks.render();
  }

  function refresh() {
    const active = document.querySelector('.view.active')?.id?.replace('view-','');
    if (active === 'today')    { Schedule.render('scheduleGrid', Schedule.getOffset(), 'scheduleLabel'); Tasks.renderDueSoon(); }
    if (active === 'schedule') Schedule.render('scheduleFullGrid', Schedule.getFullOffset(), 'scheduleFullLabel');
    if (active === 'week')     Week.render();
    if (active === 'tasks')    Tasks.render();
  }

  function initHeader() {
    const d = new Date();
    document.getElementById('todayHeading').textContent = 'Today';
    document.getElementById('todayDate').textContent =
      d.toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric', year:'numeric' });
  }

  // ── Seed data (first launch) ────────────────────────────
  function seed() {
    if (Store.tasks.length) return;
    const add = (name, cat, cls, pri, d, status='Not started', est='') => {
      const due = new Date(Store.today());
      due.setDate(due.getDate() + d);
      Store.tasks.push({
        id: 'seed_' + Math.random().toString(36).slice(2),
        fromNotion: false,
        name, category: cat, classLabel: cls,
        priority: pri, status,
        due: Store.toStr(due), est, description: '',
      });
    };
    add('AP Practice Multiple Choice',         'hw',   'AP Language',         'high',   0, 'In progress', '1h');
    add('Read Ch. 4-6 of The Great Gatsby',    'hw',   'AP Language',         'medium', 2, 'Not started', '2h');
    add('Iran Quiz',                           'test', 'AP US History',       'high',   3, 'Not started', '1.5h');
    add('Rational Functions Quiz',             'test', 'Precalculus',         'high',   4, 'Not started', '1h');
    add('AP Bio lab report',                   'hw',   'AP Biology',          'medium', 5, 'Not started', '2h');
    add('Spanish TalkAbroad reflection',       'hw',   'Honors Spanish IV',   'low',    7, 'Not started', '1h');
    add('Debate – affirmative bill prep',      'ec',   'Congressional Debate','high',   6, 'Not started', '2h');
    add('APUSH Ch. 28-29 reading',             'hw',   'AP US History',       'medium', 8, 'Not started', '1.5h');
    Store.persist();
  }

  // ── Keyboard shortcuts ──────────────────────────────────
  function initKeys() {
    document.addEventListener('keydown', e => {
      const typing = ['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName);

      if (e.key === 'Escape') {
        document.querySelectorAll('.modal-backdrop.open').forEach(m => m.classList.remove('open'));
        return;
      }

      if ((e.metaKey||e.ctrlKey) && e.key === 'k') {
        e.preventDefault(); TaskModal.open(); return;
      }

      if (!typing) {
        if ((e.metaKey||e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
          e.preventDefault(); Store.undo(); return;
        }
        if ((e.metaKey||e.ctrlKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
          e.preventDefault(); Store.redo(); return;
        }
        if ((e.metaKey||e.ctrlKey) && e.key === 'ArrowRight') { e.preventDefault(); Schedule.shift(1); return; }
        if ((e.metaKey||e.ctrlKey) && e.key === 'ArrowLeft')  { e.preventDefault(); Schedule.shift(-1); return; }
      }
    });
  }

  // ── Init ────────────────────────────────────────────────
  window.addEventListener('DOMContentLoaded', () => {
    seed();
    initHeader();
    Store.loadFocus();
    initKeys();
    nav('today');

    // Auto-sync Notion on load
    Notion.sync();
  });

  return { nav, refresh };
})();
