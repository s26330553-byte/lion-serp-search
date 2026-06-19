const runBtn   = document.getElementById('run-btn');
const toggle   = document.getElementById('auto-sync-toggle');
const syncStatus = document.getElementById('sync-status');
const lastSyncBox = document.getElementById('last-sync-box');
const lastSyncContent = document.getElementById('last-sync-content');
const evaBtn        = document.getElementById('eva-btn');
const compareBtn    = document.getElementById('compare-btn');
const evaInfo       = document.getElementById('eva-info');
const jxBtn         = document.getElementById('jx-btn');
const jxCompareBtn  = document.getElementById('jx-compare-btn');
const jxInfo        = document.getElementById('jx-info');
const ciBtn         = document.getElementById('ci-btn');
const ciCompareBtn  = document.getElementById('ci-compare-btn');
const ciInfo        = document.getElementById('ci-info');

// 讀取設定與上次同步記錄，並更新各航空狀態
chrome.storage.local.get(['autoSync', 'lastSync',
  'eva_br_data', 'eva_br_time', 'eva_br_count', 'serp_br_data', 'serp_br_time',
  'jx_starlux_data', 'jx_starlux_time', 'jx_starlux_count', 'serp_jx_data', 'serp_jx_time',
  'ci_agent_data', 'ci_agent_time', 'ci_agent_count', 'serp_ci_data', 'serp_ci_time'
], function(data) {
  toggle.checked = !!data.autoSync;
  updateSyncStatus(!!data.autoSync);
  renderLastSync(data.lastSync);
  renderEvaStatus(data);
  renderJxStatus(data);
  renderCiStatus(data);
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

// ── 長榮對照 ──────────────────────────────────────────────────

function renderCiStatus(data) {
  var hasCi   = data.ci_agent_data && data.ci_agent_data.length > 0;
  var hasSerp = data.serp_ci_data  && data.serp_ci_data.length > 0;
  if (hasCi) {
    var lines = ['華航：' + data.ci_agent_count + ' 筆（' + data.ci_agent_time + '）'];
    lines.push(hasSerp ? 'SERP：' + data.serp_ci_data.length + ' 筆（' + data.serp_ci_time + '）' : 'SERP：尚未擷取');
    ciInfo.textContent = lines.join('　');
    ciInfo.className = 'eva-info ' + (hasSerp ? 'ok' : 'warn');
  } else {
    ciInfo.textContent = '尚未擷取華航資料';
    ciInfo.className = 'eva-info';
  }
  ciCompareBtn.disabled = !(hasCi && hasSerp);
}

function renderJxStatus(data) {
  var hasJx   = data.jx_starlux_data && data.jx_starlux_data.length > 0;
  var hasSerp = data.serp_jx_data    && data.serp_jx_data.length > 0;
  if (hasJx) {
    var lines = ['星宇：' + data.jx_starlux_count + ' 筆（' + data.jx_starlux_time + '）'];
    lines.push(hasSerp ? 'SERP：' + data.serp_jx_data.length + ' 筆（' + data.serp_jx_time + '）' : 'SERP：尚未擷取');
    jxInfo.textContent = lines.join('　');
    jxInfo.className = 'eva-info ' + (hasSerp ? 'ok' : 'warn');
  } else {
    jxInfo.textContent = '尚未擷取星宇資料';
    jxInfo.className = 'eva-info';
  }
  jxCompareBtn.disabled = !(hasJx && hasSerp);
}

function renderEvaStatus(data) {
  var hasEva  = data.eva_br_data  && data.eva_br_data.length > 0;
  var hasSerp = data.serp_br_data && data.serp_br_data.length > 0;

  if (hasEva) {
    var lines = [];
    lines.push('長榮：' + data.eva_br_count + ' 筆（' + data.eva_br_time + '）');
    if (hasSerp) lines.push('SERP：' + data.serp_br_data.length + ' 筆（' + data.serp_br_time + '）');
    else lines.push('SERP：尚未擷取');
    evaInfo.textContent = lines.join('　');
    evaInfo.className = 'eva-info ' + (hasSerp ? 'ok' : 'warn');
  } else {
    evaInfo.textContent = '尚未擷取長榮資料';
    evaInfo.className = 'eva-info';
  }
  compareBtn.disabled = !(hasEva && hasSerp);
}

// 擷取長榮資料按鈕
var _evaPoller = null;

evaBtn.addEventListener('click', function() {
  chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
    var tab = tabs[0];
    if (!tab || !tab.url || !tab.url.includes('evaagent.com')) {
      evaInfo.textContent = '⚠ 請先切換到長榮代理商網站查詢結果頁';
      evaInfo.className = 'eva-info warn';
      return;
    }
    // 清除舊進度
    chrome.storage.local.remove('eva_progress');
    evaBtn.disabled = true;
    compareBtn.disabled = true;
    evaBtn.textContent = '擷取中…';
    evaInfo.textContent = '注入腳本中...';
    evaInfo.className = 'eva-info';

    chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: true },
      files:  ['eva-content.js']
      // isolated world（預設）：chrome.storage 可用，DOM 可讀
    }, function() {
      if (chrome.runtime.lastError) {
        evaInfo.textContent = '❌ 注入失敗：' + chrome.runtime.lastError.message;
        evaInfo.className = 'eva-info warn';
        evaBtn.disabled = false;
        evaBtn.textContent = '📥 擷取長榮資料';
        return;
      }
      // 顯示進度條
      var progBar  = document.getElementById('eva-progress-bar');
      var progFill = document.getElementById('eva-progress-fill');
      if (progBar) { progBar.style.display = 'block'; progFill.style.width = '0%'; }

      // 開始輪詢進度（每 600ms 讀一次 storage）
      _evaPoller = setInterval(function() {
        chrome.storage.local.get(['eva_progress', 'eva_br_data', 'eva_br_time', 'eva_br_count', 'serp_br_data', 'serp_br_time'], function(data) {
          var p = data.eva_progress;
          if (p) {
            var pct = p.tot > 0 ? Math.round(p.cur / p.tot * 100) : 0;
            evaInfo.textContent = p.msg + (p.tot > 0 ? '　' + pct + '%' : '');
            evaInfo.className = 'eva-info' + (p.done ? ' ok' : '');
            if (progFill) progFill.style.width = (p.done ? 100 : pct) + '%';
          }
          if (p && p.done) {
            clearInterval(_evaPoller);
            _evaPoller = null;
            evaBtn.disabled = false;
            evaBtn.textContent = '📥 擷取長榮資料';
            if (progBar) setTimeout(function() { progBar.style.display = 'none'; }, 2000);
            renderEvaStatus(data);
          }
        });
      }, 600);
    });
  });
});

