/**
 * ひとりごと — 設定ファイル
 * GASを「新バージョン」でデプロイし直してもURLは変わりません。
 * 新しいデプロイを作成した場合のみ、ここのURLを書き換えてください。
 */
window.APP_CONFIG = {
  // GASウェブアプリのURL（.../exec で終わるもの）
  GAS_API_URL: 'https://script.google.com/macros/s/AKfycbxmEwPmE7Cyk3dbbqFeulaX1oJl75OmfQXubFzOOctnq9MsyckyngFs49oQeZwqp3ICVA/exec',

  APP_NAME: 'ひとりごと',
  APP_VERSION: 'v1.2.0',

  // タイムラインの1回あたりの読み込み件数
  PAGE_SIZE: 20,

  // API通信のタイムアウト（ミリ秒）。AIの返事を待つので長めに
  REQUEST_TIMEOUT_MS: 60000,
};
