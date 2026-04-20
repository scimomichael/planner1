// Calendar subscription sync module
// SAFETY CONTRACT:
//  1. The filter only affects incoming events during import. It NEVER
//     reaches into Store.schedule to delete or modify blocks that already
//     exist there. Manual deletion via Sched.removeBlock remains the only
//     path that removes blocks (and records tombstones).
//  2. Filtering is strict: the normalized title must EXACTLY equal a
//     pattern, or start with "<pattern> " / "<pattern>-" / "<pattern>(".
//     No loose substring matching anywhere.
//  3. Sync is idempotent. Running it repeatedly (including on every page
//     load) never compounds data loss.
//  4. Filtered events are NOT tombstoned. If the filter list changes
//     later, previously-filtered events will import normally.
const Cal = (() => {
  // The specific recurring school events the user wants excluded. Add more
  // here any time. Case-insensitive, punctuation-insensitive.
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
      .replace(/[()[\]{}*"']/g, ' ')     // strip brackets, asterisks, quotes
      .replace(/[_\/\\.,;:!?]/g, ' ')   // strip common punctuation (NOT dashes)
      .replace(/\s+/g, ' ')
      .trim();
  }

  // Strict match. Exact equality OR the pattern followed by a natural
  // separator (space, dash, paren-ish, slash). This catches titles like:
  //   "Daily Worship"
  //   "Daily Worship (DW)"           -> normalized "daily worship  dw"
  //   "Daily Worship - Chapel"       -> normalized "daily worship - chapel"
  //   "Unproctored Spring SH* (M)"   -> normalized "unproctored spring sh   m"
  // but NOT:
  //   "Advisory Meeting"
  //   "Pre-Junior Advisory Activity" (because pattern would have to be at start)
  function isFiltered(title) {
    const n = _normalize(title);
    if (!n) return false;
    for (const pat of FILTERED_PATTERNS) {
      if (n === pat) return true;
      // Must start with the pattern AND be followed by a separator char
      // (space or dash). If the pattern is followed by a letter/digit, that
      // means it's a different word and we do NOT filter.
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
      const res = await fetch('/api/ical', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: sub.url, secret: sub.secret || '' }),
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

      for (const ev of data.events) {
        if (!ev.date || !ev.start) continue;

        // Skip past events
        if (ev.date < todayStr) continue;

        // Filter recurring school events (applies to NEW imports only)
        if (isFiltered(ev.summary)) { filtered++; continue; }

        const uid = ev.uid || `${sub.id}_${ev.date}_${ev.start}`;

        // Skip tombstoned (user-deleted) events
        if (Store.isCalTombstoned(uid)) { skipped++; continue; }

        // Check if this block already exists on this date
        const existing = Store.schedule[ev.date] || [];
        const alreadyIdx = existing.findIndex(b => b.importUid === uid);

        if (alreadyIdx >= 0) {
          // Don't overwrite user-edited blocks
          if (existing[alreadyIdx].userEdited) { skipped++; continue; }
          // Update non-user-edited in place (fresh title/time/location/desc)
          existing[alreadyIdx] = {
            ...existing[alreadyIdx],
            label: ev.summary || 'Event',
            start: ev.start,
            end: ev.end || ev.start,
            description: ev.description || existing[alreadyIdx].description || '',
            location: ev.location || existing[alreadyIdx].location || '',
          };
          updated++;
          continue;
        }

        // Add new block
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

      Store.updateCalSub(sub.id, { lastSync: Date.now() });
      Store.persist();
      if (typeof App !== 'undefined' && App.refresh) App.refresh();

      // Build concise toast. On auto-sync (boot), stay quiet if nothing changed.
      const changed = added + updated;
      if (changed === 0 && filtered === 0 && skipped === 0) {
        // truly nothing happened; don't toast
        return;
      }
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