// 產生對照報告按鈕
compareBtn.addEventListener('click', function() {
  chrome.storage.local.get(['eva_br_data', 'serp_br_data'], function(data) {
    if (!data.eva_br_data || !data.serp_br_data) return;
    var html = buildCompareReport(data.serp_br_data, data.eva_br_data);
    var blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    var url  = URL.createObjectURL(blob);
    window.open(url);
  });
});

// ── 對照報告 HTML 產生器 ──────────────────────────────────────

function buildCompareReport(serpRows, evaRows) {
  var now = new Date().toLocaleString('zh-TW', { hour12: false });

  // 以 "YYYY/MM/DD|D" 為 key 加總
  function groupBy(rows, dateKey, daysKey, valKey) {
    var map = {};
    rows.forEach(function(r) {
      var k = r[dateKey] + '|' + r[daysKey];
      if (!map[k]) map[k] = { departure: r[dateKey], days: r[daysKey], total: 0, items: [] };
      map[k].total += (r[valKey] || 0);
      map[k].items.push(r);
    });
    return map;
  }

  // SERP 側：自訂加總邏輯
  // - 有成團的日期 → 只算已成團各團的 HK
  // - 全部未成團（共賣池）→ 取一團的 totalSeats 代表池子大小
  var serpMap = {};
  serpRows.forEach(function(r) {
    var k = r.departure + '|' + r.days;
    if (!serpMap[k]) serpMap[k] = { departure: r.departure, days: r.days, total: 0, items: [], hasFormed: false };
    serpMap[k].items.push(r);
    if ((r.remark || '').includes('成團')) serpMap[k].hasFormed = true;
  });
  Object.keys(serpMap).forEach(function(k) {
    var g = serpMap[k];
    // 優先：備註含半形 *數字 → 直接採用（最可靠，如「*47 回滿」）
    var starNum = null;
    g.items.forEach(function(r) {
      var m = (r.remark||'').match(/\*(\d+)/);
      if (m) starNum = parseInt(m[1], 10);
    });
    if (starNum !== null) {
      g.total = starNum;
    } else {
      // 先過濾掉：員工團（共用主團機位）、備註含全形＊（無實際機位）
      var countable = g.items.filter(function(r) {
        return !(r.teamName||'').includes('員工') && !(r.remark||'').includes('＊');
      });
      if (g.hasFormed) {
        // 有任一成團 → countable 團的 totalSeats 加總
        g.total = countable.reduce(function(s,r){ return s + (r.totalSeats||0); }, 0);
      } else {
        // 全未成團（共賣）：取第一個 countable 團的 totalSeats 代表池子
        g.total = countable[0] ? (countable[0].totalSeats || 0) : 0;
      }
    }
  });

  var evaMap  = groupBy(evaRows,  'departure', 'days', 'pax');

  // 合併所有 key
  var allKeys = {};
  Object.keys(serpMap).forEach(function(k) { allKeys[k] = true; });
  Object.keys(evaMap).forEach(function(k)  { allKeys[k] = true; });

  var results = Object.keys(allKeys).map(function(k) {
    var s = serpMap[k] || { departure: k.split('|')[0], days: parseInt(k.split('|')[1], 10) || 0, total: 0, items: [] };
    var e = evaMap[k]  || { departure: k.split('|')[0], days: parseInt(k.split('|')[1], 10) || 0, total: 0, items: [] };
    return {
      key:        k,
      departure:  s.departure || e.departure,
      days:       s.days || e.days,
      serpTotal:  s.total,
      evaTotal:   e.total,
      diff:       s.total - e.total,
      serpItems:  s.items,
      evaItems:   e.items
    };
  }).sort(function(a, b) {
    return a.departure.localeCompare(b.departure) || a.days - b.days;
  });

  var mismatch = results.filter(function(r) { return r.diff !== 0; });
  var match    = results.filter(function(r) { return r.diff === 0; });

  function rowHtml(r) {
    var diffStr = r.diff === 0 ? '✅ 相符' :
      (r.diff > 0 ? '⚠ SERP 多 ' + r.diff : '⚠ EVA 多 ' + Math.abs(r.diff));
    var bg = r.diff === 0 ? '#f0fdf4' : '#fff7ed';
    var diffColor = r.diff === 0 ? '#16a34a' : '#c2410c';

    // SERP 各團號
    var serpDetail = r.serpItems.map(function(s) {
      return s.groupNo + '（' + s.totalSeats + '位）';
    }).join('<br>');
    // EVA 各 PNR
    var evaDetail = r.evaItems.map(function(e) {
      return e.pnr + ' ' + (e.flight || '') + '（' + e.pax + '人）';
    }).join('<br>');

    return '<tr style="background:' + bg + ';border-bottom:1px solid #e2e8f0;">' +
      '<td style="padding:8px 10px;white-space:nowrap;font-weight:600;">' + r.departure + '</td>' +
      '<td style="padding:8px 10px;text-align:center;">' + r.days + 'D</td>' +
      '<td style="padding:8px 10px;text-align:center;">' + r.serpTotal + '</td>' +
      '<td style="padding:8px 10px;text-align:center;">' + r.evaTotal + '</td>' +
      '<td style="padding:8px 10px;text-align:center;font-weight:700;color:' + diffColor + ';">' + diffStr + '</td>' +
      '<td style="padding:8px 10px;font-size:11px;color:#475569;">' + serpDetail + '</td>' +
      '<td style="padding:8px 10px;font-size:11px;color:#475569;">' + evaDetail + '</td>' +
      '</tr>';
  }

  var tableHeader =
    '<tr style="background:#334155;color:#fff;">' +
    '<th style="padding:8px 10px;text-align:left;">出發日</th>' +
    '<th style="padding:8px 10px;">天數</th>' +
    '<th style="padding:8px 10px;">SERP 合計</th>' +
    '<th style="padding:8px 10px;">EVA 合計</th>' +
    '<th style="padding:8px 10px;">差異</th>' +
    '<th style="padding:8px 10px;text-align:left;">SERP 各團</th>' +
    '<th style="padding:8px 10px;text-align:left;">EVA 各 PNR</th>' +
    '</tr>';

  var mismatchRows = mismatch.map(rowHtml).join('');
  var matchRows    = match.map(rowHtml).join('');

  return '<!DOCTYPE html><html lang="zh-TW"><head><meta charset="UTF-8">' +
    '<title>BR 機位對照報告</title>' +
    '<style>body{font-family:Segoe UI,system-ui,sans-serif;margin:0;padding:20px;background:#f8fafc;color:#1e293b;}' +
    'h1{font-size:20px;margin:0 0 4px;}' +
    '.meta{font-size:12px;color:#64748b;margin-bottom:20px;}' +
    '.kpi{display:flex;gap:12px;margin-bottom:20px;flex-wrap:wrap;}' +
    '.kpi-card{background:#fff;border-radius:10px;padding:12px 18px;box-shadow:0 1px 4px rgba(0,0,0,.08);min-width:100px;}' +
    '.kpi-card .n{font-size:28px;font-weight:800;}' +
    '.kpi-card .l{font-size:12px;color:#64748b;margin-top:2px;}' +
    '.kpi-card.red .n{color:#dc2626;} .kpi-card.green .n{color:#16a34a;}' +
    'h2{font-size:15px;margin:20px 0 8px;}' +
    'table{width:100%;border-collapse:collapse;background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.08);}' +
    '</style></head><body>' +
    '<h1>✈ BR 機位對照報告</h1>' +
    '<div class="meta">產生時間：' + now + '　SERP ' + serpRows.length + ' 筆 vs. 長榮 ' + evaRows.length + ' 筆</div>' +
    '<div class="kpi">' +
    '<div class="kpi-card red"><div class="n">' + mismatch.length + '</div><div class="l">數量不符</div></div>' +
    '<div class="kpi-card green"><div class="n">' + match.length + '</div><div class="l">數量相符</div></div>' +
    '<div class="kpi-card"><div class="n">' + results.length + '</div><div class="l">總日期組數</div></div>' +
    '</div>' +
    (mismatch.length > 0 ?
      '<h2>⚠ 數量不符（' + mismatch.length + ' 組）</h2>' +
      '<table>' + tableHeader + mismatchRows + '</table>' : '') +
    (match.length > 0 ?
      '<h2>✅ 數量相符（' + match.length + ' 組）</h2>' +
      '<table>' + tableHeader + matchRows + '</table>' : '') +
    '</body></html>';
}

