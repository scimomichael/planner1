// ═════════════════════════════════════════════════════════
// TASKS — kanban, due-soon list, card renderer, with tags
// ═════════════════════════════════════════════════════════
const Tasks = (() => {
  const CYCLE = { 'Not started': 'In progress', 'In progress': 'Done', 'Done': 'Not started' };

  function renderDueSoon() {
    const el = document.getElementById('dueSoon');
    if (!el) return;
    const upcoming = Store.tasks
      .filter(t => t.status !== 'Done' && t.due)
      .sort((a, b) => Store.daysUntil(a.due) - Store.daysUntil(b.due))
      .slice(0, 9);
    if (!upcoming.length) {
      el.innerHTML = '<div class="empty">No upcoming tasks</div>';
      return;
    }
    el.innerHTML = `<div class="due-soon-list">${upcoming.map(card).join('')}</div>`;
    _wireCards(el);
  }

  function render() {
    const kanEl = document.getElementById('kanban');
    if (!kanEl) return;
    const fCat = document.getElementById('fCat').value;
    const fClass = document.getElementById('fClass').value;
    const cols = [
      { status: 'Not started', label: 'Not started', items: [] },
      { status: 'In progress', label: 'In progress', items: [] },
      { status: 'Done',        label: 'Done',        items: [] },
    ];
    Store.tasks.forEach(t => {
      if (fCat && t.category !== fCat) return;
      if (fClass && t.classLabel !== fClass) return;
      const c = cols.find(c => c.status === t.status);
      if (c) c.items.push(t);
    });
    kanEl.innerHTML = cols.map(col => `
      <div class="kb-col">
        <div class="kb-col-hd">
          <span class="kb-col-title">${col.label}</span>
          <span class="kb-col-n">${col.items.length}</span>
        </div>
        <div class="kb-body">
          ${col.items.length ? `<div class="kb-list">${col.items.map(card).join('')}</div>` : '<div class="kb-empty">Nothing here</div>'}
          ${col.status !== 'Done' ? `<button class="kb-add" onclick="TaskModal.open('${col.status}')">+ Add Task</button>` : ''}
        </div>
      </div>
    `).join('');
    _wireCards(kanEl);
  }

  function card(t) {
    const checkCls = t.status === 'Done' ? 'done' : t.status === 'In progress' ? 'prog' : '';
    const doneCls = t.status === 'Done' ? ' is-done' : '';
    const schedBadge = t.schedDate ? `<span class="sched-badge">📅 ${Store.fmtDate(t.schedDate)}</span>` : '';
    const tags = Array.isArray(t.tags) && t.tags.length
      ? t.tags.slice(0, 3).map(tag => `<span class="tag-chip">#${Store.esc(tag)}</span>`).join('')
      : '';
    return `
      <div class="task-row cat-${t.category||'hw'}${doneCls}" data-id="${t.id}">
        <div class="tr-check ${checkCls}" data-act="cycle"></div>
        <div class="tr-body">
          <div class="tr-name">${Store.esc(t.name)}</div>
          <div class="tr-meta">
            ${t.classLabel ? Store.clsPill(t.classLabel) : ''}
            ${t.est ? `<span class="cls-chip">${Store.esc(t.est)}</span>` : ''}
            ${schedBadge}
            ${tags}
          </div>
        </div>
        <div class="tr-right">
          ${t.due ? Store.duePill(t.due) : ''}
          ${t.priority ? `<span class="pri-dot p-${t.priority}"></span>` : ''}
          <button class="tr-del" data-act="del">✕</button>
        </div>
      </div>`;
  }

  function _wireCards(root) {
    root.querySelectorAll('.task-row').forEach(row => {
      const id = row.dataset.id;
      row.addEventListener('click', e => {
        const act = e.target.dataset.act;
        if (act === 'cycle') { e.stopPropagation(); cycle(id); return; }
        if (act === 'del')   { e.stopPropagation(); del(id); return; }
        TaskModal.openEdit(id);
      });
    });
  }

  function cycle(id) {
    const t = Store.tasks.find(x => x.id === id);
    if (!t) return;
    Store.snapshot();
    t.status = CYCLE[t.status] || 'Not started';
    Store.persist();
    App.refresh();
  }

  function del(id) {
    Store.snapshot();
    Store.tasks = Store.tasks.filter(x => x.id !== id);
    Store.persist();
    App.refresh();
  }

  return { render, renderDueSoon, cycle, del, card };
})();


