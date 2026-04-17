// ═════════════════════════════════════════════════════════
// AI — chat panel, send to /api/chat, execute actions
// ═════════════════════════════════════════════════════════
const AI = (() => {
  const LS_HIST = 'pl3_aiHist';
  let history = [];
  try { history = JSON.parse(localStorage.getItem(LS_HIST)) || []; } catch { history = []; }

  function init() {
    // Welcome if empty
    if (!history.length) {
      history = [{
        role: 'assistant',
        content: "Hey Michael! I can help you plan your week, schedule study blocks, find open slots, or move things around. Just tell me what you need."
      }];
      _persist();
    }
    renderMessages();
    // Show/hide bubble per setting
    const enabled = Settings.get('sAIEnabled', true);
    document.getElementById('aiBubble').style.display = enabled ? '' : 'none';
  }

  function _persist() {
    try { localStorage.setItem(LS_HIST, JSON.stringify(history.slice(-30))); } catch {}
  }

  function toggle() {
    const panel = document.getElementById('aiPanel');
    panel.classList.toggle('open');
    if (panel.classList.contains('open')) {
      renderMessages();
      setTimeout(() => {
        const body = document.getElementById('aiMessages');
        body.scrollTop = body.scrollHeight;
        document.getElementById('aiInput').focus();
      }, 100);
    }
  }

  function renderMessages() {
    const body = document.getElementById('aiMessages');
    if (!body) return;
    body.innerHTML = history.map(m => {
      if (m.role === 'user') {
        return `<div class="ai-msg user">${Store.esc(m.content)}</div>`;
      }
      const actionNote = m.actionsApplied
        ? `<div class="ai-msg-actions"><strong>✓ Applied ${m.actionsApplied} change${m.actionsApplied===1?'':'s'}</strong> to your planner</div>`
        : '';
      return `<div class="ai-msg assistant">${_formatMarkdown(m.content)}${actionNote}</div>`;
    }).join('');
    body.scrollTop = body.scrollHeight;
  }

  function _formatMarkdown(text) {
    // Minimal markdown: **bold**, *italic*, `code`, newlines
    let t = Store.esc(text);
    t = t.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    t = t.replace(/\*(.+?)\*/g, '<em>$1</em>');
    t = t.replace(/`(.+?)`/g, '<code style="font-family:var(--mono);background:rgba(0,0,0,.06);padding:1px 5px;border-radius:4px;font-size:.9em">$1</code>');
    t = t.replace(/\n/g, '<br>');
    return t;
  }

  function handleKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  async function send() {
    const input = document.getElementById('aiInput');
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    input.style.height = 'auto';
    history.push({ role: 'user', content: text });
    _persist();
    renderMessages();

    // Add typing indicator
    const body = document.getElementById('aiMessages');
    const typing = document.createElement('div');
    typing.className = 'ai-msg typing';
    typing.innerHTML = '<div class="ai-typing-dot"></div><div class="ai-typing-dot"></div><div class="ai-typing-dot"></div>';
    body.appendChild(typing);
    body.scrollTop = body.scrollHeight;

    const sendBtn = document.querySelector('.ai-send');
    if (sendBtn) sendBtn.disabled = true;

    try {
      // Build context: upcoming blocks, classes, focus, tz
      const ctx = _buildContext();
      const msgsForApi = history.filter(m => m.role === 'user' || m.role === 'assistant').slice(-12);

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: msgsForApi, context: ctx }),
      });

      typing.remove();

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Unknown error' }));
        history.push({
          role: 'assistant',
          content: `⚠️ ${err.error || 'Something went wrong'}. Make sure your Anthropic API key is set in Netlify env vars as ANTHROPIC_API_KEY.`
        });
        _persist();
        renderMessages();
        return;
      }

      const data = await res.json();
      const actionsApplied = Array.isArray(data.actions) && data.actions.length
        ? executeActions(data.actions) : 0;
      history.push({
        role: 'assistant',
        content: data.text || '(no response)',
        actionsApplied,
      });
      _persist();
      renderMessages();
      if (actionsApplied > 0) App.refresh();
    } catch (err) {
      typing.remove();
      history.push({
        role: 'assistant',
        content: `⚠️ Connection error: ${err.message || err}`
      });
      _persist();
      renderMessages();
    } finally {
      if (sendBtn) sendBtn.disabled = false;
    }
  }

  function _buildContext() {
    const today = Store.todayStr();
    const scheduledKeys = Object.keys(Store.schedule).filter(dk => {
      const n = Store.daysUntil(dk);
      return n !== null && n >= -1 && n <= 21;
    }).sort();
    const sched = {};
    scheduledKeys.forEach(dk => {
      sched[dk] = (Store.schedule[dk] || []).map((b, i) => ({
        index: i,
        label: b.label,
        type: b.type,
        classLabel: b.classLabel || null,
        start: b.start,
        end: b.end,
        due: b.due || null,
        description: b.description || null,
        recur: b.recur || null,
        done: !!b.done,
      }));
    });
    return {
      today,
      timezone: Sched.getLocalTz(),
      focus: {
        today: (JSON.parse(localStorage.getItem('pl3_focus') || '{}'))[today] || '',
      },
      schedule: sched,
      classes: Store.getClasses().map(c => ({ name: c.name, color: c.color })),
      blockTypes: Sched.getBlockTypes().map(t => t.id),
    };
  }

  function executeActions(actions) {
    let applied = 0;
    Store.snapshot();
    for (const a of actions) {
      try {
        switch (a.type) {
          case 'add_block': {
            if (!a.date || !a.start) break;
            const blockType = a.blockType || a.type_hint || 'study';
            const css = Sched.getBlockTypes().find(t => t.id === blockType)?.css || 'sb-other';
            Sched.addBlock(a.date, {
              label: a.label || blockType,
              type: blockType,
              css,
              start: a.start,
              end: a.end || a.start,
              due: a.due || null,
              classLabel: a.classLabel || '',
              description: a.description || '',
              storedTz: Sched.getLocalTz(),
              recur: a.recur || null,
              recurUntil: a.recurUntil || null,
              priority: a.priority || '',
              reminder: a.reminder || null,
              location: a.location || '',
              link: a.link || '',
              status: 'scheduled',
              done: false,
            });
            applied++;
            break;
          }
          case 'update_block': {
            const list = Store.schedule[a.date];
            if (list && list[a.index]) {
              const b = { ...list[a.index] };
              ['label','start','end','due','classLabel','description','recur','recurUntil','done','priority','reminder','location','link','status'].forEach(k => {
                if (a[k] !== undefined) b[k] = a[k];
              });
              if (a.blockType) {
                b.type = a.blockType;
                b.css = Sched.getBlockTypes().find(t => t.id === a.blockType)?.css || 'sb-other';
              }
              Sched.updateBlock(a.date, a.index, b);
              applied++;
            }
            break;
          }
          case 'move_block': {
            const list = Store.schedule[a.fromDate];
            if (list && list[a.fromIndex]) {
              const b = { ...list[a.fromIndex] };
              if (a.newStart) b.start = a.newStart;
              if (a.newEnd) b.end = a.newEnd;
              Sched.removeBlock(a.fromDate, a.fromIndex);
              if (a.toDate) Sched.addBlock(a.toDate, b);
              applied++;
            }
            break;
          }
          case 'delete_block': {
            const list = Store.schedule[a.date];
            if (list && list[a.index] !== undefined) {
              Sched.removeBlock(a.date, a.index);
              applied++;
            }
            break;
          }
          case 'set_focus': {
            if (a.date && typeof a.text === 'string') {
              Store.setFocus(a.date, a.text);
              applied++;
            }
            break;
          }
          case 'add_class': {
            if (a.name) {
              Store.addClass(a.name, a.color || '#8e8e93');
              applied++;
            }
            break;
          }
          case 'rename_class': {
            const c = Store.getClasses().find(x => x.name === a.oldName);
            if (c && a.newName) {
              Store.updateClass(c.id, { name: a.newName });
              applied++;
            }
            break;
          }
          case 'duplicate_block': {
            const list = Store.schedule[a.date];
            if (list && list[a.index]) {
              const src = list[a.index];
              const copy = JSON.parse(JSON.stringify(src));
              copy.done = false;
              delete copy._recurFrom;
              delete copy._recurBaseIdx;
              const targetDate = a.toDate || a.date;
              if (a.newStart) copy.start = a.newStart;
              if (a.newEnd) copy.end = a.newEnd;
              Sched.addBlock(targetDate, copy);
              applied++;
            }
            break;
          }
          case 'bulk_add_blocks': {
            if (Array.isArray(a.blocks)) {
              for (const b of a.blocks) {
                if (!b.date || !b.start) continue;
                const blockType = b.blockType || b.type || 'study';
                const css = Sched.getBlockTypes().find(t => t.id === blockType)?.css || 'sb-other';
                Sched.addBlock(b.date, {
                  label: b.label || blockType,
                  type: blockType,
                  css,
                  start: b.start,
                  end: b.end || b.start,
                  due: b.due || null,
                  classLabel: b.classLabel || '',
                  description: b.description || '',
                  storedTz: Sched.getLocalTz(),
                  recur: b.recur || null,
                  recurUntil: b.recurUntil || null,
                  priority: b.priority || '',
                  reminder: b.reminder || null,
                  location: b.location || '',
                  link: b.link || '',
                  status: 'scheduled',
                  done: false,
                });
                applied++;
              }
            }
            break;
          }
        }
      } catch (e) {
        console.error('AI action failed:', a, e);
      }
    }
    if (applied > 0) Store.persist();
    return applied;
  }

  // Auto-resize textarea
  document.addEventListener('input', e => {
    if (e.target && e.target.id === 'aiInput') {
      e.target.style.height = 'auto';
      e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
    }
  });

  return { init, toggle, send, handleKey, renderMessages, executeActions };
})();
