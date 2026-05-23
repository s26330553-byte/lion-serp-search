// background.js — 處理工具列按鈕點擊，注入擷取腳本

chrome.action.onClicked.addListener(function (tab) {
  if (!tab.url || !tab.url.includes('gitberp.liontravel.com')) {
    // 不在 ERP 網站上，不做任何事
    return;
  }

  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files:  ['content.js'],
    world:  'MAIN'          // 在頁面本身的 JS 環境執行（可用 fetch、window 等）
  }).catch(function (err) {
    console.error('[ERP Extension] 注入失敗:', err.message);
  });
});
