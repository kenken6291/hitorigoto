/**
 * ひとりごと — GAS バックエンド
 * Version: v1.0.0
 *
 * ■ スクリプトプロパティ（プロジェクトの設定 → スクリプト プロパティ）
 *   GEMINI_API_KEY  … 必須。Gemini APIキー
 *   GEMINI_MODEL    … 任意。既定: gemini-2.5-flash
 *   SPREADSHEET_ID  … 任意。スプレッドシートにバインドしていない場合のみ指定
 *   APP_URL         … 任意。メール本文に載せるサイトURL（例: https://kenken6291.github.io/hitorigoto/）
 *   PEPPER          … 自動。setup() 実行時に自動生成（変更すると全員ログイン不可になるので触らない）
 *
 * ■ 初回の手順
 *   1. setup() を実行（シート作成・PEPPER生成）
 *   2. setupTriggers() を実行（毎日4時にDriveへバックアップ）
 *   3. testGemini() でAI応答を確認
 *   4. デプロイ → ウェブアプリ（実行ユーザー: 自分 / アクセス: 全員）
 *   ※ コードを変更したら「デプロイを管理 → 編集 → 新バージョン」で再デプロイが必要
 */

const APP_VERSION = 'v1.0.0';
const APP_NAME = 'ひとりごと';
const TZ = 'Asia/Tokyo';

const HEADERS = {
  Users: ['userId', 'email', 'nickname', 'passwordHash', 'salt', 'isFirstLogin', 'defaultCharacter',
    'failCount', 'lockedUntil', 'sessionVer', 'createdAt', 'updatedAt', 'lastLoginAt'],
  Posts: ['postId', 'userId', 'text', 'emotionTag', 'emoji', 'isPublic', 'isAnonymous', 'character',
    'aiReply', 'x', 'y', 'aiSource', 'createdAt', 'updatedAt', 'deleted'],
  Reactions: ['postId', 'userId', 'type', 'createdAt'],
};

const SESSION_TTL_SEC = 21600;   // 6時間（CacheServiceの上限）。アクセスのたびに延長
const MAX_LOGIN_FAIL = 5;
const LOCK_MINUTES = 15;
const RESET_COOLDOWN_SEC = 60;
const POST_COOLDOWN_SEC = 8;
const TEXT_MAX = 400;
const HASH_ROUNDS = 300;
const BACKUP_KEEP = 14;
const MAP_LIMIT = 500;

const CHARS_PW = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
const CHARS_ALNUM = 'abcdefghijklmnopqrstuvwxyz0123456789';

const REACTION_TYPES = ['wakaru', 'yoshiyoshi', 'erai', 'gyu'];

// 感情タグ → AIが使えないときの座標の目安 [X, Y]
const EMOTION_HINTS = {
  'うれしい': [70, 40], 'たのしい': [75, 65], 'ほっこり': [60, -55], 'すっきり': [55, -20],
  'どきどき': [20, 70], 'なんとなく': [0, 0], 'ねむい': [-5, -80], 'つかれた': [-35, -60],
  'もやもや': [-40, -10], 'ふあん': [-50, 25], 'かなしい': [-65, -45], 'いらいら': [-60, 70],
};

const CHARACTERS = {
  obachan: {
    name: 'なにわのおかん', icon: '🍬',
    persona: '大阪の商店街にいる世話焼きのおばちゃん。こてこての関西弁（「〜やん」「〜やで」「せやせや」「ほんま」）。まず「よう言うてくれたなぁ」と受け止め、ツッコミは愛情たっぷりで軽く。最後は「飴ちゃんあげるわ🍬」のような小ネタで笑わせて締める。',
  },
  yousei: {
    name: 'ふわふわ妖精ぽわん', icon: '🧚',
    persona: '綿毛の森に住む小さな妖精。ひらがな多め、語尾は「〜だよぉ」「〜なの」「ふわ〜」。星くず・わたあめ・朝露などのきらきらした比喩で気持ちを包み、最後に小さなおまじないをひとつかける。',
  },
  shitsuji: {
    name: '執事セバスチャン', icon: '🎩',
    persona: '名家に仕える老執事。最上級の敬語で相手を「ご主人様」と呼ぶ。どんな話も「さすがでございます」と全肯定し、温かい紅茶やブランケットを差し出すような気遣いの描写を入れる。上品なユーモアを少しだけ。',
  },
  neko: {
    name: 'こたつ猫', icon: '🐈',
    persona: 'こたつに住む気まぐれな猫。語尾は「〜にゃ」「〜にゃん」。一見そっけないけれど、そっと隣に来てくれる。「ゴロゴロ…」「しっぽでぽんぽん」など猫らしい仕草で寄り添う。',
  },
  ojiichan: {
    name: '縁側の源さん', icon: '🍵',
    persona: '田舎の縁側でお茶をすする80代のおじいちゃん。のんびりした口調（「〜じゃのう」「そうかそうか」）。自分の若いころの失敗談や季節の話を少し交え、「急がんでええ」と励ます。',
  },
};

