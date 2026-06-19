// 跑在 ISOLATED world（有 chrome API），負責橋接 MAIN world 與 chrome.storage

// 把 autoSync 設定寫進 html data 屬性，讓 MAIN world 的 content.js 讀到
function applyAutoSync(enabled) {
  document.documentElement.dataset.erpAutoSync = enabled ? '1' : '0';
}

chrome.storage.local.get('autoSync', function(data) {
  applyAutoSync(!!data.autoSync);
});

chrome.storage.onChanged.addListener(function(changes) {
  if (changes.autoSync !== undefined) {
    applyAutoSync(!!changes.autoSync.newValue);
  }
});

// 接收 MAIN world 傳來的 SERP BR / JX 資料，存回 chrome.storage
window.addEventListener('message', function(e) {
  if (e.data && e.data.type === 'erpSerpBR') {
    chrome.storage.local.set({
      serp_br_data: e.data.rows,
      serp_br_time: new Date().toLocaleString('zh-TW', { hour12: false })
    });
  }
  if (e.data && e.data.type === 'erpSerpJX') {
    chrome.storage.local.set({
      serp_jx_data: e.data.rows,
      serp_jx_time: new Date().toLocaleString('zh-TW', { hour12: false })
    });
  }
  if (e.data && e.data.type === 'erpSerpCI') {
    chrome.storage.local.set({
      serp_ci_data: e.data.rows,
      serp_ci_time: new Date().toLocaleString('zh-TW', { hour12: false })
    });
  }
});

// 接收 MAIN world 的同步結果，存回 chrome.storage
window.addEventListener('message', function(e) {
  if (!e.data || e.data.type !== 'erpSync') return;
  var now = new Date().toLocaleString('zh-TW', { hour12: false });
  chrome.storage.local.set({
    lastSync: {
      time: now,
      created: e.data.created || 0,
      updated: e.data.updated || 0,
      total:   e.data.total   || 0,
      errors:  e.data.errors  || []
    }
  });
});
