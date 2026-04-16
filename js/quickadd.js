// ═════════════════════════════════════════════════════════
// QUICK ADD — natural language to block/task
// ═════════════════════════════════════════════════════════
const QuickAdd = (() => {
  const CLASS_KEYWORDS = {
    'AP Language': ['ap lang', 'ap language', 'lang'],
    'AP Biology': ['ap bio', 'ap biology', 'bio', 'biology'],
    'AP US History': ['apush', 'us history', 'apush'],
    'Honors Spanish IV': ['spanish', 'spa', 'espanol'],
    'Precalculus': ['precalc', 'pre-calc', 'precalculus', 'math'],
    'Congressional Debate': ['debate', 'congress', 'congressional'],
    'Harvard Pre-College': ['harvard', 'pre-college', 'hpc'],
  };

  const DAY_WORDS = {
    sunday: 0, sun: 0,
    monday: 1, mon: 1,
    tuesday: 2, tue: 2, tues: 2,
    wednesday: 3, wed: 3,
    thursday: 4, thu: 4, thur: 4, thurs: 4,
    friday: 5, fri: 5,
    saturday: 6, sat: 6,
  };

  function open() {
    document.getElementById('qaInput').value = '';
    document.getElementById('qaPreview').textContent = '';
    document.getElementById('quickAddOverlay').classList.add('open');
    setTimeout(() => {
      const inp = document.getElementById('qaInput');
      inp.focus();
      inp.oninput = () => updatePreview();
      inp.onkeydown = e => {
        if (e.key === 'Enter') { e.preventDefault(); commit(); }
        if (e.key === 'Escape') close();
      };
    }, 60);
  }

  function close() {
    document.getElementById('quickAddOverlay').classList.remove('open');
  }
  function overlayClick(e) {
    if (e.target.id === 'quickAddOverlay') close();
  }

  function updatePreview() {
    const raw = document.getElementById('qaInput').value;
    const parsed = parse(raw);
    const p = document.getElementById('qaPreview');
    if (!parsed) {
      p.textContent = raw.trim() ? `Task: ${raw.trim()}` : '';
      return;
    }
    const classPart = parsed.classLabel ? ` [${parsed.classLabel}]` : '';
    if (parsed.kind === 'block') {
      const dateLabel = dateLabelFor(parsed.date);
      p.textContent = `📅 Block on ${dateLabel} · ${parsed.start}–${parsed.end} · "${parsed.label}"${classPart}`;
    } else {
      const dateLabel = parsed.date ? `due ${dateLabelFor(parsed.date)}` : 'no due date';
      p.textContent = `📝 Task · "${parsed.label}" · ${dateLabel}${classPart}`;
    }
  }

  function dateLabelFor(dk) {
    if (!dk) return '—';
    const n = Store.daysUntil(dk);
    if (n === 0) return 'Today';
    if (n === 1) return 'Tomorrow';
    if (n === -1) return 'Yesterday';
    const d = new Date(dk + 'T00:00:00');
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  }

  // Parse the text and return either null, a block object, or a task object
  function parse(text) {
    if (!text || !text.trim()) return null;
    const t = text.toLowerCase().trim();

    // Find class
    let classLabel = null;
    for (const [cls, kws] of Object.entries(CLASS_KEYWORDS)) {
      for (const kw of kws) {
        if (t.includes(kw)) { classLabel = cls; break; }
      }
      if (classLabel) break;
    }

    // Find date
    let date = null;
    if (/\btoday\b/.test(t)) date = Store.todayStr();
    else if (/\btomorrow\b|\btmrw\b/.test(t)) {
      const d = Store.today(); d.setDate(d.getDate() + 1);
      date = Store.toStr(d);
    } else if (/\byesterday\b/.test(t)) {
      const d = Store.today(); d.setDate(d.getDate() - 1);
      date = Store.toStr(d);
    } else {
      // Day of week
      for (const [name, target] of Object.entries(DAY_WORDS)) {
        const re = new RegExp(`\\b${name}\\b`);
        if (re.test(t)) {
          const d = Store.today();
          const cur = d.getDay();
          let diff = target - cur;
          if (diff <= 0) diff += 7;
          d.setDate(d.getDate() + diff);
          date = Store.toStr(d);
          break;
        }
      }
    }
    // Check for "in N days"
    if (!date) {
      const md = t.match(/\bin (\d+)\s?(day|days|d)\b/);
      if (md) {
        const d = Store.today();
        d.setDate(d.getDate() + Number(md[1]));
        date = Store.toStr(d);
      }
    }
    // Check for explicit date like "apr 20" "april 20"
    if (!date) {
      const monthNames = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
      for (let mi = 0; mi < monthNames.length; mi++) {
        const re = new RegExp(`\\b${monthNames[mi]}\\w*\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`);
        const m = t.match(re);
        if (m) {
          const now = new Date();
          let yr = now.getFullYear();
          let tryDate = new Date(yr, mi, Number(m[1]));
          // If already in past this year, assume next year
          if (tryDate < Store.today()) { yr++; tryDate = new Date(yr, mi, Number(m[1])); }
          date = Store.toStr(tryDate);
          break;
        }
      }
    }

    // Find time range or single time
    // Patterns: "3-5pm", "3 to 5 pm", "at 3pm", "at 15:00", "3pm"
    const rangeMatch = t.match(/\b(\d{1,2})(?::(\d{2}))?\s*(?:-|to|–)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm|a|p)?\b/);
    let start = null, end = null;
    if (rangeMatch) {
      let sh = Number(rangeMatch[1]);
      const sm = Number(rangeMatch[2] || 0);
      let eh = Number(rangeMatch[3]);
      const em = Number(rangeMatch[4] || 0);
      const ap = rangeMatch[5];
      // Apply am/pm
      if (ap && (ap === 'p' || ap === 'pm')) { if (sh < 12) sh += 12; if (eh < 12) eh += 12; }
      if (ap && (ap === 'a' || ap === 'am')) { if (sh === 12) sh = 0; if (eh === 12) eh = 0; }
      // Common-sense: if no am/pm and sh 1-7, likely PM (student context)
      if (!ap && sh >= 1 && sh <= 7 && sh < eh) { sh += 12; eh += 12; }
      start = `${String(sh).padStart(2,'0')}:${String(sm).padStart(2,'0')}`;
      end = `${String(eh).padStart(2,'0')}:${String(em).padStart(2,'0')}`;
    } else {
      // Single time: "at 3pm" → default 1 hr
      const singleMatch = t.match(/\b(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm|a|p)\b/);
      if (singleMatch) {
        let h = Number(singleMatch[1]);
        const m = Number(singleMatch[2] || 0);
        const ap = singleMatch[3];
        if (ap === 'p' || ap === 'pm') { if (h < 12) h += 12; }
        if (ap === 'a' || ap === 'am') { if (h === 12) h = 0; }
        start = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
        const eh = (h + 1) % 24;
        end = `${String(eh).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
      }
    }

    // Clean label: strip time/date words
    let label = text;
    const stripPatterns = [
      /\bat\s+\d{1,2}(?::\d{2})?\s*(?:am|pm|a|p)?\b/gi,
      /\b\d{1,2}(?::\d{2})?\s*(?:-|to|–)\s*\d{1,2}(?::\d{2})?\s*(?:am|pm|a|p)?\b/gi,
      /\b\d{1,2}(?::\d{2})?\s*(?:am|pm)\b/gi,
      /\b(?:today|tomorrow|yesterday|tmrw)\b/gi,
      /\b(?:sunday|sun|monday|mon|tuesday|tue|tues|wednesday|wed|thursday|thu|thur|thurs|friday|fri|saturday|sat)\b/gi,
      /\bin \d+\s?(?:day|days|d)\b/gi,
      /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s+\d{1,2}(?:st|nd|rd|th)?\b/gi,
    ];
    stripPatterns.forEach(re => { label = label.replace(re, ''); });
    label = label.replace(/\s+/g, ' ').trim();
    if (!label) label = 'Untitled';

    // If we have a time range → it's a block
    if (start && end) {
      return {
        kind: 'block',
        label,
        start, end,
        date: date || Store.todayStr(),
        classLabel,
        type: classLabel ? 'class' : 'study',
      };
    }
    // Otherwise, it's a task
    return {
      kind: 'task',
      label,
      date,
      classLabel,
    };
  }

  function commit() {
    const raw = document.getElementById('qaInput').value;
    const parsed = parse(raw);
    if (!parsed) { Store.toast('Nothing to add'); return; }
    if (parsed.kind === 'block') {
      const css = Sched.getBlockTypes().find(t => t.id === parsed.type)?.css || 'sb-other';
      Sched.addBlock(parsed.date, {
        label: parsed.label,
        type: parsed.type,
        css,
        start: parsed.start, end: parsed.end,
        due: null, taskId: null,
        storedTz: Sched.getLocalTz(),
        recur: null, recurUntil: null,
        done: false,
      });
      Store.toast('Block added');
    } else {
      Store.snapshot();
      Store.tasks.push({
        id: 'local_' + Date.now() + Math.random().toString(36).slice(2),
        name: parsed.label,
        category: 'hw',
        classLabel: parsed.classLabel || '',
        due: parsed.date,
        status: 'Not started',
        priority: 'medium',
        est: '',
        description: '',
        tags: [],
      });
      Store.persist();
      Store.toast('Task added');
      App.refresh();
    }
    close();
  }

  return { open, close, overlayClick, commit, parse };
})();