const FALLBACK_REPLIES = {
  obachan: 'よう言うてくれたなぁ。ちょっと今おかん、電波が悪うて上手いこと返されへんねんけど、ちゃんと読んだで。あんたはようやってる。飴ちゃんあげるわ🍬',
  yousei: 'ふわ〜、ちゃんと届いたよぉ。いまは森の風がつよくて、うまくおへんじできないの。でもね、あなたのことばは星くずみたいに光ってるよ✨',
  shitsuji: 'ご主人様のお言葉、確かに拝受いたしました。ただいま少々通信が乱れておりますが、セバスチャンはいつでもお側におります。温かい紅茶をどうぞ。',
  neko: 'ふみゃ…いまちょっと眠くてうまく言えにゃいけど、ちゃんと聞いてたにゃ。となり、あったかいにゃん。',
  ojiichan: 'そうかそうか。今日はちぃと耳の調子が悪うてのう、うまく返せんが、ちゃんと聞いとったよ。急がんでええ、お茶でも飲みんさい。',
};

/* =========================================================
 * エントリポイント
 * ========================================================= */

function doGet() {
  return jsonOut_({ ok: true, app: APP_NAME, version: APP_VERSION, time: new Date().toISOString() });
}

function doPost(e) {
  let req;
  try {
    req = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (err) {
    return jsonOut_({ ok: false, code: 'BAD_REQUEST', error: 'リクエストの形式が正しくありません' });
  }
  try {
    const route = routes_()[req.action];
    if (!route) throw AppError('BAD_ACTION', '不明な操作です: ' + req.action);
    const ctx = route.auth ? requireSession_(String(req.token || ''), !!route.allowFirst) : null;
    const data = route.fn(req.payload || {}, ctx);
    return jsonOut_({ ok: true, data: data });
  } catch (err) {
    const code = err.code || 'SERVER_ERROR';
    if (code === 'SERVER_ERROR') console.error(err && err.stack ? err.stack : err);
    return jsonOut_({ ok: false, code: code, error: code === 'SERVER_ERROR' ? 'サーバーでエラーが起きました: ' + err.message : err.message });
  }
}

function routes_() {
  return {
    register: { fn: register_ },
    login: { fn: login_ },
    forgotPassword: { fn: forgotPassword_ },
    me: { fn: me_, auth: true, allowFirst: true },
    logout: { fn: logout_, auth: true, allowFirst: true },
    changePassword: { fn: changePassword_, auth: true, allowFirst: true },
    updateProfile: { fn: updateProfile_, auth: true },
    createPost: { fn: createPost_, auth: true },
    listMyPosts: { fn: listMyPosts_, auth: true },
    listPublic: { fn: listPublic_, auth: true },
    setVisibility: { fn: setVisibility_, auth: true },
    deletePost: { fn: deletePost_, auth: true },
    react: { fn: react_, auth: true },
    getMap: { fn: getMap_, auth: true },
  };
}

/* =========================================================
 * 会員・認証
 * ========================================================= */

function register_(p) {
  const email = normEmail_(p.email);
  const nickname = cleanNickname_(p.nickname);
  return withLock_(function () {
    if (findUserByEmail_(email)) {
      throw AppError('EMAIL_EXISTS', 'このメールアドレスはすでに登録されています。「パスワードを忘れた」から仮パスワードを再発行できます。');
    }
    if (MailApp.getRemainingDailyQuota() < 1) {
      throw AppError('MAIL_QUOTA', '本日のメール送信上限に達しました。明日もう一度お試しください。');
    }
    const temp = genTempPassword_();
    const salt = newSalt_();
    const now = nowIso_();
    sendTempPasswordMail_(email, nickname, temp, false);
    append_('Users', {
      userId: 'u_' + randomString_(12), email: email, nickname: nickname,
      passwordHash: hashPassword_(temp, salt), salt: salt, isFirstLogin: 'TRUE',
      defaultCharacter: 'obachan', failCount: '0', lockedUntil: '', sessionVer: '1',
      createdAt: now, updatedAt: now, lastLoginAt: '',
    });
    return { message: '仮パスワードを ' + email + ' に送りました。メールを確認してログインしてください。' };
  });
}

function login_(p) {
  const email = normEmail_(p.email);
  const pw = String(p.password || '');
  if (!pw) throw AppError('BAD_INPUT', 'パスワードを入力してください');
  return withLock_(function () {
    const u = findUserByEmail_(email);
    if (!u) throw AppError('LOGIN_FAILED', 'メールアドレスまたはパスワードが違います');

    const lockedUntil = u.lockedUntil ? new Date(u.lockedUntil) : null;
    if (lockedUntil && lockedUntil.getTime() > Date.now()) {
      const m = Math.ceil((lockedUntil.getTime() - Date.now()) / 60000);
      throw AppError('LOCKED', 'ログインに' + MAX_LOGIN_FAIL + '回失敗したため、一時的にロックしています。約' + m + '分後にもう一度お試しいただくか、パスワードを再発行してください。');
    }

    if (hashPassword_(pw, u.salt) !== u.passwordHash) {
      const fail = (Number(u.failCount) || 0) + 1;
      if (fail >= MAX_LOGIN_FAIL) {
        update_('Users', u._row, { failCount: '0', lockedUntil: new Date(Date.now() + LOCK_MINUTES * 60000).toISOString() });
        throw AppError('LOCKED', 'ログインに' + MAX_LOGIN_FAIL + '回失敗したため、' + LOCK_MINUTES + '分間ロックしました。パスワードを忘れた場合は再発行してください。');
      }
      update_('Users', u._row, { failCount: String(fail) });
      throw AppError('LOGIN_FAILED', 'メールアドレスまたはパスワードが違います（あと' + (MAX_LOGIN_FAIL - fail) + '回でロック）');
    }

    update_('Users', u._row, { failCount: '0', lockedUntil: '', lastLoginAt: nowIso_() });
    return { token: createSession_(u), user: publicUser_(u) };
  });
}

function forgotPassword_(p) {
  const email = normEmail_(p.email);
  const cache = CacheService.getScriptCache();
  const ck = 'reset_' + sha256Hex_(email);
  if (cache.get(ck)) throw AppError('TOO_SOON', '再発行は1分に1回までです。少し待ってからもう一度お試しください。');
  cache.put(ck, '1', RESET_COOLDOWN_SEC);

  withLock_(function () {
    const u = findUserByEmail_(email);
    if (!u) return; // 登録の有無は返さない
    const temp = genTempPassword_();
    const salt = newSalt_();
    sendTempPasswordMail_(email, u.nickname, temp, true);
    update_('Users', u._row, {
      passwordHash: hashPassword_(temp, salt), salt: salt, isFirstLogin: 'TRUE',
      failCount: '0', lockedUntil: '', sessionVer: String((Number(u.sessionVer) || 1) + 1), updatedAt: nowIso_(),
    });
  });
  return { message: '登録済みのメールアドレスであれば、新しい仮パスワードを送りました。メールを確認してログインしてください。' };
}

function me_(p, ctx) {
  return { user: publicUser_(ctx.user) };
}

function logout_(p, ctx) {
  CacheService.getScriptCache().remove('sess_' + ctx.token);
  return { message: 'ログアウトしました' };
}

function changePassword_(p, ctx) {
  const cur = String(p.currentPassword || '');
  const next = String(p.newPassword || '');
  validateNewPassword_(next);
  if (cur === next) throw AppError('BAD_INPUT', '新しいパスワードは、いまのパスワードと別のものにしてください');

  return withLock_(function () {
    const u = findUserById_(ctx.user.userId);
    if (hashPassword_(cur, u.salt) !== u.passwordHash) throw AppError('BAD_PASSWORD', 'いまのパスワードが違います');
    const salt = newSalt_();
    const ver = String((Number(u.sessionVer) || 1) + 1);
    update_('Users', u._row, {
      passwordHash: hashPassword_(next, salt), salt: salt, isFirstLogin: 'FALSE', sessionVer: ver, updatedAt: nowIso_(),
    });
    CacheService.getScriptCache().remove('sess_' + ctx.token);
    const nu = Object.assign({}, u, { isFirstLogin: 'FALSE', sessionVer: ver });
    return { token: createSession_(nu), user: publicUser_(nu), message: 'パスワードを変更しました' };
  });
}

function updateProfile_(p, ctx) {
  return withLock_(function () {
    const u = findUserById_(ctx.user.userId);
    const upd = { updatedAt: nowIso_() };
    if (p.nickname !== undefined) upd.nickname = cleanNickname_(p.nickname);
    if (p.defaultCharacter !== undefined) {
      if (!CHARACTERS[p.defaultCharacter]) throw AppError('BAD_INPUT', 'キャラクターの指定が正しくありません');
      upd.defaultCharacter = p.defaultCharacter;
    }
    update_('Users', u._row, upd);
    return { user: publicUser_(Object.assign({}, u, upd)), message: '設定を保存しました' };
  });
}

/* ---------- セッション（CacheService） ---------- */

function createSession_(u) {
  const token = randomString_(40);
  CacheService.getScriptCache().put('sess_' + token, u.userId + '|' + (u.sessionVer || '1'), SESSION_TTL_SEC);
  return token;
}

function requireSession_(token, allowFirst) {
  if (!token) throw AppError('AUTH_REQUIRED', 'ログインしてください');
  const cache = CacheService.getScriptCache();
  const key = 'sess_' + token;
  const v = cache.get(key);
  if (!v) throw AppError('SESSION_EXPIRED', 'ログインの有効期限が切れました。もう一度ログインしてください');
  const parts = v.split('|');
  const u = findUserById_(parts[0]);
  if (!u || String(u.sessionVer || '1') !== parts[1]) {
    cache.remove(key);
    throw AppError('SESSION_EXPIRED', 'ログインの有効期限が切れました。もう一度ログインしてください');
  }
  cache.put(key, v, SESSION_TTL_SEC);
  if (bool_(u.isFirstLogin) && !allowFirst) {
    throw AppError('PASSWORD_CHANGE_REQUIRED', 'はじめに新しいパスワードを設定してください');
  }
  return { token: token, user: u };
}

function publicUser_(u) {
  return {
    userId: u.userId, email: u.email, nickname: u.nickname,
    isFirstLogin: bool_(u.isFirstLogin),
    defaultCharacter: CHARACTERS[u.defaultCharacter] ? u.defaultCharacter : 'obachan',
  };
}

/* =========================================================
 * ひとりごと
 * ========================================================= */

function createPost_(p, ctx) {
  const u = ctx.user;
  const text = String(p.text || '').replace(/\r\n?/g, '\n').trim();
  if (!text) throw AppError('BAD_INPUT', 'ひとりごとを入力してください');
  if (text.length > TEXT_MAX) throw AppError('BAD_INPUT', 'ひとりごとは' + TEXT_MAX + '文字までです');

  const emotionTag = EMOTION_HINTS[p.emotionTag] ? p.emotionTag : '';
  const emoji = cleanEmoji_(p.emoji);
  const character = CHARACTERS[p.character] ? p.character : (CHARACTERS[u.defaultCharacter] ? u.defaultCharacter : 'obachan');
  const isPublic = p.isPublic === true;
  const isAnonymous = isPublic && p.isAnonymous === true;

  const cache = CacheService.getScriptCache();
  const ck = 'post_' + u.userId;
  if (cache.get(ck)) throw AppError('TOO_SOON', '続けて投稿するときは、数秒あけてください');
  cache.put(ck, '1', POST_COOLDOWN_SEC);

  const ai = analyzeWithGemini_(text, emotionTag, emoji, character);
  const now = nowIso_();
  const post = {
    postId: 'p_' + Date.now().toString(36) + randomString_(5),
    userId: u.userId, text: text, emotionTag: emotionTag, emoji: emoji,
    isPublic: isPublic ? 'TRUE' : 'FALSE', isAnonymous: isAnonymous ? 'TRUE' : 'FALSE',
    character: character, aiReply: ai.reply, x: String(ai.x), y: String(ai.y), aiSource: ai.source,
    createdAt: now, updatedAt: now, deleted: 'FALSE',
  };
  withLock_(function () { append_('Posts', post); });

  const nick = {}; nick[u.userId] = u.nickname;
  return { post: postOut_(post, u.userId, nick, {}) };
}

function listMyPosts_(p, ctx) {
  const uid = ctx.user.userId;
  const posts = readAll_('Posts').filter(function (r) { return r.userId === uid && !bool_(r.deleted); }).reverse();
  return page_(posts, p, uid);
}

function listPublic_(p, ctx) {
  const posts = readAll_('Posts').filter(function (r) { return bool_(r.isPublic) && !bool_(r.deleted); }).reverse();
  return page_(posts, p, ctx.user.userId);
}

function page_(posts, p, uid) {
  const offset = Math.max(0, Number(p.offset) || 0);
  const limit = Math.min(50, Math.max(1, Number(p.limit) || 20));
  const slice = posts.slice(offset, offset + limit);
  const nick = nicknameMap_();
  const rx = reactionIndex_();
  return {
    items: slice.map(function (r) { return postOut_(r, uid, nick, rx); }),
    total: posts.length,
    hasMore: offset + limit < posts.length,
  };
}

function setVisibility_(p, ctx) {
  return withLock_(function () {
    const post = findPost_(p.postId);
    if (!post || bool_(post.deleted) || post.userId !== ctx.user.userId) throw AppError('NOT_FOUND', 'このひとりごとは見つかりませんでした');
    const isPublic = p.isPublic === true;
    const isAnonymous = isPublic && p.isAnonymous === true;
    const upd = { isPublic: isPublic ? 'TRUE' : 'FALSE', isAnonymous: isAnonymous ? 'TRUE' : 'FALSE', updatedAt: nowIso_() };
    update_('Posts', post._row, upd);
    return { postId: post.postId, isPublic: isPublic, isAnonymous: isAnonymous };
  });
}

function deletePost_(p, ctx) {
  return withLock_(function () {
    const post = findPost_(p.postId);
    if (!post || bool_(post.deleted) || post.userId !== ctx.user.userId) throw AppError('NOT_FOUND', 'このひとりごとは見つかりませんでした');
    update_('Posts', post._row, { deleted: 'TRUE', updatedAt: nowIso_() });
    return { postId: post.postId, message: '削除しました' };
  });
}

function react_(p, ctx) {
  const type = String(p.type || '');
  if (REACTION_TYPES.indexOf(type) < 0) throw AppError('BAD_INPUT', 'リアクションの種類が正しくありません');
  return withLock_(function () {
    const post = findPost_(p.postId);
    if (!post || bool_(post.deleted) || !bool_(post.isPublic)) throw AppError('NOT_FOUND', 'このひとりごとは見つかりませんでした');
    const uid = ctx.user.userId;
    const rows = readAll_('Reactions');
    const same = rows.filter(function (r) { return r.postId === post.postId && r.type === type; });
    const hit = same.filter(function (r) { return r.userId === uid; })[0];
    let active;
    if (hit) {
      sheet_('Reactions').deleteRow(hit._row);
      active = false;
    } else {
      append_('Reactions', { postId: post.postId, userId: uid, type: type, createdAt: nowIso_() });
      active = true;
    }
    return { postId: post.postId, type: type, active: active, count: same.length + (active ? 1 : -1) };
  });
}

function getMap_(p, ctx) {
  const uid = ctx.user.userId;
  const scope = p.scope === 'all' ? 'all' : 'mine';
  const posts = readAll_('Posts').filter(function (r) {
    if (bool_(r.deleted)) return false;
    return scope === 'mine' ? r.userId === uid : bool_(r.isPublic);
  }).slice(-MAP_LIMIT);
  const nick = nicknameMap_();
  return {
    scope: scope,
    points: posts.map(function (r) {
      const o = postOut_(r, uid, nick, {});
      delete o.reactions; delete o.myReactions;
      return o;
    }),
  };
}

function postOut_(r, uid, nick, rx) {
  const mine = r.userId === uid;
  const anon = bool_(r.isAnonymous);
  const c = CHARACTERS[r.character] || CHARACTERS.obachan;
  const agg = rx[r.postId] || { counts: {}, users: {} };
  const counts = {};
  REACTION_TYPES.forEach(function (t) { counts[t] = agg.counts[t] || 0; });
  return {
    postId: r.postId,
    text: r.text,
    emotionTag: r.emotionTag || '',
    emoji: r.emoji || '💭',
    isPublic: bool_(r.isPublic),
    isAnonymous: anon,
    character: r.character,
    characterName: c.name,
    characterIcon: c.icon,
    aiReply: r.aiReply,
    x: Number(r.x) || 0,
    y: Number(r.y) || 0,
    createdAt: iso_(r.createdAt),
    isMine: mine,
    nickname: (anon && !mine) ? '名無しのつぶやき人' : (nick[r.userId] || 'だれか'),
    reactions: counts,
    myReactions: agg.users[uid] || [],
  };
}

function reactionIndex_() {
  const idx = {};
  readAll_('Reactions').forEach(function (r) {
    const a = idx[r.postId] || (idx[r.postId] = { counts: {}, users: {} });
    a.counts[r.type] = (a.counts[r.type] || 0) + 1;
    (a.users[r.userId] || (a.users[r.userId] = [])).push(r.type);
  });
  return idx;
}

function nicknameMap_() {
  const m = {};
  readAll_('Users').forEach(function (u) { m[u.userId] = u.nickname; });
  return m;
}

/* =========================================================
 * Gemini：やさしい返事 ＋ 感情座標
 * ========================================================= */

function buildSystemPrompt_(c) {
  return [
    'あなたはWebアプリ「ひとりごと」の聞き役キャラクターです。ユーザーのひとりごとに返事をし、同時に感情を数値化します。',
    '',
    '【あなたのキャラクター】',
    c.name + '：' + c.persona,
    '',
    '【返事のルール】',
    '- 絶対に否定・説教・評価をしない。まず気持ちをそのまま受け止める。',
    '- 100〜180文字程度。キャラクターの口調を最初から最後まで守る。',
    '- 具体的なアドバイスは、本人が求めているときだけ控えめに。',
    '- 医療や法律について断定しない。',
    '- 死にたい・消えたい・自分を傷つけたいなど深刻な内容が含まれるときは、茶化さず、口調をやわらげて真剣に寄り添い、信頼できる人や専門の相談窓口に話してみてほしいとやさしく伝える。',
    '',
    '【感情座標】ひとりごとの内容から、次の2軸を -100〜100 の整数で判定する。',
    '- x：-100＝とてもネガティブ ／ +100＝とてもポジティブ',
    '- y：-100＝静か・内省的・チル ／ +100＝感情爆発・ハイテンション・パッション',
    '- 目安：「ため息…なんか疲れた」→ x:-40, y:-60 ／「最高すぎて叫びたい！」→ x:85, y:90 ／「まじでムカつく！！」→ x:-75, y:80 ／「縁側のお茶がおいしい」→ x:60, y:-70',
    '- 感情タグと絵文字は参考程度にし、本文の内容を優先する。',
    '',
    '【出力】次のJSONだけを返す。前置きや説明は書かない。',
    '{"reply":"返事の文章","x":整数,"y":整数}',
  ].join('\n');
}

function analyzeWithGemini_(text, tag, emoji, charKey) {
  const c = CHARACTERS[charKey] || CHARACTERS.obachan;
  try {
    const key = prop_('GEMINI_API_KEY');
    if (!key) throw new Error('GEMINI_API_KEY が未設定です');
    const model = prop_('GEMINI_MODEL') || 'gemini-2.5-flash';
    const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent';
    const body = {
      systemInstruction: { parts: [{ text: buildSystemPrompt_(c) }] },
      contents: [{
        role: 'user',
        parts: [{ text: '感情タグ: ' + (tag || 'なし') + '\n絵文字: ' + emoji + '\nひとりごと:\n"""\n' + text + '\n"""' }],
      }],
      generationConfig: {
        temperature: 0.9,
        maxOutputTokens: 2048,
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'OBJECT',
          properties: { reply: { type: 'STRING' }, x: { type: 'INTEGER' }, y: { type: 'INTEGER' } },
          required: ['reply', 'x', 'y'],
        },
      },
    };
    const res = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      headers: { 'x-goog-api-key': key },
      payload: JSON.stringify(body),
      muteHttpExceptions: true,
    });
    if (res.getResponseCode() !== 200) {
      throw new Error('Gemini HTTP ' + res.getResponseCode() + ': ' + res.getContentText().slice(0, 300));
    }
    const j = JSON.parse(res.getContentText());
    const parts = (((j.candidates || [])[0] || {}).content || {}).parts || [];
    const raw = parts.filter(function (x) { return !x.thought; })
      .map(function (x) { return x.text || ''; }).join('')
      .replace(/```json|```/g, '').trim();
    const o = JSON.parse(raw);
    const reply = String(o.reply || '').trim();
    if (!reply) throw new Error('返事が空でした');
    return { reply: reply.slice(0, 600), x: clamp_(o.x), y: clamp_(o.y), source: 'gemini' };
  } catch (err) {
    console.warn('Gemini fallback: ' + err);
    const h = EMOTION_HINTS[tag] || [0, 0];
    return { reply: FALLBACK_REPLIES[charKey] || FALLBACK_REPLIES.obachan, x: h[0], y: h[1], source: 'fallback' };
  }
}

