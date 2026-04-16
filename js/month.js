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

      const blocks = Store.schedule[dk] || [];
      const tasks = Store.tasks.filter(t => t.status !== 'Done' && (t.due === dk || t.schedDate === dk));

      const all = [
        ...tasks.slice(0, 3).map(t =>
          `<div class="mo-chip mo-task cat-${t.category||'hw'}" title="${Store.esc(t.name)}">${Store.esc(t.name)}</div>`
        ),
        ...blocks.slice(0, 2).map(b =>
          `<div class="mo-chip mo-block" title="${Store.esc(b.label)}">${Store.esc(b.label)}</div>`
        ),
      ];
      const extra = Math.max(0, (tasks.length - 3) + (blocks.length - 2));
      if (extra > 0) all.push(`<div class="mo-more">+${extra} more</div>`);

      html += `
        <div class="mo-cell${isOth ? ' mo-oth' : ''}${isToday ? ' mo-today' : ''}${isWeekend ? ' mo-weekend' : ''}"
             onclick="Month.jump('${dk}')">
          <div class="mo-dnum">${d.getDate()}</div>
          ${all.join('')}
        </div>
      `;
    });

    grid.innerHTML = html;
  }

  function jump(dk) {
    const diff = Math.round((new Date(dk + 'T00:00:00') - Store.today()) / 86400000);
    App.nav('today');
    while (Sched.getOffset() !== 0) Sched.shift(Sched.getOffset() > 0 ? -1 : 1);
    if (diff !== 0) Sched.shift(diff);
  }

  return { shift, today, render, jump };
})();