// ── 星宇 JX 對照 ──────────────────────────────────────────────

var _jxPoller = null;

jxBtn.addEventListener('click', function() {
  chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
    var tab = tabs[0];
    if (!tab || !tab.url || !tab.url.includes('starlux-airlines.com')) {
      jxInfo.textContent = '⚠ 請先切換到星宇代理商「我的團體」清單頁';
      jxInfo.className = 'eva-info warn';
      return;
    }
    chrome.storage.local.remove('jx_progress');
    jxBtn.disabled = true;
    jxCompareBtn.disabled = true;
    jxBtn.textContent = '擷取中…';
    jxInfo.textContent = '注入腳本中...';
    jxInfo.className = 'eva-info';

    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files:  ['jx-content.js']
    }, function() {
      if (chrome.runtime.lastError) {
        jxInfo.textContent = '❌ 注入失敗：' + chrome.runtime.lastError.message;
        jxInfo.className = 'eva-info warn';
        jxBtn.disabled = false;
        jxBtn.textContent = '📥 擷取星宇資料';
        return;
      }
      var jxProgBar  = document.getElementById('jx-progress-bar');
      var jxProgFill = document.getElementById('jx-progress-fill');
      if (jxProgBar) { jxProgBar.style.display = 'block'; jxProgFill.style.width = '0%'; }

      _jxPoller = setInterval(function() {
        chrome.storage.local.get(['jx_progress', 'jx_starlux_data', 'jx_starlux_time', 'jx_starlux_count', 'serp_jx_data', 'serp_jx_time'], function(data) {
          var p = data.jx_progress;
          if (p) {
            var pct = p.tot > 0 ? Math.round(p.cur / p.tot * 100) : 0;
            jxInfo.textContent = p.msg + (p.tot > 0 ? '　' + pct + '%' : '');
            jxInfo.className = 'eva-info' + (p.done ? ' ok' : '');
            if (jxProgFill) jxProgFill.style.width = (p.done ? 100 : pct) + '%';
          }
          if (p && p.done) {
            clearInterval(_jxPoller);
            _jxPoller = null;
            jxBtn.disabled = false;
            jxBtn.textContent = '📥 擷取星宇資料';
            if (jxProgBar) setTimeout(function() { jxProgBar.style.display = 'none'; }, 2000);
            renderJxStatus(data);
          }
        });
      }, 600);
    });
  });
});

