// ═══════════════════════════════════════════════════════
// NOTION — read-only sync
// Never writes to Notion. Status changes are local only.
// ═══════════════════════════════════════════════════════

const Notion = (() => {
  const API = '/api/notion?action=list';

  function setSyncState(state, label) {
    const dot = document.getElementById('syncDot');
    const lbl = document.getElementById('syncLabel');
    dot.className = `sync-dot ${state}`;
    lbl.textContent = label;
  }

  async function sync() {
    setSyncState('syncing', 'Syncing...');
    try {
      const res = await fetch(API);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { active, done } = await res.json();

      const allNotionIds = new Set([
        ...(active||[]).map(i=>i.id),
        ...(done||[]).map(i=>i.id),
      ]);

      // Remove stale Notion tasks
      Store.tasks = Store.tasks.filter(t => !t.fromNotion || allNotionIds.has(t.id));

      // Upsert — preserve local enrichments (category, class, priority, est)
      const upsert = (items) => {
        (items||[]).forEach(nt => {
          const idx = Store.tasks.findIndex(t => t.id === nt.id);
          const existing = idx >= 0 ? Store.tasks[idx] : null;
          const merged = {
            id:          nt.id,
            name:        nt.name,
            status:      nt.status,
            due:         nt.due,
            description: nt.description,
            notionUrl:   nt.url,
            fromNotion:  true,
            // Preserve local enrichment
            category:    existing?.category   ?? Store.guessCategory(nt.name),
            classLabel:  existing?.classLabel  ?? Store.guessClass(nt.name),
            priority:    existing?.priority    ?? 'medium',
            est:         existing?.est         ?? '',
          };
          if (idx >= 0) Store.tasks[idx] = merged;
          else Store.tasks.push(merged);
        });
      };

      upsert(active);
      upsert(done);

      Store.persist();
      App.refresh();

      const t = new Date().toLocaleTimeString('en-US', { hour:'numeric', minute:'2-digit' });
      setSyncState('ok', `Synced ${t}`);
    } catch(e) {
      setSyncState('err', 'Sync failed');
      console.warn('[Notion]', e.message);
      App.refresh();
    }
  }

  return { sync };
})();
