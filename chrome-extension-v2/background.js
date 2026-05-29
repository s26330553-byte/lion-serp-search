// background.js — 處理工具列按鈕點擊，注入擷取腳本（手配版 2.0）

chrome.action.onClicked.addListener(function (tab) {
  if (!tab.url || !tab.url.includes('gitberp.liontravel.com')) {
    return;
  }

  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files:  ['content.js'],
    world:  'MAIN'
  }).catch(function (err) {
    console.error('[SERP 手配版] 注入失敗:', err.message);
  });
});