/* =========================================================
 * メール
 * ========================================================= */

function sendTempPasswordMail_(email, nickname, temp, isReset) {
  const url = prop_('APP_URL') || '';
  const subject = '【' + APP_NAME + '】' + (isReset ? '仮パスワードを再発行しました' : '仮パスワードのお知らせ');
  const lines = [
    nickname + ' さん',
    '',
    isReset ? 'パスワード再発行のリクエストを受け付けました。' : '「' + APP_NAME + '」にご登録いただき、ありがとうございます。',
    '',
    '仮パスワード： ' + temp,
    '',
    'この仮パスワードでログインすると、新しいパスワードを設定する画面が表示されます。',
  ];
  if (url) lines.push('ログインはこちら： ' + url);
  lines.push('', '※心当たりがない場合は、このメールを破棄してください。', '', '── ' + APP_NAME);
  GmailApp.sendEmail(email, subject, lines.join('\n'), { name: APP_NAME });
}

/* =========================================================
 * Drive バックアップ・セットアップ
 * ========================================================= */

function setup() {
  const ss = ss_();
  Object.keys(HEADERS).forEach(function (name) {
    let sh = ss.getSheetByName(name);
    if (!sh) sh = ss.insertSheet(name);
    const h = HEADERS[name];
    sh.getRange(1, 1, 1, h.length).setValues([h])
      .setFontWeight('bold').setBackground('#26305A').setFontColor('#FFF7E6');
    sh.setFrozenRows(1);
    if (sh.getMaxRows() > 1) sh.getRange(2, 1, sh.getMaxRows() - 1, h.length).setNumberFormat('@');
  });
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('PEPPER')) props.setProperty('PEPPER', randomString_(40));
  ['シート1', 'Sheet1'].forEach(function (n) {
    const def = ss.getSheetByName(n);
    if (def && def.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(def);
  });
  Logger.log('セットアップ完了: ' + ss.getUrl());
}

