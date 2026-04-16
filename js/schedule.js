// ══════════════════════════════════════════════════════════
// SCHEDULE — visual blocks, task linking, edit/move,
//            cross-off, 15-min slots, 12h AM/PM,
//            auto timezone, per-block tz, auto-scroll to now,
//            Meeting block type (teal)
// ══════════════════════════════════════════════════════════
const Sched = (() => {
  const SLOT_H   = 28;
  const SLOT_MIN = 15;

  const BLOCK_TYPES = [
    {id:'class',   label:'Class',   css:'sb-class'},
    {id:'meeting', label:'Meeting', css:'sb-meeting'},
    {id:'study',   label:'Study',   css:'sb-study'},
    {id:'ec',      label:'EC',      css:'sb-ec'},
    {id:'free',    label:'Free',    css:'sb-free'},
    {id:'meal',    label:'Meal',    css:'sb-meal'},
    {id:'sleep',   label:'Sleep',   css:'sb-sleep'},
    {id:'work',    label:'Work',    css:'sb-work'},
    {id:'other',   label:'Other',   css:'sb-other'},
  ];

  const HOURS = [...Array.from({length:19},(_,i)=>i+5), 0, 1];
  const TOTAL_SLOTS = HOURS.length * 4;

  // ── Timezone ────────────────────────────────────────────
  let localTz = Intl.DateTimeFormat().resolvedOptions().timeZone;

  function detectTz() {
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (tz && tz !== localTz) {
        localTz = tz;
        Store.toast('Timezone: ' + tz);
        renderBoth();
      }
    } catch(e) {}
  }
  setInterval(detectTz, 30000);

  function getOffsetMinutes(tz, date) {
    try {
      const u = new Date(date.toLocaleString('en-US', {timeZone:'UTC'}));
      const t = new Date(date.toLocaleString('en-US', {timeZone:tz}));
      return (t - u) / 60000;
    } catch(e) { return 0; }
  }

  function convertToLocalTz(timeStr, srcTz) {
    if (!timeStr || !srcTz || srcTz === localTz) return timeStr;
    try {
      const [h, m] = timeStr.split(':').map(Number);
      const today = new Date();
      today.setHours(h, m, 0, 0);
      const srcOff   = getOffsetMinutes(srcTz,   today);
      const localOff = getOffsetMinutes(localTz,  today);
      const diff     = srcOff - localOff;
      const total    = h*60 + m - diff;
      const nh = ((Math.floor(total/60)) % 24 + 24) % 24;
      const nm = ((total % 60) + 60) % 60;
      return `${String(nh).padStart(2,'0')}:${String(nm).padStart(2,'0')}`;
    } catch(e) { return timeStr; }
  }

  // ── Time helpers (always 12h AM/PM) ───────────────────
  function fmt12(h, m) {
    const ap = h < 12 ? 'AM' : 'PM';
    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${h12}:${String(m).padStart(2,'0')} ${ap}`;
  }
  function fmtHQ(h, q)  { return fmt12(h, q*15); }
  function fmtStr(t)    { if(!t) return ''; const [h,m]=t.split(':').map(Number); return fmt12(h,m); }
  function toMins(t)    { if(!t) return null; const [h,m]=t.split(':').map(Number); return h*60+m; }
  function fromMins(m)  { return `${String(Math.floor(m/60)%24).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`; }

  function slotTop(h, q) {
    const idx = HOURS.indexOf(h);
    return ((idx < 0 ? 0 : idx) * 4 + q) * SLOT_H;
  }
  function blockH(sM, eM) {
    const diff = (eM ?? sM+60) - sM;
    return Math.max(SLOT_H, Math.round(Math.max(diff,0)/SLOT_MIN)*SLOT_H);
  }

  // ── Offsets ────────────────────────────────────────────
  let offset=0, fullOffset=0;
  function dateFor(off) { const d=new Date(Store.today()); d.setDate(d.getDate()+off); return d; }
  function dayLabel(d) {
    const n = Store.daysUntil(Store.toStr(d));
    const dow = d.toLocaleDateString('en-US',{weekday:'long'});
    if(n===0)  return `Today · ${dow}`;
    if(n===1)  return `Tomorrow · ${dow}`;
    if(n===-1) return `Yesterday · ${dow}`;
    return d.toLocaleDateString('en-US',{weekday:'long',month:'short',day:'numeric'});
  }

  function shift(dir)     { offset+=dir;     render('schedGrid','schedLabel',offset); }
  function shiftFull(dir) { fullOffset+=dir; render('schedFullGrid','schedFullSub',fullOffset); }
  function getOffset()     { return offset; }
  function getFullOffset() { return fullOffset; }

  // ── Render ─────────────────────────────────────────────
  function render(gridId, labelId, off) {
    const d      = dateFor(off);
    const dk     = Store.toStr(d);
    const blocks = Store.schedule[dk] || [];
    const isToday = (off === 0 && gridId === 'schedGrid');

    if (labelId) { const el=document.getElementById(labelId); if(el) el.textContent=dayLabel(d); }

    const wrap = document.getElementById(gridId);
    if (!wrap) return;
    wrap.innerHTML = '';
    wrap.style.position = 'relative';

    const totalH = TOTAL_SLOTS * SLOT_H;

    // Time axis (fixed left column)
    const axis = document.createElement('div');
    axis.className = 'sched-axis';
    axis.style.height = totalH + 'px';
    HOURS.forEach((h,i) => {
      const lbl = document.createElement('div');
      lbl.className = 'sched-axis-label';
      lbl.style.top = (i*4*SLOT_H)+'px';
      lbl.style.transform = i===0 ? 'translateY(0)' : 'translateY(-50%)';
      lbl.textContent = fmtHQ(h, 0);
      axis.appendChild(lbl);
    });
    wrap.appendChild(axis);

    // Scrollable content area
    const scroller = document.createElement('div');
    scroller.className = 'sched-scroller';

    const inner = document.createElement('div');
    inner.style.cssText = `position:relative;height:${totalH}px`;

    // "Now" line
    if (isToday) {
      const now = new Date();
      const nowM = now.getHours()*60 + now.getMinutes();
      const adjM = nowM < 120 ? nowM+24*60 : nowM;
      const startM = 5*60, endM = 26*60;
      if (adjM >= startM && adjM <= endM) {
        const topPx = ((adjM - startM) / (endM - startM)) * totalH;
        const line = document.createElement('div');
        line.className = 'now-line';
        line.style.top = topPx + 'px';
        inner.appendChild(line);
      }
    }

    // Click slots
    HOURS.forEach((h,hi) => {
      for (let q=0;q<4;q++) {
        const slot = document.createElement('div');
        slot.className = 'sched-slot'+(q===0?' hour-top':'');
        slot.style.cssText=`position:absolute;left:0;right:0;top:${(hi*4+q)*SLOT_H}px;height:${SLOT_H}px`;
        slot.addEventListener('click', () => BlockModal.open(dk, h, q));
        inner.appendChild(slot);
      }
    });

    // Visual blocks
    blocks.forEach((b, bi) => {
      const dispStart = b.storedTz ? convertToLocalTz(b.start, b.storedTz) : b.start;
      const dispEnd   = b.storedTz ? convertToLocalTz(b.end,   b.storedTz) : b.end;
      const sM = toMins(dispStart);
      if (sM === null) return;
      const eM  = toMins(dispEnd) ?? sM+60;
      const sh  = Math.floor(sM/60)%24;
      const sq  = Math.floor((sM%60)/15);
      const top = slotTop(sh, sq);
      const ht  = blockH(sM, eM);
      const linkedTask = b.taskId ? Store.tasks.find(t=>t.id===b.taskId) : null;
      const timeDisp = dispStart && dispEnd ? `${fmtStr(dispStart)}–${fmtStr(dispEnd)}` : dispStart ? fmtStr(dispStart) : '';
      const tzNote = b.storedTz && b.storedTz !== localTz
        ? `<div class="sched-block-tz">${b.storedTz.split('/').pop().replace(/_/g,' ')}</div>` : '';

      const block = document.createElement('div');
      block.className = `sched-block ${b.css||'sb-other'}${b.done?' sched-block-done':''}`;
      block.style.cssText = `top:${top}px;height:${ht}px`;
      block.innerHTML = `
        <div class="sched-block-check${b.done?' done':''}"
             onclick="event.stopPropagation();Sched.toggleDone('${dk}',${bi})"></div>
        <div class="sched-block-label">${Store.esc(b.label)}</div>
        ${timeDisp ? `<div class="sched-block-time">${timeDisp}</div>` : ''}
        ${tzNote}
        ${linkedTask ? `<div class="sched-block-task">→ ${Store.esc(linkedTask.name)}</div>` : ''}
      `;
      block.addEventListener('click', () => EditBlockModal.open(dk, bi));
      inner.appendChild(block);
    });

    scroller.appendChild(inner);
    wrap.appendChild(scroller);

    // Auto-scroll to current time (today only, schedGrid only)
    if (isToday) {
      requestAnimationFrame(() => requestAnimationFrame(() => {
        const now = new Date();
        const nowM = now.getHours()*60 + now.getMinutes();
        const adjM = nowM < 120 ? nowM+24*60 : nowM;
        const startM = 5*60;
        const pct  = Math.max(0, (adjM - startM) / (TOTAL_SLOTS * SLOT_MIN));
        const scrollTo = pct * totalH - (scroller.clientHeight / 2);
        scroller.scrollTop = Math.max(0, scrollTo);
      }));
    }
  }

  function renderBoth() {
    render('schedGrid','schedLabel',offset);
    if (document.getElementById('view-schedule')?.classList.contains('active')) {
      render('schedFullGrid','schedFullSub',fullOffset);
    }
  }

  function toggleDone(dk, bi) {
    const b=Store.schedule[dk]; if(!b?.[bi]) return;
    b[bi].done=!b[bi].done; Store.persist(); renderBoth();
  }
  function addBlock(dk, block) {
    if(!Store.schedule[dk]) Store.schedule[dk]=[];
    Store.schedule[dk].push(block); Store.persist(); renderBoth();
  }
  function updateBlock(dk, bi, block) {
    if(!Store.schedule[dk]) return;
    Store.schedule[dk][bi]=block; Store.persist(); renderBoth();
  }
  function removeBlock(dk, bi) {
    if(!Store.schedule[dk]) return;
    Store.schedule[dk].splice(bi,1); Store.persist(); renderBoth();
  }

  function getBlockTypes()  { return BLOCK_TYPES; }
  function getLocalTz()     { return localTz; }
  function minsToTimeStr(m) { return fromMins(m); }
  function fmtTimeStr(t)    { return fmtStr(t); }

  return {
    shift, shiftFull, getOffset, getFullOffset,
    render, renderBoth,
    addBlock, updateBlock, removeBlock, toggleDone,
    getBlockTypes, getLocalTz, minsToTimeStr, fmtTimeStr,
  };
})();


// ══════════════════════════════════════════════════════════
// BLOCK MODAL — add new block
// ══════════════════════════════════════════════════════════
const BlockModal = (() => {
  let _dk=null, _type='study';

  function setType(t) { _type=t; renderTypeGrid('btypeGrid',t,setType); }

  function open(dk, h, q) {
    _dk=dk; _type='study';
    const d=new Date(dk+'T00:00:00');
    document.getElementById('blockModalTitle').textContent =
      `Add block · ${d.toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'})}`;
    document.getElementById('bLabel').value='';
    const sM=h*60+q*15, eM=sM+60;
    document.getElementById('bStart').value=Sched.minsToTimeStr(sM);
    document.getElementById('bEnd').value=Sched.minsToTimeStr(eM%(24*60));
    renderTypeGrid('btypeGrid',_type,setType);
    populateTaskSelect('bTaskLink',null);
    buildTzSelect('bTz');
    document.getElementById('blockBackdrop').classList.add('open');
    setTimeout(()=>document.getElementById('bLabel').focus(),40);
  }

  function close() { document.getElementById('blockBackdrop').classList.remove('open'); }
  function bdClick(e) { if(e.target.id==='blockBackdrop') close(); }

  function save() {
    const label   = document.getElementById('bLabel').value.trim()||_type;
    const start   = document.getElementById('bStart').value;
    const end     = document.getElementById('bEnd').value;
    const taskId  = document.getElementById('bTaskLink').value||null;
    const storedTz= document.getElementById('bTz')?.value||Sched.getLocalTz();
    const css     = Sched.getBlockTypes().find(t=>t.id===_type)?.css||'sb-other';
    Sched.addBlock(_dk,{label,type:_type,css,start,end,taskId,storedTz,done:false});
    close();
  }

  return {open,close,bdClick,save};
})();


// ══════════════════════════════════════════════════════════
// EDIT BLOCK MODAL — edit / move / delete
// ══════════════════════════════════════════════════════════
const EditBlockModal = (() => {
  let _dk=null, _bi=null, _type='study';

  function setType(t) { _type=t; renderTypeGrid('ebTypeGrid',t,setType); }

  function open(dk, bi) {
    _dk=dk; _bi=bi;
    const block=Store.schedule[dk]?.[bi];
    if(!block) return;
    _type=block.type||'study';
    document.getElementById('ebLabel').value=block.label||'';
    document.getElementById('ebStart').value=block.start||'';
    document.getElementById('ebEnd').value=block.end||'';
    document.getElementById('ebDate').value=dk;
    renderTypeGrid('ebTypeGrid',_type,setType);
    populateTaskSelect('ebTaskLink',block.taskId||null);
    buildTzSelect('ebTz');
    const tzSel=document.getElementById('ebTz');
    if(tzSel) tzSel.value=block.storedTz||Sched.getLocalTz();
    document.getElementById('editBlockBackdrop').classList.add('open');
    setTimeout(()=>document.getElementById('ebLabel').focus(),40);
  }

  function close() { document.getElementById('editBlockBackdrop').classList.remove('open'); }
  function bdClick(e) { if(e.target.id==='editBlockBackdrop') close(); }

  function save() {
    const label   = document.getElementById('ebLabel').value.trim();
    const start   = document.getElementById('ebStart').value;
    const end     = document.getElementById('ebEnd').value;
    const newDk   = document.getElementById('ebDate').value;
    const taskId  = document.getElementById('ebTaskLink').value||null;
    const storedTz= document.getElementById('ebTz')?.value||Sched.getLocalTz();
    const css     = Sched.getBlockTypes().find(t=>t.id===_type)?.css||'sb-other';
    const orig    = Store.schedule[_dk]?.[_bi]||{};
    const block   = {...orig,label,type:_type,css,start,end,taskId,storedTz};
    if(newDk!==_dk){Sched.removeBlock(_dk,_bi);Sched.addBlock(newDk,block);}
    else Sched.updateBlock(_dk,_bi,block);
    close();
  }

  function del() { Sched.removeBlock(_dk,_bi); close(); }

  return {open,close,bdClick,save,del};
})();


// ══════════════════════════════════════════════════════════
// SHARED HELPERS
// ══════════════════════════════════════════════════════════
function renderTypeGrid(gridId, activeId, onPick) {
  const grid=document.getElementById(gridId);
  if(!grid) return;
  grid.innerHTML=Sched.getBlockTypes().map(t=>
    `<button class="btype-btn ${t.css}${t.id===activeId?' sel':''}" data-t="${t.id}">${t.label}</button>`
  ).join('');
  grid.querySelectorAll('.btype-btn').forEach(btn=>{
    btn.addEventListener('click',()=>onPick(btn.dataset.t));
  });
}

function populateTaskSelect(selectId, selectedId) {
  const sel=document.getElementById(selectId);
  if(!sel) return;
  const active=Store.tasks.filter(t=>t.status!=='Done');
  sel.innerHTML=`<option value="">— None —</option>`+
    active.map(t=>`<option value="${t.id}"${t.id===selectedId?' selected':''}>${Store.esc(t.name.slice(0,55))}</option>`).join('');
}

function buildTzSelect(selectId) {
  const sel=document.getElementById(selectId);
  if(!sel) return;
  const tzList=[
    'America/New_York','America/Chicago','America/Denver','America/Los_Angeles',
    'America/Phoenix','America/Anchorage','Pacific/Honolulu',
    'Europe/London','Europe/Paris','Europe/Berlin','Europe/Moscow',
    'Asia/Tokyo','Asia/Shanghai','Asia/Kolkata','Asia/Dubai',
    'Australia/Sydney','Pacific/Auckland','UTC'
  ];
  const local=Sched.getLocalTz();
  const all=[local,...tzList.filter(t=>t!==local)];
  sel.innerHTML=all.map(tz=>`<option value="${tz}">${tz===local?tz+' (your timezone)':tz}</option>`).join('');
  sel.value=local;
}
