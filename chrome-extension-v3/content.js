// content.js — 緩慢瑞萃民宿衝突警報 v3
// 偵測「花戀花火美瑛5日」(第3天入住) 與「美瑛螃蟹5日」(第1,2天入住) 的民宿日期衝突

// ── 民宿行程設定 ─────────────────────────────────────────────────
var TOURS = [
  {
    keyword:     '花戀北海道花火美瑛',
    shortLabel:  '花戀花火美瑛',
    stayOffsets: [2],          // 出發日 +2 = 第3天入住
    color:       '#1565c0'
  },
  {
    keyword:     '北海道美瑛螃蟹',
    shortLabel:  '美瑛螃蟹',
    stayOffsets: [0, 1],       // 出發日 +0,+1 = 第1,2天入住
    color:       '#6a1b9a'
  }
];

// ── 下載中繼 ─────────────────────────────────────────────────────
if (!window.__erpDlListenerSet3) {
  window.__erpDlListenerSet3 = true;
  window.addEventListener('message', function (e) {
    if (!e.data || e.data.type !== 'erpDl3') return;
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
  if (window.__erpCapturing3) {
    alert('緩慢瑞萃警報：擷取中，請稍候...');
    return;
  }

  var pageSelect = document.querySelector('select[id="PageIndex"]');
  if (!pageSelect) {
    alert('緩慢瑞萃警報：請在 SearchList 頁面（有頁碼下拉選單）使用');
    return;
  }
  window.__erpCapturing3 = true;

  // ── 進度浮層 ──────────────────────────────────────────────────
  var overlay = document.createElement('div');
  overlay.id = '__erp3_ov';
  overlay.style.cssText =
    'position:fixed;inset:0;background:rgba(0,0,0,.72);' +
    'z-index:2147483647;display:flex;align-items:center;justify-content:center;' +
    'font-family:Segoe UI,system-ui,sans-serif;';
  overlay.innerHTML =
    '<div style="background:#fff;border-radius:16px;padding:36px 48px;' +
    'text-align:center;min-width:340px;box-shadow:0 24px 64px rgba(0,0,0,.4);">' +
    '<div style="font-size:22px;font-weight:700;margin-bottom:8px;">🏠 分析民宿入住衝突中</div>' +
    '<div id="__erp3_p" style="color:#666;font-size:14px;margin-bottom:20px;">初始化...</div>' +
    '<div id="__erp3_c" style="font-size:40px;font-weight:800;color:#1a3a5c;letter-spacing:-1px;">0 筆</div>' +
    '<div style="background:#eee;height:8px;border-radius:4px;margin-top:20px;overflow:hidden;">' +
      '<div id="__erp3_b" style="height:8px;background:linear-gradient(90deg,#6a1b9a,#1565c0);' +
      'border-radius:4px;width:0%;transition:width .5s ease;"></div>' +
    '</div>' +
    '<div style="margin-top:12px;font-size:12px;color:#bbb;">請勿關閉或切換頁面</div>' +
    '</div>';
  document.body.appendChild(overlay);

  function upd(msg, cur, tot) {
    var ep = document.getElementById('__erp3_p');
    var ec = document.getElementById('__erp3_c');
    var eb = document.getElementById('__erp3_b');
    if (ep) ep.textContent = msg;
    if (ec) ec.textContent = cur + ' 筆';
    if (eb) eb.style.width = (tot > 0 ? Math.min(cur / tot * 100, 99) : 0) + '%';
  }

  // ── 預開報告視窗 ──────────────────────────────────────────────
  var reportWin = null;
  try {
    reportWin = window.open('', 'erp_report_v3');
    if (reportWin) {
      reportWin.document.write(
        '<html><body style="font-family:Segoe UI,sans-serif;display:flex;' +
        'align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f0f2f5;">' +
        '<div style="text-align:center;color:#888;">' +
        '<div style="font-size:48px;margin-bottom:16px;">🏠</div>' +
        '<div style="font-size:18px;font-weight:700;margin-bottom:8px;">資料擷取中，請稍候...</div>' +
        '</div></body></html>'
      );
    }
  } catch (e) { reportWin = null; }

  // ── 工具函式 ──────────────────────────────────────────────────
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  function isValidGrp(t) {
    return /^\d{2}[A-Z]{2}[A-Z\d]{3}[A-Z]{2}/.test(t);
  }

  function he(s) {
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // 從團號解碼出發日（沿用 v2 邏輯）
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
    if (isNaN(day) || day < 1 || day > 31) return null;
    return new Date(yr, mo - 1, day);
  }

  function addDays(date, n) {
    var d = new Date(date.getTime());
    d.setDate(d.getDate() + n);
    return d;
  }

  function fmtDate(d) {
    var m = d.getMonth() + 1;
    var dd = d.getDate();
    return d.getFullYear() + '/' + (m < 10 ? '0' + m : m) + '/' + (dd < 10 ? '0' + dd : dd);
  }

  function fmtDateShort(d) {
    return (d.getMonth() + 1) + '/' + d.getDate();
  }

  // ── 動態偵測欄位位置（沿用 v2）────────────────────────────────
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
        teamName:   (cellTexts[6] || '').replace(/\s*[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '').trim(),
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

  // ── Fetch 指定頁（沿用 v2）────────────────────────────────────
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

  // ── 判斷已成團 / 快成團（v1 邏輯）───────────────────────────
  function isFormed(r) {
    return r.remark.includes('成團');
  }

  function isForming(r) {
    return r.kk >= 10 &&
           !r.remark.includes('成團') &&
           r.orderType !== 'NJ' &&
           !r.orderType.includes('TKT');
  }

  // ── 比對行程關鍵字 ─────────────────────────────────────────────
  function matchTour(teamName) {
    for (var i = 0; i < TOURS.length; i++) {
      if (teamName.includes(TOURS[i].keyword)) return TOURS[i];
    }
    return null;
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
    upd('第 ' + startPage + ' / ' + totalPages + ' 頁（' + allRows.length + ' 筆）', allRows.length, estTotal);

    for (var page = startPage + 1; page <= totalPages; page++) {
      await sleep(800 + Math.random() * 700);
      try {
        upd('第 ' + page + ' / ' + totalPages + ' 頁', allRows.length, estTotal);
        var html = await fetchPage(page, prevDoc);
        var doc  = parser.parseFromString(html, 'text/html');
        prevDoc  = doc;
        var pr   = extractRows(doc);
        if (!Object.keys(colMap).length && Object.keys(pr.colMap).length) colMap = pr.colMap;
        allRows = allRows.concat(pr.rows);
        upd('第 ' + page + ' / ' + totalPages + ' 頁（' + pr.rows.length + ' 筆）', allRows.length, estTotal);
      } catch (e) {
        console.error('[緩慢瑞萃 v3] page ' + page + ' failed:', e);
        break;
      }
    }

    var ov = document.getElementById('__erp3_ov');
    if (ov) ov.parentNode.removeChild(ov);
    window.__erpCapturing3 = false;

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
        a.download = '緩慢瑞萃衝突-' + new Date().toISOString().slice(0, 10) + '.html';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    }
  })();

  // ── 報告 HTML 產生器 ──────────────────────────────────────────
  function buildReport(allRows) {
    var now = new Date().toLocaleString('zh-TW', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
    }).replace(/\//g, '-');

    // ── 1. 篩選符合兩種行程且已/快成團的 rows ─────────────────
    var qualified = [];
    allRows.forEach(function (r) {
      var tour = matchTour(r.teamName);
      if (!tour) return;
      var formed  = isFormed(r);
      var forming = isForming(r);
      if (!formed && !forming) return;
      var dep = departureDateObj(r.groupNo);
      if (!dep) return;
      var stayDates = tour.stayOffsets.map(function (offset) {
        return fmtDate(addDays(dep, offset));
      });
      qualified.push({
        row:        r,
        tour:       tour,
        status:     formed ? 'formed' : 'forming',
        depDate:    fmtDate(dep),
        stayDates:  stayDates
      });
    });

    // ── 2. 建立日期 → 入住項目 Map ─────────────────────────────
    var dateMap = {};
    qualified.forEach(function (q) {
      q.stayDates.forEach(function (sd, offsetIdx) {
        if (!dateMap[sd]) dateMap[sd] = [];
        var nightLabel = q.tour.stayOffsets[offsetIdx] === 0 ? '第1天' :
                         q.tour.stayOffsets[offsetIdx] === 1 ? '第2天' : '第3天';
        dateMap[sd].push({
          q:           q,
          nightLabel:  nightLabel
        });
      });
    });

    var conflictDates = Object.keys(dateMap).filter(function (d) {
      return dateMap[d].length > 1;
    }).sort();

    var formedCount  = qualified.filter(function (q) { return q.status === 'formed';  }).length;
    var formingCount = qualified.filter(function (q) { return q.status === 'forming'; }).length;

    // ── 3. 月曆資料（今月起 6 個月）──────────────────────────
    var today = new Date();
    var calMonths = [];
    for (var mi = 0; mi < 6; mi++) {
      var yr = today.getFullYear();
      var mo = today.getMonth() + mi;
      if (mo > 11) { yr++; mo -= 12; }
      calMonths.push({ year: yr, month: mo });
    }

    // ── 月曆 HTML ─────────────────────────────────────────────
    function renderCalendar() {
      var weekdays = ['日', '一', '二', '三', '四', '五', '六'];
      var html = '<div style="display:flex;flex-wrap:wrap;gap:20px;">';
      calMonths.forEach(function (cm) {
        var firstDay = new Date(cm.year, cm.month, 1).getDay();
        var daysInMonth = new Date(cm.year, cm.month + 1, 0).getDate();
        var monthLabel = cm.year + '年' + (cm.month + 1) + '月';
        html += '<div style="background:#fff;border-radius:12px;padding:16px;' +
                'box-shadow:0 1px 4px rgba(0,0,0,.1);min-width:260px;">' +
                '<div style="text-align:center;font-weight:700;font-size:15px;' +
                'margin-bottom:12px;color:#1a3a5c;">' + monthLabel + '</div>' +
                '<table style="width:100%;border-collapse:collapse;table-layout:fixed;">' +
                '<thead><tr>';
        weekdays.forEach(function (wd, wi) {
          var color = wi === 0 ? '#c62828' : wi === 6 ? '#1565c0' : '#555';
          html += '<th style="text-align:center;font-size:12px;padding:4px 0;color:' + color + ';">' + wd + '</th>';
        });
        html += '</tr></thead><tbody><tr>';
        for (var di = 0; di < firstDay; di++) {
          html += '<td></td>';
        }
        var col = firstDay;
        for (var day = 1; day <= daysInMonth; day++) {
          var dateStr = cm.year + '/' + (cm.month + 1 < 10 ? '0' : '') + (cm.month + 1) + '/' + (day < 10 ? '0' : '') + day;
          var entries = dateMap[dateStr] || [];
          var isConflict = entries.length > 1;
          var hasOccupied = entries.length > 0;
          var allFormed = hasOccupied && entries.every(function (e) { return e.q.status === 'formed'; });
          var hasForming = hasOccupied && entries.some(function (e) { return e.q.status === 'forming'; });

          var cellBg = 'transparent';
          var cellColor = '#333';
          var cellTitle = '';
          if (isConflict) {
            cellBg = '#c62828'; cellColor = '#fff';
            cellTitle = entries.map(function (e) {
              return e.q.tour.shortLabel + '(' + e.nightLabel + ') ' + e.q.row.groupNo;
            }).join('\n');
          } else if (allFormed) {
            cellBg = '#2e7d32'; cellColor = '#fff';
            cellTitle = entries[0].q.tour.shortLabel + '(' + entries[0].nightLabel + ') ' + entries[0].q.row.groupNo;
          } else if (hasForming) {
            cellBg = '#1565c0'; cellColor = '#fff';
            cellTitle = entries[0].q.tour.shortLabel + '(' + entries[0].nightLabel + ') ' + entries[0].q.row.groupNo;
          }

          var isToday = (cm.year === today.getFullYear() && cm.month === today.getMonth() && day === today.getDate());
          var dayStyle = 'text-align:center;font-size:13px;padding:5px 2px;border-radius:6px;cursor:default;' +
            'background:' + cellBg + ';color:' + cellColor + ';' +
            (isToday && !hasOccupied ? 'font-weight:800;text-decoration:underline;' : '') +
            (hasOccupied ? 'font-weight:700;' : '');

          html += '<td title="' + he(cellTitle) + '" style="' + dayStyle + '">' + day + '</td>';
          col++;
          if (col % 7 === 0 && day < daysInMonth) html += '</tr><tr>';
        }
        while (col % 7 !== 0) { html += '<td></td>'; col++; }
        html += '</tr></tbody></table></div>';
      });
      html += '</div>';
      return html;
    }

    // ── 衝突警示 HTML ─────────────────────────────────────────
    function renderConflicts() {
      if (!conflictDates.length) {
        return '<div style="background:#e8f5e9;border-left:4px solid #43a047;border-radius:8px;' +
               'padding:16px 20px;color:#2e7d32;font-weight:600;">✅ 目前無入住日期衝突</div>';
      }
      var html = '';
      conflictDates.forEach(function (d) {
        var entries = dateMap[d];
        html += '<div style="background:#ffebee;border-left:4px solid #c62828;border-radius:8px;' +
                'padding:14px 20px;margin-bottom:10px;">' +
                '<div style="font-weight:800;font-size:15px;color:#c62828;margin-bottom:8px;">⚠️ ' + d + '</div>' +
                '<div style="display:flex;flex-wrap:wrap;gap:8px;">';
        entries.forEach(function (e) {
          var bg = e.q.status === 'formed' ? '#c62828' : '#1565c0';
          html += '<span style="background:' + bg + ';color:#fff;border-radius:6px;' +
                  'padding:4px 10px;font-size:13px;font-weight:600;">' +
                  e.q.tour.shortLabel + '・' + e.nightLabel + '&nbsp;&nbsp;' +
                  he(e.q.row.groupNo) + '&nbsp;' +
                  (e.q.status === 'formed' ? '✓已成團' : '⚡快成團') +
                  '</span>';
        });
        html += '</div></div>';
      });
      return html;
    }

    // ── 全部符合團清單 ─────────────────────────────────────────
    function renderTable() {
      if (!qualified.length) {
        return '<div style="text-align:center;padding:32px;color:#bbb;">目前無符合條件的行程</div>';
      }
      var sorted = qualified.slice().sort(function (a, b) {
        return a.depDate < b.depDate ? -1 : a.depDate > b.depDate ? 1 : 0;
      });
      var rows = sorted.map(function (q) {
        var r = q.row;
        var statusBadge = q.status === 'formed'
          ? '<span style="background:#2e7d32;color:#fff;border-radius:4px;padding:2px 8px;font-size:12px;font-weight:700;">✓ 已成團</span>'
          : '<span style="background:#1565c0;color:#fff;border-radius:4px;padding:2px 8px;font-size:12px;font-weight:700;">⚡ 快成團</span>';

        var stayConflict = q.stayDates.some(function (sd) {
          return dateMap[sd] && dateMap[sd].length > 1;
        });
        var rowBg = stayConflict ? '#fff3e0' : '';

        var saved = '';
        try { saved = localStorage.getItem('erp_v3_note_' + r.groupNo) || ''; } catch (e) {}
        var inpStyle = 'width:100%;box-sizing:border-box;border:1px solid ' +
          (saved ? '#ffc107' : '#ddd') + ';border-radius:5px;padding:4px 8px;' +
          'font-size:13px;color:#444;background:' + (saved ? '#fff8e1' : '#fafafa') + ';font-family:inherit;outline:none;';

        return '<tr style="background:' + rowBg + ';">' +
          '<td style="font-family:monospace;font-size:12px;white-space:nowrap;">' + he(r.groupNo) + '</td>' +
          '<td style="font-size:12px;color:' + q.tour.color + ';font-weight:600;">' + he(q.tour.shortLabel) + '</td>' +
          '<td style="font-weight:700;color:#1558d6;text-align:center;">' + he(r.airline) + '</td>' +
          '<td style="text-align:center;">' + q.depDate + '</td>' +
          '<td>' + q.stayDates.map(function (sd, i) {
            var isConflict = dateMap[sd] && dateMap[sd].length > 1;
            return '<span style="' + (isConflict ? 'color:#c62828;font-weight:800;' : 'color:#333;') + '">' +
              sd + '(' + (q.tour.stayOffsets[i] === 0 ? '第1天' : q.tour.stayOffsets[i] === 1 ? '第2天' : '第3天') + ')' +
              (isConflict ? ' ⚠️' : '') + '</span>';
          }).join('<br>') + '</td>' +
          '<td style="text-align:center;">' + statusBadge + '</td>' +
          '<td style="text-align:center;color:#1565c0;font-weight:600;">' + r.hk + '</td>' +
          '<td style="text-align:center;color:#2e7d32;font-weight:600;">' + r.kk + '</td>' +
          '<td style="text-align:center;color:' + (r.available < 0 ? '#c62828' : '#333') + ';font-weight:600;">' + r.available + '</td>' +
          '<td><input class="__erp_v3_note" data-gno="' + he(r.groupNo) + '" value="' + he(saved) + '" placeholder="備註…" style="' + inpStyle + '"></td>' +
          '</tr>';
      }).join('');

      return '<table style="width:100%;border-collapse:collapse;background:white;border-radius:10px;' +
             'overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.12);">' +
             '<thead><tr>' +
             '<th>團號</th><th>行程類型</th><th>航空</th><th>出發日</th>' +
             '<th>民宿入住日</th><th>狀態</th><th>HK</th><th>KK</th><th>可賣</th>' +
             '<th style="min-width:200px;">備註</th>' +
             '</tr></thead><tbody>' + rows + '</tbody></table>';
    }

    // ── 儲存備註 / 下載函式 ────────────────────────────────────
    var saveFn =
      '(function(){' +
        'document.querySelectorAll(\'.__erp_v3_note\').forEach(function(i){' +
          'var v=i.value.trim();' +
          'if(v){localStorage.setItem(\'erp_v3_note_\'+i.dataset.gno,v);}' +
          'else{localStorage.removeItem(\'erp_v3_note_\'+i.dataset.gno);}' +
          'i.style.background=v?\'#fff8e1\':\'#fafafa\';' +
          'i.style.borderColor=v?\'#ffc107\':\'#ddd\';' +
        '});' +
        'var ok=document.getElementById(\'__v3_save_ok\');' +
        'if(ok){ok.style.opacity=\'1\';setTimeout(function(){ok.style.opacity=\'0\';},2200);}' +
      '})()';

    var dlFn =
      '(function(){' +
        'document.querySelectorAll(\'.__erp_v3_note\').forEach(function(i){i.setAttribute(\'value\',i.value);});' +
        'if(window.opener){' +
          'window.opener.postMessage({type:\'erpDl3\',' +
            'html:document.documentElement.outerHTML,' +
            'name:\'緩慢瑞萃衝突_' + now.slice(0, 10) + '.html\'' +
          '},\'*\');' +
        '}' +
      '})()';

    // ── CSS ──────────────────────────────────────────────────────
    var css =
      'body{font-family:Segoe UI,system-ui,sans-serif;background:#f0f2f5;color:#222;margin:0;}' +
      'header{background:linear-gradient(135deg,#4a0e8f,#1a237e);color:white;padding:24px 32px;position:relative;}' +
      'header h1{font-size:20px;font-weight:700;margin:0 0 6px;}' +
      '.meta{font-size:13px;color:rgba(255,255,255,.65);}' +
      '.container{max-width:1400px;margin:0 auto;padding:24px 32px;}' +
      '.section-title{font-size:16px;font-weight:700;color:#1a3a5c;margin:28px 0 12px;' +
                     'display:flex;align-items:center;gap:8px;}' +
      '.stats{display:flex;gap:16px;margin-bottom:4px;flex-wrap:wrap;}' +
      '.stat-card{background:#fff;border-radius:10px;padding:14px 22px;' +
                 'box-shadow:0 1px 4px rgba(0,0,0,.1);min-width:140px;text-align:center;}' +
      '.stat-num{font-size:28px;font-weight:800;}' +
      '.stat-lbl{font-size:12px;color:#888;margin-top:2px;}' +
      'table thead th{background:#1a3a5c;color:white;padding:10px 14px;text-align:left;' +
                     'font-size:13px;font-weight:600;white-space:nowrap;}' +
      'table tbody tr:nth-child(even){background:#f9fafb;}' +
      'table tbody tr:hover{filter:brightness(.97);}' +
      'table tbody td{padding:8px 14px;font-size:13px;border-bottom:1px solid #f0f0f0;vertical-align:middle;}' +
      '.legend{display:flex;gap:14px;flex-wrap:wrap;font-size:12px;margin-top:8px;}' +
      '.legend-item{display:flex;align-items:center;gap:6px;}' +
      '.legend-dot{width:14px;height:14px;border-radius:50%;}';

    // ── 組合最終 HTML ──────────────────────────────────────────
    return '<!DOCTYPE html><html lang="zh-TW"><head>' +
      '<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<title>緩慢瑞萃衝突警報 ' + now.slice(0, 10) + '</title>' +
      '<style>' + css + '</style></head><body>' +

      '<header>' +
      '<h1>🏠 緩慢瑞萃民宿 入住衝突警報</h1>' +
      '<div class="meta">分析時間：' + now + '　掃描 ' + allRows.length + ' 筆團資料</div>' +
      '<button onclick="' + dlFn + '" style="position:absolute;top:24px;right:32px;padding:7px 20px;' +
        'background:rgba(255,255,255,.15);color:white;border:1px solid rgba(255,255,255,.4);' +
        'border-radius:7px;cursor:pointer;font-size:13px;font-weight:600;">⬇ 下載 HTML</button>' +
      '</header>' +

      '<div class="container">' +

      // 統計卡
      '<div class="stats">' +
      '<div class="stat-card"><div class="stat-num" style="color:#2e7d32;">' + formedCount + '</div>' +
        '<div class="stat-lbl">已成團（符合行程）</div></div>' +
      '<div class="stat-card"><div class="stat-num" style="color:#1565c0;">' + formingCount + '</div>' +
        '<div class="stat-lbl">快成團（KK≥10）</div></div>' +
      '<div class="stat-card"><div class="stat-num" style="color:' + (conflictDates.length ? '#c62828' : '#2e7d32') + ';">' +
        conflictDates.length + '</div><div class="stat-lbl">衝突日數</div></div>' +
      '</div>' +

      // 圖例
      '<div class="legend">' +
      '<div class="legend-item"><div class="legend-dot" style="background:#c62828;"></div>衝突（多團同一天入住）</div>' +
      '<div class="legend-item"><div class="legend-dot" style="background:#2e7d32;"></div>已成團（無衝突）</div>' +
      '<div class="legend-item"><div class="legend-dot" style="background:#1565c0;"></div>快成團（無衝突）</div>' +
      '</div>' +

      '<div class="section-title">⚠️ 衝突警示</div>' +
      renderConflicts() +

      '<div class="section-title">📅 民宿入住月曆</div>' +
      renderCalendar() +

      '<div class="section-title">📋 符合行程清單（已成團 + 快成團）</div>' +
      renderTable() +

      '<div style="margin-top:16px;display:flex;align-items:center;justify-content:flex-end;gap:12px;">' +
      '<span id="__v3_save_ok" style="font-size:12px;color:#43a047;opacity:0;transition:opacity .3s;">✓ 已儲存</span>' +
      '<button onclick="' + saveFn + '" style="padding:8px 24px;background:#43a047;color:white;border:none;' +
        'border-radius:7px;cursor:pointer;font-size:14px;font-weight:600;">💾 儲存所有備註</button>' +
      '</div>' +

      '</div></body></html>';
  }

})();
