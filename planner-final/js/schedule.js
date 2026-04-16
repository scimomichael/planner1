// ── SCHEDULE ─────────────────────────────────────────────────────────
//  Weekdays:
//    5:00 AM  – 9:00 AM   → before school (plannable)
//    9:00 AM  – 11:10 AM  → school locked
//   11:10 AM  – 12:10 PM  → study hall (plannable, purple)
//   12:10 PM  – 4:00 PM   → school locked
//    4:00 PM  – 2:00 AM   → after school (plannable)
//
//  Weekends: entire day 12:00 AM – 2:00 AM plannable

const BLOCK_TYPES = [
  { id:'class',  label:'Class',  cls:'bt-class'  },
  { id:'study',  label:'Study',  cls:'bt-study'  },
  { id:'ec',     label:'EC',     cls:'bt-ec'     },
  { id:'free',   label:'Free',   cls:'bt-free'   },
  { id:'meal',   label:'Meal',   cls:'bt-meal'   },
  { id:'sleep',  label:'Sleep',  cls:'bt-sleep'  },
  { id:'work',   label:'Work',   cls:'bt-work'   },
  { id:'other',  label:'Other',  cls:'bt-other'  },
];

// All hours 0-23 plus wrap: display order 0..23 → displayed 12AM,1AM,2AM,...11PM
// For the schedule we show: 5,6,7,8 | 9,10 | 11(sh) | 12,13,14,15 | 16..23,0,1
function buildHourList(isWeekend) {
  if (isWeekend) {
    // Full day: 6 AM to 2 AM next day (20 hours, practical)
    const h = [];
    for (let i=6;i<=23;i++) h.push({ h:i, locked:false, sh:false });
    h.push({ h:0, locked:false, sh:false });
    h.push({ h:1, locked:false, sh:false });
    return h;
  }
  const rows = [];
  // 5 AM–9 AM → plannable before school
  for (let h=5;h<9;h++) rows.push({ h, locked:false, sh:false });
  // 9 AM–11 AM → school locked  (shows 9:00 and 10:00)
  for (let h=9;h<11;h++) rows.push({ h, locked:true, sh:false });
  // 11 AM = study hall (11:10–12:10 label)
  rows.push({ h:11, locked:false, sh:true });
  // 12 PM–4 PM → school locked
  for (let h=12;h<16;h++) rows.push({ h, locked:true, sh:false });
  // 4 PM–midnight → plannable after school
  for (let h=16;h<=23;h++) rows.push({ h, locked:false, sh:false });
  // Past midnight (0, 1 AM)
  rows.push({ h:0, locked:false, sh:false });
  rows.push({ h:1, locked:false, sh:false });
  return rows;
}

function fmtHour(h, isSH) {
  if (isSH) return '11:10 AM';
  if (h===0) return '12:00 AM';
  if (h===12) return '12:00 PM';
  if (h<12) return `${h}:00 AM`;
  return `${h-12}:00 PM`;
}

function schedDayKey(offset=0) {
  const d = new Date(todayDate());
  d.setDate(d.getDate() + schedOffset + offset);
  return dateStr(d);
}
function schedDayLabel() {
  const d = new Date(todayDate());
  d.setDate(d.getDate() + schedOffset);
  const n = daysUntil(dateStr(d));
  if (n===0) return 'Today · ' + d.toLocaleDateString('en-US',{weekday:'long'});
  if (n===1) return 'Tomorrow · ' + d.toLocaleDateString('en-US',{weekday:'long'});
  if (n===-1) return 'Yesterday · ' + d.toLocaleDateString('en-US',{weekday:'long'});
  return d.toLocaleDateString('en-US',{weekday:'long',month:'short',day:'numeric'});
}
function isWeekend(dk) {
  const d = new Date(dk+'T00:00:00');
  return d.getDay()===0 || d.getDay()===6;
}

function shiftSchedule(dir) { schedOffset += dir; renderSchedule(); }

