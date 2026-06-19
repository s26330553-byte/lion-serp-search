// ci-content.js — 擷取華航代理商網站（calec.china-airlines.com）機位資料
// 全部資料在 DOM，不需翻頁
// isolated world，chrome.storage 可直接使用

(function () {

  if (window.__ciCapturing) return;

  // tbody row 0 = 空白、row 1 = header、row 2 起 = 資料
  var allTr = document.querySelectorAll('table tbody tr');
  if (!allTr || allTr.length < 3) {
    alert('找不到資料列，請確認已在華航代理商 PNR 清單頁且有資料。');
    return;
  }

  window.__ciCapturing = true;

  function report(msg, cur, tot, done) {
    chrome.storage.local.set({ ci_progress: { msg: msg, cur: cur, tot: tot, done: !!done } });
  }

  // 欄位固定（從 F12 確認）：2=出發日期、4=日數、5=行程、6=訂位人數
  var COL = { departure: 2, days: 4, route: 5, seats: 6 };

  // 從行程欄位判斷路線（同 JX 邏輯，看 CTS / HKD 順序）
  function detectRoute(routeText) {
    var r = routeText.replace(/\s+/g, '').toUpperCase();
    if (r.includes('CTS') && r.includes('HKD')) {
      return r.indexOf('CTS') < r.indexOf('HKD') ? '千函' : '函千';
    }
    if (r.includes('CTS')) return '千歲';
    if (r.includes('HKD')) return '函館';
    return null; // 非北海道
  }

  var dataRows = Array.from(allTr).slice(2); // 跳過空白行和 header 行
  report('解析 ' + dataRows.length + ' 筆資料...', 0, dataRows.length, false);

  var allRows = [];
  dataRows.forEach(function(tr, i) {
    var cells = tr.querySelectorAll('td, th');
    if (cells.length <= COL.seats) return;

    var departureText = cells[COL.departure] ? cells[COL.departure].textContent.trim() : '';
    var daysText      = cells[COL.days]      ? cells[COL.days].textContent.trim()      : '';
    var routeText     = cells[COL.route]     ? cells[COL.route].textContent.trim()     : '';
    var seatsText     = cells[COL.seats]     ? cells[COL.seats].textContent.trim()     : '';

    // 出發日期 "2026/06/19(五)" → "2026/06/19"
    var dateM = departureText.match(/(\d{4})\/(\d{1,2})\/(\d{1,2})/);
    if (!dateM) return;
    var departure = dateM[1] + '/' +
      String(parseInt(dateM[2], 10)).padStart(2, '0') + '/' +
      String(parseInt(dateM[3], 10)).padStart(2, '0');

    // 日數 "5d" → 5
    var days  = parseInt(daysText, 10) || 0;
    var seats = parseInt(seatsText, 10) || 0;
    if (seats === 0) return;

    var route = detectRoute(routeText);
    if (!route) return;

    allRows.push({ departure: departure, days: days, seats: seats, route: route, routeText: routeText });

    if (i % 50 === 0) report('解析中... ' + i + ' / ' + dataRows.length, i, dataRows.length, false);
  });

  chrome.storage.local.set({
    ci_agent_data:  allRows,
    ci_agent_time:  new Date().toLocaleString('zh-TW', { hour12: false }),
    ci_agent_count: allRows.length
  });

  report('✅ 擷取完成！共 ' + allRows.length + ' 筆（訂位人數 > 0）', allRows.length, allRows.length, true);

  window.__ciCapturing = false;

})();
