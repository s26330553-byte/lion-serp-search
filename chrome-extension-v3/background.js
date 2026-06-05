// background.js — 緩慢瑞萃民宿衝突警報 v3

chrome.action.onClicked.addListener(function (tab) {
  if (!tab.url || !tab.url.includes('gitberp.liontravel.com')) {
    return;
  }

  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files:  ['content.js'],
    world:  'MAIN'
  }).catch(function (err) {
    if (err.message && err.message.includes('Frame with ID 0 was removed')) return;
    console.error('[緩慢瑞萃 v3] 注入失敗:', err.message);
  });
});
