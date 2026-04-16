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
        content: 'Hey Michael! I can help you plan your week, add tasks, schedule study time, or just chat about your workload. What\'s up?'
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
      // Build context: recent tasks, today's blocks, focus, tz
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
      return n !== null && n >= -1 && n <= 14;
    });
    const sched = {};
    scheduledKeys.forEach(dk => { sched[dk] = Store.schedule[dk]; });
    return {
      today,
      timezone: Sched.getLocalTz(),
      focus: {
        today: (JSON.parse(localStorage.getItem('pl3_focus') || '{}'))[today] || '',
      },
      schedule: sched,
      tasks: Store.tasks.slice(0, 50).map(t => ({
        id: t.id, name: t.name, category: t.category, classLabel: t.classLabel,
        status: t.status, due: t.due, priority: t.priority, est: t.est,
      })),
    };
  }

  function executeActions(actions) {
    let applied = 0;
    Store.snapshot();
    for (const a of actions) {
      try {
        switch (a.type) {
          case 'add_task': {
            Store.tasks.push({
              id: 'ai_' + Date.now() + Math.random().toString(36).slice(2),
              name: a.name || 'Untitled',
              category: a.category || 'hw',
              classLabel: a.classLabel || '',
              priority: a.priority || 'medium',
              due: a.due || null,
              status: a.status || 'Not started',
              est: a.est || '',
              description: a.notes || '',
              tags: [],
            });
            applied++;
            break;
          }
          case 'update_task': {
            const t = Store.tasks.find(x => x.id === a.id);
            if (t) {
              Object.keys(a).forEach(k => {
                if (k !== 'type' && k !== 'id') t[k] = a[k];
              });
              applied++;
            }
            break;
          }
          case 'delete_task': {
            const idx = Store.tasks.findIndex(x => x.id === a.id);
            if (idx >= 0) { Store.tasks.splice(idx, 1); applied++; }
            break;
          }
          case 'add_block': {
            if (!a.date || !a.start) break;
            const blockType = a.type || 'study';
            const css = Sched.getBlockTypes().find(t => t.id === blockType)?.css || 'sb-other';
            if (!Store.schedule[a.date]) Store.schedule[a.date] = [];
            Store.schedule[a.date].push({
              label: a.label || blockType,
              type: blockType,
              css,
              start: a.start,
              end: a.end || a.start,
              due: a.due || null,
              taskId: null,
              storedTz: Sched.getLocalTz(),
              recur: null,
              recurUntil: null,
              done: false,
            });
            applied++;
            break;
          }
          case 'update_block': {
            const list = Store.schedule[a.date];
            if (list && list[a.index]) {
              Object.keys(a).forEach(k => {
                if (!['type','date','index'].includes(k)) list[a.index][k] = a[k];
              });
              applied++;
            }
            break;
          }
          case 'delete_block': {
            const list = Store.schedule[a.date];
            if (list && list[a.index] !== undefined) { list.splice(a.index, 1); applied++; }
            break;
          }
          case 'set_focus': {
            if (a.date && typeof a.text === 'string') {
              const fm = JSON.parse(localStorage.getItem('pl3_focus') || '{}');
              fm[a.date] = a.text;
              localStorage.setItem('pl3_focus', JSON.stringify(fm));
              applied++;
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
