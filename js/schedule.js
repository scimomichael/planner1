// ═════════════════════════════════════════════════════════
// SCHEDULE — flex-based scroll, drag-to-create/move/resize,
//            recurring blocks, collision handling, due pills
// ═════════════════════════════════════════════════════════
const Sched = (() => {
  const SLOT_MIN = 15;

  const BLOCK_TYPES = [
    { id: 'class',   label: 'Class',   css: 'sb-class' },
    { id: 'meeting', label: 'Meeting', css: 'sb-meeting' },
    { id: 'study',   label: 'Study',   css: 'sb-study' },
    { id: 'ec',      label: 'EC',      css: 'sb-ec' },
    { id: 'free',    label: 'Free',    css: 'sb-free' },
    { id: 'meal',    label: 'Meal',    css: 'sb-meal' },
    { id: 'sleep',   label: 'Sleep',   css: 'sb-sleep' },
    { id: 'work',    label: 'Work',    css: 'sb-work' },
    { id: 'other',   label: 'Other',   css: 'sb-other' },
  ];

  function getHours() {
    const s = Settings.get ? Number(Settings.get('sStartHour', 5)) : 5;
    const arr = [];
    for (let h = s; h < 24; h++) arr.push(h);
    arr.push(0, 1);
    return arr;
  }
  function getSlotH() {
    return Settings.get ? Number(Settings.get('sSlotH', 28)) : 28;
  }

  let localTz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  function detectTz() {
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (tz && tz !== localTz) { localTz = tz; Store.toast('Timezone: ' + tz); renderBoth(); }
    } catch {}
  }
  setInterval(detectTz, 60000);

  function getOffsetMinutes(tz, date) {
    try {
      const u = new Date(date.toLocaleString('en-US', { timeZone: 'UTC' }));
      const t = new Date(date.toLocaleString('en-US', { timeZone: tz }));
      return (t - u) / 60000;
    } catch { return 0; }
  }
  function convertToLocalTz(timeStr, srcTz) {
    if (!timeStr || !srcTz || srcTz === localTz) return timeStr;
    try {
      const [h, m] = timeStr.split(':').map(Number);
      const ref = new Date(); ref.setHours(h, m, 0, 0);
      const diff = getOffsetMinutes(srcTz, ref) - getOffsetMinutes(localTz, ref);
      const total = h * 60 + m - diff;
      const nh = ((Math.floor(total / 60)) % 24 + 24) % 24;
      const nm = ((total % 60) + 60) % 60;
      return `${String(nh).padStart(2,'0')}:${String(nm).padStart(2,'0')}`;
    } catch { return timeStr; }
  }

  function fmt12(h, m) {
    const ap = h < 12 ? 'AM' : 'PM';
    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${h12}:${String(m).padStart(2,'0')} ${ap}`;
  }
  function fmtHQ(h, q) { return fmt12(h, q * 15); }
  function fmtStr(t) {
    if (!t) return '';
    const [h, m] = t.split(':').map(Number);
    return fmt12(h, m);
  }
  function toMins(t) {
    if (!t) return null;
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  }
  function fromMins(m) {
    m = ((m % 1440) + 1440) % 1440;
    return `${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;
  }

  let offset = 0, fullOffset = 0;
  // Track which grids have completed their initial auto-scroll-to-now so
  // subsequent renders (e.g. after saving a block edit) don't yank the user
  // back to the current time. Keyed by `gridId|dk` so switching days still
  // re-centers once on the new day.
  const _initDone = {};
  // When non-null, the next render of that grid should scroll this block
  // back into view instead of auto-centering. Consumed on use.
  let _scrollAnchor = null; // { gridId, dk, bi } | null
  // When non-null, this scrollTop value should be restored on the next
  // render of the given gridId. Consumed on use.
  const _preservedScroll = {}; // { gridId: number }
  function dateFor(off) { const d = new Date(Store.today()); d.setDate(d.getDate() + off); return d; }
  function dayLabel(d) {
    const n = Store.daysUntil(Store.toStr(d));
    const dow = d.toLocaleDateString('en-US', { weekday: 'long' });
    if (n === 0)  return `Today · ${dow}`;
    if (n === 1)  return `Tomorrow · ${dow}`;
    if (n === -1) return `Yesterday · ${dow}`;
    return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
  }

  function shift(dir) { offset += dir; render('schedGrid', 'schedLabel', offset); }
  function shiftFull(dir) { fullOffset += dir; render('schedFullGrid', 'schedFullLabel', fullOffset); }
  function today() { offset = 0; render('schedGrid', 'schedLabel', 0); }
  function todayFull() { fullOffset = 0; render('schedFullGrid', 'schedFullLabel', 0); }
  function getOffset() { return offset; }
  function getFullOffset() { return fullOffset; }

  // Compute collision groups: blocks that overlap get assigned columns
  function assignColumns(blocks) {
    // Each block gets {col, totalCols}
    const items = blocks.map((b, idx) => {
      const s = b._dispStart ?? b.start;
      const e = b._dispEnd ?? b.end;
      return { idx, startMin: toMins(s), endMin: toMins(e) ?? (toMins(s) + 60) };
    }).filter(it => it.startMin !== null).sort((a, b) => a.startMin - b.startMin);

    const result = blocks.map(() => ({ col: 0, totalCols: 1 }));
    // Group overlapping blocks
    const groups = [];
    items.forEach(it => {
      let placed = false;
      for (const g of groups) {
        // Group overlaps if any block in group overlaps it
        const last = g[g.length - 1];
        if (g.some(x => x.endMin > it.startMin && x.startMin < it.endMin)) {
          g.push(it); placed = true; break;
        }
      }
      if (!placed) groups.push([it]);
    });
    groups.forEach(g => {
      // Within a group, assign columns greedily
      const cols = []; // each col: last endMin
      g.forEach(it => {
        let myCol = -1;
        for (let c = 0; c < cols.length; c++) {
          if (cols[c] <= it.startMin) { myCol = c; cols[c] = it.endMin; break; }
        }
        if (myCol < 0) { myCol = cols.length; cols.push(it.endMin); }
        result[it.idx].col = myCol;
      });
      const tc = cols.length;
      g.forEach(it => { result[it.idx].totalCols = tc; });
    });
    return result;
  }

  function render(gridId, labelId, off) {
    const d = dateFor(off);
    const dk = Store.toStr(d);
    const isToday = (off === 0 && gridId === 'schedGrid');

    if (labelId) {
      const el = document.getElementById(labelId);
      if (el) el.textContent = dayLabel(d);
    }
    const box = document.getElementById(gridId);
    if (!box) return;

    const HOURS = getHours();
    const SLOT_H = getSlotH();
    const TOTAL_SLOTS = HOURS.length * 4;
    const totalH = TOTAL_SLOTS * SLOT_H;

    // Expand blocks with recurring + base-day
    const rawBlocks = Store.schedule[dk] || [];
    // Include recurring blocks from other days that match this date
    const allBlocks = [...rawBlocks];
    Object.entries(Store.schedule).forEach(([src, list]) => {
      if (src === dk) return;
      list.forEach(b => {
        if (!b.recur || b.recur === 'none') return;
        if (_recursOn(b, src, dk)) {
          allBlocks.push({ ...b, _recurFrom: src, _recurBaseIdx: list.indexOf(b) });
        }
      });
    });

    box.innerHTML = '';

    // One scroller contains a two-column grid: axis | canvas.
    // Both scroll together because they live in the same scrolling element.
    const scroller = document.createElement('div');
    scroller.className = 'sched-scroll';

    const inner = document.createElement('div');
    inner.className = 'sched-inner';
    inner.style.height = totalH + 'px';

    // AXIS column (scrolls with canvas)
    const axis = document.createElement('div');
    axis.className = 'sched-axis';
    HOURS.forEach((h, i) => {
      const lbl = document.createElement('div');
      lbl.className = 'sched-axis-lbl' + (i === 0 ? ' first' : '');
      lbl.style.top = (i * 4 * SLOT_H) + 'px';
      lbl.textContent = fmtHQ(h, 0);
      axis.appendChild(lbl);
    });

    // CANVAS column
    const canvas = document.createElement('div');
    canvas.className = 'sched-canvas';

    // Gridlines
    HOURS.forEach((_, i) => {
      for (let q = 0; q < 4; q++) {
        const line = document.createElement('div');
        line.className = 'sched-hline' + (q === 0 ? ' major' : '');
        line.style.top = ((i * 4 + q) * SLOT_H) + 'px';
        canvas.appendChild(line);
      }
    });

    // Drag-to-create: mousedown on canvas background starts a ghost
    _wireCanvasDrag(canvas, dk, HOURS, SLOT_H, totalH);

    // Now line
    if (isToday && Settings.get('sNowLine', true)) {
      const now = new Date();
      const nowM = now.getHours() * 60 + now.getMinutes();
      const startM = HOURS[0] * 60;
      let adjM = nowM;
      if (HOURS.includes(0) && nowM < 120) adjM = nowM + 24 * 60;
      const endM = startM + TOTAL_SLOTS * SLOT_MIN;
      if (adjM >= startM && adjM <= endM) {
        const topPx = ((adjM - startM) / (TOTAL_SLOTS * SLOT_MIN)) * totalH;
        const line = document.createElement('div');
        line.className = 'now-line';
        line.style.top = topPx + 'px';
        canvas.appendChild(line);
      }
    }

    // Normalize blocks with display times + assign columns for collision
    allBlocks.forEach(b => {
      b._dispStart = b.storedTz ? convertToLocalTz(b.start, b.storedTz) : b.start;
      b._dispEnd   = b.storedTz ? convertToLocalTz(b.end,   b.storedTz) : b.end;
    });
    const columnData = assignColumns(allBlocks);

    const showBlockDue = Settings.get('sBlockDue', true);
    allBlocks.forEach((b, bi) => {
      const sM = toMins(b._dispStart);
      if (sM === null) return;
      const eM = toMins(b._dispEnd) ?? sM + 60;
      const sh = Math.floor(sM / 60) % 24;
      const sq = Math.floor((sM % 60) / 15);
      const hourIdx = HOURS.indexOf(sh);
      if (hourIdx < 0) return;
      const top = (hourIdx * 4 + sq) * SLOT_H;
      const duration = Math.max(SLOT_MIN, eM - sM);
      const height = Math.max(SLOT_H, Math.round(duration / SLOT_MIN) * SLOT_H);

      const { col, totalCols } = columnData[bi];
      const widthPct = 100 / totalCols;
      const leftPct = col * widthPct;

      const isRecurInstance = !!b._recurFrom;
      const timeDisp = b._dispStart && b._dispEnd ? `${fmtStr(b._dispStart)}–${fmtStr(b._dispEnd)}` : fmtStr(b._dispStart);
      const tzNote = b.storedTz && b.storedTz !== localTz
        ? `<div class="sched-block-tz">${Store.esc(b.storedTz.split('/').pop().replace(/_/g,' '))}</div>` : '';
      let dueHtml = '';
      if (showBlockDue && b.due) {
        const n = Store.daysUntil(b.due);
        let cls = 'due-later', label = Store.fmtDate(b.due);
        if (n !== null) {
          if (n < 0) { cls = 'due-over'; label = Store.fmtDate(b.due) + ' (overdue)'; }
          else if (n === 0) { cls = 'due-today'; label = 'today'; }
          else if (n === 1) { cls = 'due-soon'; label = 'tomorrow'; }
          else if (n <= 7) { cls = 'due-soon'; label = `in ${n}d`; }
        }
        dueHtml = `<div class="sched-block-due ${cls}">Due ${label}</div>`;
      }
      const classPill = b.classLabel ? `<div class="sched-block-cls">${Store.clsPill(b.classLabel)}</div>` : '';
      const showDesc = !Settings.get || Settings.get('sBlockDesc', true);
      const descSnip = (b.description && showDesc)
        ? `<div class="sched-block-desc">${Store.esc(b.description.slice(0, 120))}${b.description.length > 120 ? '…' : ''}</div>`
        : '';
      const recurBadge = (b.recur && b.recur !== 'none') || isRecurInstance
        ? `<div class="sched-block-recur" title="Recurring">↻</div>` : '';
      const showPriority = !Settings.get || Settings.get('sBlockPriority', true);
      const priDot = (showPriority && b.priority)
        ? `<span class="sched-block-pri pri-${b.priority}" title="Priority: ${b.priority}"></span>` : '';
      const showLocation = !Settings.get || Settings.get('sBlockLocation', true);
      const locChip = (showLocation && b.location)
        ? `<div class="sched-block-loc" title="${Store.esc(b.location)}"><svg viewBox="0 0 10 12" fill="none"><path d="M5 1a3.5 3.5 0 013.5 3.5c0 2.6-3.5 6.5-3.5 6.5S1.5 7.1 1.5 4.5A3.5 3.5 0 015 1z" stroke="currentColor" stroke-width="1.1" fill="none"/><circle cx="5" cy="4.5" r="1.2" fill="currentColor"/></svg><span class="sched-block-loc-text">${Store.esc(b.location)}</span></div>` : '';
      const showLink = !Settings.get || Settings.get('sBlockLink', true);
      const linkChip = (showLink && b.link)
        ? `<a class="sched-block-link" href="${Store.esc(b.link)}" target="_blank" rel="noopener noreferrer" title="${Store.esc(b.link)}" onclick="event.stopPropagation()"><svg viewBox="0 0 12 12" fill="none"><path d="M5 3h2a3 3 0 010 6H6M7 9H5a3 3 0 010-6h1M4.5 6h3" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg></a>` : '';
      const statusBadge = (b.status && b.status !== 'scheduled')
        ? `<div class="sched-block-status status-${b.status}">${b.status.replace('-', ' ')}</div>` : '';

      const block = document.createElement('div');
      block.className = `sched-block ${b.css || 'sb-other'}${b.done ? ' sched-block-done' : ''}${b.status ? ' status-' + b.status : ''}`;
      block.style.top = top + 'px';
      block.style.height = height + 'px';
      block.style.left = `calc(${leftPct}% + 4px)`;
      block.style.width = `calc(${widthPct}% - 8px)`;
      block.dataset.dk = dk;
      block.dataset.bi = bi;
      // Blocks under ~60px tall can only fit the title + time row.
      // Everything else gets hidden to prevent overlap.
      if (height < 60) block.dataset.short = '1';

      // Build the inner HTML. Everything other than the name row + time
      // goes into .sched-block-extras which the CSS hides on short blocks.
      const extras = [
        classPill,
        statusBadge,
        tzNote,
        dueHtml,
        locChip,
        descSnip,
      ].filter(Boolean).join('');

      block.innerHTML = `
        <div class="sched-block-check${b.done ? ' done' : ''}" data-act="check"></div>
        ${recurBadge}
        <div class="sched-block-name">${priDot}<span class="sched-block-name-text">${Store.esc(b.label)}</span>${linkChip}</div>
        ${timeDisp ? `<div class="sched-block-time">${timeDisp}</div>` : ''}
        ${extras ? `<div class="sched-block-extras">${extras}</div>` : ''}
        <div class="sched-block-resize" data-act="resize"></div>
      `;

      _wireBlockInteraction(block, b, bi, allBlocks, dk, HOURS, SLOT_H, totalH);
      canvas.appendChild(block);
    });

    inner.appendChild(axis);
    inner.appendChild(canvas);
    scroller.appendChild(inner);
    box.appendChild(scroller);

    // Scroll behavior:
    //   1. If a specific scrollTop was preserved for this grid (e.g. the
    //      user just saved an edit), restore it — never yank the view.
    //   2. Else if an anchor block is set (we just saved an edit to that
    //      block), scroll that block back into view.
    //   3. Else if this is the first time we've rendered this grid for
    //      this date, center on "now" (today) or top (other days).
    //   4. Otherwise leave scroll where the user put it.
    //
    // CRITICAL: scrollTop is set SYNCHRONOUSLY here (not in rAF) so the user
    // never sees a flash-of-scroll-at-top before the restore kicks in.
    const initKey = `${gridId}|${dk}`;
    const preservedTop = _preservedScroll[gridId];
    const isTodayDate = (off === 0);

    let targetScroll = null;
    if (preservedTop !== undefined) {
      targetScroll = preservedTop;
      delete _preservedScroll[gridId];
    } else if (_scrollAnchor && _scrollAnchor.gridId === gridId && _scrollAnchor.dk === dk) {
      const anchorBi = _scrollAnchor.bi;
      const anchorEl = canvas.querySelector(`.sched-block[data-bi="${anchorBi}"]`);
      if (anchorEl) {
        const atop = parseFloat(anchorEl.style.top) || 0;
        const ah = parseFloat(anchorEl.style.height) || 0;
        targetScroll = atop - scroller.clientHeight / 2 + ah / 2;
      }
      _scrollAnchor = null;
    } else if (!_initDone[initKey]) {
      _initDone[initKey] = true;
      if (isTodayDate && Settings.get('sAutoScroll', true)) {
        const now = new Date();
        const nowM = now.getHours() * 60 + now.getMinutes();
        const startM = HOURS[0] * 60;
        let adjM = nowM;
        if (HOURS.includes(0) && nowM < 120) adjM = nowM + 24 * 60;
        const pct = Math.max(0, (adjM - startM) / (TOTAL_SLOTS * SLOT_MIN));
        targetScroll = pct * totalH - scroller.clientHeight / 2;
      }
    }
    if (targetScroll !== null) {
      const max = Math.max(0, totalH - scroller.clientHeight);
      scroller.scrollTop = Math.max(0, Math.min(targetScroll, max));
    }
  }

  // Check if a recurring block recurs on target date
  function _recursOn(block, srcDk, tgtDk) {
    if (!block.recur || block.recur === 'none') return false;
    const [sy, sm, sd] = srcDk.split('-').map(Number);
    const [ty, tm, td] = tgtDk.split('-').map(Number);
    const src = new Date(sy, sm-1, sd); src.setHours(0,0,0,0);
    const tgt = new Date(ty, tm-1, td); tgt.setHours(0,0,0,0);
    if (tgt <= src) return false;
    if (block.recurUntil) {
      const [uy, um, ud] = block.recurUntil.split('-').map(Number);
      const until = new Date(uy, um-1, ud); until.setHours(0,0,0,0);
      if (tgt > until) return false;
    }
    const diffDays = Math.round((tgt - src) / 86400000);
    const dow = tgt.getDay();
    if (block.recur === 'daily') return true;
    if (block.recur === 'weekdays') return dow >= 1 && dow <= 5;
    if (block.recur === 'weekly') return diffDays % 7 === 0;
    return false;
  }

  // ── Drag-to-create on empty canvas ─────────────────────
  function _wireCanvasDrag(canvas, dk, HOURS, SLOT_H, totalH) {
    let ghost = null, startY = 0, startSlot = 0, currentSlot = 0;
    canvas.addEventListener('mousedown', e => {
      // Only if clicking on canvas itself (not on a block)
      if (e.target !== canvas && !e.target.classList.contains('sched-hline')) return;
      if (e.button !== 0) return;
      const rect = canvas.getBoundingClientRect();
      const y = e.clientY - rect.top;
      startY = y;
      startSlot = Math.floor(y / SLOT_H);
      currentSlot = startSlot;
      ghost = document.createElement('div');
      ghost.className = 'sched-drag-ghost';
      ghost.style.top = (startSlot * SLOT_H) + 'px';
      ghost.style.height = SLOT_H + 'px';
      canvas.appendChild(ghost);
      e.preventDefault();

      const onMove = mv => {
        const y2 = mv.clientY - rect.top;
        currentSlot = Math.max(0, Math.min(HOURS.length * 4 - 1, Math.floor(y2 / SLOT_H)));
        const topSlot = Math.min(startSlot, currentSlot);
        const botSlot = Math.max(startSlot, currentSlot);
        ghost.style.top = (topSlot * SLOT_H) + 'px';
        ghost.style.height = ((botSlot - topSlot + 1) * SLOT_H) + 'px';
      };
      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        if (ghost) { ghost.remove(); ghost = null; }
        const topSlot = Math.min(startSlot, currentSlot);
        const botSlot = Math.max(startSlot, currentSlot);
        const startH = HOURS[Math.floor(topSlot / 4)];
        const startQ = topSlot % 4;
        const startMin = startH * 60 + startQ * 15;
        const endMin = startMin + (botSlot - topSlot + 1) * 15;
        if (botSlot === topSlot) {
          // It's a click, not drag — open modal with 1-hr default
          BlockModal.open(dk, HOURS[Math.floor(topSlot / 4)], topSlot % 4);
        } else {
          BlockModal.openWithRange(dk, fromMins(startMin), fromMins(endMin));
        }
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  }

  // ── Drag-to-move and drag-to-resize on a block ─────────
  function _wireBlockInteraction(block, b, bi, allBlocks, dk, HOURS, SLOT_H, totalH) {
    const chk = block.querySelector('.sched-block-check');
    chk.addEventListener('click', e => {
      e.stopPropagation();
      toggleDone(dk, b, bi);
    });

    const resize = block.querySelector('.sched-block-resize');

    block.addEventListener('mousedown', e => {
      if (e.target === chk) return;
      if (e.button !== 0) return;

      const isResize = e.target === resize;
      const startY = e.clientY;
      const origTop = parseFloat(block.style.top);
      const origHeight = parseFloat(block.style.height);
      let moved = false;

      const onMove = mv => {
        const dy = mv.clientY - startY;
        if (Math.abs(dy) > 3) moved = true;
        if (isResize) {
          // Snap height to SLOT_H increments
          const newH = Math.max(SLOT_H, Math.round((origHeight + dy) / SLOT_H) * SLOT_H);
          block.style.height = newH + 'px';
          block.classList.add('resizing');
        } else {
          const newTop = Math.max(0, Math.min(totalH - origHeight, origTop + dy));
          const snapped = Math.round(newTop / SLOT_H) * SLOT_H;
          block.style.top = snapped + 'px';
          block.classList.add('dragging');
        }
      };
      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        block.classList.remove('dragging', 'resizing');
        if (!moved) {
          // It's a click — open edit (if recur instance, edit the source)
          if (b._recurFrom !== undefined) {
            EditBlock.open(b._recurFrom, b._recurBaseIdx);
          } else {
            EditBlock.open(dk, bi);
          }
          return;
        }
        // Commit the move/resize
        if (isResize) {
          const newH = parseFloat(block.style.height);
          const slots = Math.round(newH / SLOT_H);
          const startMin = toMins(b._dispStart);
          const newEndMin = startMin + slots * 15;
          const newEnd = fromMins(newEndMin);
          _commitChange(b, dk, bi, { end: _reverseTz(newEnd, b.storedTz) });
        } else {
          const newTop = parseFloat(block.style.top);
          const slotOffset = Math.round(newTop / SLOT_H);
          const hourIdx = Math.floor(slotOffset / 4);
          const qIdx = slotOffset % 4;
          const newStartH = HOURS[hourIdx];
          const newStartMin = newStartH * 60 + qIdx * 15;
          const oldStartMin = toMins(b._dispStart);
          const oldEndMin = toMins(b._dispEnd) ?? oldStartMin + 60;
          const delta = newStartMin - oldStartMin;
          const newEndMin = oldEndMin + delta;
          _commitChange(b, dk, bi, {
            start: _reverseTz(fromMins(newStartMin), b.storedTz),
            end:   _reverseTz(fromMins(newEndMin), b.storedTz),
          });
        }
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
      e.preventDefault();
    });
  }

  function _reverseTz(localStr, srcTz) {
    // Convert local-displayed back to stored tz representation
    if (!srcTz || srcTz === localTz) return localStr;
    try {
      const [h, m] = localStr.split(':').map(Number);
      const ref = new Date(); ref.setHours(h, m, 0, 0);
      const diff = getOffsetMinutes(srcTz, ref) - getOffsetMinutes(localTz, ref);
      const total = h * 60 + m + diff;
      return fromMins(total);
    } catch { return localStr; }
  }

  function _commitChange(b, dk, bi, changes) {
    if (b._recurFrom !== undefined) {
      // Editing a recurring instance — update the SOURCE
      const src = Store.schedule[b._recurFrom];
      if (!src || !src[b._recurBaseIdx]) return;
      Store.snapshot();
      src[b._recurBaseIdx] = { ...src[b._recurBaseIdx], ...changes };
      Store.persist();
      _preserveScroll();
      renderBoth();
    } else {
      const list = Store.schedule[dk];
      if (!list || !list[bi]) return;
      Store.snapshot();
      list[bi] = { ...list[bi], ...changes };
      Store.persist();
      _preserveScroll();
      renderBoth();
    }
  }

  function toggleDone(dk, b, bi) {
    if (b._recurFrom !== undefined) {
      // For recurring instances, store "done" in an override map on the source
      const src = Store.schedule[b._recurFrom];
      if (!src || !src[b._recurBaseIdx]) return;
      const sb = src[b._recurBaseIdx];
      sb.doneOverrides = sb.doneOverrides || {};
      sb.doneOverrides[dk] = !sb.doneOverrides[dk];
      Store.persist();
      _preserveScroll();
      renderBoth();
    } else {
      const list = Store.schedule[dk];
      if (!list || !list[bi]) return;
      Store.snapshot();
      list[bi].done = !list[bi].done;
      Store.persist();
      _preserveScroll();
      renderBoth();
    }
  }

  function renderBoth() {
    render('schedGrid', 'schedLabel', offset);
    if (document.getElementById('view-schedule')?.classList.contains('active')) {
      render('schedFullGrid', 'schedFullLabel', fullOffset);
    }
  }

  // Snapshot each visible scroller's scrollTop so the next render can
  // restore it. Call this BEFORE mutating + renderBoth.
  function _preserveScroll() {
    ['schedGrid', 'schedFullGrid'].forEach(gid => {
      const box = document.getElementById(gid);
      const sc = box && box.querySelector('.sched-scroll');
      if (sc) _preservedScroll[gid] = sc.scrollTop;
    });
  }

  // Ask the next render to bring (dk, bi) back into view if possible.
  function _anchorToBlock(dk, bi) {
    _scrollAnchor = { gridId: 'schedGrid', dk, bi };
    // If the full-schedule view is currently showing, anchor that too.
    if (document.getElementById('view-schedule')?.classList.contains('active')) {
      _scrollAnchor = { gridId: 'schedFullGrid', dk, bi };
    }
  }

  function addBlock(dk, block) {
    Store.snapshot();
    if (!Store.schedule[dk]) Store.schedule[dk] = [];
    Store.schedule[dk].push(block);
    Store.persist();
    _preserveScroll();
    renderBoth();
  }

  function updateBlock(dk, bi, block) {
    if (!Store.schedule[dk]) return;
    Store.snapshot();
    Store.schedule[dk][bi] = block;
    Store.persist();
    _preserveScroll();
    _anchorToBlock(dk, bi);
    renderBoth();
  }

  function removeBlock(dk, bi) {
    if (!Store.schedule[dk]) return;
    Store.snapshot();
    Store.schedule[dk].splice(bi, 1);
    Store.persist();
    _preserveScroll();
    renderBoth();
  }

  // Return a combined list of raw blocks + any recurring-instance blocks
  // that should appear on the given date. Used by Week and Month views so
  // recurring blocks show up everywhere, not just on the source day.
  function blocksForDate(dk) {
    const raw = Store.schedule[dk] || [];
    const out = [...raw];
    Object.entries(Store.schedule).forEach(([src, list]) => {
      if (src === dk) return;
      (list || []).forEach(b => {
        if (!b.recur || b.recur === 'none') return;
        if (_recursOn(b, src, dk)) out.push({ ...b, _recurFrom: src });
      });
    });
    return out;
  }

  // Set the compact-today offset directly in one go (no busy loop).
  function setOffset(n) {
    offset = n | 0;
    render('schedGrid', 'schedLabel', offset);
  }

  return {
    shift, shiftFull, today, todayFull, getOffset, getFullOffset, setOffset,
    render, renderBoth,
    addBlock, updateBlock, removeBlock, toggleDone,
    blocksForDate,
    getBlockTypes: () => BLOCK_TYPES,
    getLocalTz: () => localTz,
    minsToTimeStr: fromMins,
    timeStrToMins: toMins,
    fmtTimeStr: fmtStr,
    _preserveScroll,
  };
})();


// ═════════════════════════════════════════════════════════
// BLOCK ADD MODAL
// ═════════════════════════════════════════════════════════
const BlockModal = (() => {
  let _dk = null, _type = 'study';

  function setType(t) { _type = t; renderTypeGrid('bTypeGrid', t, setType); }

  function open(dk, h, q) {
    _openCore(dk, Sched.minsToTimeStr(h * 60 + q * 15), Sched.minsToTimeStr((h * 60 + q * 15 + 60) % (24 * 60)));
  }

  function openWithRange(dk, startTime, endTime) {
    _openCore(dk, startTime, endTime);
  }

  function _openCore(dk, startTime, endTime) {
    _dk = dk;
    _type = 'study';
    const d = new Date(dk + 'T00:00:00');
    document.getElementById('blockModalTitle').textContent =
      `Add Block · ${d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}`;
    document.getElementById('bLabel').value = '';
    document.getElementById('bStart').value = startTime;
    document.getElementById('bEnd').value = endTime;
    document.getElementById('bDue').value = '';
    document.getElementById('bDescription').value = '';
    document.getElementById('bRecur').value = 'none';
    document.getElementById('bRecurUntil').value = '';
    document.getElementById('bRecurEndGroup').style.display = 'none';
    const pri = document.getElementById('bPriority'); if (pri) pri.value = '';
    const rem = document.getElementById('bReminder'); if (rem) rem.value = '';
    const loc = document.getElementById('bLocation'); if (loc) loc.value = '';
    const lnk = document.getElementById('bLink'); if (lnk) lnk.value = '';
    renderTypeGrid('bTypeGrid', _type, setType);
    if (typeof Classes !== 'undefined') Classes.populateSelect('bClass', '');
    buildTzSelect('bTz');
    document.getElementById('blockOverlay').classList.add('open');
    setTimeout(() => document.getElementById('bLabel').focus(), 50);

    document.getElementById('bRecur').onchange = e => {
      const g = document.getElementById('bRecurEndGroup');
      g.style.display = e.target.value === 'none' ? 'none' : '';
    };
  }

  function close() { document.getElementById('blockOverlay').classList.remove('open'); }
  function overlayClick(e) { if (e.target.id === 'blockOverlay') close(); }

  function save() {
    const label     = document.getElementById('bLabel').value.trim() || _type;
    const start     = document.getElementById('bStart').value;
    const end       = document.getElementById('bEnd').value;
    if (!start) { document.getElementById('bStart').focus(); return; }
    const due         = document.getElementById('bDue').value || null;
    const classLabel  = document.getElementById('bClass').value || '';
    const description = document.getElementById('bDescription').value.trim();
    const storedTz    = document.getElementById('bTz')?.value || Sched.getLocalTz();
    const recur       = document.getElementById('bRecur').value;
    const recurUntil  = recur !== 'none' ? (document.getElementById('bRecurUntil').value || null) : null;
    const priority    = document.getElementById('bPriority')?.value || '';
    const reminder    = document.getElementById('bReminder')?.value ? Number(document.getElementById('bReminder').value) : null;
    const location    = document.getElementById('bLocation')?.value.trim() || '';
    const link        = document.getElementById('bLink')?.value.trim() || '';
    const css = Sched.getBlockTypes().find(t => t.id === _type)?.css || 'sb-other';

    // Conflict detection
    if (!Settings.get || Settings.get('sConflictWarn', true)) {
      const conflicts = _findConflicts(_dk, start, end);
      if (conflicts.length) {
        const labels = conflicts.map(c => `"${c.label}" (${c.start}–${c.end})`).join(', ');
        if (!confirm(`This overlaps: ${labels}\n\nAdd anyway?`)) return;
      }
    }

    Sched.addBlock(_dk, {
      label, type: _type, css, start, end,
      due, classLabel, description, storedTz,
      recur: recur === 'none' ? null : recur,
      recurUntil,
      priority, reminder, location, link,
      status: 'scheduled',
      done: false
    });
    close();
  }

  function _findConflicts(dk, start, end) {
    const list = Store.schedule[dk] || [];
    const toMin = t => { const [h,m] = t.split(':').map(Number); return h*60+m; };
    const sMin = toMin(start);
    let eMin = toMin(end || start);
    if (eMin <= sMin) eMin += 24*60;
    return list.filter(b => {
      if (!b.start || !b.end) return false;
      const bsMin = toMin(b.start);
      let beMin = toMin(b.end);
      if (beMin <= bsMin) beMin += 24*60;
      return sMin < beMin && eMin > bsMin;
    });
  }

  return { open, openWithRange, close, overlayClick, save };
})();


// ═════════════════════════════════════════════════════════
// EDIT BLOCK MODAL
// ═════════════════════════════════════════════════════════
const EditBlock = (() => {
  let _dk = null, _bi = null, _type = 'study';

  function setType(t) { _type = t; renderTypeGrid('ebTypeGrid', t, setType); }

  function open(dk, bi) {
    _dk = dk; _bi = bi;
    const block = Store.schedule[dk]?.[bi];
    if (!block) return;
    _type = block.type || 'study';
    document.getElementById('ebLabel').value = block.label || '';
    document.getElementById('ebStart').value = block.start || '';
    document.getElementById('ebEnd').value = block.end || '';
    document.getElementById('ebDate').value = dk;
    document.getElementById('ebDue').value = block.due || '';
    document.getElementById('ebDescription').value = block.description || '';
    const rec = document.getElementById('ebRecur'); if (rec) rec.value = block.recur || 'none';
    const pri = document.getElementById('ebPriority'); if (pri) pri.value = block.priority || '';
    const st  = document.getElementById('ebStatus');   if (st)  st.value  = block.status || 'scheduled';
    const rem = document.getElementById('ebReminder'); if (rem) rem.value = block.reminder != null ? String(block.reminder) : '';
    const loc = document.getElementById('ebLocation'); if (loc) loc.value = block.location || '';
    const lnk = document.getElementById('ebLink');     if (lnk) lnk.value = block.link || '';
    renderTypeGrid('ebTypeGrid', _type, setType);
    if (typeof Classes !== 'undefined') Classes.populateSelect('ebClass', block.classLabel || '');
    buildTzSelect('ebTz');
    const tzSel = document.getElementById('ebTz');
    if (tzSel) tzSel.value = block.storedTz || Sched.getLocalTz();
    document.getElementById('editBlockOverlay').classList.add('open');
    setTimeout(() => document.getElementById('ebLabel').focus(), 50);
  }

  function close() { document.getElementById('editBlockOverlay').classList.remove('open'); }
  function overlayClick(e) { if (e.target.id === 'editBlockOverlay') close(); }

  function save() {
    const label       = document.getElementById('ebLabel').value.trim();
    const start       = document.getElementById('ebStart').value;
    const end         = document.getElementById('ebEnd').value;
    const newDk       = document.getElementById('ebDate').value;
    const due         = document.getElementById('ebDue').value || null;
    const classLabel  = document.getElementById('ebClass').value || '';
    const description = document.getElementById('ebDescription').value.trim();
    const storedTz    = document.getElementById('ebTz')?.value || Sched.getLocalTz();
    const recurVal    = document.getElementById('ebRecur')?.value || 'none';
    const priority    = document.getElementById('ebPriority')?.value || '';
    const status      = document.getElementById('ebStatus')?.value || 'scheduled';
    const reminder    = document.getElementById('ebReminder')?.value ? Number(document.getElementById('ebReminder').value) : null;
    const location    = document.getElementById('ebLocation')?.value.trim() || '';
    const link        = document.getElementById('ebLink')?.value.trim() || '';
    const css = Sched.getBlockTypes().find(t => t.id === _type)?.css || 'sb-other';
    const orig = Store.schedule[_dk]?.[_bi] || {};
    const block = {
      ...orig, label, type: _type, css, start, end, due, classLabel, description, storedTz,
      recur: recurVal === 'none' ? null : recurVal,
      priority, status, reminder, location, link,
    };
    if (newDk !== _dk) {
      Sched.removeBlock(_dk, _bi);
      Sched.addBlock(newDk, block);
    } else {
      Sched.updateBlock(_dk, _bi, block);
    }
    close();
  }

  function del() { Sched.removeBlock(_dk, _bi); close(); }

  return { open, close, overlayClick, save, del };
})();


// ═════════════════════════════════════════════════════════
// SHARED HELPERS
// ═════════════════════════════════════════════════════════
function renderTypeGrid(gridId, activeId, onPick) {
  const grid = document.getElementById(gridId);
  if (!grid) return;
  grid.innerHTML = Sched.getBlockTypes().map(t =>
    `<button class="btype-btn${t.id === activeId ? ' selected' : ''}" data-t="${t.id}">${t.label}</button>`
  ).join('');
  grid.querySelectorAll('.btype-btn').forEach(btn => {
    btn.addEventListener('click', () => onPick(btn.dataset.t));
  });
}

function populateTaskSelect(selectId, selectedId) {
  // Legacy no-op — tasks removed. Kept as stub for defense in depth.
}

function buildTzSelect(selectId) {
  const sel = document.getElementById(selectId);
  if (!sel) return;
  const tzList = [
    'America/New_York','America/Chicago','America/Denver','America/Los_Angeles',
    'America/Phoenix','America/Anchorage','Pacific/Honolulu',
    'Europe/London','Europe/Paris','Europe/Berlin','Europe/Moscow',
    'Asia/Tokyo','Asia/Shanghai','Asia/Kolkata','Asia/Dubai',
    'Australia/Sydney','Pacific/Auckland','UTC'
  ];
  const local = Sched.getLocalTz();
  const all = [local, ...tzList.filter(tz => tz !== local)];
  sel.innerHTML = all.map(tz =>
    `<option value="${tz}">${tz === local ? tz + ' (your timezone)' : tz}</option>`
  ).join('');
  sel.value = local;
}
