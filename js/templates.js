// ═════════════════════════════════════════════════════════
// TEMPLATES — save/reuse block presets
// ═════════════════════════════════════════════════════════
const Templates = (() => {
  function open() {
    render();
    document.getElementById('templatesOverlay').classList.add('open');
  }
  function close() {
    document.getElementById('templatesOverlay').classList.remove('open');
  }
  function overlayClick(e) {
    if (e.target.id === 'templatesOverlay') close();
  }

  function render() {
    const el = document.getElementById('templatesList');
    if (!el) return;
    const list = Store.getTemplates();
    if (!list.length) {
      el.innerHTML = '<div class="empty">No templates yet. Save one from an Add Block modal.</div>';
      return;
    }
    el.innerHTML = list.map(t => `
      <div class="tpl-item" data-id="${t.id}">
        <div class="tpl-item-left">
          <div class="tpl-item-name">${Store.esc(t.name)}</div>
          <div class="tpl-item-sub">${Store.esc(t.label)} · ${t.type} · ${t.start}–${t.end}</div>
        </div>
        <button class="tpl-item-del" data-id="${t.id}" onclick="event.stopPropagation();Templates.remove('${t.id}')">✕</button>
      </div>
    `).join('');
    el.querySelectorAll('.tpl-item').forEach(row => {
      row.addEventListener('click', () => insert(row.dataset.id));
    });
  }

  function insert(id) {
    const tpl = Store.getTemplates().find(t => t.id === id);
    if (!tpl) return;
    // Insert at today's date using stored start/end
    const dk = Store.todayStr();
    const css = Sched.getBlockTypes().find(t => t.id === tpl.type)?.css || 'sb-other';
    Sched.addBlock(dk, {
      label: tpl.label,
      type: tpl.type,
      css,
      start: tpl.start,
      end: tpl.end,
      due: null,
      taskId: null,
      storedTz: Sched.getLocalTz(),
      recur: null,
      recurUntil: null,
      done: false,
    });
    Store.toast(`Inserted "${tpl.name}"`);
    close();
  }

  function remove(id) {
    Store.removeTemplate(id);
    render();
  }

  function saveCurrentBlock() {
    // Called from inside Add Block modal — reads its current state
    const label = document.getElementById('bLabel').value.trim();
    const start = document.getElementById('bStart').value;
    const end = document.getElementById('bEnd').value;
    const typeBtn = document.querySelector('#bTypeGrid .btype-btn.selected');
    const type = typeBtn ? typeBtn.dataset.t : 'study';
    if (!label || !start || !end) {
      Store.toast('Fill in label, start, end first');
      return;
    }
    const name = prompt('Template name:', label);
    if (!name) return;
    Store.addTemplate({ name, label, type, start, end });
    Store.toast(`Saved template "${name}"`);
  }

  return { open, close, overlayClick, insert, remove, saveCurrentBlock, render };
})();
