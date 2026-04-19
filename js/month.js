// ═════════════════════════════════════════════════════════
// MONTH — 6-week grid
// ═════════════════════════════════════════════════════════
const Month = (() => {
  let year = new Date().getFullYear();
  let month = new Date().getMonth();

  function shift(dir) {
    month += dir;
    if (month < 0) { month = 11; year--; }
    if (month > 11) { month = 0; year++; }
    render();
  }
  function today() {
    const d = new Date();
    year = d.getFullYear();
    month = d.getMonth();
    render();
  }

  function render() {
    const grid = document.getElementById('monthGrid');
    if (!grid) return;
    const startDay = Settings.get ? Number(Settings.get('sWeekStart', 0)) : 0;
    const days = Store.monthDays(year, month, startDay);
    const todayStr = Store.todayStr();

    const label = document.getElementById('monthLabel');
    if (label) {
      const first = new Date(year, month, 1);
      label.textContent = first.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    }

    const dowLabels = [];
    const baseDow = startDay;
    const namesSun = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    for (let i = 0; i < 7; i++) dowLabels.push(namesSun[(baseDow + i) % 7]);

    let html = dowLabels.map(n => `<div class="mo-dow">${n}</div>`).join('');

    days.forEach(d => {
      const dk = Store.toStr(d);
      const isOth = d.getMonth() !== month;
      const isToday = dk === todayStr;
      const dow = d.getDay();
      const isWeekend = dow === 0 || dow === 6;

      // Include recurring instances so they show up on every applicable day.
      const blocks = Sched.blocksForDate(dk);
      const chips = blocks.slice(0, 5).map(b => {
        const clsColor = b.classLabel ? (Store.getClassColor(b.classLabel) || '') : '';
        const style = clsColor ? ` style="border-left:2px solid ${clsColor}"` : '';
        return `<div class="mo-chip mo-block"${style} title="${Store.esc(b.label)}">${Store.esc(b.label)}</div>`;
      });
      if (blocks.length > 5) chips.push(`<div class="mo-more">+${blocks.length - 5} more</div>`);

      html += `
        <div class="mo-cell${isOth ? ' mo-oth' : ''}${isToday ? ' mo-today' : ''}${isWeekend ? ' mo-weekend' : ''}"
             onclick="Month.jump('${dk}')">
          <div class="mo-dnum">${d.getDate()}</div>
          ${chips.join('')}
        </div>
      `;
    });

    grid.innerHTML = html;
  }

  function jump(dk) {
    // Clean single-shot offset set instead of busy-loop shifting.
    const diff = Math.round((new Date(dk + 'T00:00:00') - Store.today()) / 86400000);
    App.nav('today');
    Sched.setOffset(diff);
  }

  return { shift, today, render, jump };
})();
