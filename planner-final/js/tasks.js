// ── TASKS ─────────────────────────────────────────────────────────────

// ── UNDO / REDO STACK ─────────────────────────────────────────────────
// Every mutation pushes a snapshot onto undoStack so ⌘Z can restore it.
const undoStack = [];
const redoStack = [];

function snapshot() {
  undoStack.push(JSON.stringify(tasks));
  if (undoStack.length > 50) undoStack.shift();
  redoStack.length = 0; // clear redo on new action
}

function undo() {
  if (!undoStack.length) return;
  redoStack.push(JSON.stringify(tasks));
  tasks = JSON.parse(undoStack.pop());
  persist();
  refreshAll();
  showToast('Undone');
}

function redo() {
  if (!redoStack.length) return;
  undoStack.push(JSON.stringify(tasks));
  tasks = JSON.parse(redoStack.pop());
  persist();
  refreshAll();
  showToast('Redone');
}

function showToast(msg) {
  let t = document.getElementById('toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'toast';
    t.style.cssText = `
      position:fixed;bottom:28px;left:50%;transform:translateX(-50%);
      background:var(--tx);color:var(--surface);
      padding:8px 18px;border-radius:20px;font-size:13px;font-weight:500;
      z-index:9999;opacity:0;transition:opacity .2s;pointer-events:none;`;
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.style.opacity = '1';
  clearTimeout(t._timer);
  t._timer = setTimeout(() => { t.style.opacity = '0'; }, 1600);
}

// ── DUE SOON (today panel) ────────────────────────────────────────────
function renderDueSoon() {
  const el = document.getElementById('due-soon');
  const sorted = tasks
    .filter(t => t.status !== 'Done' && t.due)
    .sort((a,b) => daysUntil(a.due) - daysUntil(b.due))
    .slice(0, 8);

  if (!sorted.length) {
    el.innerHTML = '<div class="empty">No upcoming tasks</div>';
    return;
  }
  el.innerHTML = sorted.map(t => taskCard(t, true)).join('');
}

// ── KANBAN (all tasks) — 3 columns: Not started / In progress / Done ──
function renderTasksView() {
  const filterCat   = document.getElementById('filter-cat').value;
  const filterClass = document.getElementById('filter-class').value;

  const cols = [
    { status: 'Not started', label: 'Not started', tasks: [] },
    { status: 'In progress', label: 'In progress', tasks: [] },
    { status: 'Done',        label: 'Done',         tasks: [] },
  ];

  tasks.forEach(t => {
    if (filterCat   && t.category   !== filterCat)   return;
    if (filterClass && t.classLabel !== filterClass)  return;
    const col = cols.find(c => c.status === t.status);
    if (col) col.tasks.push(t);
  });

  document.getElementById('kanban').innerHTML = cols.map(col => `
    <div class="kb-col">
      <div class="kb-col-hd">
        ${col.status === 'Done'
          ? '<span style="color:var(--green)">✓</span> '
          : ''}${col.label}
        <span style="font-weight:400;color:var(--tx4)">(${col.tasks.length})</span>
      </div>
      <div class="kb-tasks">
        ${col.tasks.map(t => taskCard(t, false)).join('')
          || '<div class="empty" style="padding:12px 0;font-size:12px">Empty</div>'}
      </div>
      ${col.status !== 'Done'
        ? `<button class="kb-add btn-text-sm" onclick="openTaskModal('${col.status}')">+ Add</button>`
        : ''}
    </div>`).join('');
}

// ── TASK CARD HTML ────────────────────────────────────────────────────
function taskCard(t) {
  const checkCls = t.status === 'Done' ? 'done' : t.status === 'In progress' ? 'prog' : '';
  const catCls   = 'cat-' + (t.category || 'hw');
  const notionBadge = t.notion
    ? `<span style="font-size:10px;color:var(--tx4);margin-left:2px" title="Synced from Notion">N</span>`
    : '';

  return `
    <div class="task-card ${catCls}${t.status==='Done'?' done':''}" id="tc-${t.id}" onclick="openEditTask('${t.id}')">
      <div class="tc-check ${checkCls}" onclick="event.stopPropagation();cycleStatus('${t.id}')"></div>
      <div class="tc-body">
        <div class="tc-name">${esc(t.name)}${notionBadge}</div>
        <div class="tc-meta">
          ${t.classLabel ? clsPill(t.classLabel) : ''}
          ${t.est ? `<span>~${esc(t.est)}</span>` : ''}
        </div>
      </div>
      <div class="tc-right">
        ${t.due ? duePillStr(t.due) : ''}
        ${t.priority ? `<span class="pri-dot p-${t.priority}"></span>` : ''}
        <button class="del-btn" onclick="event.stopPropagation();handleDelete('${t.id}')">✕</button>
      </div>
    </div>`;
}

// ── CYCLE STATUS ──────────────────────────────────────────────────────
const STATUS_CYCLE = {
  'Not started': 'In progress',
  'In progress': 'Done',
  'Done':        'Not started',
};

async function cycleStatus(id) {
  const t = tasks.find(x => x.id === id);
  if (!t) return;
  snapshot();                                   // save for undo
  const newStatus = STATUS_CYCLE[t.status] || 'Not started';
  t.status = newStatus;
  persist();
  pushStatus(id, newStatus);                    // simultaneous Notion push
  refreshAll();
}

// ── DELETE ────────────────────────────────────────────────────────────
async function handleDelete(id) {
  snapshot();
  pushDelete(id);
  tasks = tasks.filter(x => x.id !== id);
  persist();
  refreshAll();
}

// ── TASK MODAL ────────────────────────────────────────────────────────
function openTaskModal(defaultStatus = '') {
  editTaskId = null;
  document.getElementById('modal-title').textContent      = 'New task';
  document.getElementById('modal-save-btn').textContent   = 'Save to Notion';
  document.getElementById('t-name').value   = '';
  document.getElementById('t-desc').value   = '';
  document.getElementById('t-due').value    = '';
  document.getElementById('t-est').value    = '';
  document.getElementById('t-status').value = defaultStatus || 'Not started';
  document.getElementById('t-class').value  = '';
  pickCat('hw');
  pickPri('medium');
  document.getElementById('task-overlay').classList.add('open');
  setTimeout(() => document.getElementById('t-name').focus(), 40);
}

function openEditTask(id) {
  const t = tasks.find(x => x.id === id);
  if (!t) return;
  editTaskId = id;
  document.getElementById('modal-title').textContent    = 'Edit task';
  document.getElementById('modal-save-btn').textContent = t.notion ? 'Save to Notion' : 'Save';
  document.getElementById('t-name').value   = t.name        || '';
  document.getElementById('t-desc').value   = t.description || '';
  document.getElementById('t-due').value    = t.due         || '';
  document.getElementById('t-est').value    = t.est         || '';
  document.getElementById('t-status').value = t.status      || 'Not started';
  document.getElementById('t-class').value  = t.classLabel  || '';
  pickCat(t.category || 'hw');
  pickPri(t.priority || 'medium');
  document.getElementById('task-overlay').classList.add('open');
  setTimeout(() => document.getElementById('t-name').focus(), 40);
}

function closeTaskModal(e) {
  if (e && e.target !== e.currentTarget) return;
  document.getElementById('task-overlay').classList.remove('open');
  editTaskId = null;
}

function pickCat(cat) {
  activeCat = cat;
  document.querySelectorAll('.cat-btn').forEach(btn => {
    const c = btn.dataset.cat;
    btn.className = `cat-btn${c === cat ? ' active ' + c : ''}`;
  });
}

function pickPri(p) {
  activePri = p;
  document.querySelectorAll('.pri-btn').forEach(btn => {
    const dp = btn.dataset.p;
    btn.className = `pri-btn${dp === p ? ' active-' + p : ''}`;
  });
}

async function saveTask() {
  const name = document.getElementById('t-name').value.trim();
  if (!name) { document.getElementById('t-name').focus(); return; }

  const fields = {
    name,
    status:      document.getElementById('t-status').value,
    due:         document.getElementById('t-due').value    || null,
    description: document.getElementById('t-desc').value.trim(),
    est:         document.getElementById('t-est').value.trim(),
    category:    activeCat,
    classLabel:  document.getElementById('t-class').value,
    priority:    activePri,
  };

  snapshot();

  if (editTaskId) {
    const t = tasks.find(x => x.id === editTaskId);
    if (t) {
      Object.assign(t, fields);
      persist();
      pushUpdate(editTaskId, {
        name: fields.name,
        status: fields.status,
        due: fields.due,
        description: fields.description,
      });
    }
  } else {
    const tempId  = 'local_' + Date.now();
    const newTask = { id: tempId, notion: false, ...fields };
    tasks.push(newTask);
    persist();

    // Push to Notion and swap in the real ID
    pushCreate(fields).then(notionId => {
      if (notionId) {
        newTask.id     = notionId;
        newTask.notion = true;
        persist();
        refreshAll();
      }
    });
  }

  closeTaskModal();
  refreshAll();
}
