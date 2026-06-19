// jx-content.js — 擷取星宇航空代理商網站（support.starlux-airlines.com）機位資料
// 全部資料在 DOM，不需翻頁
// isolated world，chrome.storage 可直接使用

(function () {

  if (window.__jxCapturing) return;

  var rows = document.querySelectorAll('table tbody tr');
  if (!rows || rows.length === 0) {
    alert('找不到資料列，請確認已在星宇代理商「我的團體」清單頁且有資料。');
    return;
  }

  window.__jxCapturing = true;

  function report(msg, cur, tot, done) {
    chrome.storage.local.set({ jx_progress: { msg: msg, cur: cur, tot: tot, done: !!done } });
  }

  // ── 偵測欄位 index（從 header 文字判斷）──────────────────────
  function buildColIdx() {
    var idx = { departure: 2, route: 3, days: 9, allocation: 7 };
    var headers = document.querySelectorAll('table thead tr th, table thead tr td');
    headers.forEach(function(th, i) {
      var t = th.textContent.replace(/\s+/g, '');
      if (t.includes('出發日')) idx.departure = i;
      else if (t.includes('出發航班') || t.includes('航點') || t.includes('航線')) idx.route = i;
      else if (t.includes('天數')) idx.days = i;
      else if (t.includes('最終分配')) idx.allocation = i;
    });
    return idx;
  }

  var idx = buildColIdx();

  report('解析 ' + rows.length + ' 筆資料...', 0, rows.length, false);

  // 從航點字串判斷路線
  // TPE-CTS-TPE          → 千歲
  // TPE-HKD-TPE          → 函館
  // TPE-CTS X HKD-TPE   → 千函（千歲進函館出）
  // TPE-HKD X CTS-TPE   → 函千（函館進千歲出）
  function detectRoute(routeText) {
    var r = routeText.replace(/\s+/g, '').toUpperCase();
    if (r.includes('CTS') && r.includes('HKD')) {
      // 混合航點：看哪個在前
      return r.indexOf('CTS') < r.indexOf('HKD') ? '千函' : '函千';
    }
    if (r.includes('CTS')) return '千歲';
    if (r.includes('HKD')) return '函館';
    return null; // 非北海道
  }

  var allRows = [];
  rows.forEach(function(tr, i) {
    var cells = tr.querySelectorAll('td, th');
    var maxIdx = Math.max(idx.departure, idx.route, idx.days, idx.allocation);
    if (cells.length <= maxIdx) return;

    var departureText  = cells[idx.departure]  ? cells[idx.departure].textContent.trim()  : '';
    var routeText      = cells[idx.route]      ? cells[idx.route].textContent.trim()      : '';
    var daysText       = cells[idx.days]       ? cells[idx.days].textContent.trim()       : '';
    var allocationText = cells[idx.allocation] ? cells[idx.allocation].textContent.trim() : '';

    var dateM = departureText.match(/(\d{4})\/(\d{1,2})\/(\d{1,2})/);
    if (!dateM) return;
    var departure = dateM[1] + '/' +
      String(parseInt(dateM[2], 10)).padStart(2, '0') + '/' +
      String(parseInt(dateM[3], 10)).padStart(2, '0');

    var days       = parseInt(daysText, 10) || 0;
    var allocation = parseInt(allocationText, 10) || 0;
    if (allocation === 0) return;

    var route = detectRoute(routeText);
    if (!route) return;

    allRows.push({ departure: departure, days: days, allocation: allocation, route: route, routeText: routeText });

    if (i % 50 === 0) report('解析中... ' + i + ' / ' + rows.length, i, rows.length, false);
  });

  chrome.storage.local.set({
    jx_starlux_data:  allRows,
    jx_starlux_time:  new Date().toLocaleString('zh-TW', { hour12: false }),
    jx_starlux_count: allRows.length
  });

  report('✅ 擷取完成！共 ' + allRows.length + ' 筆（最終分配 > 0）', allRows.length, allRows.length, true);

  window.__jxCapturing = false;

})();
