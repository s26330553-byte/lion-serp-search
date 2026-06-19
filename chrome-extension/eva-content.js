// eva-content.js — 擷取長榮代理商網站機位資料
// 翻頁用 fetch POST（form submit 會整頁重載，content script 無法存活）
// isolated world，chrome.storage 可直接使用

(function () {

  if (window.__evaCapturing) return;
  if (!document.querySelector('div.itemInList')) return;

  window.__evaCapturing = true;

  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  function report(msg, cur, tot, done) {
    chrome.storage.local.set({ eva_progress: { msg: msg, cur: cur, tot: tot, done: !!done } });
  }

  // ── 取總頁數 ─────────────────────────────────────────────────
  function getTotalPages() {
    var span = document.querySelector('input[name="Data.PageNumber"]');
    var body = document.body.innerText || '';
    var m = body.match(/(\d+)\s*\/\s*(\d+)/);
    return m ? parseInt(m[2], 10) : 1;
  }

  function getTotalRecords() {
    var body = document.body.innerText || '';
    var m = body.match(/共\s*(\d+)\s*筆/);
    return m ? parseInt(m[1], 10) : 0;
  }

  // ── 從 HTML Document 解析 itemInList 列 ──────────────────────
  function parseDoc(doc) {
    var rows = [];
    var items = doc.querySelectorAll('div.itemInList');
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      var cells = item.querySelectorAll(':scope > div');
      if (cells.length < 3) continue;

      var dateText = cells[0] ? cells[0].innerText.trim() : '';
      // PNR：優先用 hidden input value，備援用文字節點
      var pnrInput = item.querySelector('input[name*="Pnr"]');
      var pnrText  = pnrInput ? pnrInput.value.trim() : (cells[1] ? cells[1].innerText.trim().split('\n')[0].trim() : '');
      var itinText = cells[2] ? cells[2].innerText.trim() : '';
      var paxText  = cells[3] ? cells[3].innerText.trim() : '';

      var dateM = dateText.match(/(\d{4})\/(\d{1,2})\/(\d{1,2})/);
      if (!dateM) continue;
      var departure = dateM[1] + '/' +
        String(parseInt(dateM[2], 10)).padStart(2, '0') + '/' +
        String(parseInt(dateM[3], 10)).padStart(2, '0');

      var daysM = dateText.match(/\((\d+)D\)/i);
      var days = daysM ? parseInt(daysM[1], 10) : 0;

      var flightM = itinText.match(/BR(\d+)/);
      var flight = flightM ? 'BR' + flightM[1] : '';

      var pax = parseInt(paxText, 10) || 0;
      if (!pnrText || pnrText.length < 4 || pax === 0) continue;

      rows.push({ pnr: pnrText, departure: departure, days: days, flight: flight, pax: pax });
    }
    return rows;
  }

  // ── 用 fetch POST 抓指定頁 ───────────────────────────────────
  async function fetchPage(pageNum) {
    var form = document.querySelector('form');
    if (!form) throw new Error('找不到 form 元素');
    var url = form.action || location.href;
    var formData = new FormData(form);
    // 設定頁碼並模擬點 NextPage（讓 server 知道要換頁）
    formData.set('Data.PageNumber', String(pageNum - 1)); // 通常是 0-based 或由 NextPage 累加
    formData.append('NextPage', '');
    var resp = await fetch(url, {
      method: 'POST',
      body: formData,
      credentials: 'same-origin'
    });
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    var html = await resp.text();
    var parser = new DOMParser();
    return parser.parseFromString(html, 'text/html');
  }

  // ── 主流程 ───────────────────────────────────────────────────
  (async function () {
    var allRows = [];
    var totalPages  = getTotalPages();
    var totalRecords = getTotalRecords() || totalPages * 10;

    try {
      // 第一頁直接從 DOM 讀
      report('擷取第 1 / ' + totalPages + ' 頁...', 0, totalRecords, false);
      var firstRows = parseDoc(document);
      allRows = allRows.concat(firstRows);
      report('第 1 頁完成（' + firstRows.length + ' 筆）', allRows.length, totalRecords, false);

      // 後續頁用 fetch
      for (var page = 2; page <= totalPages; page++) {
        await sleep(600 + Math.random() * 400);
        report('擷取第 ' + page + ' / ' + totalPages + ' 頁...', allRows.length, totalRecords, false);

        var pageDoc = await fetchPage(page);
        var pageRows = parseDoc(pageDoc);

        // 若 fetch 失敗（拿到 0 筆），可能是 session 問題
        if (pageRows.length === 0 && page <= 3) {
          report('⚠ 第 ' + page + ' 頁 0 筆（session 可能逾時），停止', allRows.length, allRows.length, true);
          break;
        }

        allRows = allRows.concat(pageRows);
        report('第 ' + page + ' 頁完成（' + pageRows.length + ' 筆）', allRows.length, totalRecords, false);
      }

      chrome.storage.local.set({
        eva_br_data:  allRows,
        eva_br_time:  new Date().toLocaleString('zh-TW', { hour12: false }),
        eva_br_count: allRows.length
      });

      report('✅ 擷取完成！共 ' + allRows.length + ' 筆', allRows.length, allRows.length, true);

    } catch (e) {
      console.error('[EVA] 擷取錯誤:', e);
      report('❌ 錯誤：' + e.message, 0, 0, true);
    } finally {
      window.__evaCapturing = false;
    }
  })();

})();
