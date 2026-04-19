// ═════════════════════════════════════════════════════════
// STATS — this week's time breakdown by type and by class
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

    const byType = {};
    const byClass = {};
    let totalMins = 0;
    let totalBlocks = 0;
    let withDue = 0;
    let overdue = 0;
    weekKeys.forEach(dk => {
      const list = Store.schedule[dk] || [];
      list.forEach(b => {
        const m = minsOfBlock(b);
        byType[b.type || 'other'] = (byType[b.type || 'other'] || 0) + m;
        totalMins += m;
        totalBlocks++;
        if (b.classLabel) byClass[b.classLabel] = (byClass[b.classLabel] || 0) + m;
      });
    });

    Object.values(Store.schedule).forEach(list => {
      list.forEach(b => {
        if (b.due) {
          withDue++;
          if (Store.daysUntil(b.due) < 0 && !b.done) overdue++;
        }
      });
    });

    const sortedTypes = Object.entries(byType).sort((a, b) => b[1] - a[1]);
    const sortedClasses = Object.entries(byClass).sort((a, b) => b[1] - a[1]);
    const maxClassMins = sortedClasses.length ? sortedClasses[0][1] : 1;

    const busiestDay = weekKeys.reduce((best, dk) => {
      const count = (Store.schedule[dk] || []).length;
      return count > best.count ? { dk, count } : best;
    }, { dk: null, count: 0 });
    const busiestLabel = busiestDay.dk
      ? new Date(busiestDay.dk + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long' })
      : '—';

    const blocksToday = (Store.schedule[Store.todayStr()] || []).length;

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
          <div class="stat-label">Today</div>
          <div class="stat-value">${blocksToday}</div>
          <div class="stat-sub">blocks scheduled</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">This Week</div>
          <div class="stat-value">${totalBlocks}</div>
          <div class="stat-sub">${totalH}h total</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Assignments</div>
          <div class="stat-value">${withDue}</div>
          <div class="stat-sub">${overdue > 0 ? `<span style="color:var(--red)">${overdue} overdue</span>` : 'All on track'}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Busiest Day</div>
          <div class="stat-value" style="font-size:22px;line-height:1.4">${busiestLabel}</div>
          <div class="stat-sub">${busiestDay.count} block${busiestDay.count === 1 ? '' : 's'}</div>
        </div>
      </div>

      ${sortedTypes.length ? `
      <div class="stats-section">
        <div class="stats-section-title">Time by Type (this week)</div>
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
      </div>` : `<div class="stats-empty">No blocks scheduled this week. Tap <strong>Quick Add</strong> or <strong>New Block</strong> to get started.</div>`}

      ${sortedClasses.length ? `
      <div class="stats-section">
        <div class="stats-section-title">Time by Class (this week)</div>
        <div class="stats-breakdown">
          ${sortedClasses.map(([cls, mins]) => {
            const pct = (mins / maxClassMins) * 100;
            const color = Store.getClassColor(cls) || '#8e8e93';
            return `
              <div class="breakdown-row">
                <span class="breakdown-swatch" style="background:${color}"></span>
                <span class="breakdown-name">${Store.esc(cls)}</span>
                <div class="breakdown-bar">
                  <div class="breakdown-bar-fill" style="width:${pct}%;background:${color}"></div>
                </div>
                <span class="breakdown-value">${fmtMins(mins)}</span>
              </div>
            `;
          }).join('')}
        </div>
      </div>` : ''}
    `;
  }

  return { render };
})();
