// content.js — 緩慢瑞萃民宿衝突警報 v3.1
// 新增：美瑛螃蟹行程「倒走」切換（第1,2天 ↔ 第4,5天），點按即時重算

// ── 民宿行程設定 ─────────────────────────────────────────────────
var TOURS = [
  {
    keyword:        '花戀北海道花火美瑛',
    shortLabel:     '特選花戀',
    stayOffsets:    [2],          // 出發日 +2 = 第3天入住
    reversedOffsets: null,        // 無倒走版本
    color:          '#1565c0'
  },
  {
    keyword:        '北海道美瑛螃蟹',
    shortLabel:     '限定PLUS',
    stayOffsets:    [0, 1],       // 正走：出發日 +0,+1 = 第1,2天
    reversedOffsets: [3, 4],      // 倒走：出發日 +3,+4 = 第4,5天
    color:          '#6a1b9a'
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
    a.href = url; a.download = e.data.name;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
  });
}

(function () {

  if (window.__erpCapturing3) { alert('緩慢瑞萃警報：擷取中，請稍候...'); return; }

  var pageSelect = document.querySelector('select[id="PageIndex"]');
  if (!pageSelect) { alert('緩慢瑞萃警報：請在 SearchList 頁面（有頁碼下拉選單）使用'); return; }
  window.__erpCapturing3 = true;

  // ── 進度浮層 ──────────────────────────────────────────────────
  var overlay = document.createElement('div');
  overlay.id = '__erp3_ov';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.72);z-index:2147483647;display:flex;align-items:center;justify-content:center;font-family:Segoe UI,system-ui,sans-serif;';
  overlay.innerHTML =
    '<div style="background:#fff;border-radius:16px;padding:36px 48px;text-align:center;min-width:340px;box-shadow:0 24px 64px rgba(0,0,0,.4);">' +
    '<div style="font-size:22px;font-weight:700;margin-bottom:8px;">🏠 分析民宿入住衝突中</div>' +
    '<div id="__erp3_p" style="color:#666;font-size:14px;margin-bottom:20px;">初始化...</div>' +
    '<div id="__erp3_c" style="font-size:40px;font-weight:800;color:#1a3a5c;letter-spacing:-1px;">0 筆</div>' +
    '<div style="background:#eee;height:8px;border-radius:4px;margin-top:20px;overflow:hidden;">' +
      '<div id="__erp3_b" style="height:8px;background:linear-gradient(90deg,#6a1b9a,#1565c0);border-radius:4px;width:0%;transition:width .5s ease;"></div>' +
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

  var reportWin = null;
  try {
    reportWin = window.open('', 'erp_report_v3');
    if (reportWin) {
      reportWin.document.write('<html><body style="font-family:Segoe UI,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f0f2f5;"><div style="text-align:center;color:#888;"><div style="font-size:48px;margin-bottom:16px;">🏠</div><div style="font-size:18px;font-weight:700;margin-bottom:8px;">資料擷取中，請稍候...</div></div></body></html>');
    }
  } catch (e) { reportWin = null; }

  // ── 工具函式 ──────────────────────────────────────────────────
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function isValidGrp(t) { return /^\d{2}[A-Z]{2}[A-Z\d]{3}[A-Z]{2}/.test(t); }

  function he(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function departureDateObj(groupNo) {
    var gn = groupNo.split(' ')[0];
    if (gn.length < 7) return null;
    var yr = 2000 + parseInt(gn.slice(0,2), 10);
    var mc = gn[4];
    var day = parseInt(gn.slice(5,7), 10);
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
    var m = d.getMonth() + 1, dd = d.getDate();
    return d.getFullYear() + '/' + (m < 10 ? '0' : '') + m + '/' + (dd < 10 ? '0' : '') + dd;
  }

  function nightLabel(offset) { return 'D' + (offset + 1); }

  // ── 動態欄位偵測（沿用 v2）────────────────────────────────────
  function buildColMap(table) {
    var map = {};
    var allRows = Array.prototype.slice.call(table.querySelectorAll('tr'));
    var theadRows = allRows.filter(function(tr){ return tr.querySelectorAll(':scope > th').length >= 5; });
    if (!theadRows.length) return map;
    var grid = [];
    for (var ri = 0; ri < theadRows.length; ri++) {
      if (!grid[ri]) grid[ri] = [];
      var ths = Array.prototype.slice.call(theadRows[ri].querySelectorAll(':scope > th, :scope > td'));
      var col = 0;
      for (var ci = 0; ci < ths.length; ci++) {
        while (grid[ri][col] !== undefined) col++;
        var text = ths[ci].textContent.replace(/[\s\n\r　]/g,'').trim();
        var cs = Math.max(1, parseInt(ths[ci].getAttribute('colspan') || '1', 10));
        var rs = Math.max(1, parseInt(ths[ci].getAttribute('rowspan') || '1', 10));
        for (var r2 = 0; r2 < rs; r2++) {
          for (var c2 = 0; c2 < cs; c2++) {
            if (!grid[ri+r2]) grid[ri+r2] = [];
            grid[ri+r2][col+c2] = text || '_';
          }
        }
        if (text && map[text] === undefined) map[text] = col;
        col += cs;
      }
    }
    return map;
  }

  var FIELD_ALIAS = {
    '團號':'groupNo','航空':'airline','團控說明':'remark','備註':'remark',
    '團位':'totalSeats','HL':'hl','HK':'hk','KK':'kk',
    '保留':'reserved','可賣':'available','可賀':'available','JOIN':'join','天':'days'
  };
  var FALLBACK_IDX = { groupNo:2, airline:3, remark:10, totalSeats:11, hl:13, hk:17, kk:16, reserved:18, available:19, join:20, days:9 };

  function resolveIdx(colMap) {
    var idx = {};
    Object.keys(FIELD_ALIAS).forEach(function(k){ var f=FIELD_ALIAS[k]; if(colMap[k]!==undefined&&idx[f]===undefined)idx[f]=colMap[k]; });
    Object.keys(FALLBACK_IDX).forEach(function(k){ if(idx[k]===undefined)idx[k]=FALLBACK_IDX[k]; });
    return idx;
  }

  function extractRows(doc) {
    var tables = Array.prototype.slice.call(doc.querySelectorAll('table'));
    var best = tables.reduce(function(b,t){ var n=t.querySelectorAll(':scope > tbody > tr').length; return n>(b?b.count:0)?{t:t,count:n}:b; }, null);
    if (!best) return { colMap:{}, rows:[] };
    var table = best.t;
    var colMap = buildColMap(table);
    var idx = resolveIdx(colMap);
    var result = [];
    var trs = table.querySelectorAll(':scope > tbody > tr');
    for (var ri = 0; ri < trs.length; ri++) {
      var cells = Array.prototype.slice.call(trs[ri].querySelectorAll(':scope > td'));
      if (cells.length < 10) continue;
      var cellTexts = cells.map(function(td){ return td.textContent.replace(/\n/g,' ').trim(); });
      function ct(i){ return (i!==undefined&&cellTexts[i]!==undefined)?cellTexts[i]:''; }
      function cn(i){ if(i===undefined)return 0; var n=parseInt((cellTexts[i]||'').replace(/,/g,''),10); return isNaN(n)?0:n; }
      var grp = cells[idx.groupNo] ? cells[idx.groupNo].textContent.trim().split('\n')[0].trim() : '';
      if (!isValidGrp(grp)) continue;
      result.push({
        groupNo:    grp,
        teamName:   (cellTexts[6]||'').replace(/\s*[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,'').trim(),
        airline:    ct(idx.airline),
        orderType:  cellTexts[4]||'',
        remark:     ct(idx.remark),
        hk:         cn(idx.hk),
        kk:         cn(idx.kk),
        available:  cn(idx.available),
        days:       cn(idx.days)
      });
    }
    return { colMap:colMap, rows:result };
  }

  async function fetchPage(pageIndex, prevDoc) {
    var form = document.querySelector('form#SearchListForm');
    if (!form) throw new Error('找不到 SearchListForm');
    var fd = new FormData(form);
    if (prevDoc) {
      var hids = prevDoc.querySelectorAll('input[type="hidden"]');
      for (var hi = 0; hi < hids.length; hi++) { if(hids[hi].name) fd.set(hids[hi].name, hids[hi].value); }
    }
    fd.set('PageIndex', String(pageIndex));
    var res = await fetch(form.action, { method:'POST', body:fd, credentials:'include' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.text();
  }

  function matchTour(teamName) {
    for (var i = 0; i < TOURS.length; i++) { if (teamName.includes(TOURS[i].keyword)) return TOURS[i]; }
    return null;
  }
  function isFormed(r) { return r.remark.includes('成團'); }
  function isForming(r) { return r.kk >= 10 && !r.remark.includes('成團') && r.orderType !== 'NJ' && !r.orderType.includes('TKT'); }
  function isRevInLS(gno) { try { return !!localStorage.getItem('erp_v3_rev_' + gno); } catch(e) { return false; } }

  // ── 主擷取邏輯 ────────────────────────────────────────────────
  (async function () {
    var totalPages = pageSelect.querySelectorAll('option').length;
    var startPage  = parseInt(pageSelect.value, 10);
    var allRows    = [];
    var parser     = new DOMParser();
    var prevDoc    = null;
    var estTotal   = totalPages * 95;

    upd('第 ' + startPage + ' / ' + totalPages + ' 頁', 0, estTotal);
    var first = extractRows(document);
    allRows = first.rows;
    upd('第 ' + startPage + ' / ' + totalPages + ' 頁（' + allRows.length + ' 筆）', allRows.length, estTotal);

    for (var page = startPage + 1; page <= totalPages; page++) {
      await sleep(800 + Math.random() * 700);
      try {
        upd('第 ' + page + ' / ' + totalPages + ' 頁', allRows.length, estTotal);
        var html = await fetchPage(page, prevDoc);
        var doc  = parser.parseFromString(html, 'text/html');
        prevDoc  = doc;
        var pr   = extractRows(doc);
        allRows  = allRows.concat(pr.rows);
        upd('第 ' + page + ' / ' + totalPages + ' 頁（' + pr.rows.length + ' 筆）', allRows.length, estTotal);
      } catch (e) { console.error('[緩慢瑞萃 v3] page ' + page + ' failed:', e); break; }
    }

    var ov = document.getElementById('__erp3_ov');
    if (ov) ov.parentNode.removeChild(ov);
    window.__erpCapturing3 = false;

    var reportHTML = buildReport(allRows);
    if (reportWin && !reportWin.closed) {
      try { reportWin.document.open(); reportWin.document.write(reportHTML); reportWin.document.close(); reportWin.focus(); }
      catch (e) {
        var blob = new Blob([reportHTML], {type:'text/html;charset=utf-8'});
        var url  = URL.createObjectURL(blob);
        var a    = document.createElement('a');
        a.href = url; a.download = '緩慢瑞萃衝突-' + new Date().toISOString().slice(0,10) + '.html';
        document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
      }
    }
  })();

  // ── 報告 HTML 產生器 ──────────────────────────────────────────
  function buildReport(allRows) {
    var now = new Date().toLocaleString('zh-TW', {
      year:'numeric', month:'2-digit', day:'2-digit',
      hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:false
    }).replace(/\//g, '-');

    var today = new Date();

    // ── 月曆月份清單（今月起 6 個月）────────────────────────────
    var calMonths = [];
    for (var mi = 0; mi < 6; mi++) {
      var yr = today.getFullYear(), mo = today.getMonth() + mi;
      if (mo > 11) { yr++; mo -= 12; }
      calMonths.push({ year:yr, month:mo });
    }

    // ── 精簡 allRows 供 client 使用（去掉不需要的欄位）──────────
    var slimRows = allRows.map(function(r) {
      return { groupNo:r.groupNo, teamName:r.teamName, airline:r.airline,
               orderType:r.orderType, remark:r.remark, hk:r.hk, kk:r.kk, available:r.available };
    });

    // ── server-side buildData（讀 localStorage）─────────────────
    function buildData(getRevFn) {
      var qualified = [];
      allRows.forEach(function(r) {
        var tour = matchTour(r.teamName);
        if (!tour) return;
        if (!isFormed(r) && !isForming(r)) return;
        var dep = departureDateObj(r.groupNo);
        if (!dep) return;
        var rev = tour.reversedOffsets && getRevFn(r.groupNo);
        var offsets = rev ? tour.reversedOffsets : tour.stayOffsets;
        var stayDates = offsets.map(function(o) { return fmtDate(addDays(dep, o)); });
        qualified.push({
          row:r, tour:tour,
          status: isFormed(r) ? 'formed' : 'forming',
          depDate: fmtDate(dep),
          stayDates: stayDates,
          offsets: offsets,
          isReversed: !!rev
        });
      });
      var dateMap = {};
      qualified.forEach(function(q) {
        q.stayDates.forEach(function(sd, i) {
          if (!dateMap[sd]) dateMap[sd] = [];
          dateMap[sd].push({ q:q, nightLabel:nightLabel(q.offsets[i]) });
        });
      });
      var conflictDates = Object.keys(dateMap).filter(function(d){ return dateMap[d].length > 1; }).sort();
      return { qualified:qualified, dateMap:dateMap, conflictDates:conflictDates };
    }

    var D = buildData(isRevInLS);
    var qualified     = D.qualified;
    var dateMap       = D.dateMap;
    var conflictDates = D.conflictDates;
    var formedCount   = qualified.filter(function(q){ return q.status==='formed'; }).length;
    var formingCount  = qualified.filter(function(q){ return q.status==='forming'; }).length;

    // ── render 函式（輸出 HTML 字串，接受 data 參數）────────────
    function renderStats(d) {
      var fc = d.qualified.filter(function(q){ return q.status==='formed'; }).length;
      var mc = d.qualified.filter(function(q){ return q.status==='forming'; }).length;
      var cc = d.conflictDates.length;
      return '<div class="stats">' +
        '<div class="stat-card"><div class="stat-num" style="color:#2e7d32;">' + fc + '</div><div class="stat-lbl">已成團</div></div>' +
        '<div class="stat-card"><div class="stat-num" style="color:#1565c0;">' + mc + '</div><div class="stat-lbl">快成團（KK≥10）</div></div>' +
        '<div class="stat-card"><div class="stat-num" style="color:' + (cc?'#c62828':'#2e7d32') + ';">' + cc + '</div><div class="stat-lbl">衝突日數</div></div>' +
        '<div class="stat-card"><div class="stat-num" style="color:#6a1b9a;">' +
          d.qualified.filter(function(q){ return q.isReversed; }).length +
        '</div><div class="stat-lbl">倒走標記</div></div>' +
        '</div>';
    }

    function renderConflicts(d) {
      if (!d.conflictDates.length) {
        return '<div style="background:#e8f5e9;border-left:4px solid #43a047;border-radius:8px;padding:16px 20px;color:#2e7d32;font-weight:600;">✅ 目前無入住日期衝突</div>';
      }
      var html = '';
      d.conflictDates.forEach(function(dt) {
        var entries = d.dateMap[dt];
        html += '<div style="background:#ffebee;border-left:4px solid #c62828;border-radius:8px;padding:14px 20px;margin-bottom:10px;">' +
          '<div style="font-weight:800;font-size:15px;color:#c62828;margin-bottom:8px;">⚠️ ' + dt + '</div>' +
          '<div style="display:flex;flex-wrap:wrap;gap:8px;">';
        entries.forEach(function(e) {
          var bg = e.q.status === 'formed' ? '#c62828' : '#1565c0';
          var revTag = e.q.isReversed ? ' 🔄' : '';
          html += '<span style="background:' + bg + ';color:#fff;border-radius:6px;padding:4px 10px;font-size:13px;font-weight:600;">' +
            he(e.q.tour.shortLabel) + revTag + '・' + e.nightLabel + '&nbsp;&nbsp;' +
            he(e.q.row.groupNo) + '&nbsp;' + (e.q.status==='formed'?'✓已成團':'⚡快成團') +
            '</span>';
        });
        html += '</div></div>';
      });
      return html;
    }

    function renderCalendar(d) {
      var weekdays = ['日','一','二','三','四','五','六'];
      var html = '<div style="display:flex;flex-direction:column;gap:24px;">';
      calMonths.forEach(function(cm) {
        var firstDay = new Date(cm.year, cm.month, 1).getDay();
        var daysInMonth = new Date(cm.year, cm.month + 1, 0).getDate();
        html += '<div style="background:#fff;border-radius:12px;padding:20px 24px;box-shadow:0 1px 4px rgba(0,0,0,.1);width:100%;box-sizing:border-box;">' +
          '<div style="text-align:center;font-weight:700;font-size:15px;margin-bottom:12px;color:#1a3a5c;">' + cm.year + '年' + (cm.month+1) + '月</div>' +
          '<table style="width:100%;border-collapse:collapse;table-layout:fixed;"><thead><tr>';
        weekdays.forEach(function(wd, wi) {
          var wc = wi===0?'#c62828':wi===6?'#1565c0':'#444';
          html += '<th style="text-align:center;font-size:12px;padding:6px 0;color:'+wc+';background:#eef1f7;border-bottom:2px solid #d0d7e8;">'+wd+'</th>';
        });
        html += '</tr></thead><tbody><tr>';
        for (var di = 0; di < firstDay; di++) html += '<td></td>';
        var col = firstDay;
        for (var day = 1; day <= daysInMonth; day++) {
          var mm = cm.month+1, dateStr = cm.year+'/'+(mm<10?'0':'')+mm+'/'+(day<10?'0':'')+day;
          var entries = d.dateMap[dateStr] || [];
          var isConflict = entries.length > 1;
          var hasOccupied = entries.length > 0;
          var allFormed = hasOccupied && entries.every(function(e){ return e.q.status==='formed'; });
          var hasRev = hasOccupied && entries.some(function(e){ return e.q.isReversed; });
          var cellBg = 'transparent', cellColor = '#333', cellTitle = '';
          if (isConflict) {
            cellBg = '#c62828'; cellColor = '#fff';
            cellTitle = entries.map(function(e){ return e.q.tour.shortLabel+(e.q.isReversed?'🔄':'')+'('+e.nightLabel+') '+e.q.row.groupNo; }).join('\n');
          } else if (allFormed) {
            cellBg = '#2e7d32'; cellColor = '#fff';
            cellTitle = entries[0].q.tour.shortLabel+(entries[0].q.isReversed?'🔄':'')+'('+entries[0].nightLabel+') '+entries[0].q.row.groupNo;
          } else if (hasOccupied) {
            cellBg = '#1565c0'; cellColor = '#fff';
            cellTitle = entries[0].q.tour.shortLabel+(entries[0].q.isReversed?'🔄':'')+'('+entries[0].nightLabel+') '+entries[0].q.row.groupNo;
          }
          var isToday = (cm.year===today.getFullYear()&&cm.month===today.getMonth()&&day===today.getDate());
          var dayStyle = 'vertical-align:top;padding:4px 2px;border-radius:6px;cursor:default;' +
            'background:'+cellBg+';color:'+cellColor+';';
          var inner;
          if (!hasOccupied) {
            inner = '<div style="font-size:12px;text-align:center;'+(isToday?'font-weight:800;text-decoration:underline;':'')+'">'+day+'</div>';
          } else {
            inner = '<div style="font-size:14px;font-weight:800;text-align:center;margin-bottom:3px;">'+day+(isConflict?' ⚠️':'')+'</div>';
            entries.forEach(function(e){
              var gno = e.q.row.groupNo.split(' ')[0];
              var canToggle = !!e.q.tour.reversedOffsets;
              var revLabel = e.q.isReversed ? '&nbsp;<span style="background:rgba(255,255,255,.25);border-radius:3px;padding:0 3px;font-size:9px;">倒走</span>' : '';
              var gnoHtml = canToggle
                ? '<span onclick="window.toggleReversed(\''+he(e.q.row.groupNo)+'\')" ' +
                  'style="font-family:monospace;font-size:10px;cursor:pointer;border-bottom:1px dotted rgba(255,255,255,.7);" ' +
                  'title="點此切換倒走">'+he(gno)+(e.q.isReversed?' ↩️':' 🔄')+'</span>'
                : '<span style="font-family:monospace;font-size:10px;">'+he(gno)+'</span>';
              inner += '<div style="font-size:10px;line-height:1.5;text-align:left;padding:0 2px;opacity:.95;">' +
                he(e.q.tour.shortLabel)+' '+e.nightLabel+revLabel+' '+gnoHtml + '</div>';
            });
          }
          html += '<td title="'+he(cellTitle)+'" style="'+dayStyle+'">'+inner+'</td>';
          col++;
          if (col%7===0 && day<daysInMonth) html += '</tr><tr>';
        }
        while (col%7!==0) { html += '<td></td>'; col++; }
        html += '</tr></tbody></table></div>';
      });
      html += '</div>';
      return html;
    }

    function renderTable(d) {
      if (!d.qualified.length) return '<div style="text-align:center;padding:32px;color:#bbb;">目前無符合條件的行程</div>';
      var sorted = d.qualified.slice().sort(function(a,b){ return a.depDate<b.depDate?-1:a.depDate>b.depDate?1:0; });
      var rows = sorted.map(function(q) {
        var r = q.row;
        var statusBadge = q.status==='formed'
          ? '<span style="background:#2e7d32;color:#fff;border-radius:4px;padding:2px 8px;font-size:12px;font-weight:700;">✓ 已成團</span>'
          : '<span style="background:#1565c0;color:#fff;border-radius:4px;padding:2px 8px;font-size:12px;font-weight:700;">⚡ 快成團</span>';
        var stayConflict = q.stayDates.some(function(sd){ return d.dateMap[sd]&&d.dateMap[sd].length>1; });
        var rowBg = stayConflict ? '#fff3e0' : (q.isReversed ? '#f3e5f5' : '');
        var saved = '';
        try { saved = localStorage.getItem('erp_v3_note_' + r.groupNo) || ''; } catch(e) {}
        var inpStyle = 'width:100%;box-sizing:border-box;border:1px solid '+(saved?'#ffc107':'#ddd')+';border-radius:5px;padding:4px 8px;font-size:13px;color:#444;background:'+(saved?'#fff8e1':'#fafafa')+';font-family:inherit;outline:none;';

        // 倒走按鈕（只有有 reversedOffsets 的行程才顯示）
        var revBtn = '';
        if (q.tour.reversedOffsets) {
          if (q.isReversed) {
            revBtn = '<button onclick="window.toggleReversed(\'' + he(r.groupNo) + '\')" ' +
              'style="margin-top:4px;width:100%;padding:3px 8px;background:#6a1b9a;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:12px;font-weight:700;">↩️ 還原正走（第1,2天）</button>';
          } else {
            revBtn = '<button onclick="window.toggleReversed(\'' + he(r.groupNo) + '\')" ' +
              'style="margin-top:4px;width:100%;padding:3px 8px;background:#fff;color:#6a1b9a;border:1px solid #6a1b9a;border-radius:4px;cursor:pointer;font-size:12px;font-weight:700;">🔄 標記為倒走（第4,5天）</button>';
          }
        }

        var revBadge = q.isReversed ? '<span style="background:#6a1b9a;color:#fff;border-radius:4px;padding:1px 6px;font-size:11px;margin-left:6px;">🔄倒走</span>' : '';

        return '<tr style="background:'+rowBg+';">' +
          '<td style="font-family:monospace;font-size:12px;white-space:nowrap;">' + he(r.groupNo) + '</td>' +
          '<td style="font-size:12px;color:'+q.tour.color+';font-weight:600;">' + he(q.tour.shortLabel) + revBadge + '</td>' +
          '<td style="font-weight:700;color:#1558d6;text-align:center;">' + he(r.airline) + '</td>' +
          '<td style="text-align:center;">' + q.depDate + '</td>' +
          '<td>' + q.stayDates.map(function(sd,i){
            var isC = d.dateMap[sd]&&d.dateMap[sd].length>1;
            return '<span style="'+(isC?'color:#c62828;font-weight:800;':'color:#333;')+'">'+sd+'('+nightLabel(q.offsets[i])+')'+(isC?' ⚠️':'')+'</span>';
          }).join('<br>') + '</td>' +
          '<td style="text-align:center;">' + statusBadge + '</td>' +
          '<td style="text-align:center;color:#1565c0;font-weight:600;">' + r.hk + '</td>' +
          '<td style="text-align:center;color:#2e7d32;font-weight:600;">' + r.kk + '</td>' +
          '<td style="text-align:center;color:'+(r.available<0?'#c62828':'#333')+';font-weight:600;">' + r.available + '</td>' +
          '<td>' +
            '<input class="__erp_v3_note" data-gno="'+he(r.groupNo)+'" value="'+he(saved)+'" placeholder="備註…" style="'+inpStyle+'">' +
            revBtn +
          '</td>' +
          '</tr>';
      }).join('');
      return '<table style="width:100%;border-collapse:collapse;background:white;border-radius:10px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.12);">' +
        '<thead><tr>' +
        '<th>團號</th><th>行程類型</th><th>航空</th><th>出發日</th>' +
        '<th>民宿入住日</th><th>狀態</th><th>HK</th><th>KK</th><th>可賣</th>' +
        '<th style="min-width:220px;">備註 ／ 倒走設定</th>' +
        '</tr></thead><tbody>' + rows + '</tbody></table>';
    }

    // ── 儲存備註 / 下載函式 ────────────────────────────────────
    var saveFn =
      '(function(){' +
        'document.querySelectorAll(".__erp_v3_note").forEach(function(i){' +
          'var v=i.value.trim();' +
          'if(v){localStorage.setItem("erp_v3_note_"+i.dataset.gno,v);}' +
          'else{localStorage.removeItem("erp_v3_note_"+i.dataset.gno);}' +
          'i.style.background=v?"#fff8e1":"#fafafa";' +
          'i.style.borderColor=v?"#ffc107":"#ddd";' +
        '});' +
        'var ok=document.getElementById("__v3_save_ok");' +
        'if(ok){ok.style.opacity="1";setTimeout(function(){ok.style.opacity="0";},2200);}' +
      '})()';
    var dlFn =
      '(function(){' +
        'document.querySelectorAll(".__erp_v3_note").forEach(function(i){i.setAttribute("value",i.value);});' +
        'if(window.opener){window.opener.postMessage({type:"erpDl3",html:document.documentElement.outerHTML,name:"緩慢瑞萃衝突_' + now.slice(0,10) + '.html"},"*");}' +
      '})()';

    // ── CSS ──────────────────────────────────────────────────────
    var css =
      'body{font-family:Segoe UI,system-ui,sans-serif;background:#f0f2f5;color:#222;margin:0;}' +
      'header{background:linear-gradient(135deg,#4a0e8f,#1a237e);color:white;padding:24px 32px;position:relative;}' +
      'header h1{font-size:20px;font-weight:700;margin:0 0 6px;}' +
      '.meta{font-size:13px;color:rgba(255,255,255,.65);}' +
      '.container{max-width:1500px;margin:0 auto;padding:24px 32px;}' +
      '.section-title{font-size:16px;font-weight:700;color:#1a3a5c;margin:28px 0 12px;display:flex;align-items:center;gap:8px;}' +
      '.stats{display:flex;gap:16px;margin-bottom:4px;flex-wrap:wrap;}' +
      '.stat-card{background:#fff;border-radius:10px;padding:14px 22px;box-shadow:0 1px 4px rgba(0,0,0,.1);min-width:130px;text-align:center;}' +
      '.stat-num{font-size:28px;font-weight:800;}' +
      '.stat-lbl{font-size:12px;color:#888;margin-top:2px;}' +
      'table thead th{background:#1a3a5c;color:white;padding:10px 14px;text-align:left;font-size:13px;font-weight:600;white-space:nowrap;}' +
      'table tbody tr:nth-child(even){background:#f9fafb;}' +
      'table tbody tr:hover{filter:brightness(.97);}' +
      'table tbody td{padding:8px 14px;font-size:13px;border-bottom:1px solid #f0f0f0;vertical-align:middle;}' +
      '.legend{display:flex;gap:14px;flex-wrap:wrap;font-size:12px;margin-top:8px;}' +
      '.legend-item{display:flex;align-items:center;gap:6px;}' +
      '.legend-dot{width:14px;height:14px;border-radius:50%;}';

    // ── client-side script（即時重算）────────────────────────────
    var toursJSON = JSON.stringify(TOURS.map(function(t){
      return { keyword:t.keyword, shortLabel:t.shortLabel, stayOffsets:t.stayOffsets,
               reversedOffsets:t.reversedOffsets||null, color:t.color };
    }));
    var rowsJSON = JSON.stringify(slimRows);
    var calJSON  = JSON.stringify(calMonths);
    var todayTS  = today.getTime();

    var clientScript =
      '(function(){' +
      'var _rows=' + rowsJSON + ';' +
      'var _TOURS=' + toursJSON + ';' +
      'var _calMonths=' + calJSON + ';' +
      'var _today=new Date(' + todayTS + ');' +
      'function he(s){return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");}' +
      'function addDays(d,n){var x=new Date(d.getTime());x.setDate(x.getDate()+n);return x;}' +
      'function fmtDate(d){var m=d.getMonth()+1,dd=d.getDate();return d.getFullYear()+"/"+(m<10?"0":"")+m+"/"+(dd<10?"0":"")+dd;}' +
      'function nightLabel(o){return "D"+(o+1);}' +
      'function departureDateObj(gno){' +
        'var g=gno.split(" ")[0];if(g.length<7)return null;' +
        'var yr=2000+parseInt(g.slice(0,2),10),mc=g[4],day=parseInt(g.slice(5,7),10),mo;' +
        'if(mc>="1"&&mc<="9")mo=parseInt(mc,10);' +
        'else if(mc==="O")mo=10;else if(mc==="N")mo=11;else if(mc==="D")mo=12;else return null;' +
        'if(isNaN(day)||day<1||day>31)return null;return new Date(yr,mo-1,day);' +
      '}' +
      'function matchTour(name){for(var i=0;i<_TOURS.length;i++){if(name.indexOf(_TOURS[i].keyword)>=0)return _TOURS[i];}return null;}' +
      'function isFormed(r){return r.remark.indexOf("成團")>=0;}' +
      'function isForming(r){return r.kk>=10&&r.remark.indexOf("成團")<0&&r.orderType!=="NJ"&&r.orderType.indexOf("TKT")<0;}' +
      'function getIsReversed(gno){try{return !!localStorage.getItem("erp_v3_rev_"+gno);}catch(e){return false;}}' +
      'function buildData(){' +
        'var qualified=[];' +
        '_rows.forEach(function(r){' +
          'var tour=matchTour(r.teamName);if(!tour)return;' +
          'if(!isFormed(r)&&!isForming(r))return;' +
          'var dep=departureDateObj(r.groupNo);if(!dep)return;' +
          'var rev=tour.reversedOffsets&&getIsReversed(r.groupNo);' +
          'var offsets=rev?tour.reversedOffsets:tour.stayOffsets;' +
          'var stayDates=offsets.map(function(o){return fmtDate(addDays(dep,o));});' +
          'qualified.push({row:r,tour:tour,status:isFormed(r)?"formed":"forming",depDate:fmtDate(dep),stayDates:stayDates,offsets:offsets,isReversed:!!rev});' +
        '});' +
        'var dateMap={};' +
        'qualified.forEach(function(q){' +
          'q.stayDates.forEach(function(sd,i){' +
            'if(!dateMap[sd])dateMap[sd]=[];' +
            'dateMap[sd].push({q:q,nightLabel:nightLabel(q.offsets[i])});' +
          '});' +
        '});' +
        'var conflictDates=Object.keys(dateMap).filter(function(d){return dateMap[d].length>1;}).sort();' +
        'return {qualified:qualified,dateMap:dateMap,conflictDates:conflictDates};' +
      '}' +
      'function renderStats(d){' +
        'var fc=d.qualified.filter(function(q){return q.status==="formed";}).length;' +
        'var mc=d.qualified.filter(function(q){return q.status==="forming";}).length;' +
        'var cc=d.conflictDates.length;' +
        'var rc=d.qualified.filter(function(q){return q.isReversed;}).length;' +
        'return "<div class=\\"stats\\">" +' +
          '"<div class=\\"stat-card\\"><div class=\\"stat-num\\" style=\\"color:#2e7d32;\\">"+fc+"</div><div class=\\"stat-lbl\\">已成團</div></div>" +' +
          '"<div class=\\"stat-card\\"><div class=\\"stat-num\\" style=\\"color:#1565c0;\\">"+mc+"</div><div class=\\"stat-lbl\\">快成團（KK≥10）</div></div>" +' +
          '"<div class=\\"stat-card\\"><div class=\\"stat-num\\" style=\\"color:"+(cc?"#c62828":"#2e7d32")+";\\">"+cc+"</div><div class=\\"stat-lbl\\">衝突日數</div></div>" +' +
          '"<div class=\\"stat-card\\"><div class=\\"stat-num\\" style=\\"color:#6a1b9a;\\">"+rc+"</div><div class=\\"stat-lbl\\">倒走標記</div></div>" +' +
          '"</div>";' +
      '}' +
      'function renderConflicts(d){' +
        'if(!d.conflictDates.length)return "<div style=\\"background:#e8f5e9;border-left:4px solid #43a047;border-radius:8px;padding:16px 20px;color:#2e7d32;font-weight:600;\\">✅ 目前無入住日期衝突</div>";' +
        'var html="";' +
        'd.conflictDates.forEach(function(dt){' +
          'var entries=d.dateMap[dt];' +
          'html+="<div style=\\"background:#ffebee;border-left:4px solid #c62828;border-radius:8px;padding:14px 20px;margin-bottom:10px;\\">" +' +
            '"<div style=\\"font-weight:800;font-size:15px;color:#c62828;margin-bottom:8px;\\">⚠️ "+dt+"</div>" +' +
            '"<div style=\\"display:flex;flex-wrap:wrap;gap:8px;\\">";' +
          'entries.forEach(function(e){' +
            'var bg=e.q.status==="formed"?"#c62828":"#1565c0";' +
            'var rt=e.q.isReversed?" 🔄":"";' +
            'html+="<span style=\\"background:"+bg+";color:#fff;border-radius:6px;padding:4px 10px;font-size:13px;font-weight:600;\\">"+' +
              'he(e.q.tour.shortLabel)+rt+"・"+e.nightLabel+"&nbsp;&nbsp;"+he(e.q.row.groupNo)+"&nbsp;"+(e.q.status==="formed"?"✓已成團":"⚡快成團")+"</span>";' +
          '});' +
          'html+="</div></div>";' +
        '});' +
        'return html;' +
      '}' +
      'function renderCalendar(d){' +
        'var wds=["日","一","二","三","四","五","六"];' +
        'var html="<div style=\\"display:flex;flex-direction:column;gap:24px;\\">";' +
        '_calMonths.forEach(function(cm){' +
          'var firstDay=new Date(cm.year,cm.month,1).getDay();' +
          'var dim=new Date(cm.year,cm.month+1,0).getDate();' +
          'html+="<div style=\\"background:#fff;border-radius:12px;padding:20px 24px;box-shadow:0 1px 4px rgba(0,0,0,.1);width:100%;box-sizing:border-box;\\">" +' +
            '"<div style=\\"text-align:center;font-weight:700;font-size:15px;margin-bottom:12px;color:#1a3a5c;\\">"+cm.year+"年"+(cm.month+1)+"月</div>" +' +
            '"<table style=\\"width:100%;border-collapse:collapse;table-layout:fixed;\\"><thead><tr>";' +
          'wds.forEach(function(wd,wi){' +
            'var wc=wi===0?"#c62828":wi===6?"#1565c0":"#444";' +
            'html+="<th style=\\"text-align:center;font-size:12px;padding:6px 0;color:"+wc+";background:#eef1f7;border-bottom:2px solid #d0d7e8;\\">"+wd+"</th>";' +
          '});' +
          'html+="</tr></thead><tbody><tr>";' +
          'for(var di=0;di<firstDay;di++)html+="<td></td>";' +
          'var col=firstDay;' +
          'for(var day=1;day<=dim;day++){' +
            'var mm=cm.month+1,ds=cm.year+"/"+(mm<10?"0":"")+mm+"/"+(day<10?"0":"")+day;' +
            'var entries=d.dateMap[ds]||[];' +
            'var isC=entries.length>1,hasO=entries.length>0;' +
            'var allF=hasO&&entries.every(function(e){return e.q.status==="formed";});' +
            'var hasR=hasO&&entries.some(function(e){return e.q.isReversed;});' +
            'var cellBg="transparent",cellColor="#333",cellTitle="";' +
            'if(isC){cellBg="#c62828";cellColor="#fff";cellTitle=entries.map(function(e){return e.q.tour.shortLabel+(e.q.isReversed?"🔄":"")+"("+e.nightLabel+") "+e.q.row.groupNo;}).join("\\n");}' +
            'else if(allF){cellBg="#2e7d32";cellColor="#fff";cellTitle=entries[0].q.tour.shortLabel+(entries[0].q.isReversed?"🔄":"")+"("+entries[0].nightLabel+") "+entries[0].q.row.groupNo;}' +
            'else if(hasO){cellBg="#1565c0";cellColor="#fff";cellTitle=entries[0].q.tour.shortLabel+(entries[0].q.isReversed?"🔄":"")+"("+entries[0].nightLabel+") "+entries[0].q.row.groupNo;}' +
            'var isTod=(cm.year===_today.getFullYear()&&cm.month===_today.getMonth()&&day===_today.getDate());' +
            'var ds2="vertical-align:top;padding:4px 2px;border-radius:6px;cursor:default;background:"+cellBg+";color:"+cellColor+";";' +
            'var inner2;' +
            'if(!hasO){inner2="<div style=\\"font-size:12px;text-align:center;"+(isTod?"font-weight:800;text-decoration:underline;":"")+"\\">" +day+"</div>";}' +
            'else{' +
              'inner2="<div style=\\"font-size:14px;font-weight:800;text-align:center;margin-bottom:3px;\\">"+day+(isC?" ⚠️":"")+"</div>";' +
              'entries.forEach(function(e){' +
                'var gno2=e.q.row.groupNo.split(" ")[0];' +
                'var canT=!!e.q.tour.reversedOffsets;' +
                'var rvL=e.q.isReversed?"&nbsp;<span style=\\"background:rgba(255,255,255,.25);border-radius:3px;padding:0 3px;font-size:9px;\\">倒走</span>":"";' +
                'var gnoH=canT' +
                  '?"<span onclick=\\"window.toggleReversed(\'"+he(e.q.row.groupNo)+"\')\\" style=\\"font-family:monospace;font-size:10px;cursor:pointer;border-bottom:1px dotted rgba(255,255,255,.7);\\" title=\\"點此切換倒走\\">"+he(gno2)+(e.q.isReversed?" ↩️":" 🔄")+"</span>"' +
                  ':"<span style=\\"font-family:monospace;font-size:10px;\\">"+he(gno2)+"</span>";' +
                'inner2+="<div style=\\"font-size:10px;line-height:1.5;text-align:left;padding:0 2px;opacity:.95;\\">" +' +
                  'he(e.q.tour.shortLabel)+" "+e.nightLabel+rvL+" "+gnoH+"</div>";' +
              '});' +
            '}' +
            'html+="<td title=\\""+he(cellTitle)+"\\" style=\\""+ds2+"\\">"+inner2+"</td>";' +
            'col++;' +
            'if(col%7===0&&day<dim)html+="</tr><tr>";' +
          '}' +
          'while(col%7!==0){html+="<td></td>";col++;}' +
          'html+="</tr></tbody></table></div>";' +
        '});' +
        'html+="</div>";return html;' +
      '}' +
      'function renderTable(d){' +
        'if(!d.qualified.length)return "<div style=\\"text-align:center;padding:32px;color:#bbb;\\">目前無符合條件的行程</div>";' +
        'var sorted=d.qualified.slice().sort(function(a,b){return a.depDate<b.depDate?-1:a.depDate>b.depDate?1:0;});' +
        'var rows=sorted.map(function(q){' +
          'var r=q.row;' +
          'var sb=q.status==="formed"' +
            '?"<span style=\\"background:#2e7d32;color:#fff;border-radius:4px;padding:2px 8px;font-size:12px;font-weight:700;\\">✓ 已成團</span>"' +
            ':"<span style=\\"background:#1565c0;color:#fff;border-radius:4px;padding:2px 8px;font-size:12px;font-weight:700;\\">⚡ 快成團</span>";' +
          'var stayC=q.stayDates.some(function(sd){return d.dateMap[sd]&&d.dateMap[sd].length>1;});' +
          'var rowBg=stayC?"#fff3e0":(q.isReversed?"#f3e5f5":"");' +
          'var saved="";try{saved=localStorage.getItem("erp_v3_note_"+r.groupNo)||"";}catch(e){}' +
          'var inp="<input class=\\"__erp_v3_note\\" data-gno=\\""+he(r.groupNo)+"\\" value=\\""+he(saved)+"\\" placeholder=\\"備註…\\" style=\\"width:100%;box-sizing:border-box;border:1px solid "+(saved?"#ffc107":"#ddd")+";border-radius:5px;padding:4px 8px;font-size:13px;color:#444;background:"+(saved?"#fff8e1":"#fafafa")+";font-family:inherit;outline:none;\\">";' +
          'var revBtn="";' +
          'if(q.tour.reversedOffsets){' +
            'if(q.isReversed){revBtn="<button onclick=\\"window.toggleReversed(\'"+he(r.groupNo)+"\')\\" style=\\"margin-top:4px;width:100%;padding:3px 8px;background:#6a1b9a;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:12px;font-weight:700;\\">↩️ 還原正走（第1,2天）</button>";}' +
            'else{revBtn="<button onclick=\\"window.toggleReversed(\'"+he(r.groupNo)+"\')\\" style=\\"margin-top:4px;width:100%;padding:3px 8px;background:#fff;color:#6a1b9a;border:1px solid #6a1b9a;border-radius:4px;cursor:pointer;font-size:12px;font-weight:700;\\">🔄 標記為倒走（第4,5天）</button>";}' +
          '}' +
          'var rb=q.isReversed?"<span style=\\"background:#6a1b9a;color:#fff;border-radius:4px;padding:1px 6px;font-size:11px;margin-left:6px;\\">🔄倒走</span>":"";' +
          'var stays=q.stayDates.map(function(sd,i){' +
            'var isC2=d.dateMap[sd]&&d.dateMap[sd].length>1;' +
            'return "<span style=\\""+(isC2?"color:#c62828;font-weight:800;":"color:#333;")+"\\">" +sd+"("+nightLabel(q.offsets[i])+")"+(isC2?" ⚠️":"")+"</span>";' +
          '}).join("<br>");' +
          'return "<tr style=\\"background:"+rowBg+";\\">" +' +
            '"<td style=\\"font-family:monospace;font-size:12px;white-space:nowrap;\\">"+he(r.groupNo)+"</td>" +' +
            '"<td style=\\"font-size:12px;color:"+q.tour.color+";font-weight:600;\\">"+he(q.tour.shortLabel)+rb+"</td>" +' +
            '"<td style=\\"font-weight:700;color:#1558d6;text-align:center;\\">"+he(r.airline)+"</td>" +' +
            '"<td style=\\"text-align:center;\\">"+q.depDate+"</td>" +' +
            '"<td>"+stays+"</td>" +' +
            '"<td style=\\"text-align:center;\\">"+sb+"</td>" +' +
            '"<td style=\\"text-align:center;color:#1565c0;font-weight:600;\\">"+r.hk+"</td>" +' +
            '"<td style=\\"text-align:center;color:#2e7d32;font-weight:600;\\">"+r.kk+"</td>" +' +
            '"<td style=\\"text-align:center;color:"+(r.available<0?"#c62828":"#333")+";font-weight:600;\\">"+r.available+"</td>" +' +
            '"<td>"+inp+revBtn+"</td>" +' +
            '"</tr>";' +
        '}).join("");' +
        'return "<table style=\\"width:100%;border-collapse:collapse;background:white;border-radius:10px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.12);\\">" +' +
          '"<thead><tr>" +' +
          '"<th>團號</th><th>行程類型</th><th>航空</th><th>出發日</th>" +' +
          '"<th>民宿入住日</th><th>狀態</th><th>HK</th><th>KK</th><th>可賣</th>" +' +
          '"<th style=\\"min-width:220px;\\">備註 ／ 倒走設定</th>" +' +
          '"</tr></thead><tbody>"+rows+"</tbody></table>";' +
      '}' +
      'function rebuildUI(){' +
        'var d=buildData();' +
        'var s=document.getElementById("_stats");if(s)s.innerHTML=renderStats(d);' +
        'var c=document.getElementById("_conflicts");if(c)c.innerHTML=renderConflicts(d);' +
        'var cal=document.getElementById("_calendar");if(cal)cal.innerHTML=renderCalendar(d);' +
        'var t=document.getElementById("_table");if(t)t.innerHTML=renderTable(d);' +
      '}' +
      'window.toggleReversed=function(gno){' +
        'if(getIsReversed(gno))localStorage.removeItem("erp_v3_rev_"+gno);' +
        'else localStorage.setItem("erp_v3_rev_"+gno,"1");' +
        'rebuildUI();' +
      '};' +
      '})();';

    // ── 組合最終 HTML ──────────────────────────────────────────
    return '<!DOCTYPE html><html lang="zh-TW"><head>' +
      '<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<title>緩慢瑞萃衝突警報 ' + now.slice(0,10) + '</title>' +
      '<style>' + css + '</style></head><body>' +

      '<header>' +
      '<h1>🏠 緩慢瑞萃民宿 入住衝突警報</h1>' +
      '<div class="meta">分析時間：' + now + '　掃描 ' + allRows.length + ' 筆團資料</div>' +
      '<button onclick="' + dlFn + '" style="position:absolute;top:24px;right:32px;padding:7px 20px;background:rgba(255,255,255,.15);color:white;border:1px solid rgba(255,255,255,.4);border-radius:7px;cursor:pointer;font-size:13px;font-weight:600;">⬇ 下載 HTML</button>' +
      '</header>' +

      '<div class="container">' +

      '<div id="_stats">' + renderStats(D) + '</div>' +

      '<div class="legend">' +
      '<div class="legend-item"><div class="legend-dot" style="background:#c62828;"></div>衝突（多團同一天）</div>' +
      '<div class="legend-item"><div class="legend-dot" style="background:#2e7d32;"></div>已成團（無衝突）</div>' +
      '<div class="legend-item"><div class="legend-dot" style="background:#1565c0;"></div>快成團（無衝突）</div>' +
      '<div class="legend-item"><div class="legend-dot" style="background:#6a1b9a;"></div>倒走標記（月曆顯示 🔄）</div>' +
      '</div>' +

      '<div class="section-title">⚠️ 衝突警示</div>' +
      '<div id="_conflicts">' + renderConflicts(D) + '</div>' +

      '<div class="section-title">📅 民宿入住月曆</div>' +
      '<div id="_calendar">' + renderCalendar(D) + '</div>' +

      '<div class="section-title">📋 符合行程清單（已成團 + 快成團）</div>' +
      '<div id="_table">' + renderTable(D) + '</div>' +

      '<div style="margin-top:16px;display:flex;align-items:center;justify-content:flex-end;gap:12px;">' +
      '<span id="__v3_save_ok" style="font-size:12px;color:#43a047;opacity:0;transition:opacity .3s;">✓ 已儲存</span>' +
      '<button onclick="' + saveFn + '" style="padding:8px 24px;background:#43a047;color:white;border:none;border-radius:7px;cursor:pointer;font-size:14px;font-weight:600;">💾 儲存所有備註</button>' +
      '</div>' +

      '</div>' +
      '<script>' + clientScript + '<\/script>' +
      '</body></html>';
  }

})();
