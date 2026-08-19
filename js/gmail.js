// Gmail integration (read-only, manual, client-side).
//
// Privacy model:
//   - OAuth happens entirely in the browser via Google Identity Services.
//   - The access token lives in this tab (memory + sessionStorage) and is
//     NEVER sent to the planner backend or stored server-side.
//   - Scope is gmail.readonly. The app can search and read, never send,
//     delete, or modify anything.
//   - Nothing runs automatically. Gmail is only touched when the user
//     explicitly asks the AI to check their email, or taps Connect.
//   - Email text the AI reads does flow through the /api/chat function to
//     the Anthropic API as part of the conversation (that is how the AI
//     reads anything).
//
// Setup (one-time, in Google Cloud Console):
//   1. console.cloud.google.com -> create a project
//   2. Enable the Gmail API
//   3. OAuth consent screen: External, Testing mode, add yourself as a test user
//   4. Credentials -> Create OAuth client ID -> Web application
//      Authorized JavaScript origins: https://scimoplanner.com
//   5. Copy the Client ID into Settings -> Gmail in the planner
const Gmail = (() => {
  const SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';
  const LS_CLIENT_ID = 'pl3_gmail_client_id';
  const SS_TOKEN = 'pl3_gmail_token';
  let _token = null;        // { access_token, expires_at }
  let _tokenClient = null;
  let _clientIdAtInit = '';

  function clientId() { return (localStorage.getItem(LS_CLIENT_ID) || '').trim(); }
  function isConfigured() { return !!clientId(); }
  function isConnected() { return !!(_token && _token.expires_at > Date.now() + 30000); }

  (function _restore() {
    try {
      const t = JSON.parse(sessionStorage.getItem(SS_TOKEN));
      if (t && t.expires_at > Date.now() + 30000) _token = t;
    } catch {}
  })();

  function _ensureClient() {
    const id = clientId();
    if (_tokenClient && _clientIdAtInit === id) return _tokenClient;
    if (!(window.google && google.accounts && google.accounts.oauth2)) return null;
    _tokenClient = google.accounts.oauth2.initTokenClient({ client_id: id, scope: SCOPE, callback: () => {} });
    _clientIdAtInit = id;
    return _tokenClient;
  }

  function connect() {
    return new Promise((resolve, reject) => {
      if (!isConfigured()) return reject(new Error('No Google OAuth Client ID set. Paste it in Settings under Gmail.'));
      const tc = _ensureClient();
      if (!tc) return reject(new Error('Google sign-in script has not loaded yet. Wait a second and try again.'));
      tc.callback = resp => {
        if (resp.error) return reject(new Error('Google sign-in failed: ' + resp.error));
        _token = {
          access_token: resp.access_token,
          expires_at: Date.now() + (Number(resp.expires_in || 3600) - 60) * 1000,
        };
        try { sessionStorage.setItem(SS_TOKEN, JSON.stringify(_token)); } catch {}
        refreshSettingsUI();
        resolve(true);
      };
      tc.requestAccessToken({ prompt: '' });
    });
  }

  function disconnect() {
    _token = null;
    try { sessionStorage.removeItem(SS_TOKEN); } catch {}
    refreshSettingsUI();
  }

  async function _api(path) {
    const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/' + path, {
      headers: { Authorization: 'Bearer ' + _token.access_token },
    });
    if (res.status === 401 || res.status === 403) {
      _token = null;
      try { sessionStorage.removeItem(SS_TOKEN); } catch {}
      refreshSettingsUI();
      throw new Error('Gmail session expired. Reconnect in Settings.');
    }
    if (!res.ok) throw new Error('Gmail API error ' + res.status);
    return res.json();
  }

  function _b64(s) {
    const std = s.replace(/-/g, '+').replace(/_/g, '/');
    try { return decodeURIComponent(escape(atob(std))); }
    catch { try { return atob(std); } catch { return ''; } }
  }

  function _extractText(payload) {
    if (!payload) return '';
    if (payload.mimeType === 'text/plain' && payload.body && payload.body.data) return _b64(payload.body.data);
    if (payload.parts) {
      for (const p of payload.parts) { const t = _extractText(p); if (t) return t; }
    }
    if (payload.mimeType === 'text/html' && payload.body && payload.body.data) {
      const div = document.createElement('div');
      div.innerHTML = _b64(payload.body.data);
      return (div.textContent || '').trim();
    }
    return '';
  }

  function _header(msg, name) {
    const h = ((msg.payload && msg.payload.headers) || []).find(x => x.name.toLowerCase() === name.toLowerCase());
    return h ? h.value : '';
  }

  // Search Gmail and return decoded messages: [{from, subject, date, body}]
  async function search(query, max = 5) {
    if (!isConnected()) throw new Error('Gmail is not connected. Open Settings and connect Gmail first.');
    const capped = Math.max(1, Math.min(Number(max) || 5, 8));
    const list = await _api('messages?q=' + encodeURIComponent(query) + '&maxResults=' + capped);
    const out = [];
    for (const m of (list.messages || [])) {
      const full = await _api('messages/' + m.id + '?format=full');
      let body = _extractText(full.payload) || full.snippet || '';
      body = body.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
      if (body.length > 4000) body = body.slice(0, 4000) + '\n[...truncated]';
      out.push({ from: _header(full, 'From'), subject: _header(full, 'Subject'), date: _header(full, 'Date'), body });
    }
    return out;
  }

  function refreshSettingsUI() {
    const status = document.getElementById('gmailStatus');
    const btn = document.getElementById('gmailConnectBtn');
    const idField = document.getElementById('gmailClientId');
    if (idField && idField.value !== clientId()) idField.value = clientId();
    if (!status || !btn) return;
    if (!isConfigured()) {
      status.textContent = 'Paste your Google OAuth Client ID above to enable';
      btn.textContent = 'Connect';
      btn.disabled = true;
    } else if (isConnected()) {
      status.textContent = 'Connected. Ask the AI things like "check my email for the tournament schedule"';
      btn.textContent = 'Disconnect';
      btn.disabled = false;
    } else {
      status.textContent = 'Not connected';
      btn.textContent = 'Connect';
      btn.disabled = false;
    }
  }

  function toggleConnect() {
    if (isConnected()) { disconnect(); return; }
    connect().catch(err => {
      const status = document.getElementById('gmailStatus');
      if (status) status.textContent = err.message || 'Connection failed';
    });
  }

  function saveClientId(val) {
    try { localStorage.setItem(LS_CLIENT_ID, (val || '').trim()); } catch {}
    _tokenClient = null; // force re-init with the new ID
    refreshSettingsUI();
  }

  function init() { refreshSettingsUI(); }

  return { init, connect, disconnect, search, isConnected, isConfigured, refreshSettingsUI, toggleConnect, saveClientId };
})();
