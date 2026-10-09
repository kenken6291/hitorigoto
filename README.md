# ひとりごと v1.0.0

ひとりごとを書くと、選んだキャラクターがやさしく返事をくれて、気持ちが「感情4象限マップ（気持ちの夜空）」に星として残るWebアプリです。

## ファイル構成

```
hitorigoto/
├── index.html     画面
├── style.css      デザイン（夜の部屋・便箋・スタンドの灯り）
├── app.js         API通信・セッション・マップ描画・パスワード表示切替
├── config.js      GAS_API_URL・バージョン設定
└── gas/
    └── Code.gs    GASバックエンド（GitHub Pagesには不要。管理用に置いておく）
```

---

## 1. スプレッドシート設計書

`setup()` を実行すると3シートが自動作成されます。全セルは書式「書式なしテキスト」で保存されます（ニックネームの「0123」が数値化されるのを防ぐため）。

### Users（会員）

| 列 | 内容 | 例 |
|---|---|---|
| userId | 会員ID | u_k3x9… |
| email | メールアドレス（小文字） | ken@example.com |
| nickname | ニックネーム（20文字まで） | けん |
| passwordHash | SHA-256（ソルト＋ペッパー＋300回ストレッチ） | h1$9f2c… |
| salt | 会員ごとのソルト | s8d… |
| isFirstLogin | 仮パスワード状態か | TRUE / FALSE |
| defaultCharacter | いつもの聞き役 | obachan |
| failCount | 連続ログイン失敗回数 | 0〜4 |
| lockedUntil | ロック解除時刻（5回失敗で15分） | ISO日時 |
| sessionVer | セッション世代（パスワード変更・再発行で+1、古いログインを無効化） | 2 |
| createdAt / updatedAt / lastLoginAt | 日時 | ISO日時 |

### Posts（ひとりごと）

| 列 | 内容 | 例 |
|---|---|---|
| postId | 投稿ID | p_lz8… |
| userId | 投稿者 | u_k3x9… |
| text | 本文（400文字まで） | |
| emotionTag | 感情タグ | もやもや |
| emoji | 絵文字 | 🫠 |
| isPublic | 公開するか（既定 FALSE） | TRUE / FALSE |
| isAnonymous | 名前を出さずに公開 | TRUE / FALSE |
| character | 返事したキャラクター | neko |
| aiReply | AIの返事 | |
| x | ネガティブ(-100)〜ポジティブ(+100) | -40 |
| y | チル(-100)〜パッション(+100) | -60 |
| aiSource | gemini / fallback（AI失敗時の定型文） | gemini |
| createdAt / updatedAt | 日時 | ISO日時 |
| deleted | 論理削除 | TRUE / FALSE |

### Reactions（匿名リアクション）

| 列 | 内容 |
|---|---|
| postId | 対象の投稿 |
| userId | 押した人（画面には出さない。二重押し防止用） |
| type | wakaru（わかる〜）/ yoshiyoshi（よしよし）/ erai（えらい！）/ gyu（ぎゅっ） |
| createdAt | 日時 |

### Google Drive

`backupToDrive()` が毎日4時にスプレッドシートを `hitorigoto_backup` フォルダへコピーし、新しい14個を残します。

---

## 2. GASの設定とデプロイ

1. Googleスプレッドシートを新規作成（名前例：`hitorigoto_db`）
2. 「拡張機能 → Apps Script」を開き、`Code.gs` の中身をまるごと貼り替えて保存
3. 「プロジェクトの設定 → スクリプト プロパティ」に追加
   - `GEMINI_API_KEY` … Google AI Studio で発行したキー（必須）
   - `APP_URL` … `https://kenken6291.github.io/hitorigoto/`（メールに載るログインURL）
   - `GEMINI_MODEL` … 変える場合のみ（既定 `gemini-2.5-flash`）
4. エディタで次の関数を順に実行（初回は権限の承認が出ます：スプレッドシート・Gmail・Drive・外部通信）
   - `setup` … シート作成と PEPPER 自動生成
   - `setupTriggers` … 毎日のバックアップ
   - `testGemini` … 実行ログに `"source": "gemini"` と返事が出ればOK（`fallback` ならキーかモデル名を確認）
5. 「デプロイ → 新しいデプロイ → 種類：ウェブアプリ」
   - 実行するユーザー：**自分**
   - アクセスできるユーザー：**全員**
6. 表示された `https://script.google.com/macros/s/…/exec` をコピー

> ⚠️ `Code.gs` を直したら、必ず「デプロイを管理 → 鉛筆（編集）→ バージョン：新バージョン → デプロイ」。保存だけでは公開中のAPIに反映されません。この方法ならURLは変わりません。

> ⚠️ `PEPPER` は消したり変えたりしないでください。全員のパスワードが通らなくなります。

---

## 3. GitHub Pages

1. リポジトリ `hitorigoto` を作成
2. `config.js` の `GAS_API_URL` を手順2-6のURLに書き換え
3. `index.html` / `style.css` / `app.js` / `config.js` をリポジトリ直下に配置（`gas/` は置いても置かなくてもOK）
4. 「Settings → Pages → Branch: main / (root)」で保存
5. 数分後 `https://kenken6291.github.io/hitorigoto/` で表示

更新時は `config.js` の `APP_VERSION` と、`Code.gs` 冒頭の `APP_VERSION` を上げるとフッターで確認できます。スマホで古い表示のままなら、`index.html` の `app.js` などを `app.js?v=1.0.1` のように書き換えるとキャッシュを避けられます。

---

## 4. 動作確認チェックリスト

- [ ] 「はじめて登録」→ 仮パスワードのメールが届く
- [ ] 仮パスワードでログイン → パスワード変更画面が閉じられない状態で出る
- [ ] 変更後に「つぶやく」が使える
- [ ] 目のアイコンでパスワードの表示／非表示が切り替わる
- [ ] 5回まちがえると15分ロック、「パスワードを忘れた」で解除＆再発行できる
- [ ] 投稿の公開設定は既定で「自分だけ」
- [ ] 投稿後にキャラクターの返事と「○○エリアに灯りました」が出る
- [ ] 「わたしの記録」で公開範囲の変更・削除ができる
- [ ] 「みんなの」でリアクションを押す／もう一度押すと取り消し
- [ ] 「気持ちの夜空」で星をタップ（PCはホバー）すると吹き出しが出る
- [ ] 「みんなの星」に切り替えると、自分の星に黄色い輪が付く

## 5. 仕組みメモ

- 通信は `Content-Type: text/plain` の POST（CORSのプリフライト回避）。`{ action, token, payload }` を送り `{ ok, data | code, error }` が返ります。
- セッションは CacheService（6時間・アクセスごとに延長）。パスワード変更・再発行で `sessionVer` が上がり、他端末のログインは切れます。
- Gemini は `responseMimeType: application/json` ＋ `responseSchema` で `{reply, x, y}` を受け取ります。失敗時はキャラクター別の定型文と、感情タグからの目安座標で保存されるので投稿自体は失敗しません。
- 深刻な内容（死にたい等）には茶化さず寄り添い、相談窓口へ話すよう促す指示をプロンプトに入れています。
- エリア判定：原点から半径30以内＝無風の凪、それ以外は象限で
  🎆深夜テンション爆発（＋,＋）／🌋ぷんすか活火山（−,＋）／🌙深夜の懺悔沼（−,−）／🍵縁側ひなたぼっこ（＋,−）。
  「いちばん集まっているエリア」は直近7日の星が3つ以上あればその期間、なければ全期間で集計します。
