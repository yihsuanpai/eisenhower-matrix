/* ============================================================================
   Eisenhower Matrix — optional cloud sync (Supabase + email one-time code)
   ----------------------------------------------------------------------------
   • 100% optional: if not configured (or offline, or SDK can't load), the app
     stays fully local and nothing here runs beyond a quiet no-op.
   • Login: passwordless 6-digit email code (works on web AND inside the iOS
     WKWebView — no magic-link redirect needed).
   • Model: the whole task state ("eisenhower_v7" blob) is stored as one JSON
     row per user. Last-write-wins by timestamp across your own devices.
   • Setup: see SYNC_SETUP.md. You can paste your Supabase URL + anon key either
     below (DEFAULT_*) or in-app (Profile → Sync → Set up), which stores them
     locally on the device. The anon key is public by design and safe to ship.
   ========================================================================== */
(function () {
  'use strict';

  // ---- Paste your project values here to ship them with the app (optional) --
  const DEFAULT_URL  = 'https://cpvgjqljzxrldczgzspe.supabase.co';
  const DEFAULT_ANON = 'sb_publishable_URhRKuYRARreTXkUAqeY9w_pGT78vKz';   // public/client-safe key

  const STORAGE_KEY = 'eisenhower_v7';
  const LS_CFG = 'ei_sync_cfg', LS_MTIME = 'ei_local_mtime', LS_META = 'ei_sync_meta', LS_DIRTY = 'ei_sync_dirty', LS_LOCAL = 'ei_local_board';
  const TABLE = 'boards';
  const SDK_URL = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';

  let sb = null, ready = false, pushTimer = null, statusText = '';

  // ---- config helpers ------------------------------------------------------
  function getCfg() {
    try { const o = JSON.parse(localStorage.getItem(LS_CFG) || 'null'); if (o && o.url && o.key) return o; } catch (e) {}
    if (DEFAULT_URL && DEFAULT_ANON) return { url: DEFAULT_URL, key: DEFAULT_ANON };
    return null;
  }
  function saveCfg(url, key) { localStorage.setItem(LS_CFG, JSON.stringify({ url: url.trim().replace(/\/$/, ''), key: key.trim() })); }
  function isConfigured() { return !!getCfg(); }
  function getMeta() { try { return JSON.parse(localStorage.getItem(LS_META) || '{}'); } catch (e) { return {}; } }
  function setMeta(p) { localStorage.setItem(LS_META, JSON.stringify(Object.assign(getMeta(), p))); }
  function stampLocal() { localStorage.setItem(LS_MTIME, Date.now().toString()); }
  function localMtime() { return parseInt(localStorage.getItem(LS_MTIME) || '0', 10); }
  // "dirty" = this device has local edits not yet confirmed in the cloud.
  function markDirty() { try { localStorage.setItem(LS_DIRTY, '1'); } catch (e) {} }
  function clearDirty() { try { localStorage.removeItem(LS_DIRTY); } catch (e) {} }
  function isDirty() { return localStorage.getItem(LS_DIRTY) === '1'; }
  // Snapshot of the board shown while logged out, so sign-out can restore "local only".
  function backupLocal() { try { localStorage.setItem(LS_LOCAL, localStorage.getItem(STORAGE_KEY) || '{}'); } catch (e) {} }

  // ---- SDK loader ----------------------------------------------------------
  function loadSDK() {
    return new Promise((res, rej) => {
      if (window.supabase && window.supabase.createClient) return res();
      const s = document.createElement('script');
      s.src = SDK_URL; s.async = true;
      s.onload = () => res();
      s.onerror = () => rej(new Error('Supabase SDK failed to load'));
      document.head.appendChild(s);
    });
  }

  function hideMenuItem() {
    const item = document.getElementById('pdSync');
    if (item) item.style.display = 'none';
  }

  async function init() {
    const c = getCfg();
    if (!c) { hideMenuItem(); return; }   // no developer-baked keys → users never see "Sync"
    try { await loadSDK(); } catch (e) { console.warn('[sync] offline / SDK unavailable'); return; }
    try {
      sb = window.supabase.createClient(c.url, c.key, { auth: {
        persistSession: true, autoRefreshToken: true,
        // Disable navigator.locks coordination. A held lock (stale session / another
        // tab) was deadlocking getSession(), which froze every sync op AND the Sync
        // modal (it hung on "Checking…", so no sign-in/out ever appeared).
        lock: function (name, acquireTimeout, fn) { return fn(); }
      } });
      ready = true;
      sb.auth.onAuthStateChange(() => updateBadge());
      if (currentUser()) { setStatus('Syncing…'); await reconcile(); }   // reload → pull latest from cloud
      else { maybeNudge(); }
      updateBadge();
    } catch (e) { console.warn('[sync] init error', e); ready = false; }
  }

  // Read the user straight from the persisted session in localStorage. This never
  // calls the auth lock, so it can't hang — unlike getUser()/getSession(), whose
  // navigator.locks deadlock was freezing all sync and the Sync modal.
  function currentUser() {
    if (!ready) return null;
    try {
      const k = Object.keys(localStorage).find(x => /^sb-.*-auth-token$/.test(x));
      if (!k) return null;
      const s = JSON.parse(localStorage.getItem(k) || 'null');
      const u = s && (s.user || (s.currentSession && s.currentSession.user));
      return u && u.id ? u : null;
    } catch (e) { return null; }
  }

  // ---- auth (email one-time code) -----------------------------------------
  async function sendCode(email) {
    if (!ready) throw new Error('Sync not configured');
    const { error } = await sb.auth.signInWithOtp({ email: email.trim(), options: { shouldCreateUser: true } });
    if (error) throw error;
  }
  async function verifyCode(email, token) {
    if (!ready) throw new Error('Sync not configured');
    const { error } = await sb.auth.verifyOtp({ email: email.trim(), token: token.trim(), type: 'email' });
    if (error) throw error;
    backupLocal();                         // keep the logged-out (local-only) board to restore on sign-out
    clearDirty();                          // pre-login edits belong to the local board, not this account
    await reconcile();                     // first thing after login: pull this account's data from the cloud
    updateBadge();
  }
  async function signOut() {
    if (ready) { try { await sb.auth.signOut(); } catch (e) {} }
    clearTimeout(pushTimer);
    const backup = localStorage.getItem(LS_LOCAL);     // restore the logged-out / local-only board
    if (backup !== null) {
      localStorage.setItem(STORAGE_KEY, backup);
      localStorage.removeItem(LS_LOCAL);
      stampLocal(); rerender();                        // show local data immediately, no reload needed
    }
    clearDirty();
    setStatus(''); updateBadge();
  }

  // ---- sync core (last-write-wins) ----------------------------------------
  function notifyChange() {            // called by saveData()
    stampLocal();
    markDirty();                       // local change not yet pushed to the cloud
    if (!ready) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(() => { push(); }, 1500);   // debounce bursts of edits
  }

  async function push() {
    const user = await currentUser(); if (!user) return;
    setStatus('Saving…');
    let blob; try { blob = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch (e) { blob = {}; }
    const now = new Date().toISOString();
    const { error } = await sb.from(TABLE).upsert(
      { user_id: user.id, data: blob, updated_at: now },
      { onConflict: 'user_id' }
    );
    if (error) { setStatus('Sync error'); console.warn('[sync] push', error); }
    else { clearDirty(); setMeta({ lastPushedAt: now, remoteUpdatedAt: now }); setStatus('Synced'); }
    updateBadge();
  }

  async function pull() {
    const user = await currentUser(); if (!user) return;
    const { data, error } = await sb.from(TABLE).select('data, updated_at').eq('user_id', user.id).maybeSingle();
    if (error) { setStatus('Sync error'); console.warn('[sync] pull', error); updateBadge(); return; }
    if (!data) { await push(); return; }              // nothing in cloud yet → seed it from this device
    const remoteT = Date.parse(data.updated_at) || 0;
    if (remoteT >= localMtime()) { applyRemote(data.data); setMeta({ lastPulledAt: new Date().toISOString(), remoteUpdatedAt: data.updated_at }); setStatus('Synced'); }
    else { await push(); }                             // local is newer → upload
    updateBadge();
  }

  // Explicit sync — runs on page load and on the "Sync now" button.
  // The cloud is the source of truth here, so the device adopts the cloud copy.
  // The only exception: if this device has edits that never reached the cloud
  // (offline, or saved <2s before reload), we upload those first so nothing is lost.
  async function reconcile() {
    const user = await currentUser(); if (!user) return;
    setStatus('Syncing…'); updateBadge();
    if (isDirty()) {                                   // flush unsynced local edits up first…
      await push();
      if (isDirty()) { updateBadge(); return; }        // …push failed → keep local, don't let remote clobber it
    }
    const { data, error } = await sb.from(TABLE).select('data, updated_at').eq('user_id', user.id).maybeSingle();
    if (error) { setStatus('Sync error'); console.warn('[sync] reconcile', error); updateBadge(); return; }
    if (!data) { await push(); return; }               // nothing in the cloud yet → seed it from this device
    applyRemote(data.data);                            // adopt the authoritative cloud copy + re-render
    clearDirty();                                      // applyRemote's re-render may flag dirty; we're in sync
    setMeta({ lastPulledAt: new Date().toISOString(), remoteUpdatedAt: data.updated_at });
    setStatus('Synced'); updateBadge();
  }

  // Adopt a remote blob into the running app + re-render everything.
  function applyRemote(obj) {
    if (!obj || typeof obj !== 'object') return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
    stampLocal();
    rerender();
  }

  // Reload the running app from localStorage and repaint the whole UI.
  function rerender() {
    try {
      if (typeof window.loadData === 'function') window.loadData();
      if (typeof window.applyLanguageFromProfile === 'function') window.applyLanguageFromProfile();
      if (window.I18n && I18n.applyI18n) I18n.applyI18n();
      ['renderMatrix','renderTopicRail','renderCurrentTab','renderDeadlineBar','renderAddBarTopics','renderMotto','updateMoodBtn','updateProfileAvatar','updateThemeBtns']
        .forEach(fn => { if (typeof window[fn] === 'function') window[fn](); });
    } catch (e) { console.warn('[sync] rerender', e); }
  }

  // ---- status badge in the profile dropdown -------------------------------
  function setStatus(t) { statusText = t; }
  function status() { return statusText; }
  async function updateBadge() {
    const item = document.getElementById('pdSync'); if (!item) return;
    let lbl = item.querySelector('.pd-label'); if (!lbl) return;
    if (!isConfigured()) { lbl.textContent = (window.I18n ? I18n.t('pd.sync') : 'Sync'); return; }
    const user = await currentUser();
    lbl.textContent = user ? ('Sync · ' + (statusText || 'on')) : 'Sync · sign in';
  }

  // ===== UI — mobile-first passwordless sign-in ============================
  function ensureStyles() {
    if (document.getElementById('eis-style')) return;
    const s = document.createElement('style'); s.id = 'eis-style';
    s.textContent = `
    .eis-bd{position:fixed;inset:0;z-index:9300;display:flex;align-items:center;justify-content:center;
      background:rgba(0,0,0,.55);-webkit-backdrop-filter:blur(7px);backdrop-filter:blur(7px);padding:16px;animation:eisFade .18s ease}
    @keyframes eisFade{from{opacity:0}to{opacity:1}}
    .eis-sheet{position:relative;width:100%;max-width:400px;background:var(--surface);border:1px solid var(--border);
      border-radius:24px;padding:28px 24px calc(24px + env(safe-area-inset-bottom));box-shadow:0 24px 70px rgba(0,0,0,.5);animation:eisPop .22s cubic-bezier(.2,.9,.3,1)}
    @keyframes eisPop{from{opacity:0;transform:translateY(10px) scale(.985)}to{opacity:1;transform:none}}
    .eis-mark{width:52px;height:52px;border-radius:15px;display:flex;align-items:center;justify-content:center;font-size:27px;color:#fff;
      background:linear-gradient(135deg,var(--accent3),var(--accent));margin:0 auto 16px;box-shadow:0 6px 20px var(--accent-glow)}
    .eis-title{font-size:22px;font-weight:800;text-align:center;color:var(--text);margin:0 0 6px;letter-spacing:-.3px}
    .eis-sub{font-size:14.5px;line-height:1.5;text-align:center;color:var(--text-dim);margin:0 0 22px}
    .eis-sub b{color:var(--text)}
    .eis-input{width:100%;box-sizing:border-box;background:var(--surface2);color:var(--text);border:1.5px solid var(--border);
      border-radius:14px;padding:16px;font-size:17px;outline:none;transition:border-color .15s,box-shadow .15s;-webkit-appearance:none}
    .eis-input::placeholder{color:var(--text-dim)}
    .eis-input:focus{border-color:var(--accent2);box-shadow:0 0 0 3px var(--accent2-glow)}
    .eis-code{text-align:center;font-size:28px;font-weight:800;letter-spacing:14px;padding-left:14px}
    .eis-btn{width:100%;box-sizing:border-box;height:54px;border:none;border-radius:14px;font-size:16.5px;font-weight:700;cursor:pointer;
      margin-top:14px;color:#fff;background:linear-gradient(135deg,var(--accent3),var(--accent));transition:opacity .15s,transform .08s;-webkit-appearance:none}
    .eis-btn:active{transform:scale(.985)}
    .eis-btn[disabled]{opacity:.45;cursor:default}
    .eis-btn.sec{background:var(--surface2);color:var(--text);border:1px solid var(--border)}
    .eis-link{display:inline-block;background:none;border:none;color:var(--accent2);font-size:14px;cursor:pointer;padding:10px;margin-top:2px;font-weight:600}
    .eis-msg{font-size:13.5px;text-align:center;min-height:18px;margin-top:14px;color:var(--text-dim);line-height:1.4}
    .eis-msg.err{color:#ff7a7a}.eis-msg.ok{color:var(--accent2)}
    .eis-foot{text-align:center;margin-top:6px}
    .eis-row{display:flex;gap:6px;align-items:center;justify-content:center;margin-top:8px;color:var(--text-dim);font-size:13px}
    .eis-close{position:absolute;top:14px;right:16px;background:none;border:none;color:var(--text-dim);font-size:26px;line-height:1;cursor:pointer;padding:4px}
    .eis-card{background:var(--surface2);border:1px solid var(--border);border-radius:14px;padding:14px 16px;text-align:center}
    .eis-spin{width:30px;height:30px;border:3px solid var(--border);border-top-color:var(--accent2);border-radius:50%;margin:8px auto 0;animation:eisSpin .8s linear infinite}
    @keyframes eisSpin{to{transform:rotate(360deg)}}
    /* one-time discovery nudge */
    .eis-nudge{position:fixed;left:12px;right:12px;bottom:calc(12px + env(safe-area-inset-bottom));z-index:9200;display:flex;align-items:center;gap:12px;
      background:var(--surface2);border:1px solid var(--border);border-radius:14px;padding:12px 14px;box-shadow:0 8px 28px rgba(0,0,0,.4);animation:eisUp .3s cubic-bezier(.2,.9,.3,1);max-width:520px;margin:0 auto}
    .eis-nudge .t{flex:1;min-width:0;font-size:13.5px;color:var(--text);line-height:1.35}
    .eis-nudge .t span{color:var(--text-dim);font-size:12px}
    .eis-nudge button{flex-shrink:0}
    .eis-nudge .go{background:linear-gradient(135deg,var(--accent3),var(--accent));color:#fff;border:none;border-radius:10px;padding:9px 14px;font-size:13px;font-weight:700;cursor:pointer}
    .eis-nudge .x{background:none;border:none;color:var(--text-dim);font-size:20px;cursor:pointer;padding:2px 4px;line-height:1}
    @keyframes eisUp{from{transform:translateY(120%)}to{transform:none}}
    @media (max-width:480px){
      .eis-bd{align-items:flex-end;padding:0}
      .eis-sheet{max-width:none;border-radius:24px 24px 0 0;padding:26px 22px calc(28px + env(safe-area-inset-bottom));animation:eisSlide .28s cubic-bezier(.2,.9,.3,1)}
      @keyframes eisSlide{from{transform:translateY(100%)}to{transform:none}}
    }`;
    document.head.appendChild(s);
  }

  let _bd = null;
  function openSheet() {
    ensureStyles();
    if (_bd) _bd.remove();
    _bd = document.createElement('div'); _bd.className = 'eis-bd';
    const sheet = document.createElement('div'); sheet.className = 'eis-sheet';
    _bd.appendChild(sheet);
    _bd.addEventListener('click', e => { if (e.target === _bd) closeSheet(); });
    document.body.appendChild(_bd);
    return sheet;
  }
  function closeSheet() { if (_bd) { _bd.remove(); _bd = null; } }
  const closeBtn = '<button class="eis-close" aria-label="Close">×</button>';

  async function openModal() {
    dismissNudge();
    if (!isConfigured()) return renderConfig(openSheet());
    if (!ready) { const s = openSheet(); renderLoading(s, 'Connecting…'); try { await init(); } catch (e) {} }
    const sheet = (_bd && _bd.querySelector('.eis-sheet')) || openSheet();
    renderLoading(sheet, 'Checking…');
    const user = await currentUser();
    if (user) renderSignedIn(sheet, user); else renderEmail(sheet);
  }

  function renderLoading(sheet, text) {
    sheet.innerHTML = closeBtn + '<div class="eis-mark">✦</div><p class="eis-sub" style="margin-top:8px">' + text + '</p><div class="eis-spin"></div>';
    sheet.querySelector('.eis-close').addEventListener('click', closeSheet);
  }

  function renderEmail(sheet) {
    sheet.innerHTML = closeBtn +
      '<div class="eis-mark">✦</div>' +
      '<h2 class="eis-title">Sync your tasks</h2>' +
      '<p class="eis-sub">Sign in to keep your matrix in sync across the web and your iPhone. No password — we email you a code.</p>' +
      '<input id="eis-email" class="eis-input" type="email" inputmode="email" autocomplete="email" autocapitalize="off" autocorrect="off" enterkeyhint="go" placeholder="you@example.com">' +
      '<button id="eis-send" class="eis-btn">Email me a code</button>' +
      '<div class="eis-msg" id="eis-msg"></div>' +
      '<div class="eis-foot"><button id="eis-link" class="eis-link">Send a sign-in link instead</button></div>';
    sheet.querySelector('.eis-close').addEventListener('click', closeSheet);
    const email = sheet.querySelector('#eis-email');
    const msg = sheet.querySelector('#eis-msg');
    const setMsg = (t, cls) => { msg.textContent = t; msg.className = 'eis-msg' + (cls ? ' ' + cls : ''); };
    setTimeout(() => email.focus(), 60);
    const send = async () => {
      if (!email.value.trim()) { setMsg('Enter your email first.', 'err'); email.focus(); return; }
      const btn = sheet.querySelector('#eis-send'); btn.disabled = true; setMsg('Sending your code…');
      try { await sendCode(email.value); renderCode(sheet, email.value.trim()); }
      catch (e) { btn.disabled = false; setMsg(friendly(e), 'err'); }
    };
    sheet.querySelector('#eis-send').addEventListener('click', send);
    email.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); send(); } });
    sheet.querySelector('#eis-link').addEventListener('click', async () => {
      if (!email.value.trim()) { setMsg('Enter your email first.', 'err'); email.focus(); return; }
      setMsg('Sending a sign-in link…');
      try {
        await sb.auth.signInWithOtp({ email: email.value.trim(), options: { emailRedirectTo: window.location.href, shouldCreateUser: true } });
        setMsg('Link sent to ' + email.value.trim() + '. Open it on this device to finish.', 'ok');
      } catch (e) { setMsg(friendly(e), 'err'); }
    });
  }

  function renderCode(sheet, email) {
    sheet.innerHTML = closeBtn +
      '<div class="eis-mark">✦</div>' +
      '<h2 class="eis-title">Enter your code</h2>' +
      '<p class="eis-sub">We sent a 6-digit code to <b>' + email + '</b>.</p>' +
      '<input id="eis-code" class="eis-input eis-code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]*" maxlength="6" enterkeyhint="go" placeholder="––––––">' +
      '<button id="eis-verify" class="eis-btn">Verify & sync</button>' +
      '<div class="eis-msg" id="eis-msg"></div>' +
      '<div class="eis-row"><button id="eis-resend" class="eis-link">Resend code</button><span>·</span><button id="eis-back" class="eis-link">Change email</button></div>';
    sheet.querySelector('.eis-close').addEventListener('click', closeSheet);
    const code = sheet.querySelector('#eis-code');
    const msg = sheet.querySelector('#eis-msg');
    const setMsg = (t, cls) => { msg.textContent = t; msg.className = 'eis-msg' + (cls ? ' ' + cls : ''); };
    setTimeout(() => code.focus(), 60);
    const verify = async () => {
      const v = (code.value || '').replace(/\D/g, '');
      if (v.length < 6) { setMsg('Enter the 6-digit code.', 'err'); return; }
      const btn = sheet.querySelector('#eis-verify'); btn.disabled = true; setMsg('Verifying…');
      try { await verifyCode(email, v); renderSuccess(sheet); }
      catch (e) { btn.disabled = false; setMsg(friendly(e), 'err'); code.focus(); code.select(); }
    };
    sheet.querySelector('#eis-verify').addEventListener('click', verify);
    code.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); verify(); } });
    code.addEventListener('input', () => { if (code.value.replace(/\D/g, '').length === 6) verify(); }); // auto-submit on 6 digits
    sheet.querySelector('#eis-resend').addEventListener('click', async () => {
      setMsg('Resending…'); try { await sendCode(email); setMsg('New code sent.', 'ok'); } catch (e) { setMsg(friendly(e), 'err'); }
    });
    sheet.querySelector('#eis-back').addEventListener('click', () => renderEmail(sheet));
  }

  function renderSuccess(sheet) {
    sheet.innerHTML = '<div class="eis-mark" style="background:linear-gradient(135deg,var(--accent2),var(--accent))">✓</div>' +
      '<h2 class="eis-title">You\'re all synced</h2>' +
      '<p class="eis-sub">Your tasks now follow you across the web and your iPhone. Sign in with the same email anywhere.</p>' +
      '<button id="eis-done" class="eis-btn">Done</button>';
    sheet.querySelector('#eis-done').addEventListener('click', closeSheet);
    setTimeout(() => { if (_bd) closeSheet(); }, 2600);
  }

  function renderSignedIn(sheet, user) {
    const m = getMeta(); const last = m.lastPulledAt || m.lastPushedAt;
    const when = last ? new Date(last).toLocaleString() : 'just now';
    sheet.innerHTML = closeBtn +
      '<div class="eis-mark" style="background:linear-gradient(135deg,var(--accent2),var(--accent))">✓</div>' +
      '<h2 class="eis-title">Sync is on</h2>' +
      '<p class="eis-sub">Your tasks sync automatically across every device signed in with this email.</p>' +
      '<div class="eis-card"><div style="font-size:14px;color:var(--text);font-weight:600">' + (user && user.email ? user.email : 'Signed in') + '</div>' +
      '<div style="font-size:12px;color:var(--text-dim);margin-top:3px">Last synced: ' + when + '</div></div>' +
      '<button id="eis-now" class="eis-btn">Sync now</button>' +
      '<button id="eis-out" class="eis-btn sec">Sign out</button>';
    sheet.querySelector('.eis-close').addEventListener('click', closeSheet);
    sheet.querySelector('#eis-now').addEventListener('click', async () => {
      const b = sheet.querySelector('#eis-now'); b.disabled = true; b.textContent = 'Syncing…';
      await reconcile(); renderSignedIn(sheet, user);
    });
    sheet.querySelector('#eis-out').addEventListener('click', async () => { await signOut(); closeSheet(); });
  }

  function renderConfig(sheet) {
    sheet.innerHTML = closeBtn +
      '<div class="eis-mark">☁</div><h2 class="eis-title">Connect sync</h2>' +
      '<p class="eis-sub">One-time developer step: paste your Supabase <b>Project URL</b> and <b>anon key</b> (see SYNC_SETUP.md).</p>' +
      '<input id="eis-u" class="eis-input" placeholder="https://xxxx.supabase.co" style="margin-bottom:10px">' +
      '<input id="eis-k" class="eis-input" placeholder="anon public key">' +
      '<button id="eis-save" class="eis-btn">Save & continue</button>';
    sheet.querySelector('.eis-close').addEventListener('click', closeSheet);
    sheet.querySelector('#eis-save').addEventListener('click', async () => {
      const u = sheet.querySelector('#eis-u').value, k = sheet.querySelector('#eis-k').value;
      if (!u.trim() || !k.trim()) return;
      saveCfg(u, k); ready = false; sb = null;
      try { await init(); } catch (e) {}
      openModal();
    });
  }

  function friendly(e) {
    const m = (e && (e.message || e.error_description || e.msg)) ? (e.message || e.error_description || e.msg) : String(e);
    if (/rate|limit|429|too many/i.test(m)) return 'Too many requests — the email service is over its hourly limit. Please wait a while and try again.';
    if (/sending (confirmation|recovery|magic|the )?email|error sending|smtp|email provider|unexpected_failure/i.test(m))
      return 'Couldn\'t send the email right now — the mail service is unavailable or over its limit. Please try again later.';
    if (/invalid|expired|token/i.test(m)) return 'That code didn\'t work. Check it or resend.';
    if (/network|fetch|Failed to/i.test(m)) return 'No connection. Check your internet and retry.';
    return m;
  }

  // ---- one-time discovery nudge -------------------------------------------
  function maybeNudge() {
    try {
      if (localStorage.getItem('ei_sync_nudge') === 'done') return;
      if (document.querySelector('.eis-nudge')) return;
      ensureStyles();
      const n = document.createElement('div'); n.className = 'eis-nudge';
      n.innerHTML = '<div class="t">Sync across your devices<br><span>Sign in once — web &amp; iPhone stay in sync.</span></div>' +
        '<button class="go">Sign in</button><button class="x" aria-label="Dismiss">×</button>';
      n.querySelector('.go').addEventListener('click', () => { dismissNudge(true); openModal(); });
      n.querySelector('.x').addEventListener('click', () => dismissNudge(true));
      document.body.appendChild(n);
    } catch (e) {}
  }
  function dismissNudge(remember) {
    const n = document.querySelector('.eis-nudge'); if (n) n.remove();
    if (remember) { try { localStorage.setItem('ei_sync_nudge', 'done'); } catch (e) {} }
  }

  // ---- public API ----------------------------------------------------------
  window.CloudSync = { init, notifyChange, push, pull, reconcile, sendCode, verifyCode, signOut, status, isConfigured, saveCfg, openModal };
})();
