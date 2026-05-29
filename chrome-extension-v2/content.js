// content.js — SERP 手配版 2.0：HK+KK ≥ 15 一覽表（附備註欄）
// 由 background.js 注入到 ERP SearchList 頁面執行

// ── 下載中繼：報告視窗透過 postMessage 傳回 ERP 頁觸發下載 ──
if (!window.__erpDlListenerSet2) {
  window.__erpDlListenerSet2 = true;
  window.addEventListener('message', function (e) {
    if (!e.data || e.data.type !== 'erpDl2') return;
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
  if (window.__erpCapturing2) {
    alert('SERP 手配版：擷取中，請稍候...');
    return;
  }

  // ── 確認在 SearchList 頁面 ────────────────────────────────────
  var pageSelect = document.querySelector('select[id="PageIndex"]');
  if (!pageSelect) {
    alert('SERP 手配版：請在 SearchList 頁面（有頁碼下拉選單的頁面）使用');
    return;
  }
  window.__erpCapturing2 = true;

  // ── 進度浮層 ──────────────────────────────────────────────────
  var overlay = document.createElement('div');
  overlay.id = '__erp2_ov';
  overlay.style.cssText =
    'position:fixed;inset:0;background:rgba(0,0,0,.72);' +
    'z-index:2147483647;display:flex;align-items:center;justify-content:center;' +
    'font-family:Segoe UI,system-ui,sans-serif;';

  overlay.innerHTML =
    '<div style="background:#fff;border-radius:16px;padding:36px 48px;' +
    'text-align:center;min-width:340px;box-shadow:0 24px 64px rgba(0,0,0,.4);">' +
    '<div style="font-size:22px;font-weight:700;margin-bottom:8px;">' +
      '🛫 擷取機位資料中</div>' +
    '<div id="__erp2_p" style="color:#666;font-size:14px;margin-bottom:20px;">' +
      '初始化...</div>' +
    '<div id="__erp2_c" style="font-size:40px;font-weight:800;color:#1a3a5c;' +
      'letter-spacing:-1px;">0 筆</div>' +
    '<div style="background:#eee;height:8px;border-radius:4px;margin-top:20px;overflow:hidden;">' +
      '<div id="__erp2_b" style="height:8px;' +
        'background:linear-gradient(90deg,#1a3a5c,#0d6efd);' +
        'border-radius:4px;width:0%;transition:width .5s ease;"></div>' +
    '</div>' +
    '<div style="margin-top:12px;font-size:12px;color:#bbb;">' +
      '請勿關閉或切換頁面</div>' +
    '</div>';

  document.body.appendChild(overlay);

  function upd(msg, cur, tot) {
    var ep = document.getElementById('__erp2_p');
    var ec = document.getElementById('__erp2_c');
    var eb = document.getElementById('__erp2_b');
    if (ep) ep.textContent = msg;
    if (ec) ec.textContent = cur + ' 筆';
    if (eb) eb.style.width = (tot > 0 ? Math.min(cur / tot * 100, 99) : 0) + '%';
  }

  // ── 嘗試預開報告視窗 ──────────────────────────────────────────
  var reportWin = null;
  try {
    reportWin = window.open('', 'erp_report_v2');
    if (reportWin) {
      reportWin.document.write(
        '<html><body style="font-family:Segoe UI,sans-serif;display:flex;' +
        'align-items:center;justify-content:center;min-height:100vh;' +
        'margin:0;background:#f0f2f5;">' +
        '<div style="text-align:center;color:#888;">' +
        '<div style="font-size:48px;margin-bottom:16px;">🛫</div>' +
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
    return /^\d{2}[A-Z]{2}[A-Z\d]{3}[A-Z]{2}/.test(t);
  }

  // ── 動態偵測欄位位置 ──────────────────────────────────────────
  function buildColMap(table) {
    var map = {};
    var allRows = Array.prototype.slice.call(table.querySelectorAll('tr'));
    var theadRows = allRows.filter(function (tr) {
      return tr.querySelectorAll(':scope > th').length >= 5;
    });
    if (!theadRows.length) return map;

    var grid = [];
    for (var ri = 0; ri < theadRows.length; ri++) {
      if (!grid[ri]) grid[ri] = [];
      var ths = Array.prototype.slice.call(
        theadRows[ri].querySelectorAll(':scope > th, :scope > td')
      );
      var col = 0;
      for (var ci = 0; ci < ths.length; ci++) {
        while (grid[ri][col] !== undefined) col++;
        var text = ths[ci].textContent.replace(/[\s\n\r　]/g, '').trim();
        var cs   = Math.max(1, parseInt(ths[ci].getAttribute('colspan') || '1', 10));
        var rs   = Math.max(1, parseInt(ths[ci].getAttribute('rowspan') || '1', 10));
        for (var r2 = 0; r2 < rs; r2++) {
          for (var c2 = 0; c2 < cs; c2++) {
            if (!grid[ri + r2]) grid[ri + r2] = [];
            grid[ri + r2][col + c2] = text || '_';
          }
        }
        if (text && map[text] === undefined) map[text] = col;
        col += cs;
      }
    }
    return map;
  }

  var FIELD_ALIAS = {
    '團號': 'groupNo', '航空': 'airline',
    '團控說明': 'remark', '備註': 'remark',
    '團位': 'totalSeats', 'HL': 'hl', 'HK': 'hk', 'KK': 'kk',
    '保留': 'reserved', '可賣': 'available', '可賀': 'available',
    'JOIN': 'join', '天': 'days'
  };

  var FALLBACK_IDX = {
    groupNo: 2, airline: 3, remark: 10, totalSeats: 11,
    hl: 13, hk: 17, kk: 16, reserved: 18, available: 19, join: 20, days: 9
  };

  function resolveIdx(colMap) {
    var idx = {};
    Object.keys(FIELD_ALIAS).forEach(function (colName) {
      var fieldName = FIELD_ALIAS[colName];
      if (colMap[colName] !== undefined && idx[fieldName] === undefined) {
        idx[fieldName] = colMap[colName];
      }
    });
    Object.keys(FALLBACK_IDX).forEach(function (k) {
      if (idx[k] === undefined) idx[k] = FALLBACK_IDX[k];
    });
    return idx;
  }

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

      var grpCell = cells[idx.groupNo];
      var grp = grpCell ? grpCell.textContent.trim().split('\n')[0].trim() : '';
      if (!isValidGrp(grp)) continue;

      result.push({
        groupNo:    grp,
        teamName:   cellTexts[6] || '',   // 標準團名（cells[6]）
        airline:    ct(idx.airline),
        orderType:  cellTexts[4] || '',
        remark:     ct(idx.remark),
        totalSeats: cn(idx.totalSeats),
        hl:         cn(idx.hl),
        hk:         cn(idx.hk),
        kk:         cn(idx.kk),
        reserved:   cn(idx.reserved),
        available:  cn(idx.available),
        join:       cn(idx.join),
        days:       cn(idx.days),
        _cells:     cellTexts
      });
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

  // ── 主擷取邏輯 ────────────────────────────────────────────────
  (async function () {
    var totalPages = pageSelect.querySelectorAll('option').length;
    var startPage  = parseInt(pageSelect.value, 10);
    var allRows    = [];
    var colMap     = {};
    var parser     = new DOMParser();
    var prevDoc    = null;
    var estTotal   = totalPages * 95;

    upd('第 ' + startPage + ' / ' + totalPages + ' 頁', 0, estTotal);
    var firstResult = extractRows(document);
    colMap  = firstResult.colMap;
    allRows = firstResult.rows;
    upd('第 ' + startPage + ' / ' + totalPages + ' 頁（' +
        allRows.length + ' 筆）', allRows.length, estTotal);

    for (var page = startPage + 1; page <= totalPages; page++) {
      await sleep(800 + Math.random() * 700);
      try {
        upd('第 ' + page + ' / ' + totalPages + ' 頁', allRows.length, estTotal);
        var html = await fetchPage(page, prevDoc);
        var doc  = parser.parseFromString(html, 'text/html');
        prevDoc  = doc;
        var pr   = extractRows(doc);
        if (!Object.keys(colMap).length && Object.keys(pr.colMap).length) {
          colMap = pr.colMap;
        }
        allRows = allRows.concat(pr.rows);
        upd('第 ' + page + ' / ' + totalPages + ' 頁（' +
            pr.rows.length + ' 筆）', allRows.length, estTotal);
      } catch (e) {
        console.error('[SERP v2] page ' + page + ' failed:', e);
        break;
      }
    }

    var ov = document.getElementById('__erp2_ov');
    if (ov) ov.parentNode.removeChild(ov);
    window.__erpCapturing2 = false;

    var reportHTML = buildReport(allRows);

    if (reportWin && !reportWin.closed) {
      try {
        reportWin.document.open();
        reportWin.document.write(reportHTML);
        reportWin.document.close();
        reportWin.focus();
      } catch (e) {
        var blob = new Blob([reportHTML], { type: 'text/html;charset=utf-8' });
        var url  = URL.createObjectURL(blob);
        var a    = document.createElement('a');
        a.href = url;
        a.download = 'SERP手配報告-' + new Date().toISOString().slice(0, 10) + '.html';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    }
  })();

  // ── 報告 HTML 產生器 ──────────────────────────────────────────
  function buildReport(rows) {
    var now = new Date().toLocaleString('zh-TW', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
    }).replace(/\//g, '-');

    // ── 日期工具 ──────────────────────────────────────────────
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
    function he(s) {
      return String(s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    // ── 篩選 & 排序：HK+KK >= 15 ──────────────────────────────
    var list = rows.filter(function (r) { return (r.hk + r.kk) >= 15; });
    list.sort(function (a, b) {
      return departureSortKey(a.groupNo) - departureSortKey(b.groupNo);
    });

    // ── 讀取已存備註，組表格列 ────────────────────────────────
    var tableRows = list.map(function (r) {
      var saved = '';
      try { saved = localStorage.getItem('erp_v2_note_' + r.groupNo) || ''; } catch (e) {}
      var hasSaved  = saved.length > 0;
      var inpBorder = hasSaved ? '#ffc107' : '#ddd';
      var inpBg     = hasSaved ? '#fff8e1' : '#fafafa';
      var inpStyle  =
        'width:100%;box-sizing:border-box;border:1px solid ' + inpBorder + ';' +
        'border-radius:5px;padding:4px 8px;font-size:13px;color:#444;' +
        'background:' + inpBg + ';font-family:inherit;outline:none;';
      var avColor   = r.available < 0 ? '#c62828' : '#333';
      var total     = r.hk + r.kk;
      var totalColor = total >= 20 ? '#c62828' : '#e65100';

      return '<tr>' +
        '<td style="font-family:monospace;font-size:12px;white-space:nowrap;">' + he(r.groupNo) + '</td>' +
        '<td>' + he(r.teamName) + '</td>' +
        '<td style="font-weight:700;color:#1558d6;text-align:center;">' + he(r.airline) + '</td>' +
        '<td style="text-align:center;color:#666;">' + (r.days || 5) + '</td>' +
        '<td style="text-align:center;color:#1565c0;font-weight:600;">' + r.hk + '</td>' +
        '<td style="text-align:center;color:#2e7d32;font-weight:600;">' + r.kk + '</td>' +
        '<td style="text-align:center;font-weight:800;color:' + totalColor + ';">' + total + '</td>' +
        '<td style="text-align:center;color:' + avColor + ';font-weight:600;">' + r.available + '</td>' +
        '<td><input class="__erp_v2_note" data-gno="' + he(r.groupNo) + '" ' +
             'value="' + he(saved) + '" placeholder="備註…" style="' + inpStyle + '"></td>' +
        '</tr>';
    }).join('');

    // ── 儲存備註 onclick ───────────────────────────────────────
    var saveFn =
      '(function(){' +
        'document.querySelectorAll(\'.__erp_v2_note\').forEach(function(i){' +
          'var v=i.value.trim();' +
          'if(v){localStorage.setItem(\'erp_v2_note_\'+i.dataset.gno,v);}' +
          'else{localStorage.removeItem(\'erp_v2_note_\'+i.dataset.gno);}' +
          'i.style.background=v?\'#fff8e1\':\'#fafafa\';' +
          'i.style.borderColor=v?\'#ffc107\':\'#ddd\';' +
        '});' +
        'var ok=document.getElementById(\'__v2_save_ok\');' +
        'if(ok){ok.style.opacity=\'1\';setTimeout(function(){ok.style.opacity=\'0\';},2200);}' +
      '})()';

    // ── 下載 onclick（postMessage → ERP 頁觸發下載）──────────
    var dlFn =
      '(function(){' +
        'document.querySelectorAll(\'.__erp_v2_note\').forEach(function(i){i.setAttribute(\'value\',i.value);});' +
        'if(window.opener){' +
          'window.opener.postMessage({type:\'erpDl2\',' +
            'html:document.documentElement.outerHTML,' +
            'name:\'SERP手配報告_' + now.slice(0, 10) + '.html\'' +
          '},\'*\');' +
        '}' +
      '})()';

    // ── CSS ───────────────────────────────────────────────────
    var css =
      'body{font-family:Segoe UI,system-ui,sans-serif;background:#f0f2f5;color:#222;margin:0;}' +
      'header{background:linear-gradient(135deg,#1a3a5c,#0d2137);color:white;' +
             'padding:24px 32px;position:relative;}' +
      'header h1{font-size:20px;font-weight:700;margin:0 0 6px;}' +
      '.meta{font-size:13px;color:rgba(255,255,255,.65);}' +
      '.container{max-width:1400px;margin:0 auto;padding:24px 32px;}' +
      'table{width:100%;border-collapse:collapse;background:white;border-radius:10px;' +
             'overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.12);}' +
      'thead th{background:#1a3a5c;color:white;padding:10px 14px;text-align:left;' +
               'font-size:13px;font-weight:600;white-space:nowrap;}' +
      'tbody tr:nth-child(even){background:#f9fafb;}' +
      'tbody tr:hover{background:#e8f0fe;}' +
      'tbody td{padding:8px 14px;font-size:13px;border-bottom:1px solid #f0f0f0;' +
               'vertical-align:middle;}';

    // ── 組合 HTML ──────────────────────────────────────────────
    var emptyRow = '<tr><td colspan="9" style="text-align:center;padding:28px;color:#bbb;">' +
                   '目前沒有 HK+KK ≥ 15 的資料</td></tr>';

    return '<!DOCTYPE html><html lang="zh-TW"><head>' +
      '<meta charset="UTF-8">' +
      '<meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<title>SERP 手配版 ' + now.slice(0, 10) + '</title>' +
      '<style>' + css + '</style></head><body>' +
      '<header>' +
      '<h1>🛫 SERP 團資料擷取報告 2.0（手配版）</h1>' +
      '<div class="meta">擷取時間：' + now + '　共 ' + list.length + ' 筆（HK+KK ≥ 15）</div>' +
      '<button onclick="' + dlFn + '" ' +
      'style="position:absolute;top:24px;right:32px;padding:7px 20px;' +
      'background:rgba(255,255,255,.15);color:white;border:1px solid rgba(255,255,255,.4);' +
      'border-radius:7px;cursor:pointer;font-size:13px;font-weight:600;">⬇ 下載 HTML</button>' +
      '</header>' +
      '<div class="container">' +
      '<table>' +
      '<thead><tr>' +
      '<th>團號</th><th>標準團名</th><th>航空</th><th>天</th>' +
      '<th>HK</th><th>KK</th><th>合計</th><th>可賣</th>' +
      '<th style="min-width:240px;">備註（存至本機，下次自動帶入）</th>' +
      '</tr></thead>' +
      '<tbody>' + (list.length ? tableRows : emptyRow) + '</tbody>' +
      '</table>' +
      '<div style="margin-top:16px;display:flex;align-items:center;' +
                  'justify-content:flex-end;gap:12px;">' +
      '<span id="__v2_save_ok" ' +
           'style="font-size:12px;color:#43a047;opacity:0;transition:opacity .3s;">✓ 已儲存</span>' +
      '<button onclick="' + saveFn + '" ' +
      'style="padding:8px 24px;background:#43a047;color:white;border:none;' +
      'border-radius:7px;cursor:pointer;font-size:14px;font-weight:600;">' +
      '💾 儲存所有備註</button>' +
      '</div>' +
      '</div></body></html>';
  }

})();
