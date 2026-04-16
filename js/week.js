// ═══════════════════════════════════════════════════════
// WEEK VIEW
// ═══════════════════════════════════════════════════════

const Week = (() => {
  let offset = 0;

  function shift(dir) { offset += dir; render(); }

  function render() {
    const days   = Store.weekDays(offset);
    const todStr = Store.todayStr();
    const ws     = days[0];
    const we     = days[6];

    document.getElementById('weekLabel').textContent =
      `${ws.toLocaleDateString('en-US',{month:'short',day:'numeric'})} – ${we.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}`;

    const PRI = { test:0, hw:1, ec:2, personal:3 };

    document.getElementById('weekGrid').innerHTML = days.map(d => {
      const dk      = Store.toStr(d);
      const isToday = dk === todStr;
      const isWeekend = d.getDay() === 0 || d.getDay() === 6;

      const dayTasks = Store.tasks
        .filter(t => t.due === dk && t.status !== 'Done')
        .sort((a,b) => (PRI[a.category]||9) - (PRI[b.category]||9));

      const chips = dayTasks.slice(0,5).map(t =>
        `<div class="wk-chip ${t.category||'hw'}" title="${Store.esc(t.name)}">${Store.esc(t.name)}</div>`
      ).join('') + (dayTasks.length > 5
        ? `<div class="wk-chip" style="color:var(--text-ghost)">+${dayTasks.length-5} more</div>`
        : '');

      return `
        <div class="wk-day${isToday?' is-today':''}${isWeekend?' is-weekend':''}" onclick="Week.jumpTo('${dk}')">
          <div class="wk-day-label">${d.toLocaleDateString('en-US',{weekday:'short'})}</div>
          <div class="wk-day-num">${d.getDate()}</div>
          <div class="wk-tasks-list">
            ${chips || '<div style="font-size:11px;color:var(--text-ghost)">—</div>'}
          </div>
        </div>`;
    }).join('');
  }

  function jumpTo(dk) {
    const d    = new Date(dk + 'T00:00:00');
    const diff = Math.round((d - Store.today()) / 86400000);
    // Set schedule offset and nav to today
    Schedule.shift(diff - Schedule.getOffset());
    App.nav('today');
  }

  return { shift, render, jumpTo };
})();
