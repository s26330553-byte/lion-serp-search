// config.js — erp-scraper 設定中心
'use strict';

module.exports = {
  // Chrome CDP 連線位址（需用 --remote-debugging-port=9222 啟動 Chrome）
  CDP_URL: 'http://127.0.0.1:9222',

  // ERP SearchList 頁面的 URL 特徵（用來識別正確的分頁）
  TARGET_URL_KEYWORD: '/Prod/SearchList',

  // 資料輸出目錄
  DATA_DIR: 'C:\\Users\\ericlin\\Projects\\erp-scraper\\data',

  // 翻頁隨機延遲範圍（毫秒），模擬人工閱讀速度
  DELAY_MIN: 1500,
  DELAY_MAX: 3500,

  // 等待頁面資料載入的 timeout（毫秒）
  PAGE_LOAD_TIMEOUT: 15000,
};
