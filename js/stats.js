// ═════════════════════════════════════════════════════════
// STATS — this week's time breakdown, task completion, etc
// ═════════════════════════════════════════════════════════
const Stats = (() => {
  const BLOCK_COLORS = {
    class: '#007aff', meeting: '#5ac8fa', study: '#af52de',
    ec: '#34c759', free: '#8e8e93', meal: '#ff9500',
    sleep: '#5856d6', work: '#ff2d55', other: '#8e8e93',
  };
  const BLOCK_LABELS = {
    class: 'Class', meeting: 'Meeting', study: 'Study',
    ec: 'Extracurricular', free: 'Free', meal: 'Meal',
    sleep: 'Sleep', work: 'Work', other: 'Other',
  };

  function minsOfBlock(b) {
    if (!b.start || !b.end) return 0;
    const [sh, sm] = b.start.split(':').map(Number);
    const [eh, em] = b.end.split(':').map(Number);
    let mins = (eh * 60 + em) - (sh * 60 + sm);
    if (mins < 0) mins += 24 * 60;
    return mins;
  }

  function render() {
    const el = document.getElementById('statsContent');
    if (!el) return;

    const startDay = Settings.get ? Number(Settings.get('sWeekStart', 0)) : 0;
    const weekDays = Store.weekDays(0, startDay);
    const weekKeys = weekDays.map(d => Store.toStr(d));

    // Time by type across the week
    const byType = {};
    let totalMins = 0;
    weekKeys.forEach(dk => {
      const list = Store.schedule[dk] || [];
      list.forEach(b => {
        const m = minsOfBlock(b);
        byType[b.type || 'other'] = (byType[b.type || 'other'] || 0) + m;
        totalMins += m;
      });
    });
    const sortedTypes = Object.entries(byType).sort((a, b) => b[1] - a[1]);

    // Task stats
    const allTasks = Store.tasks.length;
    const doneTasks = Store.tasks.filter(t => t.status === 'Done').length;
    const progTasks = Store.tasks.filter(t => t.status === 'In progress').length;
    const overdueTasks = Store.tasks.filter(t => {
      if (t.status === 'Done' || !t.due) return false;
      return Store.daysUntil(t.due) < 0;
    }).length;
    const todayTasks = Store.tasks.filter(t =>
      t.status !== 'Done' && (t.due === Store.todayStr() || t.schedDate === Store.todayStr())
    ).length;
    const doneRate = allTasks ? Math.round((doneTasks / allTasks) * 100) : 0;

    // Busy days this week
    const busiestDay = weekKeys.reduce((best, dk) => {
      const count = (Store.schedule[dk] || []).length;
      return count > best.count ? { dk, count } : best;
    }, { dk: null, count: 0 });
    const busiestLabel = busiestDay.dk
      ? new Date(busiestDay.dk + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long' })
      : '—';

    // Blocks today
    const blocksToday = (Store.schedule[Store.todayStr()] || []).length;

    // Class distribution
    const byClass = {};
    Store.tasks.forEach(t => {
      if (!t.classLabel) return;
      byClass[t.classLabel] = (byClass[t.classLabel] || 0) + 1;
    });
    const sortedClasses = Object.entries(byClass).sort((a, b) => b[1] - a[1]);
    const maxClass = sortedClasses.length ? sortedClasses[0][1] : 1;

    const fmtMins = m => {
      if (m === 0) return '0m';
      const h = Math.floor(m / 60);
      const mm = m % 60;
      return (h ? `${h}h ` : '') + (mm ? `${mm}m` : '');
    };
    const totalH = Math.round(totalMins / 60);

    el.innerHTML = `
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-label">Tasks Today</div>
          <div class="stat-value">${todayTasks}</div>
          <div class="stat-sub">${blocksToday} scheduled blocks</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Completion Rate</div>
          <div class="stat-value">${doneRate}%</div>
          <div class="stat-sub">${doneTasks} of ${allTasks} done</div>
          <div class="stat-bar"><div class="stat-bar-fill" style="width:${doneRate}%"></div></div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Overdue</div>
          <div class="stat-value" style="color:${overdueTasks > 0 ? 'var(--red)' : 'var(--label)'}">${overdueTasks}</div>
          <div class="stat-sub">${progTasks} in progress</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Weekly Time</div>
          <div class="stat-value">${totalH}<span style="font-size:20px;color:var(--label3)">h</span></div>
          <div class="stat-sub">Busiest: ${busiestLabel}</div>
        </div>
      </div>

      ${sortedTypes.length ? `
      <div class="stats-section">
        <div class="stats-section-title">Time Breakdown (this week)</div>
        <div class="stats-breakdown">
          ${sortedTypes.map(([type, mins]) => {
            const pct = totalMins ? (mins / totalMins) * 100 : 0;
            const color = BLOCK_COLORS[type] || '#8e8e93';
            return `
              <div class="breakdown-row">
                <span class="breakdown-swatch" style="background:${color}"></span>
                <span class="breakdown-name">${BLOCK_LABELS[type] || type}</span>
                <div class="breakdown-bar">
                  <div class="breakdown-bar-fill" style="width:${pct}%;background:${color}"></div>
                </div>
                <span class="breakdown-value">${fmtMins(mins)}</span>
              </div>
            `;
          }).join('')}
        </div>
      </div>` : ''}

      ${sortedClasses.length ? `
      <div class="stats-section">
        <div class="stats-section-title">Tasks by Class</div>
        <div class="stats-breakdown">
          ${sortedClasses.map(([cls, count]) => {
            const pct = (count / maxClass) * 100;
            return `
              <div class="breakdown-row">
                <span class="breakdown-swatch" style="background:var(--blue)"></span>
                <span class="breakdown-name">${Store.esc(cls)}</span>
                <div class="breakdown-bar">
                  <div class="breakdown-bar-fill" style="width:${pct}%;background:var(--blue)"></div>
                </div>
                <span class="breakdown-value">${count}</span>
              </div>
            `;
          }).join('')}
        </div>
      </div>` : ''}
    `;
  }

  return { render };
})();