jxCompareBtn.addEventListener('click', function() {
  chrome.storage.local.get(['serp_jx_data', 'jx_starlux_data'], function(data) {
    if (!data.serp_jx_data || !data.jx_starlux_data) return;
    var html = buildJxCompareReport(data.serp_jx_data, data.jx_starlux_data);
    var blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    window.open(URL.createObjectURL(blob));
  });
});

function buildJxCompareReport(serpRows, starluxRows) {
  var now = new Date().toLocaleString('zh-TW', { hour12: false });

  // 從 teamName 判斷路線（四種）
  function _jxRoute(teamName) {
    var n = teamName || '';
    if (n.includes('函千')) return '函千';
    if (n.includes('千函')) return '千函';
    if (n.includes('函函')) return '函館'; // 純函館來回
    if (n.includes('函館')) return '函館';
    return '千歲'; // 預設純千歲來回
  }

  // SERP JX 側：依 departure+days+route 分組，套用與 BR 相同的機位判斷邏輯
  var serpMap = {};
  serpRows.forEach(function(r) {
    var route = _jxRoute(r.teamName);
    var k = r.departure + '|' + r.days + '|' + route;
    if (!serpMap[k]) serpMap[k] = { departure: r.departure, days: r.days, route: route, total: 0, items: [], hasFormed: false };
    serpMap[k].items.push(r);
    if ((r.remark||'').includes('成團')) serpMap[k].hasFormed = true;
  });
  Object.keys(serpMap).forEach(function(k) {
    var g = serpMap[k];
    var starNum = null;
    g.items.forEach(function(r) {
      var m = (r.remark||'').match(/\*(\d+)/);
      if (m) starNum = parseInt(m[1], 10);
    });
    if (starNum !== null) {
      g.total = starNum;
    } else {
      var countable = g.items.filter(function(r) {
        return !(r.teamName||'').includes('員工') && !(r.remark||'').includes('＊') && !(r.teamName||'').includes('旗艦');
      });
      g.total = g.hasFormed
        ? countable.reduce(function(s,r){ return s + (r.totalSeats||0); }, 0)
        : (countable[0] ? countable[0].totalSeats || 0 : 0);
    }
  });

  // 星宇側：依 departure+days+route 分組，加總 allocation
  var starluxMap = {};
  starluxRows.forEach(function(r) {
    var route = r.route || '千函';
    var k = r.departure + '|' + r.days + '|' + route;
    if (!starluxMap[k]) starluxMap[k] = { departure: r.departure, days: r.days, route: route, total: 0, items: [] };
    starluxMap[k].total += (r.allocation || 0);
    starluxMap[k].items.push(r);
  });

  // 只比對 SERP 有資料的日期（依 SERP 搜尋區間）
  var results = Object.keys(serpMap).map(function(k) {
    var s = serpMap[k];
    var t = starluxMap[k] || { departure: s.departure, days: s.days, route: s.route, total: 0, items: [] };
    return {
      departure: s.departure, days: s.days, route: s.route,
      serpTotal: s.total, starluxTotal: t.total,
      diff: s.total - t.total,
      serpItems: s.items, starluxItems: t.items
    };
  }).sort(function(a,b){ return a.departure.localeCompare(b.departure) || a.days - b.days || a.route.localeCompare(b.route); });

  var mismatch = results.filter(function(r){ return r.diff !== 0; });
  var match    = results.filter(function(r){ return r.diff === 0; });

  function rowHtml(r) {
    var diffStr = r.diff === 0 ? '✅ 相符' : (r.diff > 0 ? '⚠ SERP 多 ' + r.diff : '⚠ 星宇多 ' + Math.abs(r.diff));
    var bg = r.diff === 0 ? '#f0fdf4' : '#fff7ed';
    var diffColor = r.diff === 0 ? '#16a34a' : '#c2410c';
    var routeColor = r.route === '函千' ? '#7c3aed' : r.route === '千函' ? '#0369a1' : r.route === '函館' ? '#b45309' : '#047857';
    var serpDetail = r.serpItems.map(function(s){ return s.groupNo + '（' + s.totalSeats + '位）'; }).join('<br>');
    var jxDetail   = r.starluxItems.map(function(j){ return j.flight + '（' + j.allocation + '席）'; }).join('<br>');
    return '<tr style="background:' + bg + ';border-bottom:1px solid #e2e8f0;">' +
      '<td style="padding:8px 10px;white-space:nowrap;font-weight:600;">' + r.departure + '</td>' +
      '<td style="padding:8px 10px;text-align:center;">' + r.days + 'D</td>' +
      '<td style="padding:8px 10px;text-align:center;font-weight:700;color:' + routeColor + ';">' + r.route + '</td>' +
      '<td style="padding:8px 10px;text-align:center;">' + r.serpTotal + '</td>' +
      '<td style="padding:8px 10px;text-align:center;">' + r.starluxTotal + '</td>' +
      '<td style="padding:8px 10px;text-align:center;font-weight:700;color:' + diffColor + ';">' + diffStr + '</td>' +
      '<td style="padding:8px 10px;font-size:11px;color:#475569;">' + serpDetail + '</td>' +
      '<td style="padding:8px 10px;font-size:11px;color:#475569;">' + jxDetail + '</td>' +
      '</tr>';
  }

  var thead = '<tr style="background:#334155;color:#fff;">' +
    '<th style="padding:8px 10px;text-align:left;">出發日</th><th style="padding:8px 10px;">天數</th>' +
    '<th style="padding:8px 10px;">路線</th>' +
    '<th style="padding:8px 10px;">SERP</th><th style="padding:8px 10px;">星宇</th>' +
    '<th style="padding:8px 10px;">差異</th>' +
    '<th style="padding:8px 10px;text-align:left;">SERP 各團</th>' +
    '<th style="padding:8px 10px;text-align:left;">星宇各案件</th></tr>';

  return '<!DOCTYPE html><html lang="zh-TW"><head><meta charset="UTF-8"><title>JX850 機位對照</title>' +
    '<style>body{font-family:Segoe UI,system-ui,sans-serif;margin:0;padding:20px;background:#f8fafc;color:#1e293b;}' +
    'h1{font-size:20px;margin:0 0 4px;}.meta{font-size:12px;color:#64748b;margin-bottom:20px;}' +
    '.kpi{display:flex;gap:12px;margin-bottom:20px;flex-wrap:wrap;}' +
    '.kpi-card{background:#fff;border-radius:10px;padding:12px 18px;box-shadow:0 1px 4px rgba(0,0,0,.08);min-width:100px;}' +
    '.kpi-card .n{font-size:28px;font-weight:800;}.kpi-card .l{font-size:12px;color:#64748b;margin-top:2px;}' +
    '.kpi-card.red .n{color:#dc2626;}.kpi-card.green .n{color:#16a34a;}' +
    'h2{font-size:15px;margin:20px 0 8px;}' +
    'table{width:100%;border-collapse:collapse;background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.08);}' +
    '</style></head><body>' +
    '<h1>✈ JX850 機位對照報告</h1>' +
    '<div class="meta">產生時間：' + now + '　SERP ' + serpRows.length + ' 筆 vs. 星宇 ' + starluxRows.length + ' 筆</div>' +
    '<div class="kpi">' +
    '<div class="kpi-card red"><div class="n">' + mismatch.length + '</div><div class="l">數量不符</div></div>' +
    '<div class="kpi-card green"><div class="n">' + match.length + '</div><div class="l">數量相符</div></div>' +
    '<div class="kpi-card"><div class="n">' + results.length + '</div><div class="l">總日期組數</div></div>' +
    '</div>' +
    (mismatch.length > 0 ? '<h2>⚠ 數量不符（' + mismatch.length + ' 組）</h2><table>' + thead + mismatch.map(rowHtml).join('') + '</table>' : '') +
    (match.length > 0    ? '<h2>✅ 數量相符（' + match.length + ' 組）</h2><table>' + thead + match.map(rowHtml).join('') + '</table>' : '') +
    '</body></html>';
}