// ═════════════════════════════════════════════════════════
// TASK MODAL
// ═════════════════════════════════════════════════════════
const TaskModal = (() => {
  let editId = null, cat = 'hw', pri = 'medium';

  function open(defaultStatus = '') {
    editId = null;
    document.getElementById('taskModalTitle').textContent = 'New Task';
    document.getElementById('tName').value = '';
    document.getElementById('tClass').value = '';
    document.getElementById('tStatus').value = defaultStatus || 'Not started';
    document.getElementById('tDue').value = '';
    document.getElementById('tEst').value = '';
    document.getElementById('tNotes').value = '';
    document.getElementById('tSchedDate').value = '';
    document.getElementById('tTags').value = '';
    setCat('hw'); setPri('medium');
    document.getElementById('taskOverlay').classList.add('open');
    setTimeout(() => document.getElementById('tName').focus(), 50);
  }

  function openEdit(id) {
    const t = Store.tasks.find(x => x.id === id);
    if (!t) return;
    editId = id;
    document.getElementById('taskModalTitle').textContent = 'Edit Task';
    document.getElementById('tName').value = t.name || '';
    document.getElementById('tClass').value = t.classLabel || '';
    document.getElementById('tStatus').value = t.status || 'Not started';
    document.getElementById('tDue').value = t.due || '';
    document.getElementById('tEst').value = t.est || '';
    document.getElementById('tNotes').value = t.description || '';
    document.getElementById('tSchedDate').value = t.schedDate || '';
    document.getElementById('tTags').value = Array.isArray(t.tags) ? t.tags.join(', ') : '';
    setCat(t.category || 'hw'); setPri(t.priority || 'medium');
    document.getElementById('taskOverlay').classList.add('open');
    setTimeout(() => document.getElementById('tName').focus(), 50);
  }

  function close() { document.getElementById('taskOverlay').classList.remove('open'); editId = null; }
  function overlayClick(e) { if (e.target.id === 'taskOverlay') close(); }

  function setCat(c) {
    cat = c;
    document.querySelectorAll('#catPicker .seg-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.c === c);
    });
  }
  function setPri(p) {
    pri = p;
    document.querySelectorAll('#priPicker .seg-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.p === p);
    });
  }

  function save() {
    const name = document.getElementById('tName').value.trim();
    if (!name) { document.getElementById('tName').focus(); return; }
    Store.snapshot();
    const tagsRaw = document.getElementById('tTags').value;
    const tags = tagsRaw.split(',').map(s => s.trim()).filter(Boolean);
    const fields = {
      name,
      status: document.getElementById('tStatus').value,
      due: document.getElementById('tDue').value || null,
      description: document.getElementById('tNotes').value.trim(),
      est: document.getElementById('tEst').value.trim(),
      category: cat,
      classLabel: document.getElementById('tClass').value,
      priority: pri,
      schedDate: document.getElementById('tSchedDate').value || null,
      tags,
    };
    if (editId) {
      const t = Store.tasks.find(x => x.id === editId);
      if (t) Object.assign(t, fields);
    } else {
      Store.tasks.push({
        id: 'local_' + Date.now() + Math.random().toString(36).slice(2),
        ...fields
      });
    }
    Store.persist();
    close();
    App.refresh();
  }

  return { open, openEdit, close, overlayClick, setCat, setPri, save };
})();
