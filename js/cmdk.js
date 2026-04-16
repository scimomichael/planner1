// ═════════════════════════════════════════════════════════
// COMMAND PALETTE — ⌘K fuzzy search
// ═════════════════════════════════════════════════════════
const CmdK = (() => {
  let activeIdx = 0;
  let currentItems = [];

  const CORE_COMMANDS = [
    { id: 'c-today',    title: 'Jump to Today',     sub: 'Open today\'s schedule',  action: () => App.nav('today') },
    { id: 'c-sched',    title: 'Full Schedule',     sub: 'Day-view with full height', action: () => App.nav('schedule') },
    { id: 'c-week',     title: 'Week View',         sub: '7-day overview',           action: () => App.nav('week') },
    { id: 'c-month',    title: 'Month View',        sub: '6-week calendar',          action: () => App.nav('month') },
    { id: 'c-tasks',    title: 'All Tasks',         sub: 'Kanban board',             action: () => App.nav('tasks') },
    { id: 'c-stats',    title: 'Stats',             sub: 'Time & task breakdown',    action: () => App.nav('stats') },
    { id: 'c-newtask',  title: 'New Task',          sub: 'Create a new task',        action: () => { close(); TaskModal.open(); } },
    { id: 'c-newblock', title: 'New Block (today)', sub: 'Add a schedule block for today', action: () => { close(); BlockModal.open(Store.todayStr(), 12, 0); } },
    { id: 'c-quickadd', title: 'Quick Add',         sub: 'Natural language add',     action: () => { close(); QuickAdd.open(); } },
    { id: 'c-templates',title: 'Block Templates',   sub: 'Manage & insert templates',action: () => { close(); Templates.open(); } },
    { id: 'c-settings', title: 'Settings',          sub: 'Customize your planner',   action: () => { close(); Settings.open(); } },
    { id: 'c-ai',       title: 'Toggle AI Chat',    sub: 'Open/close Claude panel',  action: () => { close(); AI.toggle(); } },
    { id: 'c-dark',     title: 'Toggle Dark Mode',  sub: 'Switch light/dark theme',  action: () => { close(); Settings.toggleDark(); } },
    { id: 'c-print',    title: 'Print',             sub: 'Print today\'s schedule',  action: () => { close(); window.print(); } },
    { id: 'c-undo',     title: 'Undo',              sub: 'Revert last change',       action: () => { close(); Store.undo(); } },
    { id: 'c-redo',     title: 'Redo',              sub: 'Re-apply undone change',   action: () => { close(); Store.redo(); } },
  ];

  function open() {
    const inp = document.getElementById('cmdkInput');
    inp.value = '';
    document.getElementById('cmdkOverlay').classList.add('open');
    activeIdx = 0;
    render('');
    setTimeout(() => inp.focus(), 60);
  }

  function close() {
    document.getElementById('cmdkOverlay').classList.remove('open');
  }

  function overlayClick(e) {
    if (e.target.id === 'cmdkOverlay') close();
  }

  function handleInput() {
    activeIdx = 0;
    const q = document.getElementById('cmdkInput').value;
    render(q);
  }

  function handleKey(e) {
    if (e.key === 'Escape') { close(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); move(1); return; }
    if (e.key === 'ArrowUp')   { e.preventDefault(); move(-1); return; }
    if (e.key === 'Enter')     { e.preventDefault(); trigger(activeIdx); return; }
  }

  function move(dir) {
    activeIdx = Math.max(0, Math.min(currentItems.length - 1, activeIdx + dir));
    highlight();
    const el = document.querySelector(`.cmdk-item[data-idx="${activeIdx}"]`);
    if (el) el.scrollIntoView({ block: 'nearest' });
  }

  function highlight() {
    document.querySelectorAll('.cmdk-item').forEach(el => {
      el.classList.toggle('active', Number(el.dataset.idx) === activeIdx);
    });
  }

  function trigger(idx) {
    const item = currentItems[idx];
    if (!item) return;
    item.action();
  }

  function fuzzyScore(text, query) {
    text = text.toLowerCase(); query = query.toLowerCase();
    if (!query) return 1;
    if (text.includes(query)) return 10 + (text.startsWith(query) ? 5 : 0);
    let score = 0, qi = 0;
    for (let i = 0; i < text.length && qi < query.length; i++) {
      if (text[i] === query[qi]) { score++; qi++; }
    }
    return qi === query.length ? score : 0;
  }

  function render(q) {
    const res = document.getElementById('cmdkResults');
    currentItems = [];
    const groups = { Commands: [], Tasks: [], Blocks: [] };

    // Commands
    CORE_COMMANDS.forEach(c => {
      const s = fuzzyScore(c.title + ' ' + (c.sub||''), q);
      if (s > 0 || !q) {
        groups.Commands.push({ ...c, score: s });
      }
    });

    // Tasks
    Store.tasks.slice(0, 200).forEach(t => {
      const s = fuzzyScore(t.name + ' ' + (t.classLabel||''), q);
      if (s > 0) {
        groups.Tasks.push({
          id: 'task-' + t.id,
          title: t.name,
          sub: `${t.classLabel ? t.classLabel + ' · ' : ''}${t.status}`,
          score: s,
          action: () => { close(); TaskModal.openEdit(t.id); },
          ico: 'task'
        });
      }
    });

    // Blocks (today + ±3 days)
    if (q) {
      for (let off = -3; off <= 10; off++) {
        const d = new Date(Store.today()); d.setDate(d.getDate() + off);
        const dk = Store.toStr(d);
        (Store.schedule[dk] || []).forEach((b, bi) => {
          const s = fuzzyScore(b.label, q);
          if (s > 0) {
            groups.Blocks.push({
              id: `block-${dk}-${bi}`,
              title: b.label,
              sub: `${dk} · ${b.start}–${b.end}`,
              score: s,
              action: () => { close(); EditBlock.open(dk, bi); },
              ico: 'block'
            });
          }
        });
      }
    }

    // Sort & flatten
    Object.keys(groups).forEach(g => {
      groups[g].sort((a, b) => b.score - a.score);
      if (g !== 'Commands') groups[g] = groups[g].slice(0, 8);
    });

    let html = '';
    Object.entries(groups).forEach(([name, items]) => {
      if (!items.length) return;
      html += `<div class="cmdk-group-hd">${name}</div>`;
      items.forEach(it => {
        currentItems.push(it);
        const idx = currentItems.length - 1;
        html += `
          <div class="cmdk-item${idx === activeIdx ? ' active' : ''}" data-idx="${idx}">
            <div class="cmdk-item-ico">${iconFor(it)}</div>
            <div class="cmdk-item-body">
              <div class="cmdk-item-title">${Store.esc(it.title)}</div>
              <div class="cmdk-item-sub">${Store.esc(it.sub || '')}</div>
            </div>
          </div>`;
      });
    });

    if (!currentItems.length) {
      html = `<div class="empty" style="padding:30px 0">No results for "${Store.esc(q)}"</div>`;
    }
    res.innerHTML = html;
    res.querySelectorAll('.cmdk-item').forEach(el => {
      el.addEventListener('click', () => trigger(Number(el.dataset.idx)));
      el.addEventListener('mouseenter', () => { activeIdx = Number(el.dataset.idx); highlight(); });
    });
  }

  function iconFor(it) {
    if (it.ico === 'task')  return `<svg viewBox="0 0 14 14" fill="none"><path d="M2 4h10M2 7h7M2 10h5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`;
    if (it.ico === 'block') return `<svg viewBox="0 0 14 14" fill="none"><rect x="1" y="2" width="12" height="11" rx="2" stroke="currentColor" stroke-width="1.3"/><path d="M1 5h12" stroke="currentColor" stroke-width="1.3"/></svg>`;
    return `<svg viewBox="0 0 14 14" fill="none"><path d="M7 2v10M2 7h10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`;
  }

  return { open, close, overlayClick, handleInput, handleKey };
})();
