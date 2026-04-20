// Calendar subscription sync module
// SAFETY CONTRACT:
//   1. The filter only affects incoming events. It never reads or modifies
//      existing blocks in Store.schedule beyond the update-in-place path
//      that matches on importUid.
//   2. Imports NEVER get a classLabel (they are not linked to any of the
//      user's tagged classes like AP Biology), but they CAN use the
//      'class' block type so they display with blue Class coloring.
//   3. Sync is idempotent. Auto-sync every page load doesn't compound
//      data loss.
//   4. Filtered events are NOT tombstoned. If the filter list changes
//      later, previously-filtered events will import normally on next sync.
//   5. User-edited imported blocks (userEdited: true) are never overwritten.
const Cal = (() => {
  const FILTERED_PATTERNS = [
    'junior advisory activity',
    'daily worship',
    'unproctored spring sh',
    'unproctored fall sh',
    'unproctored spring study hall',
    'unproctored fall study hall',
  ];

  function _normalize(s) {
    return (s || '')
      .toLowerCase()
      .replace(/[()[\]{}*"']/g, ' ')
      .replace(/[_\/\\.,;:!?]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function isFiltered(title) {
    const n = _normalize(title);
    if (!n) return false;
    for (const pat of FILTERED_PATTERNS) {
      if (n === pat) return true;
      if (n.length > pat.length && n.startsWith(pat)) {
        const next = n[pat.length];
        if (next === ' ' || next === '-') return true;
      }
    }
    return false;
  }

  async function syncSub(sub) {
    if (!sub || !sub.url) return;
    try {
      const tz = (typeof Sched !== 'undefined' && Sched.getLocalTz) ? Sched.getLocalTz() : 'America/Chicago';
      const res = await fetch('/api/ical', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: sub.url, secret: sub.secret || '', tz }),
      });
      if (!res.ok) {
        let msg = 'Sync failed: ' + res.status;
        try { const j = await res.json(); if (j && j.error) msg = 'Sync: ' + j.error; } catch {}
        Store.toast(msg);
        return;
      }
      const data = await res.json();
      if (!data.events || !Array.isArray(data.events)) {
        Store.toast('No events found');
        return;
      }

      const todayStr = Store.todayStr();
      let added = 0, updated = 0, skipped = 0, filtered = 0;

      // Import type for this subscription. Imports use the subscription's
      // configured type (class, other, exam, etc.) -- so if the user picked
      // Class for their school calendar, those events show up blue.
      // Imports NEVER carry a classLabel though.
      const importType = sub.defaultType || 'class';
      const importCss = Sched.getBlockTypes().find(t => t.id === importType)?.css || 'sb-class';

      for (const ev of data.events) {
        if (!ev.date || !ev.start) continue;
        if (ev.date < todayStr) continue;
        if (isFiltered(ev.summary)) { filtered++; continue; }

        const uid = ev.uid || `${sub.id}_${ev.date}_${ev.start}`;
        if (Store.isCalTombstoned(uid)) { skipped++; continue; }

        const existing = Store.schedule[ev.date] || [];
        const alreadyIdx = existing.findIndex(b => b.importUid === uid);

        if (alreadyIdx >= 0) {
          // Don't overwrite user-edited blocks
          if (existing[alreadyIdx].userEdited) { skipped++; continue; }
          const prev = existing[alreadyIdx];
          // Re-sync authoritative feed fields AND correct any stale type/classLabel
          // from previous broken versions. type resets to sub default; classLabel ''
          existing[alreadyIdx] = {
            ...prev,
            label: ev.summary || 'Event',
            start: ev.start,
            end: ev.end || ev.start,
            description: ev.description || prev.description || '',
            location: ev.location || prev.location || '',
            classLabel: '',         // imports never carry a class label
            type: importType,
            css: importCss,
          };
          updated++;
          continue;
        }

        // Add new block
        if (!Store.schedule[ev.date]) Store.schedule[ev.date] = [];
        Store.schedule[ev.date].push({
          label: ev.summary || 'Event',
          type: importType,
          css: importCss,
          start: ev.start,
          end: ev.end || ev.start,
          due: null,
          classLabel: '',
          description: ev.description || '',
          storedTz: tz,
          recur: null,
          recurUntil: null,
          done: false,
          importUid: uid,
          importSubId: sub.id,
          userEdited: false,
          location: ev.location || '',
          link: '',
          priority: '',
          status: 'scheduled',
        });
        added++;
      }

      Store.updateCalSub(sub.id, { lastSync: Date.now() });
      Store.persist();
      if (typeof App !== 'undefined' && App.refresh) App.refresh();

      const changed = added + updated;
      if (changed === 0 && filtered === 0 && skipped === 0) return;
      const parts = [];
      if (added) parts.push(`${added} added`);
      if (updated) parts.push(`${updated} updated`);
      if (filtered) parts.push(`${filtered} filtered`);
      if (skipped) parts.push(`${skipped} unchanged`);
      Store.toast(`${sub.name}: ${parts.join(', ')}`);
    } catch (e) {
      Store.toast('Calendar sync error: ' + (e.message || e));
    }
  }

  async function syncAll() {
    const subs = Store.getCalSubs() || [];
    for (const sub of subs) { await syncSub(sub); }
  }

  return { syncSub, syncAll, isFiltered };
})();
