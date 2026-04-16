// ═════════════════════════════════════════════════════════
// WEEK — 7-day grid with blocks+tasks per day
// ═════════════════════════════════════════════════════════
const Week = (() => {
  let offset = 0;

  function shift(dir) { offset += dir; render(); }
  function today() { offset = 0; render(); }

  function render() {
    const grid = document.getElementById('weekGrid');
    if (!grid) return;
    const startDay = Settings.get ? Number(Settings.get('sWeekStart', 0)) : 0;
    const days = Store.weekDays(offset, startDay);
    const todayStr = Store.todayStr();

    const first = days[0], last = days[6];
    const label = document.getElementById('weekLabel');
    if (label) {
      const fmt = d => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      label.textContent = `${fmt(first)} – ${fmt(last)}, ${last.getFullYear()}`;
    }

    grid.innerHTML = days.map(d => {
      const dk = Store.toStr(d);
      const isToday = dk === todayStr;
      const dow = d.getDay();
      const isWeekend = dow === 0 || dow === 6;
      const blocks = Store.schedule[dk] || [];
      const taskToday = Store.tasks.filter(t =>
        t.status !== 'Done' && (t.due === dk || t.schedDate === dk)
      );

      const chips = [
        ...blocks.slice(0, 4).map(b =>
          `<div class="wk-chip">${Store.esc(b.label)}</div>`
        ),
        ...taskToday.slice(0, 4).map(t =>
          `<div class="wk-chip cat-${t.category||'hw'}">${Store.esc(t.name)}</div>`
        )
      ];
      const total = blocks.length + taskToday.length;
      if (total > 8) chips.push(`<div class="wk-chip" style="color:var(--label3)">+${total - 8} more</div>`);

      return `
        <div class="wk-day${isToday ? ' wk-today' : ''}${isWeekend ? ' wk-weekend' : ''}"
             onclick="Week.jump('${dk}')">
          <div class="wk-dname">${d.toLocaleDateString('en-US', { weekday: 'short' })}</div>
          <div class="wk-dnum">${d.getDate()}</div>
          <div class="wk-chips">${chips.join('')}</div>
        </div>`;
    }).join('');
  }

  function jump(dk) {
    const diff = Math.round((new Date(dk + 'T00:00:00') - Store.today()) / 86400000);
    // Set Today view offset
    App.nav('today');
    // reset and apply
    while (Sched.getOffset() !== 0) Sched.shift(Sched.getOffset() > 0 ? -1 : 1);
    if (diff !== 0) Sched.shift(diff);
  }

  return { shift, today, render, jump };
})();
