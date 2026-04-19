// ═════════════════════════════════════════════════════════
// CLASSES — Manage Classes modal + select populator
// ═════════════════════════════════════════════════════════
const Classes = (() => {
  const MAGIC_ADD = '__add_new_class__';

  // Populate any <select> with class options. Appends a "+ Add new class…"
  // sentinel option that opens the Manage modal when selected.
  // onAdded: optional callback(newClassName) invoked after class is created
  function populateSelect(selectEl, currentValue, opts = {}) {
    if (typeof selectEl === 'string') selectEl = document.getElementById(selectEl);
    if (!selectEl) return;

    const includeNone = opts.includeNone !== false;
    const nonePlaceholder = opts.nonePlaceholder || 'None';

    const list = Store.getClasses();
    let html = '';
    if (includeNone) html += `<option value="">${Store.esc(nonePlaceholder)}</option>`;
    list.forEach(c => {
      html += `<option value="${Store.esc(c.name)}">${Store.esc(c.name)}</option>`;
    });
    html += `<option disabled>──────────</option>`;
    html += `<option value="${MAGIC_ADD}">＋ Add new class…</option>`;
    html += `<option value="__manage_classes__">⚙ Manage classes…</option>`;
    selectEl.innerHTML = html;

    if (currentValue !== undefined && currentValue !== null) {
      selectEl.value = currentValue;
    }

    // One-time binding to intercept the magic values
    if (!selectEl._classesBound) {
      selectEl._classesBound = true;
      selectEl.addEventListener('change', () => {
        if (selectEl.value === MAGIC_ADD) {
          selectEl.value = opts.previousValue || '';
          _quickAdd(newName => {
            populateSelect(selectEl, newName, opts);
            if (opts.onAdded) opts.onAdded(newName);
            if (typeof App !== 'undefined' && App.refresh) App.refresh();
          });
        } else if (selectEl.value === '__manage_classes__') {
          selectEl.value = opts.previousValue || '';
          open(() => {
            populateSelect(selectEl, selectEl.value, opts);
            if (typeof App !== 'undefined' && App.refresh) App.refresh();
          });
        }
      });
    }
    opts.previousValue = selectEl.value;
  }

  // Repopulate every class select currently in the document
  function refreshAllSelects() {
    document.querySelectorAll('select[data-class-select]').forEach(sel => {
      const cur = sel.value;
      populateSelect(sel, cur, { nonePlaceholder: sel.dataset.nonePlaceholder || 'None' });
    });
  }

  // Inline prompt → add a new class quickly
  function _quickAdd(cb) {
    const name = prompt('New class name:');
    if (!name || !name.trim()) return;
    const c = Store.addClass(name, _randomColor());
    if (c) {
      Store.toast(`Added "${c.name}"`);
      if (cb) cb(c.name);
    }
  }
  function _randomColor() {
    const palette = ['#ff3b30','#ff9500','#ffcc00','#34c759','#30d158','#007aff','#5856d6','#af52de','#ff2d55','#5ac8fa','#a2845e'];
    return palette[Math.floor(Math.random() * palette.length)];
  }

  // ── Manage Classes modal ─────────────────────────────
  let _onCloseCb = null;

  function open(onClose) {
    _onCloseCb = onClose || null;
    const ov = document.getElementById('classesOverlay');
    if (!ov) {
      console.warn('classesOverlay not in DOM');
      return;
    }
    ov.classList.add('open');
    render();
    setTimeout(() => {
      const inp = document.getElementById('newClassName');
      if (inp) inp.focus();
    }, 80);
  }
  function close() {
    const ov = document.getElementById('classesOverlay');
    if (ov) ov.classList.remove('open');
    refreshAllSelects();
    if (_onCloseCb) { _onCloseCb(); _onCloseCb = null; }
  }
  function overlayClick(e) {
    if (e.target.id === 'classesOverlay') close();
  }

  function render() {
    const body = document.getElementById('classesList');
    if (!body) return;
    const list = Store.getClasses();
    if (!list.length) {
      body.innerHTML = `<div class="empty-mini">No classes yet. Add one below.</div>`;
      return;
    }
    body.innerHTML = list.map(c => {
      const count = Store.countClassAssignments(c.name);
      return `
        <div class="cls-row" data-id="${c.id}" draggable="true">
          <div class="cls-drag-handle" title="Drag to reorder">⋮⋮</div>
          <input type="color" class="cls-color" value="${c.color}" data-id="${c.id}" />
          <input type="text" class="cls-name" value="${Store.esc(c.name)}" data-id="${c.id}" />
          <span class="cls-count" title="Assignments">${count}</span>
          <button class="cls-del btn-icon" data-id="${c.id}" title="Delete">
            <svg viewBox="0 0 14 14" fill="none" width="12" height="12"><path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
          </button>
        </div>`;
    }).join('');

    // Wire handlers
    body.querySelectorAll('.cls-color').forEach(el => {
      el.addEventListener('input', e => {
        Store.updateClass(e.target.dataset.id, { color: e.target.value });
      });
    });
    body.querySelectorAll('.cls-name').forEach(el => {
      el.addEventListener('blur', e => {
        const v = e.target.value.trim();
        if (!v) {
          const c = Store.getClasses().find(x => x.id === e.target.dataset.id);
          e.target.value = c ? c.name : '';
          return;
        }
        Store.updateClass(e.target.dataset.id, { name: v });
        const count = el.closest('.cls-row').querySelector('.cls-count');
        if (count) count.textContent = Store.countClassAssignments(v);
      });
      el.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); }
      });
    });
    body.querySelectorAll('.cls-del').forEach(btn => {
      btn.addEventListener('click', e => _askDelete(btn.dataset.id));
    });

    // Drag-to-reorder
    let draggedId = null;
    body.querySelectorAll('.cls-row').forEach(row => {
      row.addEventListener('dragstart', e => {
        draggedId = row.dataset.id;
        row.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
      });
      row.addEventListener('dragend', () => {
        row.classList.remove('dragging');
        const orderedIds = [...body.querySelectorAll('.cls-row')].map(r => r.dataset.id);
        Store.reorderClasses(orderedIds);
      });
      row.addEventListener('dragover', e => {
        e.preventDefault();
        const dragging = body.querySelector('.cls-row.dragging');
        if (!dragging || dragging === row) return;
        const rect = row.getBoundingClientRect();
        const midY = rect.top + rect.height / 2;
        if (e.clientY < midY) row.parentNode.insertBefore(dragging, row);
        else row.parentNode.insertBefore(dragging, row.nextSibling);
      });
    });
  }

  function addFromForm() {
    const inp = document.getElementById('newClassName');
    if (!inp) return;
    const name = inp.value.trim();
    if (!name) return;
    const c = Store.addClass(name, _randomColor());
    if (c) {
      inp.value = '';
      render();
      Store.toast(`Added "${c.name}"`);
      setTimeout(() => inp.focus(), 50);
    }
  }

  // ── Delete flow with reassignment prompt ──────────────
  function _askDelete(id) {
    const c = Store.getClasses().find(x => x.id === id);
    if (!c) return;
    const count = Store.countClassAssignments(c.name);
    if (count === 0) {
      if (confirm(`Delete class "${c.name}"? It has no assignments.`)) {
        Store.removeClass(id);
        render();
        if (typeof App !== 'undefined' && App.refresh) App.refresh();
        Store.toast(`Deleted "${c.name}"`);
      }
      return;
    }
    _showReassignModal(c, count);
  }

  function _showReassignModal(cls, count) {
    const ov = document.getElementById('reassignOverlay');
    if (!ov) return;
    document.getElementById('reassignClassName').textContent = cls.name;
    document.getElementById('reassignCount').textContent = count;

    const sel = document.getElementById('reassignTarget');
    const others = Store.getClasses().filter(x => x.id !== cls.id);
    sel.innerHTML = `<option value="">Unassign (clear class field)</option>` +
      others.map(c => `<option value="${Store.esc(c.name)}">${Store.esc(c.name)}</option>`).join('');

    const confirmBtn = document.getElementById('reassignConfirm');
    const cancelBtn = document.getElementById('reassignCancel');
    const closeFn = () => ov.classList.remove('open');

    // Rebind (idempotent)
    confirmBtn.onclick = () => {
      const target = sel.value || '';
      Store.removeClass(cls.id, target);
      closeFn();
      render();
      if (typeof App !== 'undefined' && App.refresh) App.refresh();
      Store.toast(`Deleted "${cls.name}"${target ? `, reassigned ${count} to "${target}"` : `, unassigned ${count}`}`);
    };
    cancelBtn.onclick = closeFn;
    ov.onclick = e => { if (e.target.id === 'reassignOverlay') closeFn(); };

    ov.classList.add('open');
  }

  return { open, close, overlayClick, render, addFromForm, populateSelect, refreshAllSelects };
})();
