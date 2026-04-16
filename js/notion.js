// ══════════════════════════════════════════════════════════
// NOTION — read-only. Never writes anything.
// ══════════════════════════════════════════════════════════
const Notion = (() => {
  function setState(cls, label) {
    document.getElementById('syncDot').className = `sync-dot ${cls}`;
    document.getElementById('syncLabel').textContent = label;
  }

  async function sync() {
    setState('syncing', 'Syncing...');
    try {
      const res = await fetch('/api/notion?action=list');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { active, done } = await res.json();

      const allIds = new Set([...(active||[]), ...(done||[])].map(i=>i.id));
      Store.tasks = Store.tasks.filter(t => !t.fromNotion || allIds.has(t.id));

      const upsert = items => {
        (items||[]).forEach(nt => {
          const i = Store.tasks.findIndex(t => t.id === nt.id);
          const ex = i >= 0 ? Store.tasks[i] : null;
          const m = {
            id: nt.id, name: nt.name, status: nt.status,
            due: nt.due, description: nt.description, notionUrl: nt.url,
            fromNotion: true,
            category:   ex?.category   ?? Store.guessCat(nt.name),
            classLabel: ex?.classLabel ?? Store.guessClass(nt.name),
            priority:   ex?.priority   ?? 'medium',
            est:        ex?.est        ?? '',
            schedDate:  ex?.schedDate  ?? null,
          };
          if (i >= 0) Store.tasks[i] = m;
          else Store.tasks.push(m);
        });
      };

      upsert(active);
      upsert(done);
      Store.persist();
      App.refresh();

      const t = new Date().toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'});
      setState('ok', `Synced ${t}`);
    } catch(e) {
      setState('err', 'Sync failed');
      console.warn('[Notion]', e.message);
      App.refresh();
    }
  }

  return { sync };
})();
