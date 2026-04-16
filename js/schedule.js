// ═══════════════════════════════════════════════════════
// SCHEDULE — 15-minute slots, full day
// ═══════════════════════════════════════════════════════

const Schedule = (() => {
  const BLOCK_TYPES = [
    { id:'class',  label:'Class',  css:'bc-class'  },
    { id:'study',  label:'Study',  css:'bc-study'  },
    { id:'ec',     label:'EC',     css:'bc-ec'     },
    { id:'free',   label:'Free',   css:'bc-free'   },
    { id:'meal',   label:'Meal',   css:'bc-meal'   },
    { id:'sleep',  label:'Sleep',  css:'bc-sleep'  },
    { id:'work',   label:'Work',   css:'bc-work'   },
    { id:'other',  label:'Other',  css:'bc-other'  },
  ];

  // Display range: 5:00 AM to 2:00 AM (next day)
  // Slots: every 15 minutes
  // Hours 5..23 → 0 → 1
  function buildSlots() {
    const slots = [];
    const addHour = h => {
      for (let q = 0; q < 4; q++) {
        slots.push({ h, q, isHourStart: q === 0 });
      }
    };
    for (let h = 5; h <= 23; h++) addHour(h);
    addHour(0);
    addHour(1);
    return slots;
  }

  function fmtSlot(h, q) {
    const mins = q * 15;
    const mStr = mins === 0 ? '00' : String(mins);
    if (h === 0) return `12:${mStr} AM`;
    if (h === 12) return `12:${mStr} PM`;
    return h < 12 ? `${h}:${mStr} AM` : `${h-12}:${mStr} PM`;
  }

  function slotKey(h, q) { return `${h}:${q}`; }

  // Schedule offsets
  let schedOffset = 0;     // for today panel
  let fullOffset  = 0;     // for full schedule view

  function schedDayDate(offset) {
    const d = new Date(Store.today());
    d.setDate(d.getDate() + offset);
    return d;
  }

  function dayLabel(d) {
    const n = Store.daysUntil(Store.toStr(d));
    if (n === 0) return `Today · ${d.toLocaleDateString('en-US',{weekday:'long'})}`;
    if (n === 1) return `Tomorrow · ${d.toLocaleDateString('en-US',{weekday:'long'})}`;
    if (n === -1) return `Yesterday · ${d.toLocaleDateString('en-US',{weekday:'long'})}`;
    return d.toLocaleDateString('en-US',{weekday:'long', month:'short', day:'numeric'});
  }

  function shift(dir) { schedOffset += dir; render('scheduleGrid', schedOffset, 'scheduleLabel'); }
  function shiftFull(dir) { fullOffset += dir; render('scheduleFullGrid', fullOffset, 'scheduleFullLabel'); }

  function render(gridId, offset, labelId) {
    const d     = schedDayDate(offset);
    const dk    = Store.toStr(d);
    const dayData = Store.schedule[dk] || {};
    const slots = buildSlots();

    if (labelId) document.getElementById(labelId).textContent = dayLabel(d);

    const html = slots.map(({ h, q, isHourStart }) => {
      const key    = slotKey(h, q);
      const blocks = dayData[key] || [];
      const pills  = blocks.map((b, bi) => blockChip(b, bi, dk, key)).join('');
      const timeStr = q === 0 ? fmtSlot(h, 0) : (q === 2 ? fmtSlot(h, 30) : '');
      const rowCls = ['sched-slot'];
      if (isHourStart) rowCls.push('hour-start');
      if (q !== 0) rowCls.push('quarter');

      return `
        <div class="${rowCls.join(' ')}">
          <div class="sched-time">${timeStr}</div>
          <div class="sched-cell" onclick="BlockModal.open('${dk}','${key}',${h},${q},event)">${pills}</div>
        </div>`;
    }).join('');

    document.getElementById(gridId).innerHTML = html;
  }

  function blockChip(b, bi, dk, key) {
    const type = BLOCK_TYPES.find(t => t.id === b.type) || BLOCK_TYPES[7];
    const timeLabel = b.start && b.end ? `<span class="bchip-time">${b.start}–${b.end}</span>` : '';
    return `<span class="bchip ${type.css}">${Store.esc(b.label)}${timeLabel}<span class="bchip-x" onclick="event.stopPropagation();Schedule.removeBlock('${dk}','${key}',${bi})">✕</span></span>`;
  }

  function removeBlock(dk, key, bi) {
    if (!Store.schedule[dk]?.[key]) return;
    Store.schedule[dk][key].splice(bi, 1);
    Store.persist();
    render('scheduleGrid', schedOffset, 'scheduleLabel');
    if (document.getElementById('view-schedule').classList.contains('active')) {
      render('scheduleFullGrid', fullOffset, 'scheduleFullLabel');
    }
  }

  function addBlock(dk, key, label, type, start, end) {
    if (!Store.schedule[dk]) Store.schedule[dk] = {};
    if (!Store.schedule[dk][key]) Store.schedule[dk][key] = [];
    Store.schedule[dk][key].push({ label, type, start, end });
    Store.persist();
    render('scheduleGrid', schedOffset, 'scheduleLabel');
    if (document.getElementById('view-schedule').classList.contains('active')) {
      render('scheduleFullGrid', fullOffset, 'scheduleFullLabel');
    }
  }

  function getBlockTypes() { return BLOCK_TYPES; }
  function getOffset() { return schedOffset; }
  function getFullOffset() { return fullOffset; }

  return { shift, shiftFull, render, removeBlock, addBlock, getBlockTypes, getOffset, getFullOffset, fmtSlot, slotKey };
})();