// ── 華航 CI 對照 ──────────────────────────────────────────────

var _ciPoller = null;

ciBtn.addEventListener('click', function() {
  chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
    var tab = tabs[0];
    if (!tab || !tab.url || !tab.url.includes('calec.china-airlines.com')) {
      ciInfo.textContent = '⚠ 請先切換到華航代理商 PNR 清單頁';
      ciInfo.className = 'eva-info warn';
      return;
    }
    chrome.storage.local.remove('ci_progress');
    ciBtn.disabled = true;
    ciCompareBtn.disabled = true;
    ciBtn.textContent = '擷取中…';
    ciInfo.textContent = '注入腳本中...';
    ciInfo.className = 'eva-info';

    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files:  ['ci-content.js']
    }, function() {
      if (chrome.runtime.lastError) {
        ciInfo.textContent = '❌ 注入失敗：' + chrome.runtime.lastError.message;
        ciInfo.className = 'eva-info warn';
        ciBtn.disabled = false;
        ciBtn.textContent = '📥 擷取華航資料';
        return;
      }
      var ciProgBar  = document.getElementById('ci-progress-bar');
      var ciProgFill = document.getElementById('ci-progress-fill');
      if (ciProgBar) { ciProgBar.style.display = 'block'; ciProgFill.style.width = '0%'; }

      _ciPoller = setInterval(function() {
        chrome.storage.local.get(['ci_progress', 'ci_agent_data', 'ci_agent_time', 'ci_agent_count', 'serp_ci_data', 'serp_ci_time'], function(data) {
          var p = data.ci_progress;
          if (p) {
            var pct = p.tot > 0 ? Math.round(p.cur / p.tot * 100) : 0;
            ciInfo.textContent = p.msg + (p.tot > 0 ? '　' + pct + '%' : '');
            ciInfo.className = 'eva-info' + (p.done ? ' ok' : '');
            if (ciProgFill) ciProgFill.style.width = (p.done ? 100 : pct) + '%';
          }
          if (p && p.done) {
            clearInterval(_ciPoller);
            _ciPoller = null;
            ciBtn.disabled = false;
            ciBtn.textContent = '📥 擷取華航資料';
            if (ciProgBar) setTimeout(function() { ciProgBar.style.display = 'none'; }, 2000);
            renderCiStatus(data);
          }
        });
      }, 600);
    });
  });
});

