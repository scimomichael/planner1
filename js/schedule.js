// ═══════════════════════════════════════════════════════
// SCHEDULE -- with exam type, date picker, popover, setOffset
// ═══════════════════════════════════════════════════════
const Sched = (() => {
  const SLOT_MIN = 15;
  const BLOCK_TYPES = [
    { id: 'class',   label: 'Class',   css: 'sb-class' },
    { id: 'exam',    label: 'Exam',    css: 'sb-exam' },
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
    // Full 24-hour day. The grid starts at the user's preferred start hour
    // (sStartHour, default 5 AM) and wraps around so EVERY hour of the day
    // exists on the grid: e.g. 5 AM, 6 AM ... 11 PM, 12 AM, 1 AM ... 4 AM.
    // This means a block at any time (3 AM, 4:30 AM, etc.) always has a home
    // and never silently disappears from the day view.
    const raw = Settings.get ? Number(Settings.get('sStartHour', 5)) : 5;
    const s = ((Math.round(raw) % 24) + 24) % 24;
    const arr = [];
    for (let i = 0; i < 24; i++) arr.push((s + i) % 24);
    return arr;
  }
  function getSlotH() { return Settings.get ? Number(Settings.get('sSlotH', 28)) : 28; }

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
      return String(nh).padStart(2,'0') + ':' + String(nm).padStart(2,'0');
    } catch { return timeStr; }
  }

  function fmt12(h, m) {
    const ap = h < 12 ? 'AM' : 'PM';
    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return h12 + ':' + String(m).padStart(2,'0') + ' ' + ap;
  }
  function fmtHQ(h, q) { return fmt12(h, q * 15); }
  function fmtStr(t) { if (!t) return ''; const [h, m] = t.split(':').map(Number); return fmt12(h, m); }
  function toMins(t) { if (!t) return null; const [h, m] = t.split(':').map(Number); return h * 60 + m; }
  function fromMins(m) { m = ((m % 1440) + 1440) % 1440; return String(Math.floor(m/60)).padStart(2,'0') + ':' + String(m%60).padStart(2,'0'); }

  let offset = 0;
  const _initDone = {};
  let _scrollAnchor = null;
  const _preservedScroll = {};
  const _skipPreserve = {};
  const _lastRenderedDk = {};
  function dateFor(off) { const d = new Date(Store.today()); d.setDate(d.getDate() + off); return d; }
  function dayLabel(d) {
    const n = Store.daysUntil(Store.toStr(d));
    const dow = d.toLocaleDateString('en-US', { weekday: 'long' });
    if (n === 0) return 'Today \xb7 ' + dow;
    if (n === 1) return 'Tomorrow \xb7 ' + dow;
    if (n === -1) return 'Yesterday \xb7 ' + dow;
    return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
  }

  function shift(dir) { offset += dir; render('schedGrid', 'schedLabel', offset); }
  // Today button: force fresh autoscroll to the now-line (skip auto-preserve)
  function today() { offset = 0; delete _initDone['schedGrid|' + Store.toStr(new Date())]; _skipPreserve['schedGrid'] = true; render('schedGrid', 'schedLabel', 0); }
  function getOffset() { return offset; }
  // setOffset for week/month jump without busy loop
  function setOffset(n) { offset = n; }

  function assignColumns(blocks, gridStartMin = 0) {
    // Overlay blocks are pulled out of the column-splitting math. They render
    // full-width, on top of non-overlay blocks, intentionally covering them.
    // The user opts into this per-block via the overlay:true flag.
    const result = blocks.map(() => ({ col: 0, totalCols: 1 }));
    const items = blocks
      .map((b, idx) => {
        const s = b._dispStart ?? b.start;
        const e = b._dispEnd ?? b.end;
        const sM = toMins(s);
        let eM = toMins(e);
        if (eM === null) eM = (sM ?? 0) + 60;
        if (sM === null) return { idx, isOverlay: !!b.overlay, startMin: null, endMin: null };
        // Convert to grid space (minutes since grid start hour, wrapped) so
        // overlap detection agrees with where blocks visually sit, including
        // blocks that span midnight.
        const gs = ((sM - gridStartMin) + 1440) % 1440;
        let ge = ((eM - gridStartMin) + 1440) % 1440;
        if (ge <= gs) ge = (eM === sM) ? gs + 15 : 1440;
        return { idx, isOverlay: !!b.overlay, startMin: gs, endMin: ge };
      })
      .filter(it => it.startMin !== null && !it.isOverlay)
      .sort((a, b) => a.startMin - b.startMin);
    const groups = [];
    items.forEach(it => {
      let placed = false;
      for (const g of groups) {
        if (g.some(x => x.endMin > it.startMin && x.startMin < it.endMin)) {
          g.push(it); placed = true; break;
        }
      }
      if (!placed) groups.push([it]);
    });
    groups.forEach(g => {
      const cols = [];
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
    // Nuke any popovers from a previous render/view before rebuilding the DOM.
    // Without this, popovers orphan themselves because they live on document.body.
    _purgeAllPopovers();
    const d = dateFor(off);
    const dk = Store.toStr(d);
    const isToday = (off === 0 && gridId === 'schedGrid');

    if (labelId) { const el = document.getElementById(labelId); if (el) el.textContent = dayLabel(d); }
    const box = document.getElementById(gridId);
    if (!box) return;

    const HOURS = getHours();
    const SLOT_H = getSlotH();
    const TOTAL_SLOTS = HOURS.length * 4;
    const totalH = TOTAL_SLOTS * SLOT_H;

    const rawBlocks = Store.schedule[dk] || [];
    const allBlocks = [...rawBlocks];
    Object.entries(Store.schedule).forEach(([src, list]) => {
      if (src === dk) return;
      list.forEach(b => {
        if (!b.recur || b.recur === 'none') return;
        if (_recursOn(b, src, dk)) {
          // Project this recurring source into an instance for date `dk`. If the
          // user toggled done on a specific occurrence, doneOverrides[dk] holds
          // that per-date flag; similarly for statusOverrides. Apply them so
          // the rendered instance reflects the toggle state.
          const inst = { ...b, _recurFrom: src, _recurBaseIdx: list.indexOf(b) };
          if (b.doneOverrides && Object.prototype.hasOwnProperty.call(b.doneOverrides, dk)) {
            inst.done = !!b.doneOverrides[dk];
          }
          if (b.statusOverrides && Object.prototype.hasOwnProperty.call(b.statusOverrides, dk)) {
            inst.status = b.statusOverrides[dk];
          }
          allBlocks.push(inst);
        }
      });
    });

    // AUTO-PRESERVE SCROLL: before we wipe the box, grab the existing
    // scroller's scrollTop so the new render lands at the same spot.
    // This makes background sync, edit-save, and any other refresh feel
    // seamless instead of snapping to top. An explicit _preservedScroll
    // or _scrollAnchor set by a caller still wins. _skipPreserve lets
    // today() forces a fresh autoscroll to the now-line.
    // DAY NAVIGATION is different: switching to another date must NOT
    // inherit the previous day's scroll. Today re-centers on the now-line;
    // any other day always opens with 9 AM at the top (see bottom of render).
    const dayNavigated = _lastRenderedDk[gridId] !== undefined && _lastRenderedDk[gridId] !== dk;
    _lastRenderedDk[gridId] = dk;
    if (_skipPreserve[gridId]) {
      delete _skipPreserve[gridId];
      delete _preservedScroll[gridId];
    } else if (dayNavigated) {
      delete _preservedScroll[gridId];
    } else if (_preservedScroll[gridId] === undefined && !(_scrollAnchor && _scrollAnchor.gridId === gridId)) {
      const existingScroller = box.querySelector('.sched-scroll');
      if (existingScroller) {
        _preservedScroll[gridId] = existingScroller.scrollTop;
      }
    }

    box.innerHTML = '';
    const scroller = document.createElement('div');
    scroller.className = 'sched-scroll';
    const inner = document.createElement('div');
    inner.className = 'sched-inner';
    inner.style.height = totalH + 'px';

    const axis = document.createElement('div');
    axis.className = 'sched-axis';
    HOURS.forEach((h, i) => {
      for (let q = 0; q < 4; q++) {
        const lbl = document.createElement('div');
        const isHour = q === 0;
        // Hour marks keep full styling; quarter marks (:15, :30, :45) get a
        // lighter variant class so the hour boundary still reads first.
        lbl.className = 'sched-axis-lbl' + (isHour ? '' : ' quarter') + (i === 0 && q === 0 ? ' first' : '');
        lbl.style.top = ((i * 4 + q) * SLOT_H) + 'px';
        lbl.textContent = fmtHQ(h, q);
        axis.appendChild(lbl);
      }
    });

    const canvas = document.createElement('div');
    canvas.className = 'sched-canvas';

    HOURS.forEach((_, i) => {
      for (let q = 0; q < 4; q++) {
        const line = document.createElement('div');
        line.className = 'sched-hline' + (q === 0 ? ' major' : '');
        line.style.top = ((i * 4 + q) * SLOT_H) + 'px';
        canvas.appendChild(line);
      }
    });

    _wireCanvasDrag(canvas, dk, HOURS, SLOT_H, totalH);

    if (isToday && Settings.get('sNowLine', true)) {
      const now = new Date();
      const nowM = now.getHours() * 60 + now.getMinutes();
      // Grid space: minutes since the grid's start hour, wrapped 0..1440.
      // With the full 24h wrapped grid, "now" always has a valid position.
      const gridStartMin = HOURS[0] * 60;
      const adj = ((nowM - gridStartMin) + 1440) % 1440;
      const topPx = (adj / (TOTAL_SLOTS * SLOT_MIN)) * totalH;
      const line = document.createElement('div');
      line.className = 'now-line';
      line.style.top = topPx + 'px';
      canvas.appendChild(line);
    }

    allBlocks.forEach(b => {
      b._dispStart = b.storedTz ? convertToLocalTz(b.start, b.storedTz) : b.start;
      b._dispEnd = b.storedTz ? convertToLocalTz(b.end, b.storedTz) : b.end;
    });
    const columnData = assignColumns(allBlocks, HOURS[0] * 60);
    const showBlockDue = Settings.get('sBlockDue', true);
    // Whether to show the globe icon next to block times when the block was
    // created in a different timezone than the one the user is viewing from.
    const showTzIndicators = Settings.get('sTzIndicators', true);
    // Render a small globe icon + tooltip when the block's storedTz differs
    // from the current local tz. Returns empty string when no indicator is warranted.
    const _tzChip = (b) => {
      if (!showTzIndicators) return '';
      if (!b.storedTz || b.storedTz === localTz) return '';
      const tip = 'Shown in your local time. Originally set in ' + b.storedTz + ' (you are viewing from ' + localTz + ')';
      return '<span class="sched-block-tz" title="' + Store.esc(tip) + '"><svg viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="5.5" stroke="currentColor" stroke-width="1.2"/><path d="M1.5 7h11M7 1.5c2 1.8 3 3.6 3 5.5s-1 3.7-3 5.5M7 1.5c-2 1.8-3 3.6-3 5.5s1 3.7 3 5.5" stroke="currentColor" stroke-width="1"/></svg></span>';
    };

    allBlocks.forEach((b, bi) => {
      const sM = toMins(b._dispStart);
      if (sM === null) return;
      const eM = toMins(b._dispEnd) ?? sM + 60;
      // Grid space: minutes since the grid's start hour, wrapped into 0..1440.
      // Because the grid covers all 24 hours, every clock time maps to exactly
      // one grid position. A 9:30 PM -> 12:45 AM block spans the midnight line
      // on the grid and renders its full true height.
      const gridStartMin = HOURS[0] * 60;
      const gs = ((sM - gridStartMin) + 1440) % 1440;
      let ge = ((eM - gridStartMin) + 1440) % 1440;
      if (ge <= gs) {
        // Either a zero-length block (start == end: give it minimum height)
        // or a block that wraps past the grid's own boundary (e.g. 4 AM ->
        // 6 AM when the grid starts at 5 AM): clamp at the grid's end.
        ge = (eM === sM) ? gs + SLOT_MIN : TOTAL_SLOTS * SLOT_MIN;
      }
      const startSlot = Math.floor(gs / SLOT_MIN);
      const top = startSlot * SLOT_H;
      const durationMin = ge - gs;
      const slots = Math.max(1, Math.min(Math.round(durationMin / SLOT_MIN), TOTAL_SLOTS - startSlot));
      const height = slots * SLOT_H;
      const { col, totalCols } = columnData[bi];
      const widthPct = 100 / totalCols;
      const leftPct = col * widthPct;
      const isRecurInstance = !!b._recurFrom;
      const timeDisp = b._dispStart && b._dispEnd ? fmtStr(b._dispStart) + '\u2013' + fmtStr(b._dispEnd) : fmtStr(b._dispStart);
      let dueHtml = '';
      if (showBlockDue && b.due) {
        const n = Store.daysUntil(b.due);
        let cls = 'due-later', label = Store.fmtDate(b.due);
        if (n !== null) {
          if (n < 0) { cls = 'due-over'; label = Store.fmtDate(b.due) + ' (overdue)'; }
          else if (n === 0) { cls = 'due-today'; label = 'today'; }
          else if (n === 1) { cls = 'due-soon'; label = 'tomorrow'; }
          else if (n <= 7) { cls = 'due-soon'; label = 'in ' + n + 'd'; }
        }
        // Append due time if present: "in class" or e.g. "at 11:59 PM"
        let timeSuffix = '';
        if (b.dueInClass) timeSuffix = ', in class';
        else if (b.dueTime) timeSuffix = ' at ' + fmtStr(b.dueTime);
        dueHtml = '<div class="sched-block-due ' + cls + '">Due ' + label + timeSuffix + '</div>';
      }
      const classPill = b.classLabel ? '<div class="sched-block-cls">' + Store.clsPill(b.classLabel) + '</div>' : '';
      const showDesc = !Settings.get || Settings.get('sBlockDesc', true);
      const descSnip = (b.description && showDesc) ? '<div class="sched-block-desc">' + Store.esc(b.description.slice(0, 120)) + (b.description.length > 120 ? '\u2026' : '') + '</div>' : '';
      const recurBadge = (b.recur && b.recur !== 'none') || isRecurInstance ? '<div class="sched-block-recur" title="Recurring">\u21bb</div>' : '';
      const showPriority = !Settings.get || Settings.get('sBlockPriority', true);
      const priDot = (showPriority && b.priority) ? '<span class="sched-block-pri pri-' + b.priority + '" title="Priority: ' + b.priority + '"></span>' : '';
      const showLocation = !Settings.get || Settings.get('sBlockLocation', true);
      const locChip = (showLocation && b.location) ? '<div class="sched-block-loc" title="' + Store.esc(b.location) + '"><svg viewBox="0 0 10 12" fill="none"><path d="M5 1a3.5 3.5 0 013.5 3.5c0 2.6-3.5 6.5-3.5 6.5S1.5 7.1 1.5 4.5A3.5 3.5 0 015 1z" stroke="currentColor" stroke-width="1.1" fill="none"/><circle cx="5" cy="4.5" r="1.2" fill="currentColor"/></svg><span class="sched-block-loc-text">' + Store.esc(b.location) + '</span></div>' : '';
      const showLink = !Settings.get || Settings.get('sBlockLink', true);
      const linkChip = (showLink && b.link) ? '<a class="sched-block-link" href="' + Store.esc(b.link) + '" target="_blank" rel="noopener noreferrer" title="' + Store.esc(b.link) + '" onclick="event.stopPropagation()"><svg viewBox="0 0 12 12" fill="none"><path d="M5 3h2a3 3 0 010 6H6M7 9H5a3 3 0 010-6h1M4.5 6h3" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg></a>' : '';
      const statusBadge = (b.status && b.status !== 'scheduled') ? '<div class="sched-block-status status-' + b.status + '">' + b.status.replace('-', ' ') + '</div>' : '';
      const isShort = height < 60;

      const block = document.createElement('div');
      block.className = 'sched-block ' + (b.css || 'sb-other') + (b.done ? ' sched-block-done' : '') + (b.status ? ' status-' + b.status : '') + (b.overlay ? ' sched-block-overlay' : '');
      block.style.top = top + 'px';
      block.style.height = height + 'px';
      block.style.left = 'calc(' + leftPct + '% + 4px)';
      block.style.width = 'calc(' + widthPct + '% - 8px)';
      if (b.overlay) block.style.zIndex = '5';
      block.dataset.dk = dk;
      block.dataset.bi = bi;
      if (isShort) block.dataset.short = '1';

      const extras = [classPill, statusBadge, dueHtml, locChip, descSnip].filter(Boolean).join('');

      if (isShort) {
        // Compact single-row layout: Title · Time · Class · Due (all inline, ellipsizing).
        // This keeps essential info visible even when the block is 28-60px tall.
        const shortClass = b.classLabel
          ? '<span class="sched-block-short-cls" style="color:' + (Store.getClassColor(b.classLabel) || 'currentColor') + '">' + Store.esc(b.classLabel) + '</span>'
          : '';
        // Due chip for short blocks -- uses same urgency classes and date formatting as the full-size version
        let shortDue = '';
        if (showBlockDue && b.due) {
          const n = Store.daysUntil(b.due);
          let dueCls = 'due-later', dueLabel = Store.fmtDate(b.due);
          if (n !== null) {
            if (n < 0) { dueCls = 'due-over'; dueLabel = Store.fmtDate(b.due) + ' (overdue)'; }
            else if (n === 0) { dueCls = 'due-today'; dueLabel = 'today'; }
            else if (n === 1) { dueCls = 'due-soon'; dueLabel = 'tomorrow'; }
            else if (n <= 7) { dueCls = 'due-soon'; dueLabel = 'in ' + n + 'd'; }
          }
          let dueTimeSuffix = '';
          if (b.dueInClass) dueTimeSuffix = ', in class';
          else if (b.dueTime) dueTimeSuffix = ' at ' + fmtStr(b.dueTime);
          shortDue = '<span class="sched-block-short-due ' + dueCls + '">Due ' + dueLabel + dueTimeSuffix + '</span>';
        }
        block.innerHTML =
          '<div class="sched-block-check' + (b.done ? ' done' : '') + '" data-act="check"><svg viewBox="0 0 10 8" fill="none"><path d="M1 4l3 3 5-6" stroke="var(--surface)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg></div>' +
          recurBadge +
          '<div class="sched-block-short-row">' +
            priDot +
            '<span class="sched-block-name-text">' + Store.esc(b.label) + '</span>' +
            (timeDisp ? '<span class="sched-block-short-sep">\xb7</span><span class="sched-block-short-time">' + timeDisp + _tzChip(b) + '</span>' : '') +
            (shortClass ? '<span class="sched-block-short-sep">\xb7</span>' + shortClass : '') +
            (shortDue ? '<span class="sched-block-short-sep">\xb7</span>' + shortDue : '') +
            linkChip +
          '</div>' +
          '<div class="sched-block-resize" data-act="resize"></div>';
      } else {
        block.innerHTML =
          '<div class="sched-block-check' + (b.done ? ' done' : '') + '" data-act="check"><svg viewBox="0 0 10 8" fill="none"><path d="M1 4l3 3 5-6" stroke="var(--surface)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg></div>' +
          recurBadge +
          '<div class="sched-block-name">' + priDot + '<span class="sched-block-name-text">' + Store.esc(b.label) + '</span>' + linkChip + '</div>' +
          (timeDisp ? '<div class="sched-block-time">' + timeDisp + _tzChip(b) + '</div>' : '') +
          (extras ? '<div class="sched-block-extras">' + extras + '</div>' : '') +
          '<div class="sched-block-resize" data-act="resize"></div>';
      }

      _wireBlockInteraction(block, b, bi, allBlocks, dk, HOURS, SLOT_H, totalH);

      // Hover popover for short blocks (shows full details on side panel)
      if (isShort) {
        try { _wirePopover(block, b, timeDisp); } catch (e) { console.error('Popover error:', e); }
      }

      canvas.appendChild(block);
    });

    inner.appendChild(axis);
    inner.appendChild(canvas);
    scroller.appendChild(inner);
    box.appendChild(scroller);

    // Synchronous scroll restore
    const initKey = gridId + '|' + dk;
    const preservedTop = _preservedScroll[gridId];
    const isTodayDate = (off === 0);

    if (preservedTop !== undefined) {
      scroller.scrollTop = preservedTop;
      delete _preservedScroll[gridId];
    } else if (_scrollAnchor && _scrollAnchor.gridId === gridId && _scrollAnchor.dk === dk) {
      const anchorBi = _scrollAnchor.bi;
      const el = canvas.querySelector('.sched-block[data-bi="' + anchorBi + '"]');
      if (el) {
        const elTop = parseFloat(el.style.top) || 0;
        const target = elTop - scroller.clientHeight / 2 + (parseFloat(el.style.height) || 0) / 2;
        scroller.scrollTop = Math.max(0, Math.min(target, totalH - scroller.clientHeight));
      }
      _scrollAnchor = null;
    } else if (dayNavigated || !_initDone[initKey]) {
      _initDone[initKey] = true;
      if (isTodayDate) {
        // Today: center the viewport on the current time (with the now-line).
        if (Settings.get('sAutoScroll', true)) {
          const now = new Date();
          const nowM = now.getHours() * 60 + now.getMinutes();
          const gridStartMin = HOURS[0] * 60;
          const adj = ((nowM - gridStartMin) + 1440) % 1440;
          const pct = adj / (TOTAL_SLOTS * SLOT_MIN);
          const target = pct * totalH - scroller.clientHeight / 2;
          scroller.scrollTop = Math.max(0, Math.min(target, totalH - scroller.clientHeight));
        }
      } else {
        // Any other day: open scrolled so the day's FIRST event sits just
        // below the top of the box (a couple slots of breathing room above
        // it). Days with no events fall back to 8:45 AM at the top. Applies
        // every time you navigate here, regardless of past scrolling.
        const gridStartMin = HOURS[0] * 60;
        let anchorMin = null;
        allBlocks.forEach(b => {
          if (b.overlay) return;
          const sM = toMins(b._dispStart);
          if (sM === null) return;
          const gs = ((sM - gridStartMin) + 1440) % 1440;
          if (anchorMin === null || gs < anchorMin) anchorMin = gs;
        });
        if (anchorMin === null) anchorMin = ((8 * 60 + 45 - gridStartMin) + 1440) % 1440;
        const target = Math.floor(anchorMin / SLOT_MIN) * SLOT_H - 2 * SLOT_H;
        scroller.scrollTop = Math.max(0, Math.min(target, totalH - scroller.clientHeight));
      }
    }
  }

  // Hover popover for short blocks -- shows to the side
  function _wirePopover(block, b, timeDisp) {
    let popover = null;
    let scrollListener = null;

    function hidePopover() {
      if (popover && popover.parentNode) popover.remove();
      popover = null;
      if (scrollListener) {
        const scroller = block.closest('.sched-scroll');
        if (scroller) scroller.removeEventListener('scroll', scrollListener);
        scrollListener = null;
      }
    }

    block.addEventListener('mouseenter', () => {
      try {
        if (popover) return;
        // Defensive: wipe any stale popovers left over from a previous render,
        // nav change, etc. Popovers live on document.body so they survive block
        // destruction, which is how they end up orphaned.
        document.querySelectorAll('.sched-block-popover').forEach(p => p.remove());
        popover = document.createElement('div');
        popover.className = 'sched-block-popover';
        let html = '<div class="sched-block-popover-title">' + Store.esc(b.label) + '</div>';
        html += '<div class="sched-block-popover-time">' + timeDisp + '</div>';
        if (b.classLabel) html += '<div class="sched-block-popover-detail">' + Store.esc(b.classLabel) + '</div>';
        if (b.location) html += '<div class="sched-block-popover-detail">' + Store.esc(b.location) + '</div>';
        if (b.due) {
          let dueSuffix = '';
          if (b.dueInClass) dueSuffix = ' (in class)';
          else if (b.dueTime) dueSuffix = ' at ' + fmtStr(b.dueTime);
          html += '<div class="sched-block-popover-detail">Due: ' + Store.fmtDate(b.due) + dueSuffix + '</div>';
        }
        // Show tz origin when the block was created in a different zone
        if (b.storedTz && b.storedTz !== localTz && Settings.get('sTzIndicators', true)) {
          html += '<div class="sched-block-popover-detail" style="opacity:0.75;font-style:italic">Originally set in ' + Store.esc(b.storedTz) + '</div>';
        }
        popover.innerHTML = html;
        document.body.appendChild(popover);

        const rect = block.getBoundingClientRect();
        const pw = 220;
        let left = rect.right + 8;
        if (left + pw > window.innerWidth) left = rect.left - pw - 8;
        if (left < 4) left = rect.left;
        popover.style.left = left + 'px';
        popover.style.top = Math.max(4, rect.top) + 'px';

        scrollListener = () => { hidePopover(); };
        const scroller = block.closest('.sched-scroll');
        if (scroller) scroller.addEventListener('scroll', scrollListener, { once: true });
      } catch (e) { console.error('Popover show error:', e); }
    });

    block.addEventListener('mouseleave', hidePopover);
    // If the block itself is removed from the DOM (rerender), also kill
    // our popover. MutationObserver watches the block's parent for removal.
    block._cleanupPopover = hidePopover;
  }

  // Called before every render to nuke any popovers hanging from a previous state.
  function _purgeAllPopovers() {
    document.querySelectorAll('.sched-block-popover').forEach(p => p.remove());
  }

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

  function _wireCanvasDrag(canvas, dk, HOURS, SLOT_H, totalH) {
    let ghost = null, startY = 0, startSlot = 0, currentSlot = 0;
    canvas.addEventListener('mousedown', e => {
      if (e.target !== canvas && !e.target.classList.contains('sched-hline')) return;
      if (e.button !== 0) return;
      const rect = canvas.getBoundingClientRect();
      startSlot = Math.floor((e.clientY - rect.top) / SLOT_H);
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
        if (botSlot === topSlot) BlockModal.open(dk, HOURS[Math.floor(topSlot / 4)], topSlot % 4);
        else BlockModal.openWithRange(dk, fromMins(startMin), fromMins(endMin));
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  }

  function _wireBlockInteraction(block, b, bi, allBlocks, dk, HOURS, SLOT_H, totalH) {
    const chk = block.querySelector('.sched-block-check');
    chk.addEventListener('click', e => { e.stopPropagation(); toggleDone(dk, b, bi); });
    const resize = block.querySelector('.sched-block-resize');
    block.addEventListener('mousedown', e => {
      if (e.target === chk || chk.contains(e.target)) return;
      if (e.button !== 0) return;
      const isResize = e.target === resize;
      // Option/Alt held at drag-start -> this is an "overlay drag". The
      // dropped block becomes overlay:true (stacks on top instead of getting
      // pushed to a side column). A regular drag without Option clears any
      // existing overlay flag on the block.
      const overlayDrag = !isResize && (e.altKey || e.metaKey);
      const startY = e.clientY;
      const origTop = parseFloat(block.style.top);
      const origHeight = parseFloat(block.style.height);
      let moved = false;
      if (overlayDrag) block.classList.add('sched-block-overlay-dragging');
      const onMove = mv => {
        const dy = mv.clientY - startY;
        if (Math.abs(dy) > 3) moved = true;
        if (isResize) {
          // Clamp between one slot and the bottom of the grid so a resize
          // can never push the block past the end of the (24h) day view.
          const maxH = totalH - origTop;
          const newH = Math.max(SLOT_H, Math.min(maxH, Math.round((origHeight + dy) / SLOT_H) * SLOT_H));
          block.style.height = newH + 'px';
        } else {
          const newTop = Math.max(0, Math.min(totalH - origHeight, origTop + dy));
          block.style.top = Math.round(newTop / SLOT_H) * SLOT_H + 'px';
        }
      };
      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        block.classList.remove('sched-block-overlay-dragging');
        if (!moved) {
          if (b._recurFrom !== undefined) EditBlock.open(b._recurFrom, b._recurBaseIdx);
          else EditBlock.open(dk, bi);
          return;
        }
        if (isResize) {
          const newH = parseFloat(block.style.height);
          const slots = Math.round(newH / SLOT_H);
          const startMin = toMins(b._dispStart);
          const newEnd = fromMins(startMin + slots * 15);
          _commitChange(b, dk, bi, { end: _reverseTz(newEnd, b.storedTz) });
        } else {
          const newTop = parseFloat(block.style.top);
          const slotOffset = Math.round(newTop / SLOT_H);
          const hourIdx = Math.floor(slotOffset / 4);
          const qIdx = slotOffset % 4;
          const newStartH = HOURS[hourIdx];
          const newStartMin = newStartH * 60 + qIdx * 15;
          const oldStartMin = toMins(b._dispStart);
          let oldEndMin = toMins(b._dispEnd) ?? oldStartMin + 60;
          // Midnight-crossing block: true duration = (24:00 - start) + end
          if (oldEndMin < oldStartMin) oldEndMin += 24 * 60;
          const delta = newStartMin - oldStartMin;
          // Preserve true duration. The new end can exceed 24:00 after the
          // shift; wrap it back into 0-24:00 range via modulo when converting.
          let newEndMinRaw = oldEndMin + delta;
          const newEndWrapped = ((newEndMinRaw % (24 * 60)) + 24 * 60) % (24 * 60);
          const changes = {
            start: _reverseTz(fromMins(newStartMin), b.storedTz),
            end: _reverseTz(fromMins(newEndWrapped), b.storedTz),
          };
          // Set overlay on Option-drag; clear on plain drag. This keeps the
          // default behavior (side-by-side) unless the user explicitly asked
          // to stack.
          if (overlayDrag) changes.overlay = true;
          else if (b.overlay) changes.overlay = false;
          _commitChange(b, dk, bi, changes);
        }
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
      e.preventDefault();
    });

    // Right-click (or long-press on touch) toggles overlay without needing to drag.
    block.addEventListener('contextmenu', e => {
      if (e.target === chk || chk.contains(e.target)) return;
      e.preventDefault();
      _commitChange(b, dk, bi, { overlay: !b.overlay });
    });
  }

  function _reverseTz(localStr, srcTz) {
    if (!srcTz || srcTz === localTz) return localStr;
    try {
      const [h, m] = localStr.split(':').map(Number);
      const ref = new Date(); ref.setHours(h, m, 0, 0);
      const diff = getOffsetMinutes(srcTz, ref) - getOffsetMinutes(localTz, ref);
      return fromMins(h * 60 + m + diff);
    } catch { return localStr; }
  }

  function _commitChange(b, dk, bi, changes) {
    // Build a human summary of what actually changed. This runs for drag-move,
    // drag-resize, and Option+drag overlay toggles — all three were previously
    // silent in the changelog which meant the AI couldn't see manual drag edits.
    const _summarize = (before, after, date) => {
      const label = after.label || before.label || '?';
      const parts = [];
      if (after.start !== undefined && before.start !== after.start) {
        parts.push('time: ' + (before.start || '?') + '\u2013' + (before.end || '?') + ' \u2192 ' + (after.start || '?') + '\u2013' + (after.end || '?'));
      } else if (after.end !== undefined && before.end !== after.end) {
        parts.push('end: ' + (before.end || '?') + ' \u2192 ' + (after.end || '?'));
      }
      if (after.overlay !== undefined && !!before.overlay !== !!after.overlay) {
        parts.push(after.overlay ? 'stacked on top' : 'un-stacked');
      }
      let summary = 'Edited "' + label + '" on ' + date;
      if (parts.length) summary += ' (' + parts.join('; ') + ')';
      return summary;
    };

    if (b._recurFrom !== undefined) {
      const src = Store.schedule[b._recurFrom];
      if (!src || !src[b._recurBaseIdx]) return;
      const before = { ...src[b._recurBaseIdx] };
      Store.snapshot();
      const after = { ...before, ...changes, userEdited: true };
      src[b._recurBaseIdx] = after;
      Store.logChange({
        type: 'block_updated',
        summary: _summarize(before, after, b._recurFrom) + ' (recurring)',
        date: b._recurFrom,
        label: after.label || '',
        diff: Object.keys(changes).reduce((acc, k) => { acc[k] = { from: before[k], to: after[k] }; return acc; }, {}),
      });
      Store.persist(); _preserveScroll(); renderBoth();
    } else {
      const list = Store.schedule[dk];
      if (!list || !list[bi]) return;
      const before = { ...list[bi] };
      Store.snapshot();
      const after = { ...before, ...changes, userEdited: true };
      list[bi] = after;
      Store.logChange({
        type: 'block_updated',
        summary: _summarize(before, after, dk),
        date: dk,
        label: after.label || '',
        diff: Object.keys(changes).reduce((acc, k) => { acc[k] = { from: before[k], to: after[k] }; return acc; }, {}),
      });
      Store.persist(); _preserveScroll(); renderBoth();
    }
  }

  function toggleDone(dk, b, bi) {
    if (b._recurFrom !== undefined) {
      const src = Store.schedule[b._recurFrom];
      if (!src || !src[b._recurBaseIdx]) return;
      const sb = src[b._recurBaseIdx];
      sb.doneOverrides = sb.doneOverrides || {};
      sb.statusOverrides = sb.statusOverrides || {};
      const wasDone = !!sb.doneOverrides[dk];
      sb.doneOverrides[dk] = !wasDone;
      // Keep status in sync: completed <-> scheduled for this occurrence only.
      sb.statusOverrides[dk] = wasDone ? 'scheduled' : 'completed';
      Store.logChange({
        type: wasDone ? 'block_uncompleted' : 'block_completed',
        summary: (wasDone ? 'Marked ' : 'Completed ') + `"${sb.label || '?'}" on ${dk} (recurring)`,
        date: dk, label: sb.label || '',
      });
      Store.persist(); _preserveScroll(); renderBoth();
    } else {
      const list = Store.schedule[dk];
      if (!list || !list[bi]) return;
      Store.snapshot();
      const wasDone = !!list[bi].done;
      list[bi].done = !wasDone;
      // Keep status in sync with the done flag. When unchecking, revert to
      // 'scheduled' so the block stops showing the completed badge.
      list[bi].status = wasDone ? 'scheduled' : 'completed';
      Store.logChange({
        type: wasDone ? 'block_uncompleted' : 'block_completed',
        summary: (wasDone ? 'Unmarked ' : 'Completed ') + `"${list[bi].label || '?'}" on ${dk}`,
        date: dk, label: list[bi].label || '',
      });
      Store.persist(); _preserveScroll(); renderBoth();
    }
  }

  function renderBoth() {
    render('schedGrid', 'schedLabel', offset);
  }

  function _preserveScroll() {
    const box = document.getElementById('schedGrid');
    const sc = box && box.querySelector('.sched-scroll');
    if (sc) _preservedScroll['schedGrid'] = sc.scrollTop;
  }

  function addBlock(dk, block) {
    Store.snapshot();
    if (!Store.schedule[dk]) Store.schedule[dk] = [];
    Store.schedule[dk].push(block);
    Store.logChange({
      type: 'block_added',
      summary: `Added "${block.label || '(untitled)'}" on ${dk}` + (block.start ? ` at ${block.start}` : ''),
      date: dk,
      block: {
        label: block.label || '', type: block.type || '', start: block.start || '', end: block.end || '',
        classLabel: block.classLabel || '', due: block.due || null,
        dueTime: block.dueTime || '', dueInClass: !!block.dueInClass,
      },
    });
    Store.persist(); _preserveScroll(); renderBoth();
  }
  function updateBlock(dk, bi, block) {
    if (!Store.schedule[dk]) return;
    const before = Store.schedule[dk][bi] || {};
    Store.snapshot();
    Store.schedule[dk][bi] = block;
    // Compute a compact diff of meaningful fields
    const tracked = ['label','type','start','end','classLabel','due','dueTime','dueInClass','priority','status','description','location','link','recur','overlay','done'];
    const diff = {};
    tracked.forEach(k => {
      const a = before[k] === undefined ? '' : before[k];
      const b = block[k]  === undefined ? '' : block[k];
      if (JSON.stringify(a) !== JSON.stringify(b)) diff[k] = { from: a, to: b };
    });
    if (Object.keys(diff).length) {
      // Build a short human summary of the most important change
      let summary = `Edited "${block.label || before.label || '?'}" on ${dk}`;
      if (diff.start || diff.end) summary += ` (time: ${before.start || '?'}\u2013${before.end || '?'} \u2192 ${block.start || '?'}\u2013${block.end || '?'})`;
      if (diff.label) summary += ` (renamed: "${before.label || ''}" \u2192 "${block.label || ''}")`;
      if (diff.due) summary += ` (due: ${before.due || 'none'} \u2192 ${block.due || 'none'})`;
      Store.logChange({ type: 'block_updated', summary, date: dk, label: block.label || '', diff });
    }
    Store.persist(); _preserveScroll(); renderBoth();
  }
  function removeBlock(dk, bi) {
    Store.removeBlock(dk, bi);
    _preserveScroll(); renderBoth();
  }

  return {
    shift, today, getOffset, setOffset,
    render, renderBoth, addBlock, updateBlock, removeBlock, toggleDone,
    getBlockTypes: () => BLOCK_TYPES,
    getLocalTz: () => localTz,
    minsToTimeStr: fromMins, timeStrToMins: toMins, fmtTimeStr: fmtStr,
  };
})();


// Shared helper: highlights the active preset chip based on the time input
// value and in-class flag. Each chip's data-preset is either "in-class" or
// a 24h HH:MM string that matches what the time input shows when the chip
// is the current choice.
function _refreshDuePresets(timeInputId, inClass) {
  const row = document.getElementById(timeInputId)?.parentElement;
  if (!row) return;
  const time = document.getElementById(timeInputId).value;
  row.querySelectorAll('.due-preset').forEach(btn => {
    const kind = btn.dataset.preset;
    let active = false;
    if (kind === 'in-class' && inClass) active = true;
    else if (kind !== 'in-class' && time === kind && !inClass) active = true;
    btn.classList.toggle('active', active);
  });
}


// ═══════════════════════════════════════════════════════
// BLOCK ADD MODAL - with date picker
// ═══════════════════════════════════════════════════════
const BlockModal = (() => {
  let _dk = null, _type = 'study';
  function setType(t) { _type = t; renderTypeGrid('bTypeGrid', t, setType); }

  function open(dk, h, q) {
    _openCore(dk, Sched.minsToTimeStr(h * 60 + q * 15), Sched.minsToTimeStr((h * 60 + q * 15 + 60) % (24 * 60)));
  }
  function openWithRange(dk, startTime, endTime) { _openCore(dk, startTime, endTime); }

  function _openCore(dk, startTime, endTime) {
    _dk = dk; _type = 'study';
    const d = new Date(dk + 'T00:00:00');
    document.getElementById('blockModalTitle').textContent =
      'Add Block \xb7 ' + d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    document.getElementById('bLabel').value = '';
    // Date picker
    document.getElementById('bDate').value = dk;
    document.getElementById('bStart').value = startTime;
    document.getElementById('bEnd').value = endTime;
    document.getElementById('bDue').value = '';
    document.getElementById('bDueTime').value = '';
    document.getElementById('bDueTimeGroup').style.display = 'none';
    _dueInClass = false;
    _refreshDuePresets('bDueTime', false);
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
    wireDateYearFallback(['bDate', 'bDue', 'bRecurUntil']);
    document.getElementById('blockOverlay').classList.add('open');
    setTimeout(() => document.getElementById('bLabel').focus(), 50);

    // Date picker updates title when user changes the date
    document.getElementById('bDate').onchange = function() {
      const val = this.value;
      if (val) {
        _dk = val;
        const nd = new Date(val + 'T00:00:00');
        document.getElementById('blockModalTitle').textContent =
          'Add Block \xb7 ' + nd.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      }
    };

    // Due-date input toggles visibility of the due-time row
    document.getElementById('bDue').onchange = function() {
      document.getElementById('bDueTimeGroup').style.display = this.value ? '' : 'none';
      if (!this.value) {
        document.getElementById('bDueTime').value = '';
        _dueInClass = false;
        _refreshDuePresets('bDueTime', false);
      }
    };

    // Typing a time clears any "in-class" flag
    document.getElementById('bDueTime').oninput = function() {
      if (this.value) { _dueInClass = false; _refreshDuePresets('bDueTime', false); }
    };

    document.getElementById('bRecur').onchange = e => {
      document.getElementById('bRecurEndGroup').style.display = e.target.value === 'none' ? 'none' : '';
    };
  }

  // "In-Class" and "11:59 PM" preset chips for due time. Also supports "clear".
  let _dueInClass = false;
  // Preset handler: kind is either "in-class" or a 24h HH:MM string.
  // Clicking an already-active preset toggles it off (replaces the removed clear button).
  function dueTimePreset(kind) {
    const timeEl = document.getElementById('bDueTime');
    if (kind === 'in-class') {
      if (_dueInClass) { _dueInClass = false; timeEl.value = ''; }
      else { _dueInClass = true; timeEl.value = ''; }
    } else {
      // Numeric time like "09:00" or "23:59"
      if (timeEl.value === kind && !_dueInClass) { timeEl.value = ''; }
      else { timeEl.value = kind; _dueInClass = false; }
    }
    _refreshDuePresets('bDueTime', _dueInClass);
  }

  function close() { document.getElementById('blockOverlay').classList.remove('open'); }
  function overlayClick(e) { if (e.target.id === 'blockOverlay') close(); }

  function save() {
    // Run the year-fill fallback one more time in case the user clicked Save
    // without blurring the date fields first (blur doesn't always fire before
    // button click completes).
    ['bDate','bDue','bRecurUntil'].forEach(id => {
      const el = document.getElementById(id);
      if (!el || !el.value) return;
      if (/^\d{4}-\d{2}-\d{2}$/.test(el.value)) return;
      const parsed = _parsePartialDate(el.value.trim());
      if (parsed) el.value = parsed;
    });
    const label = document.getElementById('bLabel').value.trim() || _type;
    const dateVal = document.getElementById('bDate').value || _dk;
    const start = document.getElementById('bStart').value;
    const end = document.getElementById('bEnd').value;
    if (!start) { document.getElementById('bStart').focus(); return; }
    const due = document.getElementById('bDue').value || null;
    const dueTime = due ? (document.getElementById('bDueTime').value || '') : '';
    const dueInClass = due ? !!_dueInClass : false;
    const classLabel = document.getElementById('bClass').value || '';
    const description = document.getElementById('bDescription').value.trim();
    const storedTz = document.getElementById('bTz')?.value || Sched.getLocalTz();
    const recur = document.getElementById('bRecur').value;
    const recurUntil = recur !== 'none' ? (document.getElementById('bRecurUntil').value || null) : null;
    const priority = document.getElementById('bPriority')?.value || '';
    const reminder = document.getElementById('bReminder')?.value ? Number(document.getElementById('bReminder').value) : null;
    const location = document.getElementById('bLocation')?.value.trim() || '';
    const link = document.getElementById('bLink')?.value.trim() || '';
    const css = Sched.getBlockTypes().find(t => t.id === _type)?.css || 'sb-other';

    if (!Settings.get || Settings.get('sConflictWarn', true)) {
      const conflicts = _findConflicts(dateVal, start, end);
      if (conflicts.length) {
        const labels = conflicts.map(c => '"' + c.label + '" (' + c.start + '\u2013' + c.end + ')').join(', ');
        if (!confirm('This overlaps: ' + labels + '\n\nAdd anyway?')) return;
      }
    }

    Sched.addBlock(dateVal, {
      label, type: _type, css, start, end,
      due, dueTime, dueInClass, classLabel, description, storedTz,
      recur: recur === 'none' ? null : recur, recurUntil,
      priority, reminder, location, link, status: 'scheduled', done: false
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

  return { open, openWithRange, close, overlayClick, save, dueTimePreset };
})();


// ═══════════════════════════════════════════════════════
// EDIT BLOCK MODAL
// ═══════════════════════════════════════════════════════
const EditBlock = (() => {
  let _dk = null, _bi = null, _type = 'study';
  let _dueInClass = false;
  function setType(t) { _type = t; renderTypeGrid('ebTypeGrid', t, setType); }

  function dueTimePreset(kind) {
    const timeEl = document.getElementById('ebDueTime');
    if (kind === 'in-class') {
      if (_dueInClass) { _dueInClass = false; timeEl.value = ''; }
      else { _dueInClass = true; timeEl.value = ''; }
    } else {
      if (timeEl.value === kind && !_dueInClass) { timeEl.value = ''; }
      else { timeEl.value = kind; _dueInClass = false; }
    }
    _refreshDuePresets('ebDueTime', _dueInClass);
  }

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
    const st = document.getElementById('ebStatus'); if (st) st.value = block.status || 'scheduled';
    const rem = document.getElementById('ebReminder'); if (rem) rem.value = block.reminder != null ? String(block.reminder) : '';
    const loc = document.getElementById('ebLocation'); if (loc) loc.value = block.location || '';
    const lnk = document.getElementById('ebLink'); if (lnk) lnk.value = block.link || '';
    const ov = document.getElementById('ebOverlay'); if (ov) ov.checked = !!block.overlay;
    // Due time presets
    _dueInClass = !!block.dueInClass;
    document.getElementById('ebDueTime').value = block.dueTime || '';
    document.getElementById('ebDueTimeGroup').style.display = block.due ? '' : 'none';
    _refreshDuePresets('ebDueTime', _dueInClass);
    document.getElementById('ebDue').onchange = function() {
      document.getElementById('ebDueTimeGroup').style.display = this.value ? '' : 'none';
      if (!this.value) {
        document.getElementById('ebDueTime').value = '';
        _dueInClass = false;
        _refreshDuePresets('ebDueTime', false);
      }
    };
    document.getElementById('ebDueTime').oninput = function() {
      if (this.value) { _dueInClass = false; _refreshDuePresets('ebDueTime', false); }
    };
    renderTypeGrid('ebTypeGrid', _type, setType);
    if (typeof Classes !== 'undefined') Classes.populateSelect('ebClass', block.classLabel || '');
    buildTzSelect('ebTz');
    const tzSel = document.getElementById('ebTz');
    if (tzSel) tzSel.value = block.storedTz || Sched.getLocalTz();
    // Show the "originally set in X" helper note when the block's stored tz
    // differs from the user's current local tz. Only when the setting is enabled.
    const tzNote = document.getElementById('ebTzNote');
    if (tzNote) {
      const stored = block.storedTz || '';
      const local = Sched.getLocalTz();
      const showNote = Settings.get('sTzIndicators', true) && stored && stored !== local;
      if (showNote) {
        tzNote.textContent = 'This block was originally set in ' + stored + ' while you\u2019re viewing from ' + local + '.';
        tzNote.style.display = '';
      } else {
        tzNote.textContent = '';
        tzNote.style.display = 'none';
      }
    }
    document.getElementById('editBlockOverlay').classList.add('open');
    wireDateYearFallback(['ebDate', 'ebDue']);
    setTimeout(() => document.getElementById('ebLabel').focus(), 50);
  }

  function close() { document.getElementById('editBlockOverlay').classList.remove('open'); }
  function overlayClick(e) { if (e.target.id === 'editBlockOverlay') close(); }

  function save() {
    // Normalize partial dates (e.g. "4/25" -> "2026-04-25") in case blur
    // didn't fire before the Save click landed.
    ['ebDate','ebDue'].forEach(id => {
      const el = document.getElementById(id);
      if (!el || !el.value) return;
      if (/^\d{4}-\d{2}-\d{2}$/.test(el.value)) return;
      const parsed = _parsePartialDate(el.value.trim());
      if (parsed) el.value = parsed;
    });
    const label = document.getElementById('ebLabel').value.trim();
    const start = document.getElementById('ebStart').value;
    const end = document.getElementById('ebEnd').value;
    const newDk = document.getElementById('ebDate').value;
    const due = document.getElementById('ebDue').value || null;
    const dueTime = due ? (document.getElementById('ebDueTime').value || '') : '';
    const dueInClass = due ? !!_dueInClass : false;
    const classLabel = document.getElementById('ebClass').value || '';
    const description = document.getElementById('ebDescription').value.trim();
    const storedTz = document.getElementById('ebTz')?.value || Sched.getLocalTz();
    const recurVal = document.getElementById('ebRecur')?.value || 'none';
    const priority = document.getElementById('ebPriority')?.value || '';
    const status = document.getElementById('ebStatus')?.value || 'scheduled';
    const reminder = document.getElementById('ebReminder')?.value ? Number(document.getElementById('ebReminder').value) : null;
    const location = document.getElementById('ebLocation')?.value.trim() || '';
    const link = document.getElementById('ebLink')?.value.trim() || '';
    const overlay = !!document.getElementById('ebOverlay')?.checked;
    const css = Sched.getBlockTypes().find(t => t.id === _type)?.css || 'sb-other';
    const orig = Store.schedule[_dk]?.[_bi] || {};
    // Keep done flag and status in sync: completed -> done=true; anything
    // else (scheduled/in-progress/cancelled) -> done=false. Matches the
    // behavior of clicking the check circle on a block.
    const doneFromStatus = (status === 'completed');
    const block = {
      ...orig, label, type: _type, css, start, end, due, dueTime, dueInClass, classLabel, description, storedTz,
      recur: recurVal === 'none' ? null : recurVal,
      priority, status, reminder, location, link, overlay, userEdited: true,
      done: doneFromStatus,
    };
    if (newDk !== _dk) {
      // Cross-date edit: suppress the individual delete/add log entries and
      // write one coherent "block_moved" entry instead, so the AI sees a move
      // rather than a delete+create pair.
      const prevSource = 'manual';
      Store.setChangeSource('_suppress_block_log');
      try {
        Sched.removeBlock(_dk, _bi);
        Sched.addBlock(newDk, block);
      } finally {
        Store.setChangeSource(prevSource);
      }
      Store.logChange({
        type: 'block_moved',
        summary: 'Moved "' + (block.label || '?') + '" from ' + _dk + ' to ' + newDk + (block.start ? ' at ' + block.start : ''),
        fromDate: _dk,
        toDate: newDk,
        label: block.label || '',
        start: block.start || '',
        end: block.end || '',
      });
    } else {
      Sched.updateBlock(_dk, _bi, block);
    }
    close();
  }

  function del() { Sched.removeBlock(_dk, _bi); close(); }
  return { open, close, overlayClick, save, del, dueTimePreset };
})();


// ═══════════════════════════════════════════════════════
// SHARED HELPERS
// ═══════════════════════════════════════════════════════
function renderTypeGrid(gridId, activeId, onPick) {
  const grid = document.getElementById(gridId);
  if (!grid) return;
  grid.innerHTML = Sched.getBlockTypes().map(t =>
    '<button class="btype-btn' + (t.id === activeId ? ' selected' : '') + '" data-t="' + t.id + '">' + t.label + '</button>'
  ).join('');
  grid.querySelectorAll('.btype-btn').forEach(btn => {
    btn.addEventListener('click', () => onPick(btn.dataset.t));
  });
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
    '<option value="' + tz + '">' + (tz === local ? tz + ' (your timezone)' : tz) + '</option>'
  ).join('');
  sel.value = local;
}

// Auto-fill year for date inputs. On browsers that render <input type="date">
// as an MM/DD/YYYY text field (common on desktop Chrome), the user can leave
// the year blank. That makes the input invalid, and .value returns "" on save.
// This helper watches for the user typing a month and day, and if they leave
// without a year, rewrites the field's value to include the current year.
//
// We can't read partial text from a type="date" input, so instead we also
// support a fallback: accept free-text input and parse it. If the user's
// browser shows the field as a text box (we detect this by reading
// .validity.badInput after blur), we parse their typed string.
//
// Accepted formats when year is missing:
//   "4/25", "04/25", "4-25", "Apr 25", "April 25"
// Also handles "4/25/26" and "4/25/2026" as full dates.
//
// The parsed date is rewritten into the input as "YYYY-MM-DD" so the form
// accepts it normally.
function wireDateYearFallback(inputIds) {
  const ids = Array.isArray(inputIds) ? inputIds : [inputIds];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (!el || el._yearFallbackWired) return;
    el._yearFallbackWired = true;

    // We listen to a few events because blur doesn't fire if the user
    // clicks Save (focus stays on the button after mousedown).
    const handler = () => {
      // If the input already has a valid YYYY-MM-DD value, do nothing.
      if (el.value && /^\d{4}-\d{2}-\d{2}$/.test(el.value)) return;

      // Try to read what the user actually typed. Browsers that show the
      // field as a text box expose the raw string via the input.
      // On Safari/iOS the field is a native picker and this won't fire.
      const raw = (el.value || '').trim();
      if (!raw) return; // truly empty, leave alone

      const parsed = _parsePartialDate(raw);
      if (parsed) el.value = parsed;
    };

    // blur catches tabbing / clicking elsewhere
    el.addEventListener('blur', handler);
    // change fires when the native picker commits, also useful
    el.addEventListener('change', handler);
  });
}

// Parse "4/25", "Apr 25", "04-25-2026", etc. into "YYYY-MM-DD".
// If the year is missing, uses the current year, but bumps to next year
// if the resulting date has already passed (same logic as Quick Add).
function _parsePartialDate(s) {
  if (!s) return null;
  s = s.trim();
  const now = new Date();
  const thisYear = now.getFullYear();

  // Case 1: MM/DD or M/D or MM-DD
  let m = s.match(/^(\d{1,2})[\/\-](\d{1,2})$/);
  if (m) {
    const mo = Number(m[1]), d = Number(m[2]);
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    return _assembleDate(thisYear, mo, d);
  }

  // Case 2: MM/DD/YY or MM/DD/YYYY
  m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (m) {
    const mo = Number(m[1]), d = Number(m[2]);
    let y = Number(m[3]);
    if (y < 100) y += 2000; // "26" -> 2026
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    return _pad4(y) + '-' + _pad2(mo) + '-' + _pad2(d);
  }

  // Case 3: "Apr 25", "April 25", "apr 25"
  const MONTHS = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
  m = s.toLowerCase().match(/^([a-z]+)\s+(\d{1,2})(?:\s*,?\s*(\d{2,4}))?$/);
  if (m) {
    const monthName = m[1].slice(0, 3);
    const mi = MONTHS.indexOf(monthName);
    if (mi < 0) return null;
    const d = Number(m[2]);
    if (d < 1 || d > 31) return null;
    if (m[3]) {
      let y = Number(m[3]);
      if (y < 100) y += 2000;
      return _pad4(y) + '-' + _pad2(mi + 1) + '-' + _pad2(d);
    }
    return _assembleDate(thisYear, mi + 1, d);
  }

  return null;
}
function _assembleDate(year, month, day) {
  // If the date is more than 1 day in the past, assume next year.
  const candidate = new Date(year, month - 1, day);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const oneDay = 24 * 60 * 60 * 1000;
  if (candidate.getTime() < today.getTime() - oneDay) {
    year += 1;
  }
  return _pad4(year) + '-' + _pad2(month) + '-' + _pad2(day);
}
function _pad2(n) { return String(n).padStart(2, '0'); }
function _pad4(n) { return String(n).padStart(4, '0'); }
