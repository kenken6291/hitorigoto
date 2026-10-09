/* =========================================================
 * ひとりごと — app.js  v1.1.0
 * ========================================================= */
(() => {
  'use strict';

  const CFG = window.APP_CONFIG || {};
  const LS_TOKEN = 'hitorigoto_token';
  const LS_EMAIL = 'hitorigoto_email';
  const PAGE = CFG.PAGE_SIZE || 20;

  /* ---------------- 定数 ---------------- */
  const CHARACTERS = [
    { key: 'obachan', name: 'なにわのおかん', icon: '🍬', desc: '関西弁で世話焼き。飴ちゃんもくれる' },
    { key: 'yousei', name: 'ふわふわ妖精ぽわん', icon: '🧚', desc: 'ふんわり包んでおまじない' },
    { key: 'shitsuji', name: '執事セバスチャン', icon: '🎩', desc: 'うやうやしく全肯定' },
    { key: 'neko', name: 'こたつ猫', icon: '🐈', desc: 'そっけないけど隣にいる' },
    { key: 'ojiichan', name: '縁側の源さん', icon: '🍵', desc: 'のんびり昔話で励ます' },
  ];
  const EMOTION_TAGS = ['うれしい', 'たのしい', 'ほっこり', 'すっきり', 'どきどき', 'なんとなく',
    'ねむい', 'つかれた', 'もやもや', 'ふあん', 'かなしい', 'いらいら'];
  const EMOJIS = ['😊', '🥰', '😆', '😌', '🍵', '✨', '🔥', '🤔', '😴', '🫠', '🌧️', '😢', '😭', '😰', '😤', '😡', '🌙', '💭'];
  const REACTIONS = [
    { key: 'wakaru', icon: '🙋', label: 'わかる〜' },
    { key: 'yoshiyoshi', icon: '🤲', label: 'よしよし' },
    { key: 'erai', icon: '👏', label: 'えらい！' },
    { key: 'gyu', icon: '🫂', label: 'ぎゅっ' },
  ];
  const ZONES = {
    bakuhatsu: { name: '深夜テンション爆発エリア', icon: '🎆', color: '#FFD36E', desc: 'うれしさが止まらない人たちの打ち上げ花火会場。いっしょにワーッと盛り上がろう。' },
    kazan: { name: 'ぷんすか活火山エリア', icon: '🌋', color: '#FF7A6B', desc: '言いたいことが煮えたぎっている場所。ここで吐き出せば、少しは軽くなるはず。' },
    numa: { name: '深夜の懺悔沼エリア', icon: '🌙', color: '#9A8CFF', desc: 'しずかに沈んだ気持ちが集まる沼。ひとりで浸かっているわけじゃないよ。' },
    engawa: { name: '縁側ひなたぼっこエリア', icon: '🍵', color: '#7FD8C4', desc: 'おだやかで満ち足りた人たちが、のんびりお茶をすする縁側。' },
    nagi: { name: '無風の凪エリア', icon: '🌊', color: '#C9D3E6', desc: '波風の立たない、ふつうの一日。ふつうって、けっこう大事。' },
  };
  const ZONE_ORDER = ['bakuhatsu', 'kazan', 'numa', 'engawa', 'nagi'];
  const NAGI_RADIUS = 30;
  const VOICE_MAX_SEC = 120;
  const TEXT_MAX = 400;

  const EYE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
  const EYE_OFF = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17.9 17.9A10.4 10.4 0 0 1 12 19c-6.4 0-10-7-10-7a18.5 18.5 0 0 1 4.2-5.1M9.9 5.2A9.6 9.6 0 0 1 12 5c6.4 0 10 7 10 7a18.6 18.6 0 0 1-2.2 3.2"/><path d="M14.1 14.2a3 3 0 0 1-4.3-4.3"/><path d="M3 3l18 18"/></svg>';

  /* ---------------- 状態 ---------------- */
  const state = {
    token: localStorage.getItem(LS_TOKEN) || '',
    user: null,
    compose: { emoji: '😊', tag: '', character: 'obachan', emojiTouched: false },
    mine: { offset: 0, loaded: false, busy: false },
    pub: { offset: 0, loaded: false, busy: false },
    mapScope: 'mine',
    mapCache: { mine: null, all: null },
    lastPostId: null,
    pwForced: false,
  };

  /* ---------------- ユーティリティ ---------------- */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function timeAgo(iso) {
    const t = new Date(iso).getTime();
    if (!t) return '';
    const s = Math.floor((Date.now() - t) / 1000);
    if (s < 60) return 'いま';
    if (s < 3600) return Math.floor(s / 60) + '分前';
    if (s < 86400) return Math.floor(s / 3600) + '時間前';
    if (s < 86400 * 7) return Math.floor(s / 86400) + '日前';
    const d = new Date(t);
    return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
  }

  function zoneOf(x, y) {
    if (x * x + y * y <= NAGI_RADIUS * NAGI_RADIUS) return 'nagi';
    if (x >= 0 && y >= 0) return 'bakuhatsu';
    if (x < 0 && y >= 0) return 'kazan';
    if (x < 0 && y < 0) return 'numa';
    return 'engawa';
  }

  function charOf(key) {
    return CHARACTERS.find((c) => c.key === key) || CHARACTERS[0];
  }

  function hashStr(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }

  function seeded(n) {
    const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
    return x - Math.floor(x);
  }

  function hexA(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }

  /* ---------------- API ---------------- */
  async function api(action, payload = {}) {
    if (!CFG.GAS_API_URL || CFG.GAS_API_URL.includes('XXXX')) {
      throw new Error('config.js の GAS_API_URL を設定してください');
    }
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), CFG.REQUEST_TIMEOUT_MS || 60000);
    let res;
    try {
      res = await fetch(CFG.GAS_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action, token: state.token, payload }),
        signal: ctrl.signal,
      });
    } catch (e) {
      throw new Error(e.name === 'AbortError' ? '応答に時間がかかっています。少し待ってからもう一度お試しください' : '通信できませんでした。電波の状態を確認してください');
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) throw new Error(`通信に失敗しました（${res.status}）`);
    let j;
    try { j = await res.json(); } catch { throw new Error('サーバーの応答を読み取れませんでした。GASのデプロイ設定を確認してください'); }
    if (!j.ok) {
      const err = new Error(j.error || 'エラーが起きました');
      err.code = j.code;
      if (j.code === 'SESSION_EXPIRED' || j.code === 'AUTH_REQUIRED') {
        clearSession();
        showAuth();
      } else if (j.code === 'PASSWORD_CHANGE_REQUIRED') {
        openPwDialog(true);
      }
      throw err;
    }
    return j.data;
  }

  /* ---------------- UI共通 ---------------- */
  let toastTimer;
  function toast(msg, isError = false) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.toggle('is-error', isError);
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, isError ? 5000 : 3000);
  }

  function loading(on, text = '読み込み中…', icon = '💭') {
    $('#loading').hidden = !on;
    $('#loadingText').textContent = text;
    $('#loadingIcon').textContent = icon;
  }

  function note(form, msg, type) {
    const n = $('.form-note', form);
    if (!n) return;
    n.textContent = msg || '';
    n.classList.toggle('is-error', type === 'error');
    n.classList.toggle('is-ok', type === 'ok');
  }

  async function withButton(btn, fn) {
    if (btn.disabled) return;
    btn.disabled = true;
    try { return await fn(); } finally { btn.disabled = false; }
  }

  function initPwToggles(root = document) {
    $$('.pw-toggle', root).forEach((b) => {
      if (b.dataset.ready) return;
      b.dataset.ready = '1';
      b.innerHTML = EYE;
      b.addEventListener('click', () => {
        const input = b.parentElement.querySelector('input');
        const show = input.type === 'password';
        input.type = show ? 'text' : 'password';
        b.innerHTML = show ? EYE_OFF : EYE;
        b.setAttribute('aria-pressed', String(show));
        b.setAttribute('aria-label', show ? 'パスワードを隠す' : 'パスワードを表示');
        input.focus();
      });
    });
  }

  function resetPwFields(form) {
    $$('input[type="text"], input[type="password"]', form).forEach((i) => {
      if (i.closest('.pw-wrap')) i.type = 'password';
      i.value = '';
    });
    $$('.pw-toggle', form).forEach((b) => {
      b.innerHTML = EYE;
      b.setAttribute('aria-pressed', 'false');
      b.setAttribute('aria-label', 'パスワードを表示');
    });
  }

  /* ---------------- セッション ---------------- */
  function saveSession(data) {
    if (data.token) {
      state.token = data.token;
      localStorage.setItem(LS_TOKEN, data.token);
    }
    if (data.user) {
      state.user = data.user;
      localStorage.setItem(LS_EMAIL, data.user.email);
      renderUserBox();
    }
  }

  function clearSession() {
    state.token = '';
    state.user = null;
    localStorage.removeItem(LS_TOKEN);
    state.mine = { offset: 0, loaded: false, busy: false };
    state.pub = { offset: 0, loaded: false, busy: false };
    state.mapCache = { mine: null, all: null };
  }

  function renderUserBox() {
    if (!state.user) return;
    $('#userName').textContent = state.user.nickname;
    $('#userCharIcon').textContent = charOf(state.user.defaultCharacter).icon;
  }

  /* ---------------- 画面切り替え ---------------- */
  function showAuth() {
    $('#authView').hidden = false;
    $('#appView').hidden = true;
    $('#userBox').hidden = true;
    const email = localStorage.getItem(LS_EMAIL);
    if (email) $('#loginForm [name="email"]').value = email;
  }

  function enterApp() {
    $('#authView').hidden = true;
    $('#appView').hidden = false;
    $('#userBox').hidden = false;
    renderUserBox();
    state.compose.character = state.user.defaultCharacter || 'obachan';
    renderCharPicker();
    switchTab('post');
  }

  function switchAuth(mode) {
    $$('[data-auth]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.auth === mode)));
    $('#loginForm').hidden = mode !== 'login';
    $('#registerForm').hidden = mode !== 'register';
    $('#forgotForm').hidden = mode !== 'forgot';
  }

  function switchTab(name) {
    Voice.cancelIfRecording();
    $$('.tab').forEach((t) => t.setAttribute('aria-selected', String(t.dataset.tab === name)));
    ['post', 'mine', 'public', 'map'].forEach((n) => { $('#tab-' + n).hidden = n !== name; });
    if (name === 'mine' && !state.mine.loaded) loadMine(true);
    if (name === 'public' && !state.pub.loaded) loadPublic(true);
    if (name === 'map') loadMap();
    window.scrollTo({ top: 0 });
  }

  /* ---------------- 認証フォーム ---------------- */
  async function onLogin(e) {
    e.preventDefault();
    const f = e.currentTarget;
    const email = f.email.value.trim();
    const password = f.password.value;
    if (!email || !password) return note(f, 'メールアドレスとパスワードを入力してください', 'error');
    await withButton($('button[type="submit"]', f), async () => {
      note(f, 'ログインしています…');
      try {
        const data = await api('login', { email, password });
        saveSession(data);
        resetPwFields(f);
        note(f, '');
        if (data.user.isFirstLogin) openPwDialog(true);
        else enterApp();
      } catch (err) {
        note(f, err.message, 'error');
      }
    });
  }

  async function onRegister(e) {
    e.preventDefault();
    const f = e.currentTarget;
    const email = f.email.value.trim();
    const nickname = f.nickname.value.trim();
    if (!email || !nickname) return note(f, 'メールアドレスとニックネームを入力してください', 'error');
    await withButton($('button[type="submit"]', f), async () => {
      note(f, '送信しています…');
      try {
        const data = await api('register', { email, nickname });
        f.reset();
        switchAuth('login');
        $('#loginForm [name="email"]').value = email;
        note($('#loginForm'), data.message, 'ok');
        $('#loginForm [name="password"]').focus();
      } catch (err) {
        note(f, err.message, 'error');
      }
    });
  }

  async function onForgot(e) {
    e.preventDefault();
    const f = e.currentTarget;
    const email = f.email.value.trim();
    if (!email) return note(f, 'メールアドレスを入力してください', 'error');
    await withButton($('button[type="submit"]', f), async () => {
      note(f, '送信しています…');
      try {
        const data = await api('forgotPassword', { email });
        switchAuth('login');
        $('#loginForm [name="email"]').value = email;
        note($('#loginForm'), data.message, 'ok');
      } catch (err) {
        note(f, err.message, 'error');
      }
    });
  }

  /* ---------------- パスワード変更 ---------------- */
  function openPwDialog(forced) {
    const d = $('#pwDialog');
    state.pwForced = forced;
    const f = $('#pwForm');
    resetPwFields(f);
    note(f, '');
    $('#pwTitle').textContent = forced ? '新しいパスワードを決めましょう' : 'パスワードを変更する';
    $('#pwLead').hidden = !forced;
    $('#pwCurrentLabel').textContent = forced ? '仮パスワード（メールに書いてあるもの）' : 'いまのパスワード';
    $('#pwCancel').hidden = forced;
    if (!d.open) d.showModal();
    setTimeout(() => $('[name="currentPassword"]', f).focus(), 50);
  }

  async function onPwChange(e) {
    e.preventDefault();
    const f = e.currentTarget;
    const cur = f.currentPassword.value;
    const next = f.newPassword.value;
    const conf = f.confirmPassword.value;
    if (!cur || !next) return note(f, 'すべての欄を入力してください', 'error');
    if (next.length < 8 || !/[A-Za-z]/.test(next) || !/[0-9]/.test(next)) {
      return note(f, '新しいパスワードは8文字以上で、英字と数字を両方入れてください', 'error');
    }
    if (next !== conf) return note(f, '確認用のパスワードが一致しません', 'error');
    await withButton($('button[type="submit"]', f), async () => {
      note(f, '変更しています…');
      try {
        const data = await api('changePassword', { currentPassword: cur, newPassword: next });
        saveSession(data);
        const wasForced = state.pwForced;
        state.pwForced = false;
        resetPwFields(f);
        $('#pwDialog').close();
        if (wasForced) {
          enterApp();
          toast('パスワードを設定しました。ようこそ！');
        } else {
          toast('パスワードを変更しました');
        }
      } catch (err) {
        note(f, err.message, 'error');
      }
    });
  }

  /* ---------------- 設定 ---------------- */
  function openSettings() {
    const f = $('#settingsForm');
    note(f, '');
    f.nickname.value = state.user.nickname;
    $('#settingsChar').value = state.user.defaultCharacter;
    $('#settingsEmail').textContent = '登録メール：' + state.user.email;
    $('#settingsDialog').showModal();
  }

  async function onSettings(e) {
    e.preventDefault();
    const f = e.currentTarget;
    const nickname = f.nickname.value.trim();
    if (!nickname) return note(f, 'ニックネームを入力してください', 'error');
    await withButton($('button[type="submit"]', f), async () => {
      try {
        const data = await api('updateProfile', { nickname, defaultCharacter: f.defaultCharacter.value });
        saveSession(data);
        state.compose.character = data.user.defaultCharacter;
        renderCharPicker();
        state.pub.loaded = false;
        state.mapCache.all = null;
        $('#settingsDialog').close();
        toast('設定を保存しました');
      } catch (err) {
        note(f, err.message, 'error');
      }
    });
  }

  /* ---------------- 投稿フォーム ---------------- */
  function renderComposer() {
    $('#emojiPicker').innerHTML = EMOJIS.map((em) =>
      `<button type="button" class="emoji-btn" data-emoji="${em}" aria-pressed="${em === state.compose.emoji}" aria-label="${em}">${em}</button>`).join('');
    $('#tagPicker').innerHTML = EMOTION_TAGS.map((t) =>
      `<button type="button" class="chip" data-tag="${t}" aria-pressed="false">${t}</button>`).join('');
    $('#settingsChar').innerHTML = CHARACTERS.map((c) => `<option value="${c.key}">${c.icon} ${c.name}</option>`).join('');
    updateVisHint();
  }

  function renderCharPicker() {
    $('#charPicker').innerHTML = CHARACTERS.map((c) => `
      <label class="char-card">
        <input type="radio" name="character" value="${c.key}" ${c.key === state.compose.character ? 'checked' : ''}>
        <span class="char-card-body">
          <span class="char-icon" aria-hidden="true">${c.icon}</span>
          <span class="char-name">${c.name}</span>
          <span class="char-desc">${c.desc}</span>
        </span>
      </label>`).join('');
  }

  function updateVisHint() {
    const pub = $('#postPublic').checked;
    const anon = $('#postAnon');
    anon.disabled = !pub;
    if (!pub) anon.checked = false;
    $('#visHint').textContent = !pub
      ? 'いまの設定：🔒 自分だけが見られます'
      : anon.checked
        ? 'いまの設定：🎭 名前を出さずに、みんなに公開します'
        : 'いまの設定：🌏 ニックネーム付きで、みんなに公開します';
  }

  async function onPost(e) {
    e.preventDefault();
    const ta = $('#postText');
    if (Voice.isRecording()) { toast('録音中です。「話し終えた」を押してから投稿してください', true); return; }
    const text = ta.value.trim();
    if (!text) { toast('ひとりごとを書いてください', true); ta.focus(); return; }
    const charKey = ($('input[name="character"]:checked') || {}).value || state.compose.character;
    const c = charOf(charKey);
    await withButton($('#postSubmit'), async () => {
      loading(true, `${c.name}が聞いてくれています…`, c.icon);
      try {
        const data = await api('createPost', {
          text,
          emoji: state.compose.emoji,
          emotionTag: state.compose.tag,
          character: charKey,
          isPublic: $('#postPublic').checked,
          isAnonymous: $('#postAnon').checked,
        });
        ta.value = '';
        updateCount();
        state.compose.tag = '';
        state.compose.emojiTouched = false;
        $$('#tagPicker .chip').forEach((b) => b.setAttribute('aria-pressed', 'false'));
        state.mine.loaded = false;
        state.mapCache.mine = null;
        if (data.post.isPublic) { state.pub.loaded = false; state.mapCache.all = null; }
        showReply(data.post);
      } catch (err) {
        toast(err.message, true);
      } finally {
        loading(false);
      }
    });
  }

  function updateCount() {
    const n = $('#postText').value.length;
    $('#postCount').textContent = n;
    $('.counter').classList.toggle('is-over', n >= 400);
  }

  function showReply(post) {
    const z = ZONES[zoneOf(post.x, post.y)];
    state.lastPostId = post.postId;
    $('#replyIcon').textContent = post.characterIcon;
    $('#replyName').textContent = post.characterName + 'より';
    $('#replyText').textContent = post.aiReply;
    $('#replyZone').textContent = `あなたの星は ${z.icon}『${z.name}』に灯りました。`;
    $('#replyDialog').showModal();
  }

  /* =========================================================
   * 音声入力（録音 → GAS → Geminiで整理 → 入力欄へ）
   * ========================================================= */
  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result).split(',')[1] || '');
      r.onerror = () => reject(new Error('音声データを読み込めませんでした'));
      r.readAsDataURL(blob);
    });
  }

  function fmtSec(s) {
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  const Voice = {
    rec: null,
    stream: null,
    chunks: [],
    timer: 0,
    startedAt: 0,
    canceled: false,
    mime: '',

    supported() {
      return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);
    },

    isRecording() {
      return !!(this.rec && this.rec.state === 'recording');
    },

    pickMime() {
      const list = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
      if (typeof MediaRecorder.isTypeSupported !== 'function') return '';
      return list.find((t) => MediaRecorder.isTypeSupported(t)) || '';
    },

    async toggle() {
      if (this.isRecording()) this.stop(false);
      else await this.start();
    },

    async start() {
      if (!this.supported()) {
        toast('このブラウザは録音に対応していません。文字で入力してください', true);
        return;
      }
      if ($('#postText').value.length >= TEXT_MAX) {
        toast('入力欄がいっぱいです。少し消してから話してください', true);
        return;
      }
      try {
        this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      } catch (e) {
        toast(e && e.name === 'NotAllowedError'
          ? 'マイクの使用が許可されていません。ブラウザの設定でこのサイトのマイクを許可してください'
          : 'マイクを使えませんでした。ほかのアプリがマイクを使っていないか確認してください', true);
        return;
      }
      this.mime = this.pickMime();
      this.chunks = [];
      this.canceled = false;
      try {
        this.rec = new MediaRecorder(this.stream, this.mime ? { mimeType: this.mime } : undefined);
      } catch {
        this.release();
        toast('録音を始められませんでした', true);
        return;
      }
      this.rec.ondataavailable = (e) => { if (e.data && e.data.size) this.chunks.push(e.data); };
      this.rec.onstop = () => this.finish();
      this.rec.start(1000);
      this.startedAt = Date.now();
      this.setUi(true);
      this.tick();
      this.timer = setInterval(() => this.tick(), 250);
    },

    tick() {
      const s = Math.floor((Date.now() - this.startedAt) / 1000);
      $('#voiceTimer').textContent = `${fmtSec(Math.min(s, VOICE_MAX_SEC))} / ${fmtSec(VOICE_MAX_SEC)}`;
      if (s >= VOICE_MAX_SEC) {
        toast('2分たったので録音を止めました');
        this.stop(false);
      }
    },

    stop(cancel) {
      this.canceled = cancel;
      clearInterval(this.timer);
      if (this.rec && this.rec.state !== 'inactive') this.rec.stop();
    },

    cancelIfRecording() {
      if (this.isRecording()) this.stop(true);
    },

    release() {
      if (this.stream) this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    },

    setUi(on) {
      const btn = $('#voiceBtn');
      btn.setAttribute('aria-pressed', String(on));
      $('#voiceLabel').textContent = on ? '⏹ 話し終えた' : '🎙️ 話して入力';
      $('#voiceTimer').hidden = !on;
      $('#voiceCancel').hidden = !on;
      $('#postText').classList.toggle('is-recording', on);
      $('#postSubmit').disabled = on;
    },

    async finish() {
      const sec = (Date.now() - this.startedAt) / 1000;
      const type = (this.rec && this.rec.mimeType) || this.mime || 'audio/webm';
      this.release();
      this.setUi(false);
      if (this.canceled) { this.chunks = []; return; }
      if (sec < 1.2 || !this.chunks.length) {
        toast('短すぎて聞き取れませんでした。少し話してから「話し終えた」を押してください', true);
        return;
      }
      const blob = new Blob(this.chunks, { type });
      this.chunks = [];
      const btn = $('#voiceBtn');
      btn.disabled = true;
      $('#postSubmit').disabled = true;
      loading(true, '話したことを整えています…', '🎙️');
      try {
        const b64 = await blobToBase64(blob);
        const data = await api('transcribe', { audio: b64, mimeType: type });
        insertVoiceText(data);
      } catch (err) {
        toast(err.message, true);
      } finally {
        loading(false);
        btn.disabled = false;
        $('#postSubmit').disabled = false;
      }
    },
  };

  function insertVoiceText(data) {
    const ta = $('#postText');
    const cur = ta.value.replace(/\s+$/, '');
    let next = cur ? `${cur}\n${data.text}` : data.text;
    let cut = false;
    if (next.length > TEXT_MAX) { next = next.slice(0, TEXT_MAX); cut = true; }
    ta.value = next;
    updateCount();

    if (data.emotionTag && !state.compose.tag) {
      const chip = $(`#tagPicker [data-tag="${data.emotionTag}"]`);
      if (chip) {
        state.compose.tag = data.emotionTag;
        $$('#tagPicker .chip').forEach((x) => x.setAttribute('aria-pressed', String(x === chip)));
      }
    }
    if (data.emoji && !state.compose.emojiTouched) {
      const eb = $(`#emojiPicker [data-emoji="${data.emoji}"]`);
      if (eb) {
        state.compose.emoji = data.emoji;
        $$('#emojiPicker .emoji-btn').forEach((x) => x.setAttribute('aria-pressed', String(x === eb)));
      }
    }

    toast(cut ? '400文字をこえた分は入りませんでした。手で整えてください' : '話した内容を入力しました。気になるところは手で直せます', cut);
    ta.focus();
    ta.setSelectionRange(ta.value.length, ta.value.length);
  }

  /* ---------------- 投稿カード ---------------- */
  function visLabel(p) {
    if (!p.isPublic) return '<span class="badge badge-private">🔒 自分だけ</span>';
    return p.isAnonymous ? '<span class="badge badge-public">🎭 匿名で公開</span>' : '<span class="badge badge-public">🌏 公開</span>';
  }

  function postCard(p, where) {
    const showName = where === 'public' ? (p.isMine ? `${p.nickname}（あなた）` : p.nickname) : '';
    const tag = p.emotionTag ? `<span class="badge">${esc(p.emotionTag)}</span>` : '';
    const reactions = p.isPublic ? `<div class="reactions">${REACTIONS.map((r) => {
      const on = (p.myReactions || []).includes(r.key);
      return `<button type="button" class="react-btn" data-react="${r.key}" aria-pressed="${on}" aria-label="${r.label}">
        <span class="react-icon" aria-hidden="true">${r.icon}</span>${r.label}<span class="react-count">${p.reactions?.[r.key] || 0}</span></button>`;
    }).join('')}</div>` : '';
    const vis = p.isPublic ? (p.isAnonymous ? 'anon' : 'public') : 'private';
    const owner = where === 'mine' ? `
      <div class="owner-tools">
        <select data-vis aria-label="公開範囲">
          <option value="private" ${vis === 'private' ? 'selected' : ''}>🔒 自分だけ</option>
          <option value="public" ${vis === 'public' ? 'selected' : ''}>🌏 公開</option>
          <option value="anon" ${vis === 'anon' ? 'selected' : ''}>🎭 匿名で公開</option>
        </select>
        <button type="button" class="del-btn" data-delete>削除</button>
      </div>` : '';

    return `
      <article class="post" data-id="${esc(p.postId)}">
        <header class="post-head">
          <span class="post-emoji" aria-hidden="true">${esc(p.emoji)}</span>
          <span class="post-meta">
            ${showName ? `<span class="post-name">${esc(showName)}</span>` : ''}
            <time class="post-time" datetime="${esc(p.createdAt)}">${timeAgo(p.createdAt)}</time>
          </span>
          <span class="post-badges">${tag}${where === 'mine' ? visLabel(p) : ''}</span>
        </header>
        <p class="post-text">${esc(p.text)}</p>
        <div class="ai-reply">
          <span class="ai-icon" aria-hidden="true">${esc(p.characterIcon)}</span>
          <div><span class="ai-name">${esc(p.characterName)}</span><p class="ai-text">${esc(p.aiReply)}</p></div>
        </div>
        ${reactions || owner ? `<footer class="post-foot">${reactions}${owner}</footer>` : ''}
      </article>`;
  }

  function emptyBox(title, body) {
    return `<div class="empty"><b>${title}</b>${body}</div>`;
  }

  /* ---------------- わたしの記録 ---------------- */
  async function loadMine(reset) {
    if (state.mine.busy) return;
    state.mine.busy = true;
    const list = $('#mineList');
    if (reset) { state.mine.offset = 0; list.innerHTML = '<p class="panel-lead">読み込み中…</p>'; }
    try {
      const data = await api('listMyPosts', { offset: state.mine.offset, limit: PAGE });
      if (reset) list.innerHTML = '';
      if (!data.items.length && reset) {
        list.innerHTML = emptyBox('まだひとりごとがありません', '「つぶやく」から、いまの気持ちを書いてみましょう。');
      } else {
        list.insertAdjacentHTML('beforeend', data.items.map((p) => postCard(p, 'mine')).join(''));
      }
      state.mine.offset += data.items.length;
      state.mine.loaded = true;
      $('#mineMeta').textContent = data.total ? `${data.total}件` : '';
      $('#mineMore').hidden = !data.hasMore;
    } catch (err) {
      if (reset) list.innerHTML = '';
      toast(err.message, true);
    } finally {
      state.mine.busy = false;
    }
  }

  /* ---------------- みんなの ---------------- */
  async function loadPublic(reset) {
    if (state.pub.busy) return;
    state.pub.busy = true;
    const list = $('#publicList');
    if (reset) { state.pub.offset = 0; list.innerHTML = '<p class="panel-lead">読み込み中…</p>'; }
    try {
      const data = await api('listPublic', { offset: state.pub.offset, limit: PAGE });
      if (reset) list.innerHTML = '';
      if (!data.items.length && reset) {
        list.innerHTML = emptyBox('まだ公開されたひとりごとはありません', '投稿するときに「みんなに公開する」にチェックすると、ここに並びます。');
      } else {
        list.insertAdjacentHTML('beforeend', data.items.map((p) => postCard(p, 'public')).join(''));
      }
      state.pub.offset += data.items.length;
      state.pub.loaded = true;
      $('#publicMore').hidden = !data.hasMore;
    } catch (err) {
      if (reset) list.innerHTML = '';
      toast(err.message, true);
    } finally {
      state.pub.busy = false;
    }
  }

  /* ---------------- カード上の操作 ---------------- */
  async function onListClick(e) {
    const card = e.target.closest('.post');
    if (!card) return;
    const postId = card.dataset.id;

    const rb = e.target.closest('[data-react]');
    if (rb) {
      const was = rb.getAttribute('aria-pressed') === 'true';
      const cnt = $('.react-count', rb);
      const before = Number(cnt.textContent) || 0;
      rb.setAttribute('aria-pressed', String(!was));
      cnt.textContent = Math.max(0, before + (was ? -1 : 1));
      if (!was) { rb.classList.remove('pop'); void rb.offsetWidth; rb.classList.add('pop'); }
      try {
        const r = await api('react', { postId, type: rb.dataset.react });
        rb.setAttribute('aria-pressed', String(r.active));
        cnt.textContent = Math.max(0, r.count);
      } catch (err) {
        rb.setAttribute('aria-pressed', String(was));
        cnt.textContent = before;
        toast(err.message, true);
      }
      return;
    }

    if (e.target.closest('[data-delete]')) {
      if (!confirm('このひとりごとを削除しますか？（元に戻せません）')) return;
      try {
        await api('deletePost', { postId });
        card.remove();
        state.mapCache = { mine: null, all: null };
        state.pub.loaded = false;
        toast('削除しました');
        if (!$('#mineList .post')) loadMine(true);
      } catch (err) {
        toast(err.message, true);
      }
    }
  }

  async function onVisChange(e) {
    const sel = e.target.closest('[data-vis]');
    if (!sel) return;
    const card = sel.closest('.post');
    const v = sel.value;
    sel.disabled = true;
    try {
      const r = await api('setVisibility', { postId: card.dataset.id, isPublic: v !== 'private', isAnonymous: v === 'anon' });
      const badges = $('.post-badges', card);
      $$('.badge-private, .badge-public', badges).forEach((b) => b.remove());
      badges.insertAdjacentHTML('beforeend', visLabel(r));
      state.pub.loaded = false;
      state.mapCache.all = null;
      toast(v === 'private' ? '自分だけに戻しました' : v === 'anon' ? '名前を出さずに公開しました' : '公開しました');
    } catch (err) {
      toast(err.message, true);
      state.mine.loaded = false;
      loadMine(true);
    } finally {
      sel.disabled = false;
    }
  }

  /* =========================================================
   * 気持ちの夜空（4象限マップ）
   * ========================================================= */
  const StarMap = {
    init() {
      this.wrap = $('#mapWrap');
      this.canvas = $('#mapCanvas');
      this.ctx = this.canvas.getContext('2d');
      this.popup = $('#mapPopup');
      this.points = [];
      this.scope = 'mine';
      this.pinned = null;
      this.hover = null;
      this.prog = 1;
      this.size = 0;
      this.reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      this.bgStars = Array.from({ length: 70 }, (_, i) => ({ x: seeded(i * 3 + 1), y: seeded(i * 3 + 2), r: 0.4 + seeded(i * 3 + 3) * 1.1 }));

      new ResizeObserver(() => this.resize()).observe(this.wrap);

      this.canvas.addEventListener('pointermove', (e) => {
        if (e.pointerType !== 'mouse') return;
        const p = this.hit(e);
        this.canvas.style.cursor = p ? 'pointer' : 'default';
        if (p !== this.hover) {
          this.hover = p;
          if (!this.pinned) (p ? this.showPopup(p) : this.hidePopup());
          this.draw(this.prog);
        }
      });
      this.canvas.addEventListener('pointerleave', () => {
        this.hover = null;
        if (!this.pinned) this.hidePopup();
        this.draw(this.prog);
      });
      this.canvas.addEventListener('click', (e) => {
        const p = this.hit(e);
        this.pinned = p;
        p ? this.showPopup(p) : this.hidePopup();
        this.draw(this.prog);
      });
      this.canvas.addEventListener('keydown', (e) => {
        if (!this.points.length) return;
        const i = this.pinned ? this.points.indexOf(this.pinned) : -1;
        let next = null;
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = this.points[(i + 1) % this.points.length];
        else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = this.points[(i - 1 + this.points.length) % this.points.length];
        else if (e.key === 'Escape') { this.pinned = null; this.hidePopup(); this.draw(this.prog); return; }
        if (next) { e.preventDefault(); this.pinned = next; this.showPopup(next); this.draw(this.prog); }
      });
      this.popup.addEventListener('click', (e) => {
        if (e.target.closest('.popup-close')) { this.pinned = null; this.hidePopup(); this.draw(this.prog); this.canvas.focus(); }
      });
    },

    set(points, scope, focusId) {
      this.scope = scope;
      this.points = points.map((p) => {
        const h = hashStr(p.postId);
        return { ...p, jx: (seeded(h) - 0.5) * 8, jy: (seeded(h + 7) - 0.5) * 8 };
      });
      this.pinned = focusId ? this.points.find((p) => p.postId === focusId) || null : null;
      this.hover = null;
      this.hidePopup();
      this.animate(() => { if (this.pinned) this.showPopup(this.pinned); });
    },

    animate(done) {
      cancelAnimationFrame(this.raf);
      if (this.reduce || !this.points.length) { this.prog = 1; this.draw(1); done && done(); return; }
      const start = performance.now();
      const step = (now) => {
        this.prog = Math.min(1, (now - start) / 1400);
        this.draw(this.prog);
        if (this.prog < 1) this.raf = requestAnimationFrame(step);
        else done && done();
      };
      this.raf = requestAnimationFrame(step);
    },

    resize() {
      const w = this.wrap.clientWidth;
      if (!w) return;
      this.size = w;
      this.dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.canvas.width = Math.round(w * this.dpr);
      this.canvas.height = Math.round(w * this.dpr);
      this.draw(this.prog);
      if (this.pinned) this.showPopup(this.pinned);
    },

    pad() { return Math.max(30, this.size * 0.08); },

    pos(p) {
      const pad = this.pad();
      const inner = this.size - pad * 2;
      return { x: pad + ((p.x + 100) / 200) * inner + p.jx, y: pad + ((100 - p.y) / 200) * inner + p.jy };
    },

    hit(e) {
      const r = this.canvas.getBoundingClientRect();
      const mx = e.clientX - r.left;
      const my = e.clientY - r.top;
      let best = null;
      let bd = 22 * 22;
      this.points.forEach((p) => {
        const q = this.pos(p);
        const d = (q.x - mx) ** 2 + (q.y - my) ** 2;
        if (d <= bd) { bd = d; best = p; }
      });
      return best;
    },

    draw(prog) {
      const c = this.ctx;
      const s = this.size;
      if (!s) return;
      c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      c.clearRect(0, 0, s, s);

      // 夜空
      const g = c.createLinearGradient(0, 0, 0, s);
      g.addColorStop(0, '#1B2246');
      g.addColorStop(1, '#2A2F5C');
      c.fillStyle = g;
      c.fillRect(0, 0, s, s);

      const pad = this.pad();
      const inner = s - pad * 2;
      const cx = s / 2;
      const cy = s / 2;

      // 4象限のにじみ
      [['bakuhatsu', 0.78, 0.22], ['kazan', 0.22, 0.22], ['numa', 0.22, 0.78], ['engawa', 0.78, 0.78]].forEach(([k, fx, fy]) => {
        const x = pad + inner * fx;
        const y = pad + inner * fy;
        const rg = c.createRadialGradient(x, y, 0, x, y, inner * 0.45);
        rg.addColorStop(0, hexA(ZONES[k].color, 0.2));
        rg.addColorStop(1, hexA(ZONES[k].color, 0));
        c.fillStyle = rg;
        c.fillRect(0, 0, s, s);
      });

      // 背景の星
      c.fillStyle = '#F3EEDF';
      this.bgStars.forEach((st) => {
        c.globalAlpha = 0.18 + 0.3 * (st.r / 1.5);
        c.beginPath();
        c.arc(st.x * s, st.y * s, st.r, 0, Math.PI * 2);
        c.fill();
      });
      c.globalAlpha = 1;

      // 凪エリア
      const nr = (NAGI_RADIUS / 200) * inner;
      c.setLineDash([4, 5]);
      c.strokeStyle = 'rgba(201,211,230,.4)';
      c.lineWidth = 1;
      c.beginPath();
      c.arc(cx, cy, nr, 0, Math.PI * 2);
      c.stroke();
      c.setLineDash([]);

      // 軸
      c.strokeStyle = 'rgba(243,238,223,.32)';
      c.beginPath();
      c.moveTo(pad, cy); c.lineTo(s - pad, cy);
      c.moveTo(cx, pad); c.lineTo(cx, s - pad);
      c.stroke();

      // 軸ラベル
      const fs = Math.max(11, s * 0.022);
      c.font = `500 ${fs}px "Zen Kaku Gothic New", sans-serif`;
      c.fillStyle = 'rgba(243,238,223,.85)';
      c.textBaseline = 'middle';
      c.textAlign = 'right'; c.fillText('ポジティブ ▶', s - 10, cy - fs);
      c.textAlign = 'left'; c.fillText('◀ ネガティブ', 10, cy - fs);
      c.textAlign = 'center';
      c.fillText('▲ パッション', cx, pad * 0.5);
      c.fillText('▼ チル', cx, s - pad * 0.5);

      // エリア名
      c.font = `${fs}px "Kiwi Maru", serif`;
      c.fillStyle = 'rgba(243,238,223,.5)';
      const label = (k) => `${ZONES[k].icon} ${ZONES[k].name.replace('エリア', '')}`;
      c.textAlign = 'right'; c.fillText(label('bakuhatsu'), s - pad, pad + fs * 0.6);
      c.textAlign = 'left'; c.fillText(label('kazan'), pad, pad + fs * 0.6);
      c.textAlign = 'left'; c.fillText(label('numa'), pad, s - pad - fs * 0.6);
      c.textAlign = 'right'; c.fillText(label('engawa'), s - pad, s - pad - fs * 0.6);
      c.textAlign = 'center'; c.fillStyle = 'rgba(201,211,230,.55)';
      c.fillText('凪', cx + nr * 0.55, cy + nr * 0.55);

      // ひとりごとの星
      const n = this.points.length;
      const es = Math.max(16, Math.min(24, s * 0.04));
      this.points.forEach((p, i) => {
        const delay = n > 1 ? (i / (n - 1)) * 0.65 : 0;
        const a = Math.max(0, Math.min(1, (prog - delay) / 0.35));
        if (a <= 0) return;
        const q = this.pos(p);
        const active = p === this.pinned || p === this.hover;
        const mine = this.scope === 'all' && p.isMine;
        const col = mine ? '#FFD36E' : ZONES[zoneOf(p.x, p.y)].color;
        c.globalAlpha = a;

        const gr = (active ? 24 : 15) * (0.6 + 0.4 * a);
        const rg = c.createRadialGradient(q.x, q.y, 0, q.x, q.y, gr);
        rg.addColorStop(0, hexA(col, 0.6));
        rg.addColorStop(1, hexA(col, 0));
        c.fillStyle = rg;
        c.beginPath();
        c.arc(q.x, q.y, gr, 0, Math.PI * 2);
        c.fill();

        if (mine || active) {
          c.strokeStyle = mine ? '#FFD36E' : '#F3EEDF';
          c.lineWidth = active ? 2 : 1.5;
          c.beginPath();
          c.arc(q.x, q.y, active ? es * 0.85 : es * 0.65, 0, Math.PI * 2);
          c.stroke();
        }

        c.fillStyle = '#fff';
        c.font = `${active ? es * 1.3 : es}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillText(p.emoji || '💭', q.x, q.y + 1);
      });
      c.globalAlpha = 1;
    },

    showPopup(p) {
      const z = ZONES[zoneOf(p.x, p.y)];
      const who = p.isMine ? 'あなた' : p.nickname;
      this.popup.innerHTML = `
        <button type="button" class="popup-close" aria-label="閉じる">×</button>
        <div class="popup-head"><span class="popup-emoji" aria-hidden="true">${esc(p.emoji)}</span><span>${esc(who)}　${timeAgo(p.createdAt)}</span></div>
        <p class="popup-text">${esc(p.text)}</p>
        <div class="popup-reply"><span aria-hidden="true">${esc(p.characterIcon)}</span><p><b>${esc(p.characterName)}</b>\n${esc(p.aiReply)}</p></div>
        <p class="popup-zone">${z.icon} ${z.name}（X ${p.x} ／ Y ${p.y}）</p>`;
      this.popup.hidden = false;
      const q = this.pos(p);
      const w = this.popup.offsetWidth;
      const h = this.popup.offsetHeight;
      const left = Math.min(Math.max(8, q.x - w / 2), this.size - w - 8);
      let top = q.y - h - 18;
      if (top < 8) top = q.y + 20;
      this.popup.style.left = left + 'px';
      this.popup.style.top = top + 'px';
    },

    hidePopup() {
      this.popup.hidden = true;
    },
  };

  function renderArea(points, scope) {
    const box = $('#areaCard');
    if (!points.length) {
      box.innerHTML = `<p class="area-empty">${scope === 'mine'
        ? 'まだ星がありません。「つぶやく」から最初のひとりごとを書くと、ここに星が灯ります。'
        : '公開されたひとりごとはまだありません。'}</p>`;
      return;
    }
    const weekAgo = Date.now() - 7 * 864e5;
    const recent = points.filter((p) => new Date(p.createdAt).getTime() >= weekAgo);
    const base = recent.length >= 3 ? recent : points;
    const period = recent.length >= 3 ? 'この7日間' : 'これまで';
    const counts = Object.fromEntries(ZONE_ORDER.map((k) => [k, 0]));
    base.forEach((p) => { counts[zoneOf(p.x, p.y)]++; });
    const top = ZONE_ORDER.reduce((a, b) => (counts[b] > counts[a] ? b : a));
    const z = ZONES[top];
    const pct = (k) => Math.round((counts[k] / base.length) * 100);
    const lead = scope === 'mine' ? `${period}のあなたがいちばん多くいるのは` : `${period}、みんながいちばん集まっているのは`;

    box.innerHTML = `
      <p class="area-lead">${lead}</p>
      <p class="area-title"><span class="area-icon" aria-hidden="true">${z.icon}</span>『${z.name}』</p>
      <p class="area-desc">${z.desc}</p>
      <div class="zone-bar" aria-hidden="true">${ZONE_ORDER.filter((k) => counts[k]).map((k) =>
        `<span style="flex:${counts[k]};background:${ZONES[k].color}"></span>`).join('')}</div>
      <ul class="zone-legend">${ZONE_ORDER.map((k) =>
        `<li><i style="background:${ZONES[k].color}"></i>${ZONES[k].name.replace('エリア', '')}<b>${pct(k)}%</b></li>`).join('')}</ul>
      <p class="area-count">${base.length}件のひとりごとから集計</p>`;
  }

  async function loadMap(focusId) {
    const scope = state.mapScope;
    $$('[data-scope]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.scope === scope)));
    let data = state.mapCache[scope];
    if (!data) {
      $('#areaCard').innerHTML = '<p class="area-empty">星を集めています…</p>';
      try {
        data = await api('getMap', { scope });
        state.mapCache[scope] = data;
      } catch (err) {
        $('#areaCard').innerHTML = '';
        toast(err.message, true);
        return;
      }
    }
    if (state.mapScope !== scope) return;
    renderArea(data.points, scope);
    StarMap.resize();
    StarMap.set(data.points, scope, focusId);
  }

  /* ---------------- 初期化 ---------------- */
  function bind() {
    $$('[data-auth]').forEach((b) => b.addEventListener('click', () => switchAuth(b.dataset.auth)));
    $('#loginForm').addEventListener('submit', onLogin);
    $('#registerForm').addEventListener('submit', onRegister);
    $('#forgotForm').addEventListener('submit', onForgot);

    $$('.tab').forEach((t) => t.addEventListener('click', () => switchTab(t.dataset.tab)));

    $('#postText').addEventListener('input', updateCount);
    $('#voiceBtn').addEventListener('click', () => Voice.toggle());
    $('#voiceCancel').addEventListener('click', () => { Voice.stop(true); toast('録音をやめました'); });
    if (!Voice.supported()) {
      $('#voiceBtn').hidden = true;
      $('#voiceHint').textContent = 'このブラウザでは音声入力が使えません（最新のChrome・Safari・Edgeで使えます）。';
    }
    window.addEventListener('pagehide', () => Voice.cancelIfRecording());
    $('#emojiPicker').addEventListener('click', (e) => {
      const b = e.target.closest('[data-emoji]');
      if (!b) return;
      state.compose.emoji = b.dataset.emoji;
      state.compose.emojiTouched = true;
      $$('#emojiPicker .emoji-btn').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    });
    $('#tagPicker').addEventListener('click', (e) => {
      const b = e.target.closest('[data-tag]');
      if (!b) return;
      const on = b.getAttribute('aria-pressed') !== 'true';
      $$('#tagPicker .chip').forEach((x) => x.setAttribute('aria-pressed', 'false'));
      b.setAttribute('aria-pressed', String(on));
      state.compose.tag = on ? b.dataset.tag : '';
    });
    $('#charPicker').addEventListener('change', (e) => {
      if (e.target.name === 'character') state.compose.character = e.target.value;
    });
    $('#postPublic').addEventListener('change', updateVisHint);
    $('#postAnon').addEventListener('change', updateVisHint);
    $('#postForm').addEventListener('submit', onPost);

    ['#mineList', '#publicList'].forEach((sel) => {
      $(sel).addEventListener('click', onListClick);
      $(sel).addEventListener('change', onVisChange);
    });
    $('#mineMore').addEventListener('click', () => loadMine(false));
    $('#publicMore').addEventListener('click', () => loadPublic(false));
    $('#publicReload').addEventListener('click', () => loadPublic(true));

    $$('[data-scope]').forEach((b) => b.addEventListener('click', () => {
      if (state.mapScope === b.dataset.scope) return;
      state.mapScope = b.dataset.scope;
      loadMap();
    }));

    $('#btnSettings').addEventListener('click', openSettings);
    $('#settingsForm').addEventListener('submit', onSettings);
    $('#openPwChange').addEventListener('click', () => { $('#settingsDialog').close(); openPwDialog(false); });

    $('#pwForm').addEventListener('submit', onPwChange);
    $('#pwCancel').addEventListener('click', () => $('#pwDialog').close());
    $('#pwDialog').addEventListener('cancel', (e) => { if (state.pwForced) e.preventDefault(); });

    $('#replyToMap').addEventListener('click', () => {
      $('#replyDialog').close();
      state.mapScope = 'mine';
      switchTabSilently('map');
      loadMap(state.lastPostId);
    });

    $$('[data-close]').forEach((b) => b.addEventListener('click', () => b.closest('dialog').close()));

    $('#btnLogout').addEventListener('click', async () => {
      Voice.cancelIfRecording();
      try { await api('logout'); } catch { /* 期限切れでもログアウト扱い */ }
      clearSession();
      showAuth();
      switchAuth('login');
      toast('ログアウトしました');
    });
  }

  // 地図を開くときに二重読み込みしないためのタブ切り替え
  function switchTabSilently(name) {
    $$('.tab').forEach((t) => t.setAttribute('aria-selected', String(t.dataset.tab === name)));
    ['post', 'mine', 'public', 'map'].forEach((n) => { $('#tab-' + n).hidden = n !== name; });
    window.scrollTo({ top: 0 });
  }

  async function init() {
    $('#appName').textContent = CFG.APP_NAME || 'ひとりごと';
    $('#appVersion').textContent = CFG.APP_VERSION || '';
    initPwToggles();
    renderComposer();
    renderCharPicker();
    StarMap.init();
    bind();

    if (!CFG.GAS_API_URL || CFG.GAS_API_URL.includes('XXXX')) {
      toast('config.js の GAS_API_URL を設定してください', true);
    }

    if (!state.token) { showAuth(); return; }
    loading(true, 'おかえりなさい…', '🌙');
    try {
      const data = await api('me');
      saveSession(data);
      if (data.user.isFirstLogin) { showAuth(); openPwDialog(true); }
      else enterApp();
    } catch (err) {
      if (err.code !== 'SESSION_EXPIRED' && err.code !== 'AUTH_REQUIRED') toast(err.message, true);
      clearSession();
      showAuth();
    } finally {
      loading(false);
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