ciCompareBtn.addEventListener('click', function() {
  chrome.storage.local.get(['serp_ci_data', 'ci_agent_data'], function(data) {
    if (!data.serp_ci_data || !data.ci_agent_data) return;
    var html = buildCiCompareReport(data.serp_ci_data, data.ci_agent_data);
    var blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    window.open(URL.createObjectURL(blob));
  });
});

function buildCiCompareReport(serpRows, ciRows) {
  var now = new Date().toLocaleString('zh-TW', { hour12: false });

  // 從 teamName 判斷路線（同 JX）
  function _ciRoute(teamName) {
    var n = teamName || '';
    if (n.includes('函千')) return '函千';
    if (n.includes('千函')) return '千函';
    if (n.includes('函函')) return '函館';
    if (n.includes('函館')) return '函館';
    return '千歲';
  }

  // SERP CI 側：依 departure+days+route 分組，套用相同機位判斷邏輯
  var serpMap = {};
  serpRows.forEach(function(r) {
    var route = _ciRoute(r.teamName);
    var k = r.departure + '|' + r.days + '|' + route;
    if (!serpMap[k]) serpMap[k] = { departure: r.departure, days: r.days, route: route, total: 0, items: [], hasFormed: false };
    serpMap[k].items.push(r);
    if ((r.remark||'').includes('成團')) serpMap[k].hasFormed = true;
  });
  Object.keys(serpMap).forEach(function(k) {
    var g = serpMap[k];
    var starNum = null;
    g.items.forEach(function(r) {
      var m = (r.remark||'').match(/\*(\d+)/);
      if (m) starNum = parseInt(m[1], 10);
    });
    if (starNum !== null) {
      g.total = starNum;
    } else {
      var countable = g.items.filter(function(r) {
        return !(r.teamName||'').includes('員工') && !(r.remark||'').includes('＊') && !(r.teamName||'').includes('旗艦');
      });
      g.total = g.hasFormed
        ? countable.reduce(function(s,r){ return s + (r.totalSeats||0); }, 0)
        : (countable[0] ? countable[0].totalSeats || 0 : 0);
    }
  });

  // 華航代理商側：依 departure+days+route 分組，加總訂位人數
  var ciMap = {};
  ciRows.forEach(function(r) {
    var k = r.departure + '|' + r.days + '|' + r.route;
    if (!ciMap[k]) ciMap[k] = { departure: r.departure, days: r.days, route: r.route, total: 0, items: [] };
    ciMap[k].total += (r.seats || 0);
    ciMap[k].items.push(r);
  });

  // 只比對 SERP 有資料的日期
  var results = Object.keys(serpMap).map(function(k) {
    var s = serpMap[k];
    var t = ciMap[k] || { departure: s.departure, days: s.days, route: s.route, total: 0, items: [] };
    return {
      departure: s.departure, days: s.days, route: s.route,
      serpTotal: s.total, ciTotal: t.total,
      diff: s.total - t.total,
      serpItems: s.items, ciItems: t.items
    };
  }).sort(function(a,b){ return a.departure.localeCompare(b.departure) || a.days - b.days || a.route.localeCompare(b.route); });

  var mismatch = results.filter(function(r){ return r.diff !== 0; });
  var match    = results.filter(function(r){ return r.diff === 0; });

  function routeColor(route) {
    return route === '函千' ? '#7c3aed' : route === '千函' ? '#0369a1' : route === '函館' ? '#b45309' : '#047857';
  }

  function rowHtml(r) {
    var diffStr = r.diff === 0 ? '✅ 相符' : (r.diff > 0 ? '⚠ SERP 多 ' + r.diff : '⚠ 華航多 ' + Math.abs(r.diff));
    var bg = r.diff === 0 ? '#f0fdf4' : '#fff7ed';
    var diffColor = r.diff === 0 ? '#16a34a' : '#c2410c';
    var serpDetail = r.serpItems.map(function(s){ return s.groupNo + '（' + s.totalSeats + '位）'; }).join('<br>');
    var ciDetail   = r.ciItems.map(function(c){ return c.routeText + '（' + c.seats + '席）'; }).join('<br>');
    return '<tr style="background:' + bg + ';border-bottom:1px solid #e2e8f0;">' +
      '<td style="padding:8px 10px;white-space:nowrap;font-weight:600;">' + r.departure + '</td>' +
      '<td style="padding:8px 10px;text-align:center;">' + r.days + 'D</td>' +
      '<td style="padding:8px 10px;text-align:center;font-weight:700;color:' + routeColor(r.route) + ';">' + r.route + '</td>' +
      '<td style="padding:8px 10px;text-align:center;">' + r.serpTotal + '</td>' +
      '<td style="padding:8px 10px;text-align:center;">' + r.ciTotal + '</td>' +
      '<td style="padding:8px 10px;text-align:center;font-weight:700;color:' + diffColor + ';">' + diffStr + '</td>' +
      '<td style="padding:8px 10px;font-size:11px;color:#475569;">' + serpDetail + '</td>' +
      '<td style="padding:8px 10px;font-size:11px;color:#475569;">' + ciDetail + '</td>' +
      '</tr>';
  }

  var thead = '<tr style="background:#334155;color:#fff;">' +
    '<th style="padding:8px 10px;text-align:left;">出發日</th><th style="padding:8px 10px;">天數</th>' +
    '<th style="padding:8px 10px;">路線</th>' +
    '<th style="padding:8px 10px;">SERP</th><th style="padding:8px 10px;">華航</th>' +
    '<th style="padding:8px 10px;">差異</th>' +
    '<th style="padding:8px 10px;text-align:left;">SERP 各團</th>' +
    '<th style="padding:8px 10px;text-align:left;">華航各 PNR</th></tr>';

  return '<!DOCTYPE html><html lang="zh-TW"><head><meta charset="UTF-8"><title>CI 機位對照</title>' +
    '<style>body{font-family:Segoe UI,system-ui,sans-serif;margin:0;padding:20px;background:#f8fafc;color:#1e293b;}' +
    'h1{font-size:20px;margin:0 0 4px;}.meta{font-size:12px;color:#64748b;margin-bottom:20px;}' +
    '.kpi{display:flex;gap:12px;margin-bottom:20px;flex-wrap:wrap;}' +
    '.kpi-card{background:#fff;border-radius:10px;padding:12px 18px;box-shadow:0 1px 4px rgba(0,0,0,.08);min-width:100px;}' +
    '.kpi-card .n{font-size:28px;font-weight:800;}.kpi-card .l{font-size:12px;color:#64748b;margin-top:2px;}' +
    '.kpi-card.red .n{color:#dc2626;}.kpi-card.green .n{color:#16a34a;}' +
    'h2{font-size:15px;margin:20px 0 8px;}' +
    'table{width:100%;border-collapse:collapse;background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.08);}' +
    '</style></head><body>' +
    '<h1>✈ CI 機位對照報告</h1>' +
    '<div class="meta">產生時間：' + now + '　SERP ' + serpRows.length + ' 筆 vs. 華航 ' + ciRows.length + ' 筆</div>' +
    '<div class="kpi">' +
    '<div class="kpi-card red"><div class="n">' + mismatch.length + '</div><div class="l">數量不符</div></div>' +
    '<div class="kpi-card green"><div class="n">' + match.length + '</div><div class="l">數量相符</div></div>' +
    '<div class="kpi-card"><div class="n">' + results.length + '</div><div class="l">總日期組數</div></div>' +
    '</div>' +
    (mismatch.length > 0 ? '<h2>⚠ 數量不符（' + mismatch.length + ' 組）</h2><table>' + thead + mismatch.map(rowHtml).join('') + '</table>' : '') +
    (match.length > 0    ? '<h2>✅ 數量相符（' + match.length + ' 組）</h2><table>' + thead + match.map(rowHtml).join('') + '</table>' : '') +
    '</body></html>';
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
