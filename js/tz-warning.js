// Timezone-change banner
//
// On every boot, compares the current browser-detected timezone against the
// last-known timezone stored in localStorage. If they differ (e.g., user
// traveled from Chicago to New York), show a thin banner above the affirmation
// explaining that their blocks are now displaying in local time. User can
// dismiss with the X button, which writes the new tz to the baseline so the
// banner won't reappear until they travel again.
//
// Respects the sTzIndicators setting: if off, the banner never shows.
//
// Storage key: pl3_last_known_tz
const TzWarning = (() => {
  const STORE_KEY = 'pl3_last_known_tz';

  // Format an IANA tz identifier like "America/Chicago" into just "Chicago"
  // for display. Falls back to the full string if the format is unexpected.
  function _shortName(tz) {
    if (!tz || typeof tz !== 'string') return tz || '?';
    const parts = tz.split('/');
    const last = parts[parts.length - 1];
    return last.replace(/_/g, ' ');
  }

  function _currentTz() {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; }
    catch { return 'UTC'; }
  }

  function init() {
    const banner = document.getElementById('tzBanner');
    const msg = document.getElementById('tzBannerMsg');
    const close = document.getElementById('tzBannerClose');
    if (!banner || !msg || !close) return;

    // If user has disabled the indicator setting, never show the banner.
    const enabled = typeof Settings !== 'undefined' && Settings.get ? Settings.get('sTzIndicators', true) : true;
    if (!enabled) { banner.style.display = 'none'; return; }

    const current = _currentTz();
    let lastKnown;
    try { lastKnown = localStorage.getItem(STORE_KEY); } catch { lastKnown = null; }

    // First ever visit: silently set baseline, show nothing.
    if (!lastKnown) {
      try { localStorage.setItem(STORE_KEY, current); } catch {}
      banner.style.display = 'none';
      return;
    }

    // Same tz as last visit: nothing to show.
    if (lastKnown === current) {
      banner.style.display = 'none';
      return;
    }

    // Tz changed. Show the banner.
    msg.innerHTML = 'Timezone changed: <strong>' + _shortName(lastKnown) + '</strong> \u2192 <strong>' + _shortName(current) + '</strong>. Your blocks are now displaying in local time.';
    banner.style.display = 'flex';

    close.onclick = () => {
      try { localStorage.setItem(STORE_KEY, current); } catch {}
      banner.style.display = 'none';
    };
  }

  // Called by Settings when the user toggles sTzIndicators off/on.
  function refresh() {
    const banner = document.getElementById('tzBanner');
    if (!banner) return;
    const enabled = typeof Settings !== 'undefined' && Settings.get ? Settings.get('sTzIndicators', true) : true;
    if (!enabled) { banner.style.display = 'none'; return; }
    // Re-run init logic if turning back on
    init();
  }

  return { init, refresh, _currentTz, _shortName };
})();
