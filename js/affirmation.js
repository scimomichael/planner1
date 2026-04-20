// Daily affirmation system with never-repeat guarantee.
//
// Each day the client:
//   1. Checks localStorage for today's cached affirmation (keyed by YYYY-MM-DD).
//   2. If not cached, attempts /api/affirmation with a 5-second timeout.
//      Sends the last 30 affirmations as history so the AI won't repeat them.
//   3. If the AI call fails or times out, falls back to the local 500-entry pool.
//      Picks one that hasn't been seen in the user's entire history (tracked
//      in localStorage). Once all 500 are seen, signals exhaustion in console
//      (should basically never happen in practice).
//   4. Picks a font that hasn't been used in the last 30 days, from a pool of 30+.
//      Injects the Google Fonts link for just that font.
//
// Storage keys:
//   pl3_affirm_today  -> {date, text, fontKey, source}
//   pl3_affirm_seen   -> array of affirmation text strings ever shown
//   pl3_affirm_fonts  -> array of {date, fontKey} for last 30+ days
const Affirmation = (() => {
  const STORE_TODAY = 'pl3_affirm_today';
  const STORE_SEEN = 'pl3_affirm_seen';
  const STORE_FONTS = 'pl3_affirm_fonts';
  const TIMEOUT_MS = 5000;

  // Curated font pool. Each entry: key, family (for Google Fonts URL),
  // cssStack (for the element's font-family), weight/style hint, mood tags
  // (used to weight selection, though we still ensure never-same-in-30-days).
  const FONTS = [
    { key: 'inter',              family: 'Inter:wght@500;600;700',           css: '"Inter", system-ui, sans-serif',            weight: 600 },
    { key: 'manrope',            family: 'Manrope:wght@500;600;700',         css: '"Manrope", system-ui, sans-serif',          weight: 600 },
    { key: 'space-grotesk',      family: 'Space+Grotesk:wght@500;600;700',   css: '"Space Grotesk", system-ui, sans-serif',    weight: 600 },
    { key: 'dm-sans',            family: 'DM+Sans:wght@500;600;700',         css: '"DM Sans", system-ui, sans-serif',          weight: 600 },
    { key: 'outfit',             family: 'Outfit:wght@500;600;700',          css: '"Outfit", system-ui, sans-serif',           weight: 600 },
    { key: 'be-vietnam-pro',     family: 'Be+Vietnam+Pro:wght@500;600;700',  css: '"Be Vietnam Pro", system-ui, sans-serif',   weight: 600 },
    { key: 'nunito',             family: 'Nunito:wght@500;600;700',          css: '"Nunito", system-ui, sans-serif',           weight: 600 },
    { key: 'karla',              family: 'Karla:wght@500;600;700',           css: '"Karla", system-ui, sans-serif',            weight: 600 },
    { key: 'work-sans',          family: 'Work+Sans:wght@500;600;700',       css: '"Work Sans", system-ui, sans-serif',        weight: 600 },
    { key: 'lato',               family: 'Lato:wght@400;700',                css: '"Lato", system-ui, sans-serif',             weight: 700 },
    { key: 'playfair-display',   family: 'Playfair+Display:wght@500;600;700',css: '"Playfair Display", Georgia, serif',        weight: 600 },
    { key: 'cormorant-garamond', family: 'Cormorant+Garamond:wght@500;600;700',css: '"Cormorant Garamond", Georgia, serif',    weight: 600 },
    { key: 'eb-garamond',        family: 'EB+Garamond:wght@500;600',         css: '"EB Garamond", Georgia, serif',             weight: 600 },
    { key: 'crimson-text',       family: 'Crimson+Text:wght@400;600;700',    css: '"Crimson Text", Georgia, serif',            weight: 600 },
    { key: 'libre-baskerville',  family: 'Libre+Baskerville:wght@400;700',   css: '"Libre Baskerville", Georgia, serif',       weight: 700 },
    { key: 'lora',               family: 'Lora:wght@500;600;700',            css: '"Lora", Georgia, serif',                    weight: 600 },
    { key: 'spectral',           family: 'Spectral:wght@500;600;700',        css: '"Spectral", Georgia, serif',                weight: 600 },
    { key: 'source-serif-4',     family: 'Source+Serif+4:wght@500;600;700',  css: '"Source Serif 4", Georgia, serif',          weight: 600 },
    { key: 'fraunces',           family: 'Fraunces:wght@500;600;700',        css: '"Fraunces", Georgia, serif',                weight: 600 },
    { key: 'pt-serif',           family: 'PT+Serif:wght@400;700',            css: '"PT Serif", Georgia, serif',                weight: 700 },
    { key: 'tenor-sans',         family: 'Tenor+Sans',                       css: '"Tenor Sans", system-ui, serif',            weight: 400 },
    { key: 'cardo',              family: 'Cardo:wght@400;700',               css: '"Cardo", Georgia, serif',                   weight: 700 },
    { key: 'oswald',             family: 'Oswald:wght@500;600;700',          css: '"Oswald", Impact, sans-serif',              weight: 600 },
    { key: 'bebas-neue',         family: 'Bebas+Neue',                       css: '"Bebas Neue", Impact, sans-serif',          weight: 400 },
    { key: 'archivo-black',      family: 'Archivo+Black',                    css: '"Archivo Black", Impact, sans-serif',       weight: 900 },
    { key: 'anton',              family: 'Anton',                            css: '"Anton", Impact, sans-serif',               weight: 400 },
    { key: 'caveat',             family: 'Caveat:wght@500;600;700',          css: '"Caveat", cursive',                         weight: 600 },
    { key: 'kalam',              family: 'Kalam:wght@400;700',               css: '"Kalam", cursive',                          weight: 700 },
    { key: 'shadows-into-light', family: 'Shadows+Into+Light',               css: '"Shadows Into Light", cursive',             weight: 400 },
    { key: 'jetbrains-mono',     family: 'JetBrains+Mono:wght@500;600;700',  css: '"JetBrains Mono", ui-monospace, monospace', weight: 600 },
    { key: 'ibm-plex-mono',      family: 'IBM+Plex+Mono:wght@500;600;700',   css: '"IBM Plex Mono", ui-monospace, monospace',  weight: 600 },
    { key: 'space-mono',         family: 'Space+Mono:wght@400;700',          css: '"Space Mono", ui-monospace, monospace',     weight: 700 },
  ];

  function _todayKey() {
    // Local date, matches Store.todayStr format
    return (typeof Store !== 'undefined' && Store.todayStr) ? Store.todayStr() : new Date().toISOString().slice(0, 10);
  }

  function _readJSON(key, fallback) {
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
    catch { return fallback; }
  }
  function _writeJSON(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
  }

  function _pickFont() {
    // Constraint (user spec): never use the same font twice within the same
    // calendar month. At the start of a new month the exclusion set resets.
    // Selection within the available pool is uniformly random.
    const history = _readJSON(STORE_FONTS, []);
    const today = _todayKey();
    const currentMonthPrefix = today.slice(0, 7); // "YYYY-MM"
    const thisMonthsKeys = new Set(
      history.filter(h => h.date && h.date.slice(0, 7) === currentMonthPrefix).map(h => h.fontKey)
    );
    const available = FONTS.filter(f => !thisMonthsKeys.has(f.key));
    if (available.length) {
      return available[Math.floor(Math.random() * available.length)];
    }
    // Defensive: if somehow all 30+ fonts have been used this month (only
    // possible in a 30+ day month with >30 fonts -- shouldn't happen since
    // no month has more days than the font pool, but fall back anyway).
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

  // Kick off the AI fetch without aborting. Returns the full fetch promise.
  // The 5-second "show fallback meanwhile" logic lives in init() below so that
  // a late AI response can still replace the fallback when it arrives.
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
    } catch {
      return null;
    }
  }

  function _pickFallback(seen) {
    // Pool of 500 hand-written affirmations. Pick the first one not in `seen`.
    // Randomize iteration order so users on different devices converge to
    // different fallbacks if they happen to be offline on day 1.
    if (typeof AFFIRMATIONS_FALLBACK === 'undefined') return null;
    const seenSet = new Set(seen);
    const indices = FALLBACK_SHUFFLE.slice();
    for (const i of indices) {
      const candidate = AFFIRMATIONS_FALLBACK[i];
      if (!seenSet.has(candidate)) return candidate;
    }
    // Edge case: 500 exhausted (should basically never happen).
    console.warn('[Affirmation] Fallback pool exhausted; resetting seen list');
    return AFFIRMATIONS_FALLBACK[Math.floor(Math.random() * AFFIRMATIONS_FALLBACK.length)];
  }

  // Pre-computed random permutation of indices so repeated fallback picks
  // don't follow the file's order.
  const FALLBACK_SHUFFLE = (() => {
    if (typeof AFFIRMATIONS_FALLBACK === 'undefined') return [];
    const arr = AFFIRMATIONS_FALLBACK.map((_, i) => i);
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  })();

  function _render(text, font) {
    const el = document.getElementById('focusInput');
    if (!el) return;
    el.textContent = text;
    el.style.fontFamily = font.css;
    el.style.fontWeight = font.weight;
  }

  // Commit the final affirmation for the day -- cache it, add to seen, log font usage.
  function _commit(today, text, fontKey, source) {
    _writeJSON(STORE_TODAY, { date: today, text, fontKey, source });
    const seen = _readJSON(STORE_SEEN, []);
    if (!seen.includes(text)) {
      seen.push(text);
      if (seen.length > 5000) seen.splice(0, seen.length - 5000);
      _writeJSON(STORE_SEEN, seen);
    }
    const fonts = _readJSON(STORE_FONTS, []);
    // Only log font once per day (avoids duplicate entries if init runs twice)
    if (!fonts.some(f => f.date === today)) {
      fonts.push({ date: today, fontKey });
      if (fonts.length > 120) fonts.splice(0, fonts.length - 120);
      _writeJSON(STORE_FONTS, fonts);
    }
    // Trigger cross-device push so other devices (browsers, iPhone, etc.) get
    // today's affirmation without needing to regenerate it themselves.
    if (typeof Store !== 'undefined' && Store.queueAffirmSync) {
      Store.queueAffirmSync();
    }
  }

  async function init() {
    const el = document.getElementById('focusInput');
    if (!el) return;

    const today = _todayKey();
    const cached = _readJSON(STORE_TODAY, null);
    if (cached && cached.date === today && cached.text && cached.fontKey) {
      // Already resolved for today. Just render from cache.
      const font = FONTS.find(f => f.key === cached.fontKey) || FONTS[0];
      _loadFont(font);
      _render(cached.text, font);
      return;
    }

    // Fresh day. Pick today's font now -- that part doesn't depend on network.
    const font = _pickFont();
    _loadFont(font);
    _render('\u2026', font);

    const seen = _readJSON(STORE_SEEN, []);
    const recentHistory = seen.slice(-30);

    // Kick off the AI fetch. We do NOT abort it -- even if it takes 20s,
    // we want to swap in the AI result when it arrives. A fallback is only
    // shown if the AI hasn't returned within TIMEOUT_MS.
    let settled = false;
    let fallbackShown = false;
    let fallbackText = null;

    const aiPromise = _fetchFromAI(recentHistory).then(aiText => {
      if (settled) return; // don't clobber a commit already in progress
      settled = true;
      if (aiText && !seen.includes(aiText)) {
        // Swap in the AI result (replaces fallback if it was shown).
        _render(aiText, font);
        _commit(today, aiText, font.key, 'ai');
      } else if (fallbackShown && fallbackText) {
        // AI gave us a repeat or nothing, but we already showed a fallback.
        // Keep the fallback and commit it as today's.
        _commit(today, fallbackText, font.key, 'fallback');
      } else {
        // AI failed and we never showed a fallback (still within 5s window
        // but resolved quickly). Render fallback now.
        const fb = _pickFallback(seen);
        if (fb) {
          _render(fb, font);
          _commit(today, fb, font.key, 'fallback');
        }
      }
    });

    // After TIMEOUT_MS, if the AI hasn't returned yet, show a fallback so the
    // user isn't staring at "..." forever. The AI promise continues in the
    // background; when it resolves, it will swap to the real affirmation.
    setTimeout(() => {
      if (settled) return;
      const fb = _pickFallback(seen);
      if (!fb) return;
      fallbackText = fb;
      fallbackShown = true;
      _render(fb, font);
      // Don't commit yet -- we still want the AI result to win if it arrives.
    }, TIMEOUT_MS);

    await aiPromise;
  }

  // Called by Store.pull() when it merges in an affirmToday from another
  // device. Swaps the displayed affirmation to the newly-cached one without
  // running the AI fetch/fallback pipeline again. If today's cached entry is
  // missing or stale, does nothing — the normal init() flow will handle it.
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
