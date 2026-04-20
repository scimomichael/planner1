// Calendar subscription sync module
const Cal = (() => {
  // Recurring school events the user wants filtered out on every sync.
  // Matching is fuzzy: we lowercase, strip punctuation/parens/asterisks,
  // collapse whitespace, then check if any normalized pattern is a substring
  // of the event title. This catches small wording/formatting variants.
  const FILTERED_PATTERNS = [
    'junior advisory activity',
    'junior advisory',
    'daily worship',
    'unproctored spring sh',
    'unproctored fall sh',
    'unproctored spring study hall',
    'unproctored fall study hall',
  ];

  function normalize(s) {
    return (s || '')
      .toLowerCase()
      .replace(/[()[\]{}*]/g, ' ')      // strip brackets and asterisks
      .replace(/[_\-\/\\.,;:!?]/g, ' ') // strip common punctuation
      .replace(/\s+/g, ' ')             // collapse whitespace
      .trim();
  }

  function isFiltered(title) {
    const n = normalize(title);
    if (!n) return false;
    for (const pat of FILTERED_PATTERNS) {
      if (n.includes(pat)) return true;
    }
    // Also catch bare "DW" acronym on its own (the shorthand for Daily Worship)
    if (/\bdw\b/.test(n) && n.length <= 6) return true;
    return false;
  }

  async function syncSub(sub) {
    if (!sub || !sub.url) return;
    try {
      const res = await fetch('/api/ical', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: sub.url, secret: sub.secret || '' }),
      });
      if (!res.ok) { Store.toast('Sync failed: ' + res.status); return; }
      const data = await res.json();
      if (!data.events || !Array.isArray(data.events)) { Store.toast('No events found'); return; }

      const todayStr = Store.todayStr();
      let added = 0, skipped = 0, filtered = 0;

      for (const ev of data.events) {
        if (!ev.date || !ev.start) continue;

        // Skip past events
        if (ev.date < todayStr) continue;

        // Filter out recurring school events
        if (isFiltered(ev.summary)) { filtered++; continue; }

        const uid = ev.uid || `${sub.id}_${ev.date}_${ev.start}`;

        // Skip tombstoned (user-deleted) events
        if (Store.isCalTombstoned(uid)) { skipped++; continue; }

        // Check if block with this importUid already exists on this date
        const existing = Store.schedule[ev.date] || [];
        const alreadyIdx = existing.findIndex(b => b.importUid === uid);

        if (alreadyIdx >= 0) {
          // Don't overwrite user-edited blocks
          if (existing[alreadyIdx].userEdited) { skipped++; continue; }
          // Update non-user-edited in place
          existing[alreadyIdx] = {
            ...existing[alreadyIdx],
            label: ev.summary || 'Event',
            start: ev.start,
            end: ev.end || ev.start,
            description: ev.description || existing[alreadyIdx].description,
            location: ev.location || existing[alreadyIdx].location,
          };
          skipped++;
          continue;
        }

        // Add new
        const type = sub.defaultType || 'other';
        const css = Sched.getBlockTypes().find(t => t.id === type)?.css || 'sb-other';
        if (!Store.schedule[ev.date]) Store.schedule[ev.date] = [];
        Store.schedule[ev.date].push({
          label: ev.summary || 'Event',
          type,
          css,
          start: ev.start,
          end: ev.end || ev.start,
          due: null,
          classLabel: '',
          description: ev.description || '',
          storedTz: Sched.getLocalTz(),
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

      // Cleanup pass: remove any previously-imported blocks from THIS
      // subscription whose titles match the filter. This scrubs events
      // imported in an older version before the filter existed.
      let cleaned = 0;
      Object.keys(Store.schedule).forEach(dk => {
        const list = Store.schedule[dk];
        if (!list) return;
        for (let i = list.length - 1; i >= 0; i--) {
          const b = list[i];
          if (b.importSubId === sub.id && !b.userEdited && isFiltered(b.label)) {
            // Tombstone so future syncs also don't bring it back
            if (b.importUid) Store.recordCalSubDeletion(b.importUid);
            list.splice(i, 1);
            cleaned++;
          }
        }
      });

      Store.updateCalSub(sub.id, { lastSync: Date.now() });
      Store.persist();
      if (typeof App !== 'undefined') App.refresh();

      const parts = [`${added} added`, `${skipped} unchanged`];
      if (filtered) parts.push(`${filtered} filtered`);
      if (cleaned) parts.push(`${cleaned} cleaned`);
      Store.toast(`Synced ${sub.name}: ${parts.join(', ')}`);
    } catch (e) {
      Store.toast('Calendar sync error: ' + e.message);
    }
  }

  async function syncAll() {
    for (const sub of Store.getCalSubs()) { await syncSub(sub); }
  }

  return { syncSub, syncAll, isFiltered };
})();
