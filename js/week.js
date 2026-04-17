// ═════════════════════════════════════════════════════════
// WEEK — 7-day grid showing each day's blocks at a glance
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
      // Expand recurring blocks so a "weekly APUSH study" on Monday appears
      // on every Monday in the view, not just the source date.
      const blocks = Sched.blocksForDate(dk);

      const chips = blocks.slice(0, 8).map(b => {
        const clsColor = b.classLabel ? (Store.getClassColor(b.classLabel) || '') : '';
        const style = clsColor ? ` style="border-left:3px solid ${clsColor}"` : '';
        return `<div class="wk-chip"${style}>${Store.esc(b.label)}</div>`;
      });
      if (blocks.length > 8) chips.push(`<div class="wk-chip" style="color:var(--label3)">+${blocks.length - 8} more</div>`);

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
    // Directly compute the offset from today and set it once. The old
    // version called Sched.shift() in a busy loop which re-rendered the
    // schedule N times; this sets it once and renders once.
    const diff = Math.round((new Date(dk + 'T00:00:00') - Store.today()) / 86400000);
    App.nav('today');
    Sched.setOffset(diff);
  }

  return { shift, today, render, jump };
})();
