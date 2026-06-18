const runBtn   = document.getElementById('run-btn');
const toggle   = document.getElementById('auto-sync-toggle');
const syncStatus = document.getElementById('sync-status');
const lastSyncBox = document.getElementById('last-sync-box');
const lastSyncContent = document.getElementById('last-sync-content');

// 讀取設定與上次同步記錄
chrome.storage.local.get(['autoSync', 'lastSync'], function(data) {
  toggle.checked = !!data.autoSync;
  updateSyncStatus(!!data.autoSync);
  renderLastSync(data.lastSync);
});

// 切換自動同步
toggle.addEventListener('change', function() {
  chrome.storage.local.set({ autoSync: toggle.checked });
  updateSyncStatus(toggle.checked);
});

// 產生報告
runBtn.addEventListener('click', function() {
  chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
    const tab = tabs[0];
    if (!tab || !tab.url || !tab.url.includes('gitberp.liontravel.com')) {
      syncStatus.textContent = '⚠ 請先切換到 ERP 頁面';
      syncStatus.style.color = '#dc2626';
      return;
    }
    runBtn.disabled = true;
    runBtn.textContent = '擷取中…';
    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files:  ['content.js'],
      world:  'MAIN'
    }, function() {
      window.close();
    });
  });
});

function updateSyncStatus(enabled) {
  if (enabled) {
    syncStatus.textContent = '✅ 開啟：報告產生後 3 秒自動上傳';
    syncStatus.style.color = '#16a34a';
  } else {
    syncStatus.textContent = '⏸ 關閉：需手動點「確認匯入 Sheet」';
    syncStatus.style.color = '#64748b';
  }
}

function renderLastSync(s) {
  if (!s) {
    lastSyncBox.className = 'last-sync-box none';
    lastSyncContent.textContent = '尚無記錄';
    return;
  }
  lastSyncBox.className = 'last-sync-box';
  const errNote = s.errors && s.errors.length > 0 ? `　⚠️ ${s.errors.length} 筆錯誤` : '';
  lastSyncContent.innerHTML =
    `新增 <b>${s.created}</b> 筆，更新 <b>${s.updated}</b> 筆（共 ${s.total} 筆）${errNote}<br>` +
    `<span style="color:#4ade80;font-size:11px">🕐 ${s.time}</span>`;
}
