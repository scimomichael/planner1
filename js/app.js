// ═════════════════════════════════════════════════════════
// APP — router, init, keyboard shortcuts
// ═════════════════════════════════════════════════════════
const App = (() => {
  let currentView = 'today';

  function nav(view) {
    currentView = view;
    document.querySelectorAll('.nav-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.view === view);
    });
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    const el = document.getElementById(`view-${view}`);
    if (el) el.classList.add('active');
    refresh();
  }

  function refresh() {
    // Today date label
    const t = document.getElementById('todayDate');
    if (t) t.textContent = new Date().toLocaleDateString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
    });
    const tt = document.getElementById('todayTitle');
    if (tt) tt.textContent = 'Today';

    Store.loadFocus();

    switch (currentView) {
      case 'today':
        Sched.render('schedGrid', 'schedLabel', Sched.getOffset());
        break;
      case 'schedule':
        Sched.render('schedFullGrid', 'schedFullLabel', Sched.getFullOffset());
        break;
      case 'week':  Week.render();  break;
      case 'month': Month.render(); break;
      case 'stats': Stats.render(); break;
    }
  }

  function setupKeyboard() {
    document.addEventListener('keydown', e => {
      const meta = e.metaKey || e.ctrlKey;
      const tag = (e.target && e.target.tagName) || '';
      const inField = ['INPUT','TEXTAREA','SELECT'].includes(tag) || e.target?.isContentEditable;

      if (meta && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (document.getElementById('cmdkOverlay').classList.contains('open')) CmdK.close();
        else CmdK.open();
        return;
      }
      if (meta && e.key === ',') {
        e.preventDefault();
        Settings.open();
        return;
      }
      if (meta && e.key === '/') {
        e.preventDefault();
        if (Settings.get('sAIEnabled', true)) AI.toggle();
        return;
      }
      if (meta && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        Store.undo();
        return;
      }
      if (meta && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) {
        e.preventDefault();
        Store.redo();
        return;
      }

      if (inField) return;

      if (e.key === 'Escape') {
        // Close any open overlays
        document.querySelectorAll('.modal-overlay.open').forEach(o => o.classList.remove('open'));
        const p = document.getElementById('aiPanel');
        if (p && p.classList.contains('open')) p.classList.remove('open');
        return;
      }
      // Single-key view shortcuts
      if (e.key === 't' || e.key === 'T') { nav('today'); return; }
      if (e.key === 's' || e.key === 'S') { nav('schedule'); return; }
      if (e.key === 'w' || e.key === 'W') { nav('week'); return; }
      if (e.key === 'm' || e.key === 'M') { nav('month'); return; }
      if (e.key === 'n' || e.key === 'N') { BlockModal.open(Store.todayStr(), 12, 0); return; }
      if (e.key === 'q' || e.key === 'Q') { QuickAdd.open(); return; }
    });

    // Swipe between day shifts (basic): keep right/left arrow on today view
    document.addEventListener('keydown', e => {
      const tag = (e.target && e.target.tagName) || '';
      const inField = ['INPUT','TEXTAREA','SELECT'].includes(tag) || e.target?.isContentEditable;
      if (inField) return;
      if (!document.getElementById('view-today').classList.contains('active')) return;
      if (e.key === 'ArrowLeft')  { Sched.shift(-1); e.preventDefault(); }
      if (e.key === 'ArrowRight') { Sched.shift(1); e.preventDefault(); }
    });
  }

  async function init() {
    Settings.init();
    await Store.pull();
    Store.loadFocus();
    AI.init();
    Notify.init();
    // Populate all class selects on boot
    if (typeof Classes !== 'undefined') {
      Classes.refreshAllSelects();
    }
    setupKeyboard();
    setInterval(() => {
      if (currentView === 'today' || currentView === 'schedule') {
        Sched.renderBoth();
      }
    }, 60000);
    nav('today');
  }

  return { nav, refresh, init };
})();

// Boot
document.addEventListener('DOMContentLoaded', App.init);
