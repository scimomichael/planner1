// ── WEEK VIEW ─────────────────────────────────────────────────────────
function shiftWeek(dir) { weekOffset += dir; renderWeek(); }

function renderWeek() {
  const days   = weekDays(weekOffset);
  const todStr = todayStr();
  const ws     = days[0];
  const we     = days[6];
  document.getElementById('week-sub').textContent =
    `${ws.toLocaleDateString('en-US',{month:'short',day:'numeric'})} – ${we.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}`;

  document.getElementById('week-grid').innerHTML = days.map(d => {
    const dk      = dateStr(d);
    const isToday = dk === todStr;
    const wkend   = d.getDay()===0 || d.getDay()===6;
    const dayTasks = tasks
      .filter(t => t.due === dk && t.status!=='Done')
      .sort((a,b) => {
        const order = { test:0, hw:1, ec:2, personal:3 };
        return (order[a.category]||9) - (order[b.category]||9);
      });

    const chips = dayTasks.slice(0,5).map(t =>
      `<div class="wk-chip cat-${t.category||'hw'}" title="${esc(t.name)}">${esc(t.name)}</div>`
    ).join('') + (dayTasks.length>5 ? `<div class="wk-chip" style="color:var(--tx4)">+${dayTasks.length-5} more</div>` : '');

    return `
      <div class="wk-col${isToday?' today':''}${wkend?' weekend':''}" onclick="jumpToDay('${dk}')">
        <div class="wk-day">${d.toLocaleDateString('en-US',{weekday:'short'})}</div>
        <div class="wk-num">${d.getDate()}</div>
        <div class="wk-tasks">${chips || '<div style="font-size:11px;color:var(--tx4)">—</div>'}</div>
      </div>`;
  }).join('');
}

// Clicking a week day jumps to Today view with schedule for that day
function jumpToDay(dk) {
  const d    = new Date(dk+'T00:00:00');
  const diff = Math.round((d - todayDate())/86400000);
  schedOffset = diff;
  nav('today');
}