function setupTriggers() {
  ScriptApp.getProjectTriggers()
    .filter(function (t) { return t.getHandlerFunction() === 'backupToDrive'; })
    .forEach(function (t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('backupToDrive').timeBased().everyDays(1).atHour(4).create();
  Logger.log('毎日4時のバックアップを設定しました');
}

function backupToDrive() {
  const folderName = 'hitorigoto_backup';
  const it = DriveApp.getFoldersByName(folderName);
  const folder = it.hasNext() ? it.next() : DriveApp.createFolder(folderName);
  const stamp = Utilities.formatDate(new Date(), TZ, 'yyyyMMdd_HHmm');
  DriveApp.getFileById(ss_().getId()).makeCopy(APP_NAME + '_backup_' + stamp, folder);

  const files = [];
  const fi = folder.getFiles();
  while (fi.hasNext()) files.push(fi.next());
  files.sort(function (a, b) { return b.getDateCreated() - a.getDateCreated(); });
  files.slice(BACKUP_KEEP).forEach(function (f) { f.setTrashed(true); });
}

function testGemini() {
  const r = analyzeWithGemini_('今日は朝から雨で、なんか全部めんどくさい…', 'つかれた', '🌧️', 'obachan');
  Logger.log(JSON.stringify(r, null, 2));
}

/* =========================================================
 * シート操作ユーティリティ
 * ========================================================= */

function ss_() {
  const id = prop_('SPREADSHEET_ID');
  return id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
}

function sheet_(name) {
  const sh = ss_().getSheetByName(name);
  if (!sh) throw AppError('SETUP', 'シート「' + name + '」がありません。GASエディタで setup() を実行してください');
  return sh;
}

function readAll_(name) {
  const sh = sheet_(name);
  const head = HEADERS[name];
  const last = sh.getLastRow();
  if (last < 2) return [];
  const values = sh.getRange(2, 1, last - 1, head.length).getValues();
  return values.map(function (r, i) {
    const o = { _row: i + 2 };
    head.forEach(function (h, j) { o[h] = unguard_(r[j]); });
    return o;
  });
}

function append_(name, obj) {
  const sh = sheet_(name);
  const head = HEADERS[name];
  const row = head.map(function (h) { return guard_(obj[h]); });
  const rng = sh.getRange(sh.getLastRow() + 1, 1, 1, head.length);
  rng.setNumberFormat('@');
  rng.setValues([row]);
}

function update_(name, rowNum, obj) {
  const sh = sheet_(name);
  const head = HEADERS[name];
  const rng = sh.getRange(rowNum, 1, 1, head.length);
  const vals = rng.getValues()[0].map(unguard_);
  Object.keys(obj).forEach(function (k) {
    const c = head.indexOf(k);
    if (c >= 0) vals[c] = obj[k];
  });
  rng.setNumberFormat('@');
  rng.setValues([vals.map(guard_)]);
}

function findUserByEmail_(email) {
  return readAll_('Users').filter(function (u) { return String(u.email).toLowerCase() === email; })[0] || null;
}

function findUserById_(id) {
  return readAll_('Users').filter(function (u) { return u.userId === id; })[0] || null;
}

function findPost_(id) {
  if (!id) return null;
  return readAll_('Posts').filter(function (r) { return r.postId === String(id); })[0] || null;
}

// 数式インジェクション対策（= + - @ で始まる文字列を文字列として保存）
function guard_(v) {
  if (v === undefined || v === null) return '';
  if (v instanceof Date) return v.toISOString();
  const s = String(v);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

function unguard_(v) {
  if (v instanceof Date) return v.toISOString();
  const s = v === undefined || v === null ? '' : String(v);
  return /^'[=+\-@]/.test(s) ? s.slice(1) : s;
}

function withLock_(fn) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) throw AppError('BUSY', '混み合っています。少し待ってからもう一度お試しください');
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

/* =========================================================
 * 汎用ユーティリティ
 * ========================================================= */

function AppError(code, message) {
  const e = new Error(message);
  e.code = code;
  return e;
}

function jsonOut_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

function prop_(k) {
  return PropertiesService.getScriptProperties().getProperty(k);
}

function pepper_() {
  const p = prop_('PEPPER');
  if (!p) throw AppError('SETUP', 'PEPPER が未設定です。GASエディタで setup() を実行してください');
  return p;
}

function sha256Hex_(s) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s, Utilities.Charset.UTF_8)
    .map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
}

