// content.js — ERP 機位資料擷取 + HTML 報告產生器（動態欄位偵測版）
// 由 background.js 注入到 ERP SearchList 頁面執行

// ── 下載中繼：報告視窗（about:blank）透過 postMessage 把 HTML 傳回這裡，
//    由 ERP 頁（真實 origin）建立 blob URL 觸發下載，避免 about:blank 被擋
if (!window.__erpDlListenerSet) {
  window.__erpDlListenerSet = true;
  window.addEventListener('message', function (e) {
    if (!e.data || e.data.type !== 'erpDl') return;
    var blob = new Blob([e.data.html], { type: 'text/html;charset=utf-8' });
    var url  = URL.createObjectURL(blob);
    var a    = document.createElement('a');
    a.href     = url;
    a.download = e.data.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });
}

(function () {

  // ── 防止重複執行 ──────────────────────────────────────────────
  if (window.__erpCapturing) {
    alert('ERP 機位報告：擷取中，請稍候...');
    return;
  }

  // ── 確認在 SearchList 頁面 ────────────────────────────────────
  var pageSelect = document.querySelector('select[id="PageIndex"]');
  if (!pageSelect) {
    alert('ERP 機位報告：請在 SearchList 頁面（有頁碼下拉選單的頁面）使用');
    return;
  }
  window.__erpCapturing = true;

  // ── 進度浮層 ──────────────────────────────────────────────────
  var overlay = document.createElement('div');
  overlay.id = '__erp_ov';
  overlay.style.cssText =
    'position:fixed;inset:0;background:rgba(0,0,0,.72);' +
    'z-index:2147483647;display:flex;align-items:center;justify-content:center;' +
    'font-family:Segoe UI,system-ui,sans-serif;';

  overlay.innerHTML =
    '<div style="background:#fff;border-radius:16px;padding:36px 48px;' +
    'text-align:center;min-width:340px;box-shadow:0 24px 64px rgba(0,0,0,.4);">' +
    '<div style="font-size:22px;font-weight:700;margin-bottom:8px;">' +
      '✈️ 擷取機位資料中</div>' +
    '<div id="__erp_p" style="color:#666;font-size:14px;margin-bottom:20px;">' +
      '初始化...</div>' +
    '<div id="__erp_c" style="font-size:40px;font-weight:800;color:#1a73e8;' +
      'letter-spacing:-1px;">0 筆</div>' +
    '<div style="background:#eee;height:8px;border-radius:4px;margin-top:20px;overflow:hidden;">' +
      '<div id="__erp_b" style="height:8px;' +
        'background:linear-gradient(90deg,#1a73e8,#0d47a1);' +
        'border-radius:4px;width:0%;transition:width .5s ease;"></div>' +
    '</div>' +
    '<div style="margin-top:12px;font-size:12px;color:#bbb;">' +
      '請勿關閉或切換頁面</div>' +
    '</div>';

  document.body.appendChild(overlay);

  function upd(msg, cur, tot) {
    var ep = document.getElementById('__erp_p');
    var ec = document.getElementById('__erp_c');
    var eb = document.getElementById('__erp_b');
    if (ep) ep.textContent = msg;
    if (ec) ec.textContent = cur + ' 筆';
    if (eb) eb.style.width = (tot > 0 ? Math.min(cur / tot * 100, 99) : 0) + '%';
  }

  // ── 嘗試預開報告視窗（在第一個 await 前，屬於 user gesture 範圍） ──
  var reportWin = null;
  try {
    reportWin = window.open('', 'erp_report');
    if (reportWin) {
      reportWin.document.write(
        '<html><body style="font-family:Segoe UI,sans-serif;display:flex;' +
        'align-items:center;justify-content:center;min-height:100vh;' +
        'margin:0;background:#f0f2f5;">' +
        '<div style="text-align:center;color:#888;">' +
        '<div style="font-size:48px;margin-bottom:16px;">✈️</div>' +
        '<div style="font-size:18px;font-weight:700;margin-bottom:8px;">' +
          '資料擷取中，請稍候...</div>' +
        '<div style="font-size:14px;">' +
          '擷取完成後本頁自動更新</div>' +
        '</div></body></html>'
      );
    }
  } catch (e) { reportWin = null; }

  // ── 工具函式 ──────────────────────────────────────────────────
  function sleep(ms) {
    return new Promise(function (r) { setTimeout(r, ms); });
  }

  function isValidGrp(t) {
    // 月份：1-9月用數字，10月以後用字母（O/N/D）
    return /^\d{2}[A-Z]{2}[A-Z\d]{3}[A-Z]{2}/.test(t);
  }

  // ── 動態偵測欄位位置（從所有含 <th> 的列解析，處理 colspan/rowspan） ──
  // ASP.NET GridView 不用 <thead>，header 就在 <tbody> 第一列 <th> 裡
  // 回傳 { '欄位名稱': 欄位索引, ... }
  function buildColMap(table) {
    var map = {};

    // 找所有「直接子 <th> 數量 >= 5」的 <tr>（這就是標題列）
    var allRows = Array.prototype.slice.call(table.querySelectorAll('tr'));
    var theadRows = allRows.filter(function (tr) {
      return tr.querySelectorAll(':scope > th').length >= 5;
    });
    if (!theadRows.length) return map;

    // 用 grid 追蹤每個格子被哪個 header 佔用（rowspan/colspan 跨欄）
    var grid = [];

    for (var ri = 0; ri < theadRows.length; ri++) {
      if (!grid[ri]) grid[ri] = [];
      var ths = Array.prototype.slice.call(
        theadRows[ri].querySelectorAll(':scope > th, :scope > td')
      );
      var col = 0;
      for (var ci = 0; ci < ths.length; ci++) {
        // 跳過已被上方 rowspan 佔用的欄位
        while (grid[ri][col] !== undefined) col++;

        var text = ths[ci].textContent.replace(/[\s\n\r　]/g, '').trim();
        var cs   = Math.max(1, parseInt(ths[ci].getAttribute('colspan') || '1', 10));
        var rs   = Math.max(1, parseInt(ths[ci].getAttribute('rowspan') || '1', 10));

        // 填入 grid（讓後續 row 知道哪些欄已被佔用）
        for (var r2 = 0; r2 < rs; r2++) {
          for (var c2 = 0; c2 < cs; c2++) {
            if (!grid[ri + r2]) grid[ri + r2] = [];
            grid[ri + r2][col + c2] = text || '_';
          }
        }

        // 記錄欄位名稱→索引（同名只取第一次出現的位置）
        if (text && map[text] === undefined) map[text] = col;

        col += cs;
      }
    }

    return map;
  }

  // ── 欄位別名對映（ERP 中文/英文名稱 → 內部 key） ─────────────
  var FIELD_ALIAS = {
    '團號':     'groupNo',
    '航空':     'airline',
    '團控說明':  'remark',
    '備註':     'remark',
    '團位':     'totalSeats',
    'HL':       'hl',
    'HK':       'hk',
    'KK':       'kk',
    '保留':     'reserved',
    '可賣':     'available',
    '可賀':     'available',
    'JOIN':     'join',
    '天':       'days',
    'OP':       'op'
  };

  // 硬編碼備援（若 thead 偵測失敗才用）
  var FALLBACK_IDX = {
    groupNo: 2, airline: 3, remark: 10, totalSeats: 11,
    hl: 13, hk: 17, kk: 16, reserved: 18, available: 19, join: 20, days: 9, op: 22
  };

  function resolveIdx(colMap) {
    var idx = {};
    // 優先從偵測結果取
    Object.keys(FIELD_ALIAS).forEach(function (colName) {
      var fieldName = FIELD_ALIAS[colName];
      if (colMap[colName] !== undefined && idx[fieldName] === undefined) {
        idx[fieldName] = colMap[colName];
      }
    });
    // 補入備援
    Object.keys(FALLBACK_IDX).forEach(function (k) {
      if (idx[k] === undefined) idx[k] = FALLBACK_IDX[k];
    });
    return idx;
  }

  // ── 從 Document 擷取資料列 ───────────────────────────────────
  // 回傳 { colMap, rows }
  function extractRows(doc) {
    var tables = Array.prototype.slice.call(doc.querySelectorAll('table'));
    var best = tables.reduce(function (b, t) {
      var n = t.querySelectorAll(':scope > tbody > tr').length;
      return n > (b ? b.count : 0) ? { t: t, count: n } : b;
    }, null);
    if (!best) return { colMap: {}, rows: [] };

    var table  = best.t;
    var colMap = buildColMap(table);
    var idx    = resolveIdx(colMap);

    var result = [];
    var trs    = table.querySelectorAll(':scope > tbody > tr');

    for (var ri = 0; ri < trs.length; ri++) {
      var cells = Array.prototype.slice.call(trs[ri].querySelectorAll(':scope > td'));
      if (cells.length < 10) continue;

      // 所有欄位原始文字（換行符號換成空白，方便顯示）
      var cellTexts = cells.map(function (td) {
        return td.textContent.replace(/\n/g, ' ').trim();
      });

      function ct(i) {
        return (i !== undefined && cellTexts[i] !== undefined) ? cellTexts[i] : '';
      }
      function cn(i) {
        if (i === undefined) return 0;
        var n = parseInt((cellTexts[i] || '').replace(/,/g, ''), 10);
        return isNaN(n) ? 0 : n;
      }

      // 團號：取第一行（避免 cell 內有副文字）
      var grpCell = cells[idx.groupNo];
      var grp = grpCell ? grpCell.textContent.trim().split('\n')[0].trim() : '';
      if (!isValidGrp(grp)) continue;

      // 依偵測到的欄位名稱建立命名物件（所有欄位，未來直接用欄位名取值）
      var namedCells = {};
      Object.keys(colMap).forEach(function (name) {
        namedCells[name] = cellTexts[colMap[name]] || '';
      });

      var row = {
        groupNo:    grp,
        airline:    ct(idx.airline),
        orderType:  cellTexts[4] || '',  // cells[4]＝航空右邊的「圍/団」欄（TKT / T/O / …）
        remark:     ct(idx.remark),
        totalSeats: cn(idx.totalSeats),
        hl:         cn(idx.hl),
        hk:         cn(idx.hk),
        kk:         cn(idx.kk),
        reserved:   cn(idx.reserved),
        available:  cn(idx.available),
        join:       cn(idx.join),
        days:       cn(idx.days),
        op:         ct(idx.op),
        _cells:     cellTexts,    // 全部原始欄位值（依 index 取）
        _named:     namedCells    // 全部原始欄位值（依欄位名稱取）
      };

      result.push(row);
    }

    return { colMap: colMap, rows: result };
  }

  // ── Fetch 指定頁 ──────────────────────────────────────────────
  async function fetchPage(pageIndex, prevDoc) {
    var form = document.querySelector('form#SearchListForm');
    if (!form) throw new Error('找不到 SearchListForm');
    var fd = new FormData(form);
    if (prevDoc) {
      var hids = prevDoc.querySelectorAll('input[type="hidden"]');
      for (var hi = 0; hi < hids.length; hi++) {
        if (hids[hi].name) fd.set(hids[hi].name, hids[hi].value);
      }
    }
    fd.set('PageIndex', String(pageIndex));
    var res = await fetch(form.action, {
      method: 'POST', body: fd, credentials: 'include'
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.text();
  }

  // ── 主擷取邏輯（async IIFE） ──────────────────────────────────
  (async function () {
    var totalPages = pageSelect.querySelectorAll('option').length;
    var startPage  = parseInt(pageSelect.value, 10);
    var allRows    = [];
    var colMap     = {};
    var parser     = new DOMParser();
    var prevDoc    = null;
    var estTotal   = totalPages * 95;

    // 第一頁：直接從當前 document 讀
    upd('第 ' + startPage + ' / ' + totalPages + ' 頁', 0, estTotal);
    var firstResult = extractRows(document);
    colMap  = firstResult.colMap;
    allRows = firstResult.rows;
    upd('第 ' + startPage + ' / ' + totalPages + ' 頁（' +
        allRows.length + ' 筆）', allRows.length, estTotal);

    // 後續頁：逐頁 fetch
    for (var page = startPage + 1; page <= totalPages; page++) {
      await sleep(800 + Math.random() * 700);
      try {
        upd('第 ' + page + ' / ' + totalPages + ' 頁',
            allRows.length, estTotal);
        var html = await fetchPage(page, prevDoc);
        var doc  = parser.parseFromString(html, 'text/html');
        prevDoc  = doc;
        var pr   = extractRows(doc);
        // 若第一頁沒抓到 colMap，用後續頁補上
        if (!Object.keys(colMap).length && Object.keys(pr.colMap).length) {
          colMap = pr.colMap;
        }
        allRows = allRows.concat(pr.rows);
        upd('第 ' + page + ' / ' + totalPages + ' 頁（' +
            pr.rows.length + ' 筆）', allRows.length, estTotal);
      } catch (e) {
        console.error('[ERP] page ' + page + ' failed:', e);
        break;
      }
    }

    // ── 移除浮層 ────────────────────────────────────────────────
    var ov = document.getElementById('__erp_ov');
    if (ov) ov.parentNode.removeChild(ov);
    window.__erpCapturing = false;

    // ── 儲存 BR 資料供長榮對照用 ────────────────────────────────
    (function () {
      function _serpDepDate(groupNo) {
        var gn = groupNo.split(' ')[0];
        if (gn.length < 7) return null;
        var yr = 2000 + parseInt(gn.slice(0, 2), 10);
        var mc = gn[4];
        var day = parseInt(gn.slice(5, 7), 10);
        var mo;
        if (mc >= '1' && mc <= '9') mo = parseInt(mc, 10);
        else if (mc === 'O') mo = 10;
        else if (mc === 'N') mo = 11;
        else if (mc === 'D') mo = 12;
        else return null;
        return yr + '/' + String(mo).padStart(2, '0') + '/' + String(day).padStart(2, '0');
      }
      var brRows = allRows.filter(function (r) { return r.airline === 'BR'; }).map(function (r) {
        return {
          groupNo:    r.groupNo,
          departure:  _serpDepDate(r.groupNo),
          days:       r.days,
          totalSeats: r.totalSeats,
          hk:         r.hk,
          kk:         r.kk,
          remark:     r.remark || '',
          teamName:   (r._cells && r._cells[6]) ? r._cells[6] : ''
        };
      }).filter(function (r) { return r.departure; });
      // MAIN world 無法用 chrome.storage，改用 postMessage → sync-bridge.js 轉存
      window.postMessage({ type: 'erpSerpBR', rows: brRows }, '*');

      // JX 資料
      var jxRows = allRows.filter(function (r) { return r.airline === 'JX'; }).map(function (r) {
        return {
          groupNo:    r.groupNo,
          departure:  _serpDepDate(r.groupNo),
          days:       r.days,
          totalSeats: r.totalSeats,
          hk:         r.hk,
          kk:         r.kk,
          remark:     r.remark || '',
          teamName:   (r._cells && r._cells[6]) ? r._cells[6] : ''
        };
      }).filter(function (r) { return r.departure; });
      window.postMessage({ type: 'erpSerpJX', rows: jxRows }, '*');

      // CI 資料
      var ciRows = allRows.filter(function (r) { return r.airline === 'CI'; }).map(function (r) {
        return {
          groupNo:    r.groupNo,
          departure:  _serpDepDate(r.groupNo),
          days:       r.days,
          totalSeats: r.totalSeats,
          hk:         r.hk,
          kk:         r.kk,
          remark:     r.remark || '',
          teamName:   (r._cells && r._cells[6]) ? r._cells[6] : ''
        };
      }).filter(function (r) { return r.departure; });
      window.postMessage({ type: 'erpSerpCI', rows: ciRows }, '*');
    })();

    // ── 輸出報告 ────────────────────────────────────────────────
    var reportHTML = buildReport(allRows, colMap);

    function _writeReport(html, autoSync) {
      var inject = autoSync ? '<script>window.__erpAutoSync=true;<\/script>' : '';
      var finalHTML = inject + html;
      if (reportWin && !reportWin.closed) {
        try {
          reportWin.document.open();
          reportWin.document.write(finalHTML);
          reportWin.document.close();
          reportWin.focus();
        } catch (e) {
          downloadReport(html);
        }
      } else {
        downloadReport(html);
      }
    }

    // 讀 sync-bridge.js（ISOLATED world）透過 data 屬性傳過來的設定
    var autoSync = document.documentElement.dataset.erpAutoSync === '1';
    _writeReport(reportHTML, autoSync);
  })();

  function downloadReport(html) {
    var blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    var url  = URL.createObjectURL(blob);
    var a    = document.createElement('a');
    a.href     = url;
    a.download = 'erp-report-' + new Date().toISOString().slice(0, 10) + '.html';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // ── 報告 HTML 產生器 ──────────────────────────────────────────
  function buildReport(rows, colMap) {
    var now = new Date().toLocaleString('zh-TW', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
    });

    function hasAst(r) {
      // 只看全形＊（U+FF0A），半形 * 不算
      return r.remark.indexOf('＊') >= 0;
    }

    // ── 篩選邏輯 ──────────────────────────────────────────────
    // 特別警示：備註含全形＊（無現成機位），不論即將成團或已成團
    // 條件：有＊ AND（KK >= 10 OR HK+KK > 15）AND 排除 NJ / TKT
    var noSeats = rows.filter(function (r) {
      if (!hasAst(r)) return false;
      if (r.orderType.indexOf('TKT') >= 0) return false;
      if (r.remark.indexOf('NJ') >= 0) return false;
      return r.kk >= 10 || (r.hk + r.kk) > 15;
    });

    // 即將成團：（KK >= 10 OR HK+KK > 15），排除已成團、NJ、TKT、以及已在特別警示的（避免重複）
    var formingAll = rows.filter(function (r) {
      return (r.kk >= 10 || (r.hk + r.kk) > 15)
        && r.remark.indexOf('成團') < 0
        && r.remark.indexOf('NJ') < 0
        && r.orderType.indexOf('TKT') < 0;
    });
    var forming = formingAll.filter(function (r) { return !hasAst(r); });
    // ── 出發日期工具 ──────────────────────────────────────────
    function departureDateObj(groupNo) {
      var gn = groupNo.split(' ')[0];
      if (gn.length < 7) return null;
      var yr  = 2000 + parseInt(gn.slice(0, 2), 10);
      var mc  = gn[4];
      var day = parseInt(gn.slice(5, 7), 10);
      var mo;
      if (mc >= '1' && mc <= '9') mo = parseInt(mc, 10);
      else if (mc === 'O') mo = 10;
      else if (mc === 'N') mo = 11;
      else if (mc === 'D') mo = 12;
      else return null;
      return new Date(yr, mo - 1, day);
    }
    function fmtDepDate(groupNo) {
      var d = departureDateObj(groupNo);
      if (!d) return '?';
      return (d.getMonth() + 1) + '/' + d.getDate();
    }
    var _today = new Date(); _today.setHours(0, 0, 0, 0);
    var _cutoff = new Date(_today.getTime() + 14 * 24 * 60 * 60 * 1000);

    // 已成團但可賣不足：備註含「成團」、可賣 < 5、排除NJ、出發日在今後14天內
    var tightSeats = rows.filter(function (r) {
      if (r.remark.indexOf('成團') < 0) return false;
      if (r.available >= 5) return false;
      if (r.remark.indexOf('NJ') >= 0) return false;
      if (r.totalSeats >= 38) return false;
      var dep = departureDateObj(r.groupNo);
      return dep && dep > _cutoff;
    });
    // 超賣：
    //   條件一：可賣 <= -1
    //   條件二：團控備註含半形 *數字（實際機位上限），且 KK 超過該數字
    var overSold = rows.filter(function (r) {
      if (r.available <= -1) return true;
      var m = r.remark.match(/\*(\d+)/);
      if (m && r.kk > parseInt(m[1], 10)) return true;
      return false;
    });

    // 保留太多：保留 > 0 且 可賣 <= 6
    var tooReserved = rows.filter(function (r) {
      return r.reserved > 0 && r.available <= 6;
    });

    // 未派OP：已成團但 OP 欄位為空
    var noOp = rows.filter(function (r) {
      if (r.remark.indexOf('成團') < 0) return false;
      return r.op.trim() === '';
    });

    // 建議漲價：標準團名含「秒殺」或「省最大」，已成團，HK+KK >= 15
    // 已點「漲價完成」按鈕的團號存在 localStorage，下次搜尋自動排除
    var priceUp = rows.filter(function (r) {
      var tn = (r._cells && r._cells[6]) ? r._cells[6] : '';
      if (tn.indexOf('秒殺') < 0 && tn.indexOf('省最大') < 0) return false;
      if (r.remark.indexOf('成團') < 0) return false;
      if ((r.hk + r.kk) < 15) return false;
      try { if (localStorage.getItem('erp_pup_' + r.groupNo.split(' ')[0])) return false; } catch(e) {}
      return true;
    });

    var byAirline = {};
    rows.forEach(function (r) {
      byAirline[r.airline] = (byAirline[r.airline] || 0) + 1;
    });

    // ── 月份 HK/KK 加總（跨次查詢比對用） ───────────────────────
    function getMonthlyTotals(rs) {
      var mo = {};
      rs.forEach(function (r) {
        var gn = r.groupNo.split(' ')[0];
        if (gn.length < 7) return;
        var mc = gn[4];
        var m;
        if (mc >= '1' && mc <= '9') m = parseInt(mc, 10);
        else if (mc === 'O') m = 10;
        else if (mc === 'N') m = 11;
        else if (mc === 'D') m = 12;
        else return;
        if (!mo[m]) mo[m] = { hk: 0, kk: 0 };
        mo[m].hk += r.hk;
        mo[m].kk += r.kk;
      });
      return mo;
    }

    var MNAMES = { 1:'1月',2:'2月',3:'3月',4:'4月',5:'5月',6:'6月',
                   7:'7月',8:'8月',9:'9月',10:'10月',11:'11月',12:'12月' };
    var LS_KEY = 'erp_last_query';

    // 讀上次查詢
    var lastQuery = null;
    try {
      var _s = localStorage.getItem(LS_KEY);
      if (_s) lastQuery = JSON.parse(_s);
    } catch (e) {}

    // 本次月份加總
    var curMonthly = getMonthlyTotals(rows);

    // 所有月份（本次 ∪ 上次，排序）
    var _am = {};
    Object.keys(curMonthly).forEach(function (m) { _am[m] = true; });
    if (lastQuery && lastQuery.monthly) {
      Object.keys(lastQuery.monthly).forEach(function (m) { _am[m] = true; });
    }
    var sortedMonths = Object.keys(_am).map(Number).sort(function (a, b) { return a - b; });

    // 差距標籤
    function diffTag(curr, prev) {
      var d = curr - prev;
      if (d === 0) return '<span style="color:#bbb;font-size:10px"> (±0)</span>';
      var color = d > 0 ? '#e53935' : '#2e7d32';
      var arrow = d > 0 ? '▲' : '▼';
      return '<span style="color:' + color + ';font-size:10px"> (' + arrow +
             (d > 0 ? '+' : '') + d + ')</span>';
    }

    // 組合比對 HTML
    var compHtml = '';
    if (sortedMonths.length > 0) {
      // 上次查詢那列
      var prevRowHtml = '';
      if (lastQuery) {
        var prevCells = sortedMonths.map(function (m) {
          var p = (lastQuery.monthly && lastQuery.monthly[m]) || { hk: 0, kk: 0 };
          return '<span style="background:#f8f9fa;border-radius:6px;padding:3px 10px;' +
                 'font-size:12px;white-space:nowrap">' +
                 '<b style="color:#666">' + MNAMES[m] + '</b> ' +
                 'HK&thinsp;<b>' + p.hk + '</b>&ensp;KK&thinsp;<b>' + p.kk + '</b></span>';
        }).join('');
        prevRowHtml =
          '<div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;' +
                     'padding:10px 0;border-bottom:1px dashed #e8eaed;">' +
          '<span style="min-width:230px;font-size:12px;color:#888;font-weight:600;">' +
            '📅 上次查詢&ensp;' + lastQuery.capturedAt + '</span>' +
          prevCells + '</div>';
      }

      // 此次查詢那列
      var currCells = sortedMonths.map(function (m) {
        var c = curMonthly[m] || { hk: 0, kk: 0 };
        var p = (lastQuery && lastQuery.monthly && lastQuery.monthly[m]) || null;
        return '<span style="background:#e8f0fe;border-radius:6px;padding:3px 10px;' +
               'font-size:12px;white-space:nowrap">' +
               '<b style="color:#1a73e8">' + MNAMES[m] + '</b> ' +
               'HK&thinsp;<b>' + c.hk + '</b>' + (p ? diffTag(c.hk, p.hk) : '') +
               '&ensp;KK&thinsp;<b>' + c.kk + '</b>' + (p ? diffTag(c.kk, p.kk) : '') +
               '</span>';
      }).join('');
      var currRowHtml =
        '<div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:10px 0;">' +
        '<span style="min-width:230px;font-size:12px;color:#1a1a2e;font-weight:700;">' +
          '🔍 此次查詢&ensp;' + now + '</span>' +
        currCells + '</div>';

      compHtml =
        '<div style="background:white;border-bottom:1px solid #e8eaed;padding:4px 24px 0;">' +
        prevRowHtml + currRowHtml + '</div>';
    }

    // 存入 localStorage，供下次查詢比對
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({
        capturedAt: now,
        monthly: curMonthly
      }));
    } catch (e) {}

    // ── 出發日期排序鍵（month*100+day） ──────────────────────
    function departureSortKey(groupNo) {
      var gn = groupNo.split(' ')[0];
      if (gn.length < 7) return 9999;
      var mc  = gn[4];
      var day = parseInt(gn.slice(5, 7), 10);
      var mo;
      if (mc >= '1' && mc <= '9') mo = parseInt(mc, 10);
      else if (mc === 'O') mo = 10;
      else if (mc === 'N') mo = 11;
      else if (mc === 'D') mo = 12;
      else return 9999;
      return mo * 100 + day;
    }

    // ── 航班偵測 ──────────────────────────────────────────────
    // BR：預設 BR116，備註含 BR166 → BR166
    //      標準團名含「旭旭」→ BR旭旭（旭川包機，航班號未定）
    //      標準團名含「函函」→ BR函函（函館包機，航班號未定）
    // CI：預設 CI130，備註含其他 CI 航班號碼 → 使用該航班
    // JX：預設 JX850，標準團名含「函函」或「函千」→ JX860
    //     ※ JX 函函 與 BR 函函 航空不同，各走各的分支，不會混
    function getFlightNo(r) {
      var al  = r.airline;
      var rmk = r.remark;
      var tn  = (r._cells && r._cells[6]) ? r._cells[6] : '';
      if (al === 'BR') {
        if (tn.indexOf('旭旭') >= 0) return 'BR旭旭';
        if (tn.indexOf('函函') >= 0) return 'BR函函';
        if (rmk.indexOf('BR166') >= 0 || rmk.indexOf('166') >= 0) return 'BR166';
        return 'BR116';
      }
      if (al === 'CI') {
        var cm = rmk.match(/CI\s*(\d{3})/);
        if (cm) return 'CI' + cm[1];
        return 'CI130';
      }
      if (al === 'JX') {
        if (tn.indexOf('函千') >= 0 || tn.indexOf('函函') >= 0) return 'JX860';
        return 'JX850';
      }
      return al;
    }

    // JX 路線備註（函千 / 函函 / 千函），顯示在每行尾端
    function getRouteNote(r) {
      if (r.airline !== 'JX') return '';
      var tn = (r._cells && r._cells[6]) ? r._cells[6] : '';
      if (tn.indexOf('函千') >= 0) return '函千';
      if (tn.indexOf('千函') >= 0) return '千函';
      return '';
    }

    // ── 疑似漏標＊：同出發日+航班，有成團的群組中，其他未標＊的團 ──
    var missingAstGroups = (function () {
      var groups = {};
      rows.forEach(function (r) {
        if (r.remark.indexOf('NJ') >= 0) return;
        if (r.orderType.indexOf('TKT') >= 0) return;
        var dep = fmtDepDate(r.groupNo);
        if (dep === '?') return;
        var key = dep + '|' + getFlightNo(r) + '|' + r.days;
        if (!groups[key]) groups[key] = { dep: dep, flight: getFlightNo(r), days: r.days, rows: [] };
        groups[key].rows.push(r);
      });
      var result = [];
      Object.keys(groups).forEach(function (key) {
        var g = groups[key];
        var formed = g.rows.filter(function (r) { return r.remark.indexOf('成團') >= 0; });
        if (!formed.length) return;
        var nonFormed = g.rows.filter(function (r) {
          if (r.remark.indexOf('成團') >= 0) return false;
          if (hasAst(r)) return false;
          // 旗艦產品預設無現成機位，不需標注檢核
          var tn = (r._cells && r._cells[6]) ? r._cells[6] : '';
          if (tn.indexOf('旗艦') >= 0) return false;
          return true;
        });
        if (!nonFormed.length) return;

        // 找實際機位數（備註含半形 *數字，例如 *64）
        var capacity = null;
        g.rows.forEach(function (r) {
          if (capacity !== null) return;
          var m = r.remark.match(/\*(\d+)/);
          if (m) capacity = parseInt(m[1], 10);
        });

        var flagged, remaining = null;
        if (capacity !== null) {
          // 有實際機位：計算剩餘，只標示 團位 > 剩餘 的團
          var totalUsed = formed.reduce(function (s, r) { return s + r.totalSeats; }, 0);
          remaining = capacity - totalUsed;
          flagged = nonFormed.filter(function (r) { return r.totalSeats > remaining; });
        } else {
          // 無實際機位資訊：原邏輯，全部非成團非＊皆標
          flagged = nonFormed;
        }
        if (!flagged.length) return;
        result.push({ dep: g.dep, flight: g.flight, days: g.days, formed: formed, flagged: flagged, capacity: capacity, remaining: remaining });
      });
      result.sort(function (a, b) {
        return departureSortKey(a.flagged[0].groupNo) - departureSortKey(b.flagged[0].groupNo);
      });
      return result;
    })();
    var missingAstCount = missingAstGroups.reduce(function (n, g) { return n + g.flagged.length; }, 0);

    var css =
      '* { box-sizing: border-box; margin: 0; padding: 0; }' +
      'body { font-family: Segoe UI, system-ui, sans-serif; background: #f0f2f5; color: #222; }' +
      'header { background: linear-gradient(135deg, #1a1a2e, #16213e); color: white; padding: 24px 32px; position: relative; }' +
      'header h1 { font-size: 22px; font-weight: 700; margin-bottom: 6px; }' +
      '.meta { font-size: 13px; color: rgba(255,255,255,.6); }' +
      '.stats { display: flex; flex-wrap: wrap; background: white; border-bottom: 1px solid #e8eaed; }' +
      '.stat { flex: 1; min-width: 80px; text-align: center; padding: 16px 8px; border-right: 1px solid #e8eaed; }' +
      '.stat:last-child { border-right: none; }' +
      '.sn { font-size: 28px; font-weight: 800; line-height: 1; }' +
      '.sl { font-size: 11px; color: #888; margin-top: 4px; }' +
      '.sec-details { margin: 24px; }' +
      '.sh { display: flex; align-items: center; gap: 10px; padding-left: 14px; }' +
      '.sec-details > summary { list-style: none; cursor: pointer; user-select: none; padding: 4px 0; }' +
      '.sec-details > summary::-webkit-details-marker { display: none; }' +
      '.sec-details[open] > summary .sh { margin-bottom: 12px; }' +
      '.sec-toggle { margin-left: auto; padding-right: 4px; font-size: 12px; color: #aaa; display: inline-block; transition: transform .2s; }' +
      '.sec-details[open] .sec-toggle { transform: rotate(180deg); }' +
      '.sh h2 { font-size: 17px; font-weight: 700; }' +
      '.badge { display: inline-flex; align-items: center; justify-content: center; min-width: 28px; height: 24px; padding: 0 10px; border-radius: 999px; font-size: 13px; font-weight: 700; color: white; }' +
      '.empty { background: white; border-radius: 8px; padding: 28px; text-align: center; color: #aaa; font-size: 14px; box-shadow: 0 1px 3px rgba(0,0,0,.08); }' +
      'table { width: 100%; border-collapse: collapse; background: white; border-radius: 10px; overflow: hidden; box-shadow: 0 1px 4px rgba(0,0,0,.1); font-size: 13px; }' +
      'thead th { background: #2c3e50; color: white; padding: 11px 12px; text-align: left; font-weight: 500; white-space: nowrap; }' +
      'tbody td { padding: 9px 12px; border-bottom: 1px solid #f0f0f0; vertical-align: middle; }' +
      'tbody tr:last-child td { border-bottom: none; }' +
      'tbody tr:hover td { background: #f8f9fa; }' +
      'tbody tr.w td { background: #fff3f3; }' +
      'tbody tr.w:hover td { background: #ffe8e8; }' +
      '.al { display: inline-block; padding: 2px 8px; border-radius: 5px; font-weight: 700; font-size: 12px; }' +
      '.alBR { background: #e8f4ff; color: #1558d6; }' +
      '.alCI { background: #fce8e6; color: #c62828; }' +
      '.alJX { background: #e8f4ff; color: #0077cc; }' +
      '.rm { max-width: 280px; color: #555; word-break: break-all; line-height: 1.4; }' +
      '.ast { color: #e53935; font-weight: 900; font-size: 15px; }' +
      '.hkk { font-weight: 700; }' +
      '.hi  { color: #e53935; font-weight: 800; }' +
      '.neg { color: #e53935; font-weight: 800; }' +
      'tbody tr.ctx td { background: #e8f5e9; }' +
      'tbody tr.ctx:hover td { background: #c8e6c9; }' +
      'tbody tr.flag td { background: #fff8e1; }' +
      'tbody tr.flag:hover td { background: #ffecb3; }' +
      'details { cursor: default; }' +
      'details summary { cursor: pointer; user-select: none; }';

    function mkRow(r) {
      var warn = hasAst(r);
      var hkk  = r.hk + r.kk;
      var rmk  = r.remark.replace(/＊/g, '<span class="ast">＊</span>');
      return '<tr class="' + (warn ? 'w' : '') + '">' +
        '<td style="font-family:monospace;white-space:nowrap">' +
          r.groupNo.split(' ')[0] + '</td>' +
        '<td><span class="al al' + r.airline + '">' + r.airline + '</span></td>' +
        '<td class="rm">' + rmk + '</td>' +
        '<td style="text-align:center">' + r.totalSeats + '</td>' +
        '<td style="text-align:center">' + r.hl + '</td>' +
        '<td style="text-align:center">' + r.hk + '</td>' +
        '<td style="text-align:center">' + r.kk + '</td>' +
        '<td style="text-align:center" class="hkk' + (hkk >= 30 ? ' hi' : '') + '">' +
          hkk + '</td>' +
        '<td style="text-align:center">' + r.reserved + '</td>' +
        '<td style="text-align:center' +
          (r.available < 0 ? ';color:#e53935;font-weight:800' : '') + '">' +
          r.available + '</td>' +
        '<td style="text-align:center">' + r.join + '</td>' +
        '</tr>';
    }

    function mkTable(list) {
      if (list.length === 0) {
        return '<div class="empty">目前無符合條件的團體 ✓</div>';
      }
      var sorted = list.slice().sort(function (a, b) {
        var da = departureSortKey(a.groupNo);
        var db = departureSortKey(b.groupNo);
        if (da !== db) return da - db;
        return (b.hk + b.kk) - (a.hk + a.kk);
      });
      return '<table>' +
        '<thead><tr>' +
        '<th>團號</th><th>航空</th><th>團控說明</th>' +
        '<th>團位</th><th>HL</th><th>HK</th><th>KK</th><th>HK+KK</th>' +
        '<th>保留</th><th>可賣</th><th>JOIN</th>' +
        '</tr></thead>' +
        '<tbody>' + sorted.map(mkRow).join('') + '</tbody></table>';
    }

    function mkSection(title, color, list, collapsed) {
      return '<details class="sec-details"' + (collapsed ? '' : ' open') + '>' +
        '<summary>' +
        '<div class="sh" style="border-left:4px solid ' + color + ';color:' + color + '">' +
        '<h2>' + title + '</h2>' +
        '<span class="badge" style="background:' + color + '">' + list.length + '</span>' +
        '<span class="sec-toggle">▼</span>' +
        '</div></summary>' +
        mkTable(list) +
        '</details>';
    }

    // ── 疑似漏標＊ 專屬渲染（分組 + 雙色列） ─────────────────────
    function mkMissingAstSection() {
      var color = '#00695c';
      var header =
        '<details class="sec-details" open>' +
        '<summary><div class="sh" style="border-left:4px solid ' + color + ';color:' + color + '">' +
        '<h2>🔍 疑似漏標＊（同航班已成團，其他團尚未標注）</h2>' +
        '<span class="badge" style="background:' + color + '">' + missingAstCount + '</span>' +
        '<span class="sec-toggle">▼</span>' +
        '</div></summary>';

      if (!missingAstGroups.length) {
        return header + '<div class="empty">目前無符合條件的團體 ✓</div></details>';
      }

      function mkGroupRow(r, cls, statusLabel, statusColor) {
        var hkk = r.hk + r.kk;
        var rmk = r.remark.replace(/＊/g, '<span class="ast">＊</span>');
        return '<tr class="' + cls + '">' +
          '<td style="font-family:monospace;white-space:nowrap">' + r.groupNo.split(' ')[0] + '</td>' +
          '<td><span class="al al' + r.airline + '">' + r.airline + '</span></td>' +
          '<td class="rm">' + rmk + '</td>' +
          '<td style="text-align:center">' + r.totalSeats + '</td>' +
          '<td style="text-align:center">' + r.hk + '</td>' +
          '<td style="text-align:center">' + r.kk + '</td>' +
          '<td style="text-align:center;font-weight:700">' + hkk + '</td>' +
          '<td style="text-align:center' + (r.available < 0 ? ';color:#e53935;font-weight:800' : '') + '">' + r.available + '</td>' +
          '<td style="font-weight:700;color:' + statusColor + '">' + statusLabel + '</td>' +
          '</tr>';
      }

      var tbody = '';
      missingAstGroups.forEach(function (g) {
        // 群組標題列：有 *數字 時顯示機位計算
        var capInfo = '';
        if (g.capacity !== null) {
          var used = g.formed.reduce(function (s, r) { return s + r.totalSeats; }, 0);
          capInfo = '　｜　機位 ' + g.capacity + '　成團已用 ' + used + '　剩餘 ' + g.remaining;
        }
        tbody += '<tr><td colspan="9" style="background:#b2dfdb;font-weight:700;color:#004d40;padding:7px 14px;">' +
          '📅 ' + g.dep + '　' + g.flight + '　' + g.days + '天' + capInfo + '　（以下應標＊）</td></tr>';
        // 成團列（綠色，作為 context）
        g.formed.forEach(function (r) {
          tbody += mkGroupRow(r, 'ctx', '✅ 成團', '#2e7d32');
        });
        // 疑似漏標列（琥珀色）
        g.flagged.forEach(function (r) {
          tbody += mkGroupRow(r, 'flag', '⚠ 應標＊', '#e65100');
        });
      });

      return header +
        '<table><thead><tr>' +
        '<th>團號</th><th>航空</th><th>團控說明</th>' +
        '<th>團位</th><th>HK</th><th>KK</th><th>HK+KK</th><th>可賣</th><th>狀態</th>' +
        '</tr></thead><tbody>' + tbody + '</tbody></table></details>';
    }

    // ── 建議漲價（含「漲價完成」按鈕，點後下次搜尋不再出現） ─────────
    function mkPriceUpSection() {
      var color = '#2e7d32';
      var header =
        '<details class="sec-details" open>' +
        '<summary><div class="sh" style="border-left:4px solid ' + color + ';color:' + color + '">' +
        '<h2>💰 建議漲價（秒殺／省最大・已成團・HK+KK ≥ 15）</h2>' +
        '<span class="badge" style="background:' + color + '">' + priceUp.length + '</span>' +
        '<span class="sec-toggle">▼</span>' +
        '</div></summary>';

      if (!priceUp.length) {
        return header + '<div class="empty">目前無符合條件的團體 ✓</div></details>';
      }

      var sorted = priceUp.slice().sort(function (a, b) {
        var da = departureSortKey(a.groupNo), db = departureSortKey(b.groupNo);
        if (da !== db) return da - db;
        return (b.hk + b.kk) - (a.hk + a.kk);
      });

      var tbody = sorted.map(function (r) {
        var gno = r.groupNo.split(' ')[0];
        var hkk = r.hk + r.kk;
        var rmk = r.remark.replace(/＊/g, '<span class="ast">＊</span>');
        var tn  = (r._cells && r._cells[6]) ? r._cells[6] : '';
        // 點擊後：寫入 opener.localStorage → 下次過濾自動排除；並視覺淡出
        var doneFn =
          '(function(btn){' +
            'try{' +
              'var ls=window.opener?window.opener.localStorage:localStorage;' +
              'ls.setItem(\'erp_pup_' + gno + '\',\'1\');' +
            '}catch(e){}' +
            'var tr=btn.closest(\'tr\');' +
            'if(tr){tr.style.transition=\'opacity .4s\';tr.style.opacity=\'0.3\';}' +
            'btn.disabled=true;btn.textContent=\'✓ 已處理\';' +
          '})(this)';
        return '<tr>' +
          '<td style="font-family:monospace;white-space:nowrap">' + gno + '</td>' +
          '<td><span class="al al' + r.airline + '">' + r.airline + '</span></td>' +
          '<td class="rm">' + rmk + '</td>' +
          '<td style="max-width:220px;color:#444;word-break:break-all;line-height:1.4">' +
            tn.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') + '</td>' +
          '<td style="text-align:center">' + r.hk + '</td>' +
          '<td style="text-align:center">' + r.kk + '</td>' +
          '<td style="text-align:center;font-weight:700">' + hkk + '</td>' +
          '<td style="text-align:center' + (r.available < 0 ? ';color:#e53935;font-weight:800' : '') + '">' +
            r.available + '</td>' +
          '<td><button onclick="' + doneFn + '" ' +
            'style="padding:5px 16px;background:#2e7d32;color:white;border:none;' +
            'border-radius:6px;cursor:pointer;font-size:12px;font-weight:600;white-space:nowrap;">' +
            '漲價完成</button></td>' +
          '</tr>';
      }).join('');

      return header +
        '<table><thead><tr>' +
        '<th>團號</th><th>航空</th><th>團控說明</th><th>標準團名</th>' +
        '<th>HK</th><th>KK</th><th>HK+KK</th><th>可賣</th><th>操作</th>' +
        '</tr></thead><tbody>' + tbody + '</tbody></table></details>';
    }

    // ── 機位需求簡訊（可直接複製貼到 LINE） ──────────────────────
    function mkSummaryMsg() {
      function groupByFlight(list) {
        var map = {};
        list.forEach(function (r) {
          var f = getFlightNo(r);
          if (!map[f]) map[f] = [];
          map[f].push(r);
        });
        return map;
      }
      function sortedFlights(map) {
        return Object.keys(map).sort();
      }
      function sortRows(list) {
        return list.slice().sort(function (a, b) {
          return departureSortKey(a.groupNo) - departureSortKey(b.groupNo);
        });
      }
      // HTML 跳脫（含雙引號，用於 HTML 屬性值）
      function he(s) {
        return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;')
                        .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
      }

      var noByF = groupByFlight(noSeats);
      var tgByF = groupByFlight(tightSeats);

      // ── 純文字（隱藏 pre，複製鈕來源）────────────────────────────
      var copyLines = [];
      if (sortedFlights(noByF).length) {
        copyLines.push('即將成團但無現成機位');
        sortedFlights(noByF).forEach(function (f) {
          copyLines.push('');
          copyLines.push(f);
          sortRows(noByF[f]).forEach(function (r) {
            var dayStr   = (r.days && r.days !== 5) ? ' ' + r.days + '天' : '';
            var routeStr = getRouteNote(r) ? ' ' + getRouteNote(r) : '';
            copyLines.push(fmtDepDate(r.groupNo) + ' 需求一組' + dayStr + routeStr);
          });
        });
      }
      if (sortedFlights(tgByF).length) {
        if (copyLines.length) copyLines.push('');
        copyLines.push('已成團可賣不足');
        sortedFlights(tgByF).forEach(function (f) {
          copyLines.push('');
          copyLines.push(f);
          sortRows(tgByF[f]).forEach(function (r) {
            var dayStr   = (r.days && r.days !== 5) ? ' ' + r.days + '天' : '';
            var routeStr = getRouteNote(r) ? ' ' + getRouteNote(r) : '';
            copyLines.push(fmtDepDate(r.groupNo) + ' ++散位' + dayStr + routeStr);
          });
        });
      }

      if (!copyLines.length) return '';

      // ── 格線 HTML（左欄文字 + 右欄備註輸入）─────────────────────
      var gridHtml = '';
      var needDivider = false;

      function addSec(label) {
        gridHtml += '<div style="font-weight:700;color:#333;padding:2px 0;line-height:2">' +
                    he(label) + '</div><div></div>';
      }
      function addFlt(label) {
        gridHtml += '<div style="font-weight:600;color:#1565c0;padding:1px 0;line-height:2">' +
                    he(label) + '</div><div></div>';
      }
      function addSpacer() {
        gridHtml += '<div style="grid-column:1/3;height:4px"></div>';
      }
      function addDivider() {
        gridHtml += '<div style="grid-column:1/3;height:1px;background:#f0f0f0;margin:8px 0"></div>';
      }
      function addDataRow(text, gno) {
        var saved = '';
        try { saved = localStorage.getItem('erp_note_' + gno) || ''; } catch (e) {}
        var hasSaved = saved.length > 0;
        var inpStyle =
          'width:100%;box-sizing:border-box;border:1px solid ' +
          (hasSaved ? '#ffc107' : '#ddd') + ';border-radius:6px;padding:3px 10px;' +
          'font-size:13px;color:#444;background:' + (hasSaved ? '#fff8e1' : '#fafafa') + ';' +
          'font-family:inherit;outline:none;';
        gridHtml +=
          '<div style="padding:1px 0;line-height:2;color:#333">' + he(text) + '</div>' +
          '<div style="padding:1px 0 1px 12px;display:flex;align-items:center">' +
          '<input class="__erp_note" data-gno="' + he(gno) + '" value="' + he(saved) + '" ' +
          'placeholder="備註…" style="' + inpStyle + '"></div>';
      }

      if (sortedFlights(noByF).length) {
        addSec('即將成團但無現成機位');
        sortedFlights(noByF).forEach(function (f) {
          addSpacer();
          addFlt(f);
          sortRows(noByF[f]).forEach(function (r) {
            var dayStr   = (r.days && r.days !== 5) ? ' ' + r.days + '天' : '';
            var routeStr = getRouteNote(r) ? ' ' + getRouteNote(r) : '';
            addDataRow(fmtDepDate(r.groupNo) + ' 需求一組' + dayStr + routeStr, r.groupNo);
          });
        });
        needDivider = true;
      }
      if (sortedFlights(tgByF).length) {
        if (needDivider) addDivider();
        addSec('已成團可賣不足');
        sortedFlights(tgByF).forEach(function (f) {
          addSpacer();
          addFlt(f);
          sortRows(tgByF[f]).forEach(function (r) {
            var dayStr   = (r.days && r.days !== 5) ? ' ' + r.days + '天' : '';
            var routeStr = getRouteNote(r) ? ' ' + getRouteNote(r) : '';
            addDataRow(fmtDepDate(r.groupNo) + ' ++散位' + dayStr + routeStr, r.groupNo);
          });
        });
      }

      // ── 儲存按鈕的 onclick（單引號 JS 放在雙引號 HTML 屬性裡）──
      var saveFn =
        '(function(){' +
          'document.querySelectorAll(\'.__erp_note\').forEach(function(i){' +
            'var v=i.value.trim();' +
            'if(v){localStorage.setItem(\'erp_note_\'+i.dataset.gno,v);}' +
            'else{localStorage.removeItem(\'erp_note_\'+i.dataset.gno);}' +
            'i.style.background=v?\'#fff8e1\':\'#fafafa\';' +
            'i.style.borderColor=v?\'#ffc107\':\'#ddd\';' +
          '});' +
          'var ok=document.getElementById(\'__erp_save_ok\');' +
          'if(ok){ok.style.opacity=\'1\';setTimeout(function(){ok.style.opacity=\'0\';},2200);}' +
        '})()';

      return '<details class="sec-details" open>' +
        '<summary>' +
        '<div class="sh" style="border-left:4px solid #37474f;color:#37474f">' +
        '<h2>📨 機位需求簡訊</h2>' +
        '<span style="font-size:12px;color:#888;margin-left:4px;">可直接複製貼至 LINE</span>' +
        '<span class="sec-toggle">▼</span>' +
        '</div></summary>' +
        '<div style="position:relative;background:white;border-radius:10px;' +
             'box-shadow:0 1px 4px rgba(0,0,0,.1);padding:20px 24px 20px 20px;">' +
        // 複製鈕（讀隱藏 pre，不含備註欄）
        '<button id="__cp_btn" onclick="(function(b){' +
          'navigator.clipboard.writeText(document.getElementById(\'__cp_text\').textContent)' +
          '.then(function(){b.textContent=\'✓ 已複製\';setTimeout(function(){b.textContent=\'複製\';},1800);})' +
        '})(this)" style="position:absolute;top:14px;right:16px;padding:5px 18px;' +
        'background:#37474f;color:white;border:none;border-radius:6px;cursor:pointer;' +
        'font-size:12px;font-weight:600;">複製</button>' +
        // 隱藏 pre（純文字複製來源）
        '<pre id="__cp_text" style="display:none">' +
        copyLines.join('\n').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') +
        '</pre>' +
        // 欄標題列
        '<div style="display:grid;grid-template-columns:max-content 1fr;column-gap:16px;' +
             'font-size:11px;color:#bbb;margin-bottom:4px;padding:0 2px;">' +
        '<div>訊息內容（複製鈕只帶這欄）</div>' +
        '<div style="padding-left:12px;">備註（不含入複製）</div>' +
        '</div>' +
        // 格線主體
        '<div style="display:grid;grid-template-columns:max-content 1fr;column-gap:16px;font-size:14px;">' +
        gridHtml +
        '</div>' +
        // 提示
        '<div style="font-size:11px;color:#ccc;margin-top:6px;">' +
        '⬆ 左欄為複製內容，右欄備註不會被帶走</div>' +
        // 儲存列
        '<div style="margin-top:12px;border-top:1px solid #f0f0f0;padding-top:12px;' +
             'display:flex;align-items:center;justify-content:flex-end;gap:10px;">' +
        '<span id="__erp_save_ok" ' +
             'style="font-size:12px;color:#43a047;opacity:0;transition:opacity .3s;">✓ 已儲存</span>' +
        '<button onclick="' + saveFn + '" ' +
        'style="padding:6px 20px;background:#43a047;color:white;border:none;border-radius:6px;' +
        'cursor:pointer;font-size:13px;font-weight:600;">💾 儲存所有備註</button>' +
        '</div>' +
        '</div></details>';
    }

    // ── 欄位偵測結果 + 原始欄位診斷（底部可收折）──────────────────
    var colDetectHtml = '';

    // 1. 欄位偵測對應表
    var keyFields = ['團號', '航空', '圍控說明', '圍位', 'HL', 'OB', 'HK', 'KK', '保留', '可賀', '可賣', 'JOIN', 'T', 'J'];
    var detectedLines = keyFields
      .filter(function (k) { return colMap[k] !== undefined; })
      .map(function (k)    { return k + '→[' + colMap[k] + ']'; });

    var detectionStatus = detectedLines.length
      ? detectedLines.join('　')
      : '⚠ 偵測失敗（表格無 &lt;th&gt; 標題列，使用備援索引）';

    // 2. 即將成團各列的原始 _cells 診斷表（前 10 列）
    var diagRows = forming.slice(0, 10);
    var maxCells = diagRows.reduce(function (m, r) {
      return Math.max(m, r._cells ? r._cells.length : 0);
    }, 0);
    maxCells = Math.min(maxCells, 28); // 最多顯示 28 欄

    var diagHtml = '';
    if (diagRows.length) {
      var diagHead = '<tr><th style="background:#455a64">團號</th>';
      for (var di = 0; di < maxCells; di++) {
        diagHead += '<th style="background:#455a64">[' + di + ']</th>';
      }
      diagHead += '</tr>';

      var diagBody = diagRows.map(function (r) {
        var cells = r._cells || [];
        var tds = '';
        for (var di = 0; di < maxCells; di++) {
          var v = cells[di] !== undefined ? cells[di] : '';
          // 標記有數值（非空）的格子
          var style = v && v !== '0' ? 'background:#e8f5e9;font-weight:700' : 'color:#ccc';
          tds += '<td style="' + style + ';text-align:center;padding:4px 6px;' +
                 'border:1px solid #eee;white-space:nowrap;max-width:80px;' +
                 'overflow:hidden;font-size:11px">' + (v || '·') + '</td>';
        }
        return '<tr><td style="font-family:monospace;padding:4px 8px;border:1px solid #eee;' +
               'white-space:nowrap;font-size:11px">' + r.groupNo.split(' ')[0] + '</td>' +
               tds + '</tr>';
      }).join('');

      diagHtml =
        '<table style="border-collapse:collapse;width:100%;font-size:11px;' +
        'background:white;margin-top:8px"><thead>' + diagHead + '</thead>' +
        '<tbody>' + diagBody + '</tbody></table>';
    }

    colDetectHtml =
      '<details style="margin:0 24px 24px;font-size:12px;color:#555;">' +
      '<summary style="cursor:pointer;padding:8px 0;font-weight:600;">' +
        '🔍 欄位偵測與診斷（點開確認數字是否正確）</summary>' +
      '<div style="margin-top:8px;padding:10px 14px;background:#f8f9fa;' +
           'border-radius:6px;line-height:2;font-family:monospace;word-break:break-all;">' +
      detectionStatus +
      '</div>' +
      (diagHtml
        ? '<div style="margin-top:8px;overflow-x:auto;">' + diagHtml + '</div>' +
          '<div style="margin-top:6px;color:#aaa;font-size:11px;">' +
          '非零值以綠底標記。確認 HK / KK / 保留 / 可賀 的 [N] 與上方偵測對應表一致即正確。</div>'
        : '') +
      '</details>';

    var statItems = [
      { n: rows.length,            l: '總團數',        c: '#1a1a2e' },
      { n: byAirline['BR'] || 0,   l: 'BR 長榮',       c: '#1558d6' },
      { n: byAirline['CI'] || 0,   l: 'CI 華航',       c: '#c62828' },
      { n: byAirline['JX'] || 0,   l: 'JX 星宇',       c: '#2e7d32' },
      { n: noSeats.length,         l: '⚠ 無現成機位',  c: '#e53935' },
      { n: forming.length,         l: '即將成團',       c: '#f57c00' },
      { n: tightSeats.length,      l: '成團・可賣不足', c: '#6a1b9a' },
      { n: overSold.length,        l: '🔴 超賣',        c: '#b71c1c' },
      { n: tooReserved.length,     l: '📌 保留太多',    c: '#0277bd' },
      { n: missingAstCount,        l: '🔍 疑似漏標＊',  c: '#00695c' },
      { n: noOp.length,            l: '🙋 未派OP',        c: '#e65100' },
      { n: priceUp.length,         l: '💰 建議漲價',     c: '#2e7d32' }
    ];
    var statsHtml = statItems.map(function (s) {
      return '<div class="stat"><div class="sn" style="color:' + s.c + '">' + s.n +
             '</div><div class="sl">' + s.l + '</div></div>';
    }).join('');

    // ── 匯入至北海道機位管理系統 ──────────────────────────────
    function buildSyncButton(rows) {
      var WORKER_SYNC_URL = 'https://line-webhook.ericlin-line.workers.dev/sync-seats?secret=eric-line-63940';
      // 第一步：按 date+flight+days 把所有 row 收集起來
      // 排除：＊（無現成機位）、NJ、TKT、旗艦（高價概念團，另行管理）
      var buckets = {};
      rows.filter(function(r) {
        var tn = (r._cells && r._cells[6]) ? r._cells[6] : '';
        return r.remark.indexOf('＊') < 0
            && r.remark.indexOf('NJ') < 0
            && r.orderType.indexOf('TKT') < 0
            && tn.indexOf('旗艦') < 0;
      }).forEach(function(r) {
        var depDate = departureDateObj(r.groupNo);
        if (!depDate) return;
        // 序列化成 YYYY-MM-DD 字串，避免 JSON.stringify 將 Date 轉成 UTC ISO 字串後與 GAS 比對失敗
        var depDateStr = depDate.getFullYear() + '-' +
          String(depDate.getMonth() + 1).padStart(2, '0') + '-' +
          String(depDate.getDate()).padStart(2, '0');
        var fn   = getFlightNo(r);
        var days = r.days || 0;
        var key  = depDateStr + '_' + fn + '_' + days;
        if (!buckets[key]) buckets[key] = { date: depDateStr, flight_no: fn, days: days, rows: [] };
        buckets[key].rows.push(r);
      });

      // 第二步：計算每個 bucket 的原始/已用席
      var items = Object.values(buckets).map(function(it) {
        var brows = it.rows;
        var maxReserved = brows.reduce(function(m, r) { return Math.max(m, r.reserved || 0); }, 0);
        var used_seats  = brows.reduce(function(s, r) {
          return s + (r.kk || 0);
        }, 0);
        var original_seats = 0;

        // Step 1：備註含半形 *數字 → 直接採用為實際機位（最可靠）
        // 注意：F*N 是 FIT 機票標記，不是容量，需排除（要求 * 前不是字母）
        var capacityFromRemark = null;
        brows.forEach(function(r) {
          if (capacityFromRemark !== null) return;
          var m = r.remark.match(/(?<![A-Za-z])\*(\d+)/);
          if (m) capacityFromRemark = parseInt(m[1], 10);
        });

        if (capacityFromRemark !== null) {
          original_seats = capacityFromRemark;
        } else {
          // Step 2：從 totalSeats 結構推算
          var seatValues = brows.map(function(r) { return r.totalSeats || 0; });
          var allSame    = seatValues.every(function(v) { return v === seatValues[0]; });
          var isShared   = brows.length > 1 && maxReserved === 0 && allSame;

          if (isShared) {
            // 純共賣（無保留）：席數只算一次
            original_seats = seatValues[0];
          } else {
            // 找主控團（有保留席的那筆）
            var mainRows = brows.filter(function(r) { return (r.reserved || 0) > 0; });
            var mainTotalSeats = mainRows.length > 0 ? (mainRows[0].totalSeats || 0) : 0;
            // 高保留（≥80%）：JX850 模式，子團顯示同池大小
            // 低保留（<80%）：員工團模式，子團佔用保留額度
            var highReserve = mainTotalSeats > 0 && maxReserved >= mainTotalSeats * 0.8;

            brows.forEach(function(r) {
              if ((r.reserved || 0) > 0) {
                original_seats += (r.totalSeats || 0);
              } else {
                var isSubGroup;
                if (mainRows.length > 0) {
                  isSubGroup = highReserve
                    ? (r.totalSeats || 0) === mainTotalSeats
                    : (r.totalSeats || 0) <= maxReserved;
                } else {
                  isSubGroup = false;
                }
                if (!isSubGroup) original_seats += (r.totalSeats || 0);
              }
            });
          }
        }
        return {
          date: it.date, flight_no: it.flight_no, days: it.days,
          groups: brows.length,
          original_seats: original_seats, current_seats: original_seats,
          used_seats: used_seats, type: 'SRS',
          note: it.days + '天|ERP同步(' + brows.length + '組)',
        };
      });
      var previewRows = items.slice(0, 10).map(function(it) {
        return '<tr><td style="padding:3px 8px">' + it.date + '</td>' +
               '<td style="padding:3px 8px;font-weight:bold">' + it.flight_no + '</td>' +
               '<td style="padding:3px 8px;text-align:center">' + it.days + '天</td>' +
               '<td style="padding:3px 8px;text-align:right">' + it.original_seats + '</td>' +
               '<td style="padding:3px 8px;text-align:right">' + it.used_seats + '</td>' +
               '<td style="padding:3px 8px;text-align:right">' + (it.original_seats - it.used_seats) + '</td>' +
               '<td style="padding:3px 8px;color:#888;font-size:11px">' + it.groups + '組</td></tr>';
      }).join('');
      // JX 暑假 P 階段：JX850/JX860 在 7/12-8/6 或 8/16-8/23 的所有團
      var JXP_FLIGHTS_LIST = ['JX850', 'JX860'];
      function inJxpRangeDate(d) {
        var m = d.getMonth() + 1, day = d.getDate(), cur = m * 100 + day;
        return (cur >= 712 && cur <= 806) || (cur >= 816 && cur <= 823);
      }
      var jxpGroups = rows.filter(function(r) {
        var fn = getFlightNo(r);
        if (JXP_FLIGHTS_LIST.indexOf(fn) < 0) return false;
        var dep = departureDateObj(r.groupNo);
        if (!dep || !inJxpRangeDate(dep)) return false;
        // 備註含 * 或 ＊ 表示共賣機位（無獨立配額），排除
        var rmk = r.remark || '';
        if (rmk.indexOf('*') >= 0 || rmk.indexOf('＊') >= 0) return false;
        return true;
      }).map(function(r) {
        var dep = departureDateObj(r.groupNo);
        var depStr = dep.getFullYear() + '-' +
          String(dep.getMonth() + 1).padStart(2, '0') + '-' +
          String(dep.getDate()).padStart(2, '0');
        return {
          date:        depStr,
          group_no:    r.groupNo.split(' ')[0],
          airline:     r.airline,
          flight_no:   getFlightNo(r),
          total_seats: r.totalSeats || 0,
          hk:          r.hk || 0,
          kk:          r.kk || 0,
        };
      });

      // 付訂團（備註含半形 $ / 全形 ＄ / FULLPAY）
      var paidGroups = rows.filter(function(r) {
        var rmk = r.remark.toUpperCase();
        return rmk.indexOf('$') >= 0      // 半形
            || rmk.indexOf('＄') >= 0  // 全形 ＄
            || rmk.indexOf('FULLPAY') >= 0;
      }).map(function(r) {
        var depDate = departureDateObj(r.groupNo);
        if (!depDate) return null;
        var depDateStr = depDate.getFullYear() + '-' +
          String(depDate.getMonth() + 1).padStart(2, '0') + '-' +
          String(depDate.getDate()).padStart(2, '0');
        return {
          date:        depDateStr,
          group_no:    r.groupNo.split(' ')[0],
          airline:     r.airline,
          flight_no:   getFlightNo(r),
          remark:      r.remark,
          total_seats: r.totalSeats || 0,
          hk:          r.hk || 0,
          kk:          r.kk || 0,
        };
      }).filter(Boolean);

      var itemsJson      = JSON.stringify(items).replace(/</g, '\\u003c').replace(/>/g, '\\u003e');
      var paidGroupsJson = JSON.stringify(paidGroups).replace(/</g, '\\u003c').replace(/>/g, '\\u003e');
      var jxpGroupsJson  = JSON.stringify(jxpGroups).replace(/</g, '\\u003c').replace(/>/g, '\\u003e');
      return '<div style="margin:24px auto;max-width:860px;padding:20px;background:#e8f5e9;border:2px solid #4caf50;border-radius:10px">' +
        '<h3 style="margin:0 0 12px;color:#2e7d32">📥 匯入至北海道機位管理系統</h3>' +
        '<p style="color:#555;font-size:13px;margin:0 0 12px">共 <strong>' + items.length + '</strong> 筆（同日同航班同天數合併）｜付訂團 <strong>' + paidGroups.length + '</strong> 筆｜JX暑P <strong>' + jxpGroups.length + '</strong> 筆</p>' +
        '<table style="width:100%;border-collapse:collapse;font-size:13px;background:white;border-radius:6px;overflow:hidden">' +
        '<thead><tr style="background:#c8e6c9"><th style="padding:4px 8px;text-align:left">出發日</th>' +
        '<th style="padding:4px 8px;text-align:left">航班</th><th style="padding:4px 8px;text-align:center">天數</th><th style="padding:4px 8px;text-align:right">總位</th>' +
        '<th style="padding:4px 8px;text-align:right">已用(HK+KK)</th><th style="padding:4px 8px;text-align:right">可售</th>' +
        '<th style="padding:4px 8px;text-align:right">組數</th></tr></thead><tbody>' + previewRows + '</tbody></table>' +
        (items.length > 10 ? '<p style="color:#888;font-size:12px;margin:6px 0 0">…另有 ' + (items.length - 10) + ' 筆</p>' : '') +
        '<div style="margin-top:14px;display:flex;gap:10px;align-items:center">' +
        '<button id="erp-sync-btn" style="padding:10px 24px;background:#388e3c;color:white;border:none;border-radius:6px;font-size:14px;font-weight:bold;cursor:pointer">✅ 確認匯入 Sheet</button>' +
        '<span id="erp-sync-status" style="font-size:13px;color:#555"></span>' +
        '</div></div>' +
        '<script>(function(){' +
        'var SYNC_URL=' + JSON.stringify(WORKER_SYNC_URL) + ';' +
        'var NOTIFY_URL="https://line-webhook.ericlin-line.workers.dev/notify-sync?secret=eric-line-63940";' +
        'var allItems=' + itemsJson + ';' +
        'var paidGroups=' + paidGroupsJson + ';' +
        'var jxpGroups=' + jxpGroupsJson + ';' +
        // 每批 50 筆，避免 GAS 單次處理超時（Cloudflare 524）
        'var BATCH=50;' +
        'var chunks=[];' +
        'for(var _i=0;_i<allItems.length;_i+=BATCH){chunks.push(allItems.slice(_i,_i+BATCH));}' +
        'var btn=document.getElementById("erp-sync-btn");' +
        'var st=document.getElementById("erp-sync-status");' +
        'if(!btn)return;' +
        'function doSync(){' +
        '  btn.disabled=true;btn.textContent="匯入中…";st.textContent="";' +
        '  var cr=0,up=0,errs=[];var ci=0;' +
        '  function next(){' +
        '    if(ci>=chunks.length){' +
        '      btn.textContent="✔ 匯入完成";' +
        '      st.textContent="新增 "+cr+" 筆，更新 "+up+" 筆（共 "+(cr+up)+" 筆）";' +
        '      var total=cr+up;' +
        '      if(window.opener){window.opener.postMessage({type:"erpSync",created:cr,updated:up,total:total,errors:errs},"*");}' +
        '      fetch(NOTIFY_URL,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({created:cr,updated:up,total:total,errors:errs})}).catch(function(){});' +
        '      return;' +
        '    }' +
        '    st.textContent="第 "+(ci+1)+" / "+chunks.length+" 批…";' +
        // 最後一批一併帶付訂團資料
        '    var payload={items:chunks[ci]};' +
        '    if(ci===chunks.length-1&&paidGroups.length>0){payload.paid_groups=paidGroups;}' +
        '    if(ci===chunks.length-1&&jxpGroups.length>0){payload.jxp_groups=jxpGroups;}' +
        '    fetch(SYNC_URL,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)})' +
        '    .then(function(r){return r.json();})' +
        '    .then(function(d){' +
        '      if(d.error){st.textContent="❌ 第"+(ci+1)+"批錯誤："+d.error;btn.disabled=false;btn.textContent="✅ 確認匯入 Sheet";return;}' +
        '      cr+=(d.created||0);up+=(d.updated||0);errs=errs.concat(d.errors||[]);' +
        '      ci++;next();' +
        '    })' +
        '    .catch(function(e){st.textContent="❌ 網路錯誤："+e.message;btn.disabled=false;btn.textContent="✅ 確認匯入 Sheet";});' +
        '  }' +
        '  next();' +
        '}' +
        'btn.onclick=doSync;' +
        'if(window.__erpAutoSync){' +
        '  var cd=3;' +
        '  var cdEl=document.createElement("span");cdEl.style="font-size:12px;color:#2563eb;margin-left:8px";' +
        '  btn.parentNode.appendChild(cdEl);' +
        '  var iv=setInterval(function(){' +
        '    if(cd<=0){clearInterval(iv);cdEl.remove();doSync();return;}' +
        '    cdEl.textContent="（"+cd+"秒後自動同步，點取消可停止）";' +
        '    cd--;' +
        '  },1000);' +
        '  var cancelBtn=document.createElement("button");' +
        '  cancelBtn.textContent="取消自動同步";' +
        '  cancelBtn.style="margin-left:8px;font-size:12px;color:#dc2626;background:none;border:none;cursor:pointer;text-decoration:underline";' +
        '  cancelBtn.onclick=function(){clearInterval(iv);cdEl.remove();cancelBtn.remove();};' +
        '  btn.parentNode.appendChild(cancelBtn);' +
        '}' +
        '})();<\/script>';
    }

    return '<!DOCTYPE html><html lang="zh-TW"><head>' +
      '<meta charset="UTF-8">' +
      '<meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<title>ERP 機位報告 ' + now.slice(0, 10) + '</title>' +
      '<style>' + css + '</style></head><body>' +
      '<header>' +
      '<h1>✈️ ERP 機位狀態報告</h1>' +
      '<div class="meta">擷取時間：' + now +
        '　共 ' + rows.length + ' 筆資料</div>' +
      '<button onclick="(function(){' +
        'document.querySelectorAll(\'.__erp_note\').forEach(function(i){i.setAttribute(\'value\',i.value);});' +
        'if(window.opener){' +
          'window.opener.postMessage({type:\'erpDl\',' +
            'html:document.documentElement.outerHTML,' +
            'name:\'ERP機位報告_' + now.slice(0,10) + '.html\'' +
          '},\'*\');' +
        '}' +
      '})()" style="position:absolute;top:24px;right:32px;padding:7px 20px;' +
      'background:rgba(255,255,255,.15);color:white;border:1px solid rgba(255,255,255,.4);' +
      'border-radius:7px;cursor:pointer;font-size:13px;font-weight:600;' +
      'backdrop-filter:blur(4px);">⬇ 下載 HTML</button>' +
      '</header>' +
      '<div class="stats">' + statsHtml + '</div>' +
      compHtml +
      mkSection('⚠ 特別警示：即將成團或是已成團但無現成機位',
                '#e53935', noSeats) +
      mkSection('📋 即將成團（HK＋KK > 10）',
                '#f57c00', forming) +
      mkSection('🔔 已成團・可賣不足（可賣 < 5，14天後以上出發）',
                '#6a1b9a', tightSeats, true) +
      mkSection('🔴 超賣（可賣 ≤ -1，或 KK 超過備註標示機位數）',
                '#b71c1c', overSold) +
      mkSection('📌 保留太多（保留 > 0 且 可賣 ≤ 6）',
                '#0277bd', tooReserved) +
      mkSection('🙋 未派OP（已成團・OP 欄位為空）',
                '#e65100', noOp) +
      mkPriceUpSection() +
      mkMissingAstSection() +
      mkSummaryMsg() +
      colDetectHtml +
      buildSyncButton(rows) +
      '<div style="text-align:center;padding:24px;color:#bbb;font-size:12px">' +
      'ERP 機位報告　' + now + '</div>' +
      '</body></html>';
  }

})();
