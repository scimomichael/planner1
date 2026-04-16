// ═══════════════════════════════════════════════════════
// TASKS
// ═══════════════════════════════════════════════════════

const Tasks = (() => {
  const STATUS_CYCLE = {
    'Not started': 'In progress',
    'In progress': 'Done',
    'Done':        'Not started',
  };

  // ── Due soon (today panel) ──────────────────────────────
  function renderDueSoon() {
    const el = document.getElementById('dueSoon');
    const sorted = Store.tasks
      .filter(t => t.status !== 'Done' && t.due)
      .sort((a,b) => Store.daysUntil(a.due) - Store.daysUntil(b.due))
      .slice(0, 8);

    if (!sorted.length) {
      el.innerHTML = '<div class="empty">No upcoming tasks</div>';
      return;
    }
    el.innerHTML = `<div class="task-stack">${sorted.map(t => card(t)).join('')}</div>`;
  }

  // ── Kanban ──────────────────────────────────────────────
  function render() {
    const filterCat   = document.getElementById('filterCat').value;
    const filterClass = document.getElementById('filterClass').value;

    const cols = [
      { status:'Not started', label:'Not started', tasks:[] },
      { status:'In progress', label:'In progress', tasks:[] },
      { status:'Done',        label:'Done',         tasks:[] },
    ];

    Store.tasks.forEach(t => {
      if (filterCat   && t.category   !== filterCat)   return;
      if (filterClass && t.classLabel !== filterClass)  return;
      const col = cols.find(c => c.status === t.status);
      if (col) col.tasks.push(t);
    });

    document.getElementById('kanban').innerHTML = cols.map(col => `
      <div class="kb-col">
        <div class="kb-col-head">
          <span class="kb-col-title">${col.label}</span>
          <span class="kb-col-count">${col.tasks.length}</span>
        </div>
        <div class="kb-tasks">
          ${col.tasks.map(t => card(t)).join('') || '<div class="empty" style="padding:16px 0;font-size:12px">Nothing here</div>'}
        </div>
        ${col.status !== 'Done' ? `<button class="kb-add btn-link" onclick="TaskModal.open('${col.status}')">+ Add task</button>` : ''}
      </div>
    `).join('');
  }

  // ── Card HTML ───────────────────────────────────────────
  function card(t) {
    const checkCls = t.status === 'Done' ? 'done' : t.status === 'In progress' ? 'prog' : '';
    const catCls   = `cat-${t.category || 'hw'}`;
    const doneCls  = t.status === 'Done' ? ' is-done' : '';
    const notionBadge = t.fromNotion ? `<span class="notion-n">N</span>` : '';

    return `
      <div class="task-card ${catCls}${doneCls}" onclick="TaskModal.openEdit('${t.id}')">
        <div class="tc-check ${checkCls}" onclick="event.stopPropagation();Tasks.cycle('${t.id}')"></div>
        <div class="tc-body">
          <div class="tc-name">${Store.esc(t.name)}${notionBadge}</div>
          <div class="tc-meta">
            ${t.classLabel ? Store.classPill(t.classLabel) : ''}
            ${t.est ? `<span class="class-chip">${Store.esc(t.est)}</span>` : ''}
          </div>
        </div>
        <div class="tc-right">
          ${t.due ? Store.duePill(t.due) : ''}
          ${t.priority ? `<span class="pri-dot pri-${t.priority}"></span>` : ''}
          <button class="tc-del" onclick="event.stopPropagation();Tasks.del('${t.id}')">✕</button>
        </div>
      </div>`;
  }

  // ── Cycle status ────────────────────────────────────────
  function cycle(id) {
    const t = Store.tasks.find(x => x.id === id);
    if (!t) return;
    Store.snapshot();
    t.status = STATUS_CYCLE[t.status] || 'Not started';
    Store.persist();
    App.refresh();
  }

  // ── Delete ──────────────────────────────────────────────
  function del(id) {
    Store.snapshot();
    Store.tasks = Store.tasks.filter(x => x.id !== id);
    Store.persist();
    App.refresh();
  }

  return { render, renderDueSoon, cycle, del, card };
})();


// ═══════════════════════════════════════════════════════
// TASK MODAL
// ═══════════════════════════════════════════════════════

const TaskModal = (() => {
  let editId   = null;
  let activeCat = 'hw';
  let activePri = 'medium';

  function open(defaultStatus = '') {
    editId = null;
    document.getElementById('modalHeading').textContent = 'New task';
    document.getElementById('tName').value    = '';
    document.getElementById('tClass').value   = '';
    document.getElementById('tStatus').value  = defaultStatus || 'Not started';
    document.getElementById('tDue').value     = '';
    document.getElementById('tEst').value     = '';
    document.getElementById('tNotes').value   = '';
    pickCat('hw');
    pickPri('medium');
    document.getElementById('taskBackdrop').classList.add('open');
    setTimeout(() => document.getElementById('tName').focus(), 40);
  }

  function openEdit(id) {
    const t = Store.tasks.find(x => x.id === id);
    if (!t) return;
    editId = id;
    document.getElementById('modalHeading').textContent = 'Edit task';
    document.getElementById('tName').value    = t.name        || '';
    document.getElementById('tClass').value   = t.classLabel  || '';
    document.getElementById('tStatus').value  = t.status      || 'Not started';
    document.getElementById('tDue').value     = t.due         || '';
    document.getElementById('tEst').value     = t.est         || '';
    document.getElementById('tNotes').value   = t.description || '';
    pickCat(t.category || 'hw');
    pickPri(t.priority || 'medium');
    document.getElementById('taskBackdrop').classList.add('open');
    setTimeout(() => document.getElementById('tName').focus(), 40);
  }

  function close() {
    document.getElementById('taskBackdrop').classList.remove('open');
    editId = null;
  }

  function backdropClick(e) {
    if (e.target.id === 'taskBackdrop') close();
  }

  function pickCat(cat) {
    activeCat = cat;
    document.querySelectorAll('.cat-opt').forEach(btn => {
      const c = btn.dataset.cat;
      btn.className = `cat-opt${c === cat ? ' active ' + c : ' ' + c}`;
    });
  }

  function pickPri(p) {
    activePri = p;
    document.querySelectorAll('.pri-opt').forEach(btn => {
      const dp = btn.dataset.p;
      btn.className = `pri-opt${dp === p ? ' active ' + p : ''}`;
    });
  }

  function save() {
    const name = document.getElementById('tName').value.trim();
    if (!name) { document.getElementById('tName').focus(); return; }

    Store.snapshot();

    const fields = {
      name,
      status:      document.getElementById('tStatus').value,
      due:         document.getElementById('tDue').value || null,
      description: document.getElementById('tNotes').value.trim(),
      est:         document.getElementById('tEst').value.trim(),
      category:    activeCat,
      classLabel:  document.getElementById('tClass').value,
      priority:    activePri,
    };

    if (editId) {
      const t = Store.tasks.find(x => x.id === editId);
      if (t) Object.assign(t, fields);
    } else {
      Store.tasks.push({
        id: 'local_' + Date.now() + Math.random().toString(36).slice(2),
        fromNotion: false,
        ...fields,
      });
    }

    Store.persist();
    close();
    App.refresh();
  }

  return { open, openEdit, close, backdropClick, pickCat, pickPri, save };
})();
