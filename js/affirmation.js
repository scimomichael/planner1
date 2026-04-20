// Daily affirmation system, AI-only.
//
// Each day the client:
//   1. Pulls from cross-device sync first (handled by Store.pull before init runs).
//   2. Checks localStorage for today's cached affirmation (keyed by YYYY-MM-DD).
//      If cached, renders instantly and stops.
//   3. Otherwise, picks today's font (calendar-month no-repeat from 31 fonts).
//   4. Calls /api/affirmation. If it succeeds: render, commit to cache, trigger sync.
//      If it fails: leave the bar empty. Next page load will retry.
//      There is intentionally NO local fallback pool -- user wants pure AI only.
//
// Storage keys (all synced across devices via Store push/pull):
//   pl3_affirm_today  -> {date, text, fontKey, source}
//   pl3_affirm_seen   -> array of affirmation text strings ever shown (AI avoids these)
//   pl3_affirm_fonts  -> array of {date, fontKey} -- used for calendar-month no-repeat
const Affirmation = (() => {
  const STORE_TODAY = 'pl3_affirm_today';
  const STORE_SEEN = 'pl3_affirm_seen';
  const STORE_FONTS = 'pl3_affirm_fonts';

  // 31 Google Fonts for rotation. Random selection with no-repeat within
  // the current calendar month. New month = exclusion set resets.
  const FONTS = [
    { key: 'inter',              family: 'Inter:wght@500;600;700',             css: '"Inter", system-ui, sans-serif',            weight: 600 },
    { key: 'manrope',            family: 'Manrope:wght@500;600;700',           css: '"Manrope", system-ui, sans-serif',          weight: 600 },
    { key: 'space-grotesk',      family: 'Space+Grotesk:wght@500;600;700',     css: '"Space Grotesk", system-ui, sans-serif',    weight: 600 },
    { key: 'dm-sans',            family: 'DM+Sans:wght@500;600;700',           css: '"DM Sans", system-ui, sans-serif',          weight: 600 },
    { key: 'outfit',             family: 'Outfit:wght@500;600;700',            css: '"Outfit", system-ui, sans-serif',           weight: 600 },
    { key: 'be-vietnam-pro',     family: 'Be+Vietnam+Pro:wght@500;600;700',    css: '"Be Vietnam Pro", system-ui, sans-serif',   weight: 600 },
    { key: 'nunito',             family: 'Nunito:wght@500;600;700',            css: '"Nunito", system-ui, sans-serif',           weight: 600 },
    { key: 'karla',              family: 'Karla:wght@500;600;700',             css: '"Karla", system-ui, sans-serif',            weight: 600 },
    { key: 'work-sans',          family: 'Work+Sans:wght@500;600;700',         css: '"Work Sans", system-ui, sans-serif',        weight: 600 },
    { key: 'lato',               family: 'Lato:wght@400;700',                  css: '"Lato", system-ui, sans-serif',             weight: 700 },
    { key: 'playfair-display',   family: 'Playfair+Display:wght@500;600;700',  css: '"Playfair Display", Georgia, serif',        weight: 600 },
    { key: 'cormorant-garamond', family: 'Cormorant+Garamond:wght@500;600;700',css: '"Cormorant Garamond", Georgia, serif',      weight: 600 },
    { key: 'eb-garamond',        family: 'EB+Garamond:wght@500;600',           css: '"EB Garamond", Georgia, serif',             weight: 600 },
    { key: 'crimson-text',       family: 'Crimson+Text:wght@400;600;700',      css: '"Crimson Text", Georgia, serif',            weight: 600 },
    { key: 'libre-baskerville',  family: 'Libre+Baskerville:wght@400;700',     css: '"Libre Baskerville", Georgia, serif',       weight: 700 },
    { key: 'lora',               family: 'Lora:wght@500;600;700',              css: '"Lora", Georgia, serif',                    weight: 600 },
    { key: 'spectral',           family: 'Spectral:wght@500;600;700',          css: '"Spectral", Georgia, serif',                weight: 600 },
    { key: 'source-serif-4',     family: 'Source+Serif+4:wght@500;600;700',    css: '"Source Serif 4", Georgia, serif',          weight: 600 },
    { key: 'fraunces',           family: 'Fraunces:wght@500;600;700',          css: '"Fraunces", Georgia, serif',                weight: 600 },
    { key: 'pt-serif',           family: 'PT+Serif:wght@400;700',              css: '"PT Serif", Georgia, serif',                weight: 700 },
    { key: 'tenor-sans',         family: 'Tenor+Sans',                         css: '"Tenor Sans", system-ui, serif',            weight: 400 },
    { key: 'cardo',              family: 'Cardo:wght@400;700',                 css: '"Cardo", Georgia, serif',                   weight: 700 },
    { key: 'oswald',             family: 'Oswald:wght@500;600;700',            css: '"Oswald", Impact, sans-serif',              weight: 600 },
    { key: 'bebas-neue',         family: 'Bebas+Neue',                         css: '"Bebas Neue", Impact, sans-serif',          weight: 400 },
    { key: 'archivo-black',      family: 'Archivo+Black',                      css: '"Archivo Black", Impact, sans-serif',       weight: 900 },
    { key: 'anton',              family: 'Anton',                              css: '"Anton", Impact, sans-serif',               weight: 400 },
    { key: 'caveat',             family: 'Caveat:wght@500;600;700',            css: '"Caveat", cursive',                         weight: 600 },
    { key: 'kalam',              family: 'Kalam:wght@400;700',                 css: '"Kalam", cursive',                          weight: 700 },
    { key: 'shadows-into-light', family: 'Shadows+Into+Light',                 css: '"Shadows Into Light", cursive',             weight: 400 },
    { key: 'jetbrains-mono',     family: 'JetBrains+Mono:wght@500;600;700',    css: '"JetBrains Mono", ui-monospace, monospace', weight: 600 },
    { key: 'ibm-plex-mono',      family: 'IBM+Plex+Mono:wght@500;600;700',     css: '"IBM Plex Mono", ui-monospace, monospace',  weight: 600 },
  ];

  function _todayKey() {
    return (typeof Store !== 'undefined' && Store.todayStr) ? Store.todayStr() : new Date().toISOString().slice(0, 10);
  }
  function _readJSON(key, fallback) {
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
    catch { return fallback; }
  }
  function _writeJSON(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
  }

  // Pick today's font: random from the pool, excluding any font already used
  // in the current calendar month. New month = exclusion set resets.
  function _pickFont() {
    const history = _readJSON(STORE_FONTS, []);
    const today = _todayKey();
    const monthPrefix = today.slice(0, 7);
    const thisMonth = new Set(
      history.filter(h => h && h.date && h.date.slice(0, 7) === monthPrefix).map(h => h.fontKey)
    );
    const available = FONTS.filter(f => !thisMonth.has(f.key));
    if (available.length) return available[Math.floor(Math.random() * available.length)];
    return FONTS[Math.floor(Math.random() * FONTS.length)];
  }

  function _loadFont(font) {
    const id = 'gfont-' + font.key;
    if (document.getElementById(id)) return;
    const link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=' + font.family + '&display=swap';
    document.head.appendChild(link);
  }

  function _render(text, font) {
    const el = document.getElementById('focusInput');
    if (!el) return;
    el.textContent = text;
    el.style.fontFamily = font.css;
    el.style.fontWeight = font.weight;
  }
  function _clear() {
    const el = document.getElementById('focusInput');
    if (el) el.textContent = '';
  }

  // Fetch from the AI endpoint. No timeout -- we wait however long it takes,
  // because the user specifically asked for pure AI with no fallback.
  async function _fetchFromAI(history) {
    try {
      const res = await fetch('/api/affirmation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ history }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      if (data && typeof data.text === 'string' && data.text.trim()) return data.text.trim();
      return null;
    } catch { return null; }
  }

  // Commit a freshly generated affirmation: cache, add to seen, log font usage,
  // trigger cross-device sync so other devices/browsers get the same one.
  function _commit(today, text, fontKey) {
    _writeJSON(STORE_TODAY, { date: today, text, fontKey, source: 'ai' });
    const seen = _readJSON(STORE_SEEN, []);
    if (!seen.includes(text)) {
      seen.push(text);
      if (seen.length > 5000) seen.splice(0, seen.length - 5000);
      _writeJSON(STORE_SEEN, seen);
    }
    const fonts = _readJSON(STORE_FONTS, []);
    if (!fonts.some(f => f && f.date === today)) {
      fonts.push({ date: today, fontKey });
      if (fonts.length > 120) fonts.splice(0, fonts.length - 120);
      _writeJSON(STORE_FONTS, fonts);
    }
    if (typeof Store !== 'undefined' && Store.queueAffirmSync) Store.queueAffirmSync();
  }

  async function init() {
    const el = document.getElementById('focusInput');
    if (!el) return;

    const today = _todayKey();
    // 1. If sync already dropped today's cached entry, use it (other-profile case).
    const cached = _readJSON(STORE_TODAY, null);
    if (cached && cached.date === today && cached.text && cached.fontKey) {
      const font = FONTS.find(f => f.key === cached.fontKey) || FONTS[0];
      _loadFont(font);
      _render(cached.text, font);
      return;
    }

    // 2. No cache. Pick today's font now so we can style whatever comes back.
    const font = _pickFont();
    _loadFont(font);

    // 3. Call the AI. Bar stays empty while waiting. No fallback.
    const seen = _readJSON(STORE_SEEN, []);
    const recentHistory = seen.slice(-30);
    const text = await _fetchFromAI(recentHistory);

    if (!text) {
      // AI failed. Leave bar empty. Next visit will retry.
      _clear();
      return;
    }

    _render(text, font);
    _commit(today, text, font.key);
  }

  // Called by Store.pull when cross-device sync merged in a new cached
  // affirmation from another device/profile. Render without hitting the AI.
  function rerenderFromCache() {
    try {
      const today = _todayKey();
      const cached = _readJSON(STORE_TODAY, null);
      if (!cached || cached.date !== today || !cached.text || !cached.fontKey) return;
      const font = FONTS.find(f => f.key === cached.fontKey) || FONTS[0];
      _loadFont(font);
      _render(cached.text, font);
    } catch (e) { console.error('[affirm] rerenderFromCache failed', e); }
  }

  return { init, rerenderFromCache };
})();