// ═══════════════════════════════════════════════════════
// BLOCK MODAL
// ═══════════════════════════════════════════════════════

const BlockModal = (() => {
  let pendingDk  = null;
  let pendingKey = null;
  let activeType = 'study';

  function open(dk, key, h, q, e) {
    e?.stopPropagation();
    pendingDk  = dk;
    pendingKey = key;

    const fmtSlot = Schedule.fmtSlot;
    const d = new Date(dk + 'T00:00:00');
    const dayStr = d.toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric' });
    document.getElementById('blockModalHeading').textContent = `Add block · ${fmtSlot(h, q * 0)} · ${dayStr}`;

    // Wait — key is "h:q", reconstruct proper time
    const mins = q * 15;
    const hh   = String(h).padStart(2,'0');
    const mm   = String(mins).padStart(2,'0');
    document.getElementById('bStart').value = `${hh}:${mm}`;

    const endMins = (h * 60 + mins + 30) % (24*60);
    const endH    = Math.floor(endMins/60);
    const endM    = endMins % 60;
    document.getElementById('bEnd').value = `${String(endH).padStart(2,'0')}:${String(endM).padStart(2,'0')}`;

    document.getElementById('bLabel').value = '';
    renderTypeGrid();
    document.getElementById('blockBackdrop').classList.add('open');
    setTimeout(() => document.getElementById('bLabel').focus(), 40);
  }

  function renderTypeGrid() {
    const types = Schedule.getBlockTypes();
    document.getElementById('blockTypeGrid').innerHTML = types.map(t =>
      `<button class="btype-btn ${t.css}${t.id === activeType ? ' active' : ''}" onclick="BlockModal.pickType('${t.id}')">${t.label}</button>`
    ).join('');
  }

  function pickType(id) {
    activeType = id;
    renderTypeGrid();
  }

  function close() {
    document.getElementById('blockBackdrop').classList.remove('open');
  }

  function backdropClick(e) {
    if (e.target.id === 'blockBackdrop') close();
  }

  function save() {
    const label = document.getElementById('bLabel').value.trim() || activeType;
    const start = document.getElementById('bStart').value;
    const end   = document.getElementById('bEnd').value;
    Schedule.addBlock(pendingDk, pendingKey, label, activeType, start, end);
    close();
  }

  return { open, pickType, close, backdropClick, save };
})();