function hashPassword_(pw, salt) {
  let h = sha256Hex_(salt + '|' + pw + '|' + pepper_());
  for (let i = 0; i < HASH_ROUNDS; i++) h = sha256Hex_(h + '|' + salt);
  return 'h1$' + h;
}

function randomBytes_(n) {
  let out = [];
  while (out.length < n) {
    const d = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,
      Utilities.getUuid() + ':' + Date.now() + ':' + Math.random());
    out = out.concat(d.map(function (b) { return b & 0xff; }));
  }
  return out.slice(0, n);
}

function randomString_(len, chars) {
  chars = chars || CHARS_ALNUM;
  return randomBytes_(len).map(function (b) { return chars[b % chars.length]; }).join('');
}

function genTempPassword_() {
  return randomString_(10, CHARS_PW);
}

function newSalt_() {
  return 's' + randomString_(20);
}

function validateNewPassword_(pw) {
  if (pw.length < 8 || pw.length > 64) throw AppError('BAD_INPUT', 'パスワードは8〜64文字にしてください');
  if (!/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) throw AppError('BAD_INPUT', 'パスワードには英字と数字の両方を入れてください');
}

function normEmail_(v) {
  const s = String(v || '').trim().toLowerCase();
  if (!s || s.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) {
    throw AppError('BAD_INPUT', 'メールアドレスの形式が正しくありません');
  }
  return s;
}

function cleanNickname_(v) {
  const s = String(v || '').replace(/[\u0000-\u001F\u007F]/g, '').trim();
  if (!s) throw AppError('BAD_INPUT', 'ニックネームを入力してください');
  if (Array.from(s).length > 20) throw AppError('BAD_INPUT', 'ニックネームは20文字までです');
  return s;
}

function cleanEmoji_(v) {
  const s = String(v || '').replace(/[\u0000-\u001F\u007F<>]/g, '').trim();
  return s ? Array.from(s).slice(0, 4).join('') : '💭';
}

function clamp_(v) {
  return Math.max(-100, Math.min(100, Math.round(Number(v) || 0)));
}

function bool_(v) {
  return v === true || String(v).toUpperCase() === 'TRUE';
}

function iso_(v) {
  if (v instanceof Date) return v.toISOString();
  return String(v || '');
}

function nowIso_() {
  return new Date().toISOString();
}
