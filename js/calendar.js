// ═════════════════════════════════════════════════════════
// CALENDAR — iCal / Google Calendar import
// ═════════════════════════════════════════════════════════
//
// Flow:
//   1. User adds a subscription (URL + label + default block type) via Settings
//   2. Cal.syncSub(id) POSTs to /api/ical, receives parsed events
//   3. Each event is upserted into the schedule:
//      - New event → create block, tag with importSource=subId, importUid=event.uid
//      - Existing event → update time/label from feed, keep user's type/class
//        if they edited it (userEdited flag)
//      - Event deleted from feed → remove block if not userEdited; keep if userEdited
//   4. UI shows "imported" badge on these blocks in the schedule view
//
// Imported blocks remain fully editable. Once a user edits type or class on an
// imported block, we set userEdited=true on it so future re-syncs don't stomp
// those changes.
const Cal = (() => {

  function isImported(block) {
    return !!(block && block.importSource);
  }

  // Convert ISO datetime string → { dk, hhmm } in local time.
  function _isoToLocal(iso) {
    const d = new Date(iso);
    if (isNaN(d)) return null;
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const da = String(d.getDate()).padStart(2, '0');
    const h = String(d.getHours()).padStart(2, '0');
    const mi = String(d.getMinutes()).padStart(2, '0');
    return { dk: `${y}-${m}-${da}`, hhmm: `${h}:${mi}` };
  }

  async function syncSub(id) {
    const sub = Store.getCalSub(id);
    if (!sub) return { ok: false, error: 'Subscription not found' };
    if (!sub.url) return { ok: false, error: 'Missing URL' };

    Store.updateCalSub(id, { lastError: '' });
    let data;
    try {
      const res = await fetch('/api/ical', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: sub.url }),
      });
      data = await res.json().catch(() => null);
      if (!res.ok) {
        const msg = (data && data.error) ? data.error : `Server returned ${res.status}`;
        Store.updateCalSub(id, { lastError: msg, lastSynced: Date.now() });
        return { ok: false, error: msg };
      }
    } catch (e) {
      const msg = e.message || String(e);
      Store.updateCalSub(id, { lastError: msg, lastSynced: Date.now() });
      return { ok: false, error: msg };
    }

    const events = (data && Array.isArray(data.events)) ? data.events : [];
    const deletedUids = Array.isArray(sub.deletedUids) ? sub.deletedUids : [];

    // Only consider events ending today or later. Anything in the past is
    // not re-imported. Events Michael has already attended/handled stay as
    // they are in his schedule and won't be stomped or re-added.
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // Build UID set for this feed so we can reap deleted events.
    const seenUids = new Set();
    let added = 0, updated = 0, skipped = 0;

    for (const ev of events) {
      if (!ev.start || !ev.uid) continue;
      seenUids.add(ev.uid);
      // User previously deleted this event. Honor that — do not resurrect.
      if (deletedUids.includes(ev.uid)) { skipped++; continue; }
      // Past events: don't create or update. Future-anchored feed only.
      const endDate = ev.end ? new Date(ev.end) : new Date(ev.start);
      if (endDate < startOfToday) { skipped++; continue; }

      const startLocal = _isoToLocal(ev.start);
      if (!startLocal) { skipped++; continue; }

      let endLocal = ev.end ? _isoToLocal(ev.end) : null;
      // Feed events without end → default to 1 hour.
      let startHHMM = startLocal.hhmm;
      let endHHMM;
      if (endLocal && endLocal.dk === startLocal.dk) {
        endHHMM = endLocal.hhmm;
      } else {
        // All-day event or crosses midnight — anchor it to 08:00 for 1hr so
        // it's visible. User can edit later.
        if (ev.allDay) {
          startHHMM = '08:00';
          endHHMM = '09:00';
        } else {
          // cross-midnight: clamp to 23:59 same day
          endHHMM = '23:59';
        }
      }

      // Does a block from this sub with this uid already exist?
      const existing = _findImportedBlock(id, ev.uid);
      const label = ev.summary || '(no title)';
      const location = ev.location || '';

      if (existing) {
        // Move the block if date changed
        if (existing.dk !== startLocal.dk) {
          _removeBlockAt(existing.dk, existing.block.id);
          const nb = _buildBlock({
            sub, ev, uid: ev.uid, label, location,
            start: startHHMM, end: endHHMM,
            preserved: existing.block,
          });
          _insertBlockAt(startLocal.dk, nb);
          updated++;
        } else {
          // Update time/label/location. Preserve type/class if user edited.
          const b = existing.block;
          if (!b.userEdited) {
            b.type = sub.defaultType || b.type || 'other';
            const types = Sched.getBlockTypes();
            const match = types.find(t => t.id === b.type);
            b.css = match ? match.css : 'sb-other';
          }
          b.label = label;
          b.location = location;
          b.start = startHHMM;
          b.end = endHHMM;
          updated++;
        }
      } else {
        const nb = _buildBlock({
          sub, ev, uid: ev.uid, label, location,
          start: startHHMM, end: endHHMM,
          preserved: null,
        });
        _insertBlockAt(startLocal.dk, nb);
        added++;
      }
    }

    // Reap: any FUTURE block tagged with this sub whose uid is no longer in
    // the feed and was not user-edited → delete it. Past blocks are kept as
    // historical record.
    let removed = 0;
    const sched = Store.schedule;
    const todayStr = Store.todayStr();
    for (const dk in sched) {
      const list = sched[dk];
      const kept = [];
      for (const b of list) {
        const isPast = dk < todayStr;
        if (b.importSource === id && b.importUid
            && !seenUids.has(b.importUid)
            && !b.userEdited
            && !isPast) {
          removed++;
          continue;
        }
        kept.push(b);
      }
      if (kept.length) sched[dk] = kept; else delete sched[dk];
    }

    Store.updateCalSub(id, {
      lastSynced: Date.now(),
      lastCount: events.length,
      lastError: '',
    });
    Store.persist();
    if (typeof App !== 'undefined') App.refresh();

    return { ok: true, added, updated, removed, skipped, total: events.length };
  }

  function _buildBlock({ sub, ev, uid, label, location, start, end, preserved }) {
    const types = Sched.getBlockTypes();
    const typeId = (preserved && preserved.userEdited ? preserved.type : sub.defaultType) || 'other';
    const match = types.find(t => t.id === typeId);
    const css = match ? match.css : 'sb-other';
    const block = {
      id: 'b_' + Math.random().toString(36).slice(2),
      label,
      start,
      end,
      type: typeId,
      css,
      classLabel: preserved ? (preserved.classLabel || '') : '',
      location: location || '',
      description: ev.description || '',
      importSource: sub.id,
      importUid: uid,
      userEdited: preserved ? !!preserved.userEdited : false,
    };
    return block;
  }

  function _findImportedBlock(subId, uid) {
    const sched = Store.schedule;
    for (const dk in sched) {
      for (const b of sched[dk]) {
        if (b.importSource === subId && b.importUid === uid) {
          return { dk, block: b };
        }
      }
    }
    return null;
  }
  function _removeBlockAt(dk, blockId) {
    const sched = Store.schedule;
    if (!sched[dk]) return;
    sched[dk] = sched[dk].filter(b => b.id !== blockId);
    if (!sched[dk].length) delete sched[dk];
  }
  function _insertBlockAt(dk, block) {
    const sched = Store.schedule;
    if (!sched[dk]) sched[dk] = [];
    sched[dk].push(block);
    sched[dk].sort((a, b) => (a.start || '').localeCompare(b.start || ''));
  }

  async function syncAll() {
    const subs = Store.getCalSubs();
    const results = [];
    for (const s of subs) {
      const r = await syncSub(s.id);
      results.push({ id: s.id, label: s.label, ...r });
    }
    return results;
  }

  return { syncSub, syncAll, isImported };
})();
