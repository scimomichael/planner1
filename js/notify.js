// ═════════════════════════════════════════════════════════
// NOTIFY — browser notifications 5 min before blocks start
// ═════════════════════════════════════════════════════════
const Notify = (() => {
  let pollTimer = null;
  const notifiedSet = new Set(); // "dk|index|start" — prevent repeats

  function init() {
    // Check saved preference
    const enabled = Settings.get('sNotify', false);
    if (enabled && 'Notification' in window && Notification.permission === 'granted') {
      start();
    }
  }

  function start() {
    stop();
    poll();
    pollTimer = setInterval(poll, 60000);
  }

  function stop() {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  }

  function poll() {
    if (!('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;

    const today = Store.todayStr();
    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const blocks = Store.schedule[today] || [];

    blocks.forEach((b, i) => {
      if (!b.start || b.done) return;
      const [h, m] = b.start.split(':').map(Number);
      const startMin = h * 60 + m;
      const diff = startMin - nowMin;
      const key = `${today}|${i}|${b.start}`;
      if (diff === 5 && !notifiedSet.has(key)) {
        notifiedSet.add(key);
        try {
          const n = new Notification(`Starting in 5 min: ${b.label}`, {
            body: `${b.start}–${b.end}`,
            icon: '/favicon.ico',
            tag: key,
          });
          setTimeout(() => { try { n.close(); } catch {} }, 15000);
        } catch (e) { /* ignore */ }
      }
    });

    // Clean old notifiedSet entries each midnight
    const hour = now.getHours();
    if (hour === 0 && nowMin < 2) notifiedSet.clear();
  }

  async function requestPermission() {
    if (!('Notification' in window)) {
      Store.toast('Your browser does not support notifications');
      return false;
    }
    if (Notification.permission === 'granted') { start(); return true; }
    if (Notification.permission === 'denied') {
      Store.toast('Permission denied. Enable in browser settings.');
      return false;
    }
    const perm = await Notification.requestPermission();
    if (perm === 'granted') { start(); Store.toast('Notifications enabled'); return true; }
    Store.toast('Permission not granted');
    return false;
  }

  return { init, start, stop, requestPermission };
})();