function renderSchedule() {
  const dk = schedDayKey();
  const dayData = schedule[dk] || {};
  const weekend = isWeekend(dk);
  const rows = buildHourList(weekend);

  document.getElementById('sched-label').textContent = schedDayLabel();

  const html = rows.map(({ h, locked, sh }) => {
    const blocks = dayData[h] || [];
    const pills  = blocks.map((b,bi) => blockChip(b,bi,dk,h)).join('');
    const rowCls = locked ? 'sched-row locked' : sh ? 'sched-row study-hall' : 'sched-row';
    const timeLabel = fmtHour(h, sh);

    if (locked) {
      return `<div class="${rowCls}">
        <div class="sched-time">${timeLabel}</div>
        <div class="sched-cell"><span class="school-tag">School</span></div>
      </div>`;
    }
    if (sh) {
      return `<div class="${rowCls}">
        <div class="sched-time">${timeLabel}</div>
        <div class="sched-cell" onclick="openBlockModal('${dk}',${h},event)">
          <span class="sh-tag">Study hall</span>${pills}
        </div>
      </div>`;
    }
    return `<div class="${rowCls}">
      <div class="sched-time">${timeLabel}</div>
      <div class="sched-cell" onclick="openBlockModal('${dk}',${h},event)">${pills}</div>
    </div>`;
  }).join('');

  document.getElementById('schedule').innerHTML = html;
}

function blockChip(b, bi, dk, h) {
  const type = BLOCK_TYPES.find(t=>t.id===b.type) || BLOCK_TYPES[7];
  return `<span class="bchip ${type.cls}">${esc(b.label)}<span class="bchip-x" onclick="event.stopPropagation();removeBlock('${dk}',${h},${bi})">✕</span></span>`;
}

function removeBlock(dk, h, bi) {
  if (!schedule[dk]?.[h]) return;
  schedule[dk][h].splice(bi,1);
  persist();
  renderSchedule();
}

// ── BLOCK MODAL ───────────────────────────────────────────────────────
function openBlockModal(dk, h, e) {
  e?.stopPropagation();
  pendingBlock = { dk, h };

  // title
  const d = new Date(dk+'T00:00:00');
  const label = `Add block · ${fmtHour(h, h===11 && !isWeekend(dk))} · ${d.toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'})}`;
  document.getElementById('block-modal-title').textContent = label;
  document.getElementById('b-label').value = '';

  // default times
  const hh = h.toString().padStart(2,'0');
  document.getElementById('b-start').value = `${hh}:00`;
  const nxt = ((h+1)%24).toString().padStart(2,'0');
  document.getElementById('b-end').value = `${nxt}:00`;

  // type buttons
  document.getElementById('block-type-grid').innerHTML = BLOCK_TYPES.map(t =>
    `<button class="btype-btn ${t.cls}${activeBlock===t.id?' sel':''}" onclick="pickBlock('${t.id}')">${t.label}</button>`
  ).join('');

  document.getElementById('block-overlay').classList.add('open');
  setTimeout(()=>document.getElementById('b-label').focus(),40);
}

function pickBlock(id) {
  activeBlock = id;
  document.querySelectorAll('.btype-btn').forEach((btn,i)=>{
    const t = BLOCK_TYPES[i];
    btn.className = `btype-btn ${t.cls}${t.id===id?' sel':''}`;
  });
}

function closeBlockModal(e) {
  if (e && e.target !== e.currentTarget) return;
  document.getElementById('block-overlay').classList.remove('open');
}

function saveBlock() {
  const label = document.getElementById('b-label').value.trim() || activeBlock;
  const { dk, h } = pendingBlock;
  if (!schedule[dk]) schedule[dk] = {};
  if (!schedule[dk][h]) schedule[dk][h] = [];
  schedule[dk][h].push({
    label,
    type: activeBlock,
    start: document.getElementById('b-start').value,
    end:   document.getElementById('b-end').value,
  });
  persist();
  closeBlockModal();
  renderSchedule();
}
