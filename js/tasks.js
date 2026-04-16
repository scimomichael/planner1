// ══════════════════════════════════════════════════════════
// TASKS — kanban, due-soon, task modal
// ══════════════════════════════════════════════════════════
const Tasks = (() => {
  const CYCLE = {'Not started':'In progress','In progress':'Done','Done':'Not started'};

  function renderDueSoon() {
    const el = document.getElementById('dueSoon');
    const sorted = Store.tasks
      .filter(t => t.status!=='Done' && t.due)
      .sort((a,b) => Store.daysUntil(a.due) - Store.daysUntil(b.due))
      .slice(0, 9);
    el.innerHTML = sorted.length
      ? `<div class="task-stack">${sorted.map(card).join('')}</div>`
      : '<div class="empty">No upcoming tasks</div>';
  }

  function render() {
    const fCat   = document.getElementById('fCat').value;
    const fClass = document.getElementById('fClass').value;

    const cols = [
      {status:'Not started', label:'Not started', tasks:[]},
      {status:'In progress', label:'In progress', tasks:[]},
      {status:'Done',        label:'Done',         tasks:[]},
    ];
    Store.tasks.forEach(t => {
      if (fCat   && t.category   !== fCat)   return;
      if (fClass && t.classLabel !== fClass)  return;
      const c = cols.find(c=>c.status===t.status);
      if (c) c.tasks.push(t);
    });

    document.getElementById('kanban').innerHTML = cols.map(col=>`
      <div class="kb-col">
        <div class="kb-col-hd">
          <span class="kb-col-title">${col.label}</span>
          <span class="kb-col-n">${col.tasks.length}</span>
        </div>
        <div class="kb-tasks">
          ${col.tasks.map(card).join('') || '<div class="empty" style="padding:14px 0;font-size:12px">Nothing here</div>'}
        </div>
        ${col.status!=='Done' ? `<button class="kb-add btn-link" onclick="TaskModal.open('${col.status}')">+ Add task</button>` : ''}
      </div>`).join('');
  }

  function card(t) {
    const checkCls = t.status==='Done'?'done':t.status==='In progress'?'prog':'';
    const doneCls  = t.status==='Done'?' is-done':'';
    const n        = t.fromNotion ? `<span class="notion-n">N</span>` : '';
    const schedBadge = t.schedDate ? `<span class="sched-badge">📅 ${Store.fmtDate(t.schedDate)}</span>` : '';
    return `
      <div class="task-card ${t.category||'hw'}${doneCls}" onclick="TaskModal.openEdit('${t.id}')">
        <div class="tc-check ${checkCls}" onclick="event.stopPropagation();Tasks.cycle('${t.id}')"></div>
        <div class="tc-body">
          <div class="tc-name">${Store.esc(t.name)}${n}</div>
          <div class="tc-meta">
            ${t.classLabel ? Store.clsPill(t.classLabel) : ''}
            ${t.est ? `<span class="cls-chip">${Store.esc(t.est)}</span>` : ''}
            ${schedBadge}
          </div>
        </div>
        <div class="tc-right">
          ${t.due ? Store.duePill(t.due) : ''}
          ${t.priority ? `<span class="pri-dot p-${t.priority}"></span>` : ''}
          <button class="tc-del" onclick="event.stopPropagation();Tasks.del('${t.id}')">✕</button>
        </div>
      </div>`;
  }

  function cycle(id) {
    const t = Store.tasks.find(x=>x.id===id);
    if (!t) return;
    Store.snapshot();
    t.status = CYCLE[t.status] || 'Not started';
    Store.persist();
    App.refresh();
  }

  function del(id) {
    Store.snapshot();
    Store.tasks = Store.tasks.filter(x=>x.id!==id);
    Store.persist();
    App.refresh();
  }

  return { render, renderDueSoon, cycle, del, card };
})();


// ══════════════════════════════════════════════════════════
// TASK MODAL
// ══════════════════════════════════════════════════════════
const TaskModal = (() => {
  let editId = null, cat = 'hw', pri = 'medium';

  function open(defaultStatus='') {
    editId = null;
    document.getElementById('taskModalTitle').textContent = 'New task';
    document.getElementById('tName').value      = '';
    document.getElementById('tClass').value     = '';
    document.getElementById('tStatus').value    = defaultStatus || 'Not started';
    document.getElementById('tDue').value       = '';
    document.getElementById('tEst').value       = '';
    document.getElementById('tNotes').value     = '';
    document.getElementById('tSchedDate').value = '';
    setCat('hw'); setPri('medium');
    document.getElementById('taskBackdrop').classList.add('open');
    setTimeout(()=>document.getElementById('tName').focus(), 40);
  }

  function openEdit(id) {
    const t = Store.tasks.find(x=>x.id===id);
    if (!t) return;
    editId = id;
    document.getElementById('taskModalTitle').textContent = 'Edit task';
    document.getElementById('tName').value      = t.name        || '';
    document.getElementById('tClass').value     = t.classLabel  || '';
    document.getElementById('tStatus').value    = t.status      || 'Not started';
    document.getElementById('tDue').value       = t.due         || '';
    document.getElementById('tEst').value       = t.est         || '';
    document.getElementById('tNotes').value     = t.description || '';
    document.getElementById('tSchedDate').value = t.schedDate   || '';
    setCat(t.category||'hw'); setPri(t.priority||'medium');
    document.getElementById('taskBackdrop').classList.add('open');
    setTimeout(()=>document.getElementById('tName').focus(), 40);
  }

  function close() {
    document.getElementById('taskBackdrop').classList.remove('open');
    editId = null;
  }
  function bdClick(e) { if (e.target.id==='taskBackdrop') close(); }

  function setCat(c) {
    cat = c;
    document.querySelectorAll('.cat-opt').forEach(b=>{
      const bc = b.dataset.c;
      b.className = `cat-opt ${bc}${bc===c?' active':''}`;
    });
  }
  function setPri(p) {
    pri = p;
    document.querySelectorAll('.pri-opt').forEach(b=>{
      const bp = b.dataset.p;
      b.className = `pri-opt${bp===p?' active '+p:''}`;
    });
  }

  function save() {
    const name = document.getElementById('tName').value.trim();
    if (!name) { document.getElementById('tName').focus(); return; }
    Store.snapshot();
    const fields = {
      name,
      status:      document.getElementById('tStatus').value,
      due:         document.getElementById('tDue').value      || null,
      description: document.getElementById('tNotes').value.trim(),
      est:         document.getElementById('tEst').value.trim(),
      category:    cat,
      classLabel:  document.getElementById('tClass').value,
      priority:    pri,
      schedDate:   document.getElementById('tSchedDate').value || null,
    };
    if (editId) {
      const t = Store.tasks.find(x=>x.id===editId);
      if (t) Object.assign(t, fields);
    } else {
      Store.tasks.push({ id:'local_'+Date.now()+Math.random().toString(36).slice(2), fromNotion:false, ...fields });
    }
    Store.persist();
    close();
    App.refresh();
  }

  // expose for onclick attributes
  return { open, openEdit, close, bdClick, cat:setCat, pri:setPri, save };
})();
