// ══════════════════════════════════════════════════════════
// SCHEDULE — visual time blocks with task linking,
//            edit/move, cross-off, 15-min granularity
// ══════════════════════════════════════════════════════════
const Sched = (() => {
  const SLOT_H  = 28;   // px per 15-min slot
  const SLOT_MIN= 15;

  const BLOCK_TYPES = [
    {id:'class', label:'Class', css:'sb-class'},
    {id:'study', label:'Study', css:'sb-study'},
    {id:'ec',    label:'EC',    css:'sb-ec'},
    {id:'free',  label:'Free',  css:'sb-free'},
    {id:'meal',  label:'Meal',  css:'sb-meal'},
    {id:'sleep', label:'Sleep', css:'sb-sleep'},
    {id:'work',  label:'Work',  css:'sb-work'},
    {id:'other', label:'Other', css:'sb-other'},
  ];

  // 5:00 AM to 2:00 AM = hours 5..23, 0, 1
  const HOURS = [...Array.from({length:19},(_,i)=>i+5), 0, 1]; // 5-23, 0, 1
  const TOTAL_SLOTS = HOURS.length * 4; // 80 slots

  function hqToMins(h,q) { return h*60 + q*15; }
  function minsToHQ(mins) { return { h: Math.floor(mins/60)%24, q: Math.floor((mins%60)/15) }; }

  function fmtHQ(h,q) {
    const mm = ['00','15','30','45'][q];
    if (h===0)  return `12:${mm} AM`;
    if (h===12) return `12:${mm} PM`;
    return h<12 ? `${h}:${mm} AM` : `${h-12}:${mm} PM`;
  }

  function timeStrToMins(t) {
    if (!t) return null;
    const [h,m] = t.split(':').map(Number);
    return h*60+m;
  }
  function minsToTimeStr(m) {
    return `${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;
  }

  function slotTopPx(h, q) {
    // Find index of h in HOURS
    let idx = HOURS.indexOf(h);
    if (idx < 0) idx = 0;
    return (idx * 4 + q) * SLOT_H;
  }

  function blockHeightPx(startMins, endMins) {
    const diff = endMins - startMins;
    if (diff <= 0) return SLOT_H;
    return Math.max(SLOT_H, Math.round(diff / SLOT_MIN) * SLOT_H);
  }

  // ── Offsets ────────────────────────────────────────────
  let offset     = 0;
  let fullOffset = 0;

  function dateForOffset(off) {
    const d = new Date(Store.today());
    d.setDate(d.getDate() + off);
    return d;
  }
  function dayLabel(d) {
    const n = Store.daysUntil(Store.toStr(d));
    if (n===0)  return `Today · ${d.toLocaleDateString('en-US',{weekday:'long'})}`;
    if (n===1)  return `Tomorrow · ${d.toLocaleDateString('en-US',{weekday:'long'})}`;
    if (n===-1) return `Yesterday · ${d.toLocaleDateString('en-US',{weekday:'long'})}`;
    return d.toLocaleDateString('en-US',{weekday:'long',month:'short',day:'numeric'});
  }

  function shift(dir) { offset += dir; render('schedGrid','schedLabel',offset); }
  function shiftFull(dir) { fullOffset += dir; render('schedFullGrid','schedFullSub',fullOffset); }
  function getOffset() { return offset; }
  function getFullOffset() { return fullOffset; }

  // ── Main render ───────────────────────────────────────
  function render(gridId, labelId, off) {
    const d   = dateForOffset(off);
    const dk  = Store.toStr(d);
    const blocks = Store.schedule[dk] || [];

    if (labelId) {
      const el = document.getElementById(labelId);
      if (el) el.textContent = dayLabel(d);
    }

    const wrap = document.getElementById(gridId);
    if (!wrap) return;
    wrap.innerHTML = '';

    const totalH = TOTAL_SLOTS * SLOT_H;

    // Axis column
    const axis = document.createElement('div');
    axis.className = 'sched-axis';
    axis.style.height = totalH + 'px';

    // Labels every hour (q=0)
    HOURS.forEach((h,i) => {
      const label = document.createElement('div');
      label.className = 'sched-axis-label';
      label.style.top = (i*4*SLOT_H) + 'px';
      label.style.transform = 'translateY(-50%)';
      if (i===0) label.style.transform = 'translateY(0)';
      label.textContent = fmtHQ(h,0);
      axis.appendChild(label);
    });
    wrap.appendChild(axis);

    // Slots container
    const slots = document.createElement('div');
    slots.className = 'sched-slots';
    slots.style.height = totalH + 'px';

    HOURS.forEach((h,hi) => {
      for (let q=0;q<4;q++) {
        const slot = document.createElement('div');
        slot.className = 'sched-slot' + (q===0 ? ' hour-top' : '');
        slot.style.top    = ((hi*4+q)*SLOT_H) + 'px';
        slot.style.height = SLOT_H + 'px';
        slot.style.position = 'absolute';
        slot.style.left = '0'; slot.style.right = '0';
        slot.addEventListener('click', () => BlockModal.open(dk, h, q));
        slots.appendChild(slot);
      }
    });

    // Render blocks
    blocks.forEach((b, bi) => {
      const startMins = timeStrToMins(b.start);
      const endMins   = timeStrToMins(b.end);
      if (startMins === null) return;

      // Find top position
      const { h: sh, q: sq } = minsToHQ(startMins);
      const top = slotTopPx(sh, sq);
      const height = blockHeightPx(startMins, endMins ?? startMins + 60);

      // Linked task
      const linkedTask = b.taskId ? Store.tasks.find(t=>t.id===b.taskId) : null;

      const block = document.createElement('div');
      block.className = `sched-block ${b.css||'sb-other'}${b.done?' sched-block-done':''}`;
      block.style.top    = top + 'px';
      block.style.height = height + 'px';

      const timeLabel = b.start && b.end ? `${b.start}–${b.end}` : b.start || '';

      block.innerHTML = `
        <div class="sched-block-check${b.done?' done':''}" onclick="event.stopPropagation();Sched.toggleDone('${dk}',${bi})"></div>
        <div class="sched-block-label">${Store.esc(b.label)}</div>
        ${timeLabel ? `<div class="sched-block-time">${timeLabel}</div>` : ''}
        ${linkedTask ? `<div class="sched-block-task">→ ${Store.esc(linkedTask.name)}</div>` : ''}
      `;

      block.addEventListener('click', () => EditBlockModal.open(dk, bi));
      slots.appendChild(block);
    });

    wrap.appendChild(slots);
    wrap.style.position = 'relative';
  }

  function toggleDone(dk, bi) {
    const blocks = Store.schedule[dk];
    if (!blocks || !blocks[bi]) return;
    blocks[bi].done = !blocks[bi].done;
    Store.persist();
    renderBoth();
  }

  function renderBoth() {
    render('schedGrid', 'schedLabel', offset);
    if (document.getElementById('view-schedule').classList.contains('active')) {
      render('schedFullGrid', 'schedFullSub', fullOffset);
    }
  }

  function addBlock(dk, block) {
    if (!Store.schedule[dk]) Store.schedule[dk] = [];
    Store.schedule[dk].push(block);
    Store.persist();
    renderBoth();
  }

  function updateBlock(dk, bi, block) {
    if (!Store.schedule[dk]) return;
    Store.schedule[dk][bi] = block;
    Store.persist();
    renderBoth();
  }

  function removeBlock(dk, bi) {
    if (!Store.schedule[dk]) return;
    Store.schedule[dk].splice(bi, 1);
    Store.persist();
    renderBoth();
  }

  function moveBlock(fromDk, bi, toDk) {
    const block = Store.schedule[fromDk]?.[bi];
    if (!block) return;
    Store.schedule[fromDk].splice(bi, 1);
    if (!Store.schedule[toDk]) Store.schedule[toDk] = [];
    Store.schedule[toDk].push(block);
    Store.persist();
    renderBoth();
  }

  function getBlockTypes() { return BLOCK_TYPES; }
  function fmtTime(h,q)   { return fmtHQ(h,q); }

  return {
    shift, shiftFull, getOffset, getFullOffset,
    render, renderBoth,
    addBlock, updateBlock, removeBlock, moveBlock,
    toggleDone, getBlockTypes, fmtTime, minsToTimeStr,
  };
})();


// ══════════════════════════════════════════════════════════
// BLOCK MODAL — add new block
// ══════════════════════════════════════════════════════════
const BlockModal = (() => {
  let dk = null, h = 0, q = 0;
  let activeType = 'study';

  function open(dayKey, hour, quarter) {
    dk = dayKey; h = hour; q = quarter;

    const d = new Date(dk+'T00:00:00');
    document.getElementById('blockModalTitle').textContent =
      `Add block · ${d.toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'})}`;

    document.getElementById('bLabel').value = '';

    // Default times from clicked slot
    const startMins = hour*60 + quarter*15;
    const endMins   = startMins + 60;
    document.getElementById('bStart').value =
      `${String(Math.floor(startMins/60)).padStart(2,'0')}:${String(startMins%60).padStart(2,'0')}`;
    document.getElementById('bEnd').value =
      `${String(Math.floor(endMins/60)%24).padStart(2,'0')}:${String(endMins%60).padStart(2,'0')}`;

    renderTypeGrid('btypeGrid', activeType, t => { activeType=t; renderTypeGrid('btypeGrid',t,arguments.callee); });
    populateTaskSelect('bTaskLink', null);

    document.getElementById('blockBackdrop').classList.add('open');
    setTimeout(()=>document.getElementById('bLabel').focus(), 40);
  }

  function close() { document.getElementById('blockBackdrop').classList.remove('open'); }
  function bdClick(e) { if (e.target.id==='blockBackdrop') close(); }

  function save() {
    const label  = document.getElementById('bLabel').value.trim() || activeType;
    const start  = document.getElementById('bStart').value;
    const end    = document.getElementById('bEnd').value;
    const taskId = document.getElementById('bTaskLink').value || null;
    const css    = Sched.getBlockTypes().find(t=>t.id===activeType)?.css || 'sb-other';

    Sched.addBlock(dk, { label, type:activeType, css, start, end, taskId, done:false });
    close();
  }

  return { open, close, bdClick, save };
})();


// ══════════════════════════════════════════════════════════
// EDIT BLOCK MODAL — edit / move / delete existing block
// ══════════════════════════════════════════════════════════
const EditBlockModal = (() => {
  let currentDk = null, currentBi = null;
  let activeType = 'study';

  function open(dk, bi) {
    currentDk = dk; currentBi = bi;
    const block = Store.schedule[dk]?.[bi];
    if (!block) return;

    activeType = block.type || 'study';

    document.getElementById('ebLabel').value  = block.label || '';
    document.getElementById('ebStart').value  = block.start || '';
    document.getElementById('ebEnd').value    = block.end   || '';
    document.getElementById('ebDate').value   = dk;

    renderTypeGrid('ebTypeGrid', activeType, t => { activeType=t; renderTypeGrid('ebTypeGrid',t,arguments.callee); });
    populateTaskSelect('ebTaskLink', block.taskId || null);

    document.getElementById('editBlockBackdrop').classList.add('open');
    setTimeout(()=>document.getElementById('ebLabel').focus(), 40);
  }

  function close() { document.getElementById('editBlockBackdrop').classList.remove('open'); }
  function bdClick(e) { if (e.target.id==='editBlockBackdrop') close(); }

  function save() {
    const label  = document.getElementById('ebLabel').value.trim();
    const start  = document.getElementById('ebStart').value;
    const end    = document.getElementById('ebEnd').value;
    const newDk  = document.getElementById('ebDate').value;
    const taskId = document.getElementById('ebTaskLink').value || null;
    const css    = Sched.getBlockTypes().find(t=>t.id===activeType)?.css || 'sb-other';

    const block = {
      ...Store.schedule[currentDk]?.[currentBi],
      label, type:activeType, css, start, end, taskId,
    };

    if (newDk !== currentDk) {
      // Moving to different day
      Sched.removeBlock(currentDk, currentBi);
      Sched.addBlock(newDk, block);
    } else {
      Sched.updateBlock(currentDk, currentBi, block);
    }
    close();
  }

  function del() {
    Sched.removeBlock(currentDk, currentBi);
    close();
  }

  return { open, close, bdClick, save, del };
})();


// ══════════════════════════════════════════════════════════
// SHARED HELPERS for block modals
// ══════════════════════════════════════════════════════════
function renderTypeGrid(gridId, activeId, onPick) {
  const grid = document.getElementById(gridId);
  if (!grid) return;
  grid.innerHTML = Sched.getBlockTypes().map(t =>
    `<button class="btype-btn ${t.css}${t.id===activeId?' sel':''}" onclick="(${onPick.toString()})('${t.id}')">${t.label}</button>`
  ).join('');
}

// Re-render with closure approach (simpler)
function renderTypeGridSimple(gridId, activeId, onPickFn) {
  const grid = document.getElementById(gridId);
  if (!grid) return;
  grid.innerHTML = Sched.getBlockTypes().map(t =>
    `<button class="btype-btn ${t.css}${t.id===activeId?' sel':''}" data-t="${t.id}">${t.label}</button>`
  ).join('');
  grid.querySelectorAll('.btype-btn').forEach(btn => {
    btn.addEventListener('click', () => onPickFn(btn.dataset.t));
  });
}

// Override block modals to use closure-based approach
(function() {
  // Block modal type state
  let bmType = 'study';
  BlockModal._setType = t => {
    bmType = t;
    renderTypeGridSimple('btypeGrid', t, BlockModal._setType);
  };
  const origBMOpen = BlockModal.open.bind(BlockModal);
  BlockModal.open = function(dk, h, q) {
    origBMOpen(dk, h, q);
    bmType = 'study';
    renderTypeGridSimple('btypeGrid', bmType, BlockModal._setType);
  };
  const origBMSave = BlockModal.save.bind(BlockModal);
  BlockModal.save = function() {
    const label  = document.getElementById('bLabel').value.trim() || bmType;
    const start  = document.getElementById('bStart').value;
    const end    = document.getElementById('bEnd').value;
    const taskId = document.getElementById('bTaskLink').value || null;
    const css    = Sched.getBlockTypes().find(t=>t.id===bmType)?.css || 'sb-other';
    const dk     = BlockModal._dk;
    Sched.addBlock(dk, { label, type:bmType, css, start, end, taskId, done:false });
    BlockModal.close();
  };

  // Store dk in BlockModal
  const _origOpen = BlockModal.open;
  BlockModal.open = function(dk, h, q) {
    BlockModal._dk = dk;
    document.getElementById('bLabel').value = '';
    const startMins = h*60 + q*15;
    const endMins   = startMins + 60;
    document.getElementById('bStart').value = `${String(Math.floor(startMins/60)).padStart(2,'0')}:${String(startMins%60).padStart(2,'0')}`;
    document.getElementById('bEnd').value   = `${String(Math.floor(endMins/60)%24).padStart(2,'0')}:${String(endMins%60).padStart(2,'0')}`;
    const d = new Date(dk+'T00:00:00');
    document.getElementById('blockModalTitle').textContent =
      `Add block · ${d.toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'})}`;
    bmType = 'study';
    renderTypeGridSimple('btypeGrid', bmType, BlockModal._setType);
    populateTaskSelect('bTaskLink', null);
    document.getElementById('blockBackdrop').classList.add('open');
    setTimeout(()=>document.getElementById('bLabel').focus(), 40);
  };

  // Edit modal type state
  let emType = 'study';
  EditBlockModal._setType = t => {
    emType = t;
    renderTypeGridSimple('ebTypeGrid', t, EditBlockModal._setType);
  };
  const origEMOpen = EditBlockModal.open.bind(EditBlockModal);
  EditBlockModal.open = function(dk, bi) {
    EditBlockModal._dk = dk;
    EditBlockModal._bi = bi;
    const block = Store.schedule[dk]?.[bi];
    if (!block) return;
    emType = block.type || 'study';
    document.getElementById('ebLabel').value = block.label || '';
    document.getElementById('ebStart').value = block.start || '';
    document.getElementById('ebEnd').value   = block.end   || '';
    document.getElementById('ebDate').value  = dk;
    renderTypeGridSimple('ebTypeGrid', emType, EditBlockModal._setType);
    populateTaskSelect('ebTaskLink', block.taskId || null);
    document.getElementById('editBlockBackdrop').classList.add('open');
    setTimeout(()=>document.getElementById('ebLabel').focus(), 40);
  };
  EditBlockModal.save = function() {
    const dk     = EditBlockModal._dk;
    const bi     = EditBlockModal._bi;
    const label  = document.getElementById('ebLabel').value.trim();
    const start  = document.getElementById('ebStart').value;
    const end    = document.getElementById('ebEnd').value;
    const newDk  = document.getElementById('ebDate').value;
    const taskId = document.getElementById('ebTaskLink').value || null;
    const css    = Sched.getBlockTypes().find(t=>t.id===emType)?.css || 'sb-other';
    const block  = { ...(Store.schedule[dk]?.[bi]||{}), label, type:emType, css, start, end, taskId };
    if (newDk !== dk) {
      Sched.removeBlock(dk, bi);
      Sched.addBlock(newDk, block);
    } else {
      Sched.updateBlock(dk, bi, block);
    }
    EditBlockModal.close();
  };
  EditBlockModal.del = function() {
    Sched.removeBlock(EditBlockModal._dk, EditBlockModal._bi);
    EditBlockModal.close();
  };
})();

function populateTaskSelect(selectId, selectedId) {
  const sel = document.getElementById(selectId);
  if (!sel) return;
  const active = Store.tasks.filter(t => t.status !== 'Done');
  sel.innerHTML = `<option value="">— None —</option>` +
    active.map(t => `<option value="${t.id}"${t.id===selectedId?' selected':''}>${Store.esc(t.name.slice(0,50))}</option>`).join('');
}
