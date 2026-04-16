// ── NOTION SYNC ──────────────────────────────────────────────────────
const API = '/api/notion';

function setSyncState(state, msg) {
  const dot = document.getElementById('sync-dot');
  const lbl = document.getElementById('sync-label');
  dot.className = 'sync-dot' + (state === 'syncing' ? ' syncing' : state === 'err' ? ' err' : '');
  lbl.textContent = msg;
}

// Auto-sync on load + manual button
async function syncFromNotion() {
  setSyncState('syncing', 'Syncing...');
  try {
    const res = await fetch(API + '?action=list');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const { items, done: doneItems } = await res.json();

    // All Notion IDs we just fetched
    const activeIds = new Set(items.map(i => i.id));
    const doneIds   = new Set((doneItems || []).map(i => i.id));
    const allNotionIds = new Set([...activeIds, ...doneIds]);

    // Remove local copies of Notion tasks no longer returned
    tasks = tasks.filter(t => !t.notion || allNotionIds.has(t.id));

    // Upsert active (Not started / In progress)
    items.forEach(nt => {
      const idx = tasks.findIndex(t => t.id === nt.id);
      const merged = {
        id:          nt.id,
        name:        nt.name,
        status:      nt.status,
        due:         nt.due,
        description: nt.description,
        notionUrl:   nt.notionUrl,
        notion:      true,
        category:    idx >= 0 ? tasks[idx].category  : guessCategory(nt.name),
        classLabel:  idx >= 0 ? tasks[idx].classLabel : guessClass(nt.name),
        priority:    idx >= 0 ? tasks[idx].priority   : 'medium',
        est:         idx >= 0 ? tasks[idx].est        : '',
      };
      if (idx >= 0) tasks[idx] = merged;
      else tasks.push(merged);
    });

    // Upsert done — same logic
    (doneItems || []).forEach(nt => {
      const idx = tasks.findIndex(t => t.id === nt.id);
      const merged = {
        id:          nt.id,
        name:        nt.name,
        status:      'Done',
        due:         nt.due,
        description: nt.description,
        notionUrl:   nt.notionUrl,
        notion:      true,
        category:    idx >= 0 ? tasks[idx].category  : guessCategory(nt.name),
        classLabel:  idx >= 0 ? tasks[idx].classLabel : guessClass(nt.name),
        priority:    idx >= 0 ? tasks[idx].priority   : 'medium',
        est:         idx >= 0 ? tasks[idx].est        : '',
      };
      if (idx >= 0) tasks[idx] = merged;
      else tasks.push(merged);
    });

    persist();
    refreshAll();
    setSyncState('ok', `Synced · ${new Date().toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'})}`);
  } catch(e) {
    setSyncState('err', 'Sync failed — check env vars');
    console.warn('[Notion sync]', e.message);
    refreshAll();
  }
}

function guessCategory(name = '') {
  if (/quiz|test|exam|midterm|final|ap classroom|summative|major/i.test(name)) return 'test';
  if (/debate|ec |extracurr|club|sport/i.test(name)) return 'ec';
  return 'hw';
}

// Push status change to Notion instantly
async function pushStatus(taskId, status) {
  const t = tasks.find(x => x.id === taskId);
  if (!t?.notion) return;
  try {
    await fetch(API + '?action=update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: taskId, status }),
    });
  } catch(e) { console.warn('[Notion push status]', e.message); }
}

// Push new task to Notion
async function pushCreate(fields) {
  try {
    const res = await fetch(API + '?action=create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name:        fields.name,
        status:      fields.status || 'Not started',
        due:         fields.due    || null,
        description: fields.description || '',
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.id;
  } catch(e) { console.warn('[Notion create]', e.message); return null; }
}

// Push field updates to Notion
async function pushUpdate(taskId, fields) {
  const t = tasks.find(x => x.id === taskId);
  if (!t?.notion) return;
  try {
    await fetch(API + '?action=update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: taskId, ...fields }),
    });
  } catch(e) { console.warn('[Notion update]', e.message); }
}

// Push delete (archive) to Notion
async function pushDelete(taskId) {
  const t = tasks.find(x => x.id === taskId);
  if (!t?.notion) return;
  try {
    await fetch(API + '?action=delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: taskId }),
    });
  } catch(e) { console.warn('[Notion delete]', e.message); }
}
