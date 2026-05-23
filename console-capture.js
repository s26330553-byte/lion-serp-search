// ============================================================
// ERP SearchList 資料擷取腳本（Fetch 翻頁版）
// ============================================================
// 使用方式：
//   1. 在 ERP SearchList 頁面按 F12 → Console
//   2. 輸入 allow pasting 按 Enter（只需一次）
//   3. 貼入本腳本，按 Enter 執行
//   4. 自動逐頁擷取，完成後下載 erp-snapshot-YYYY-MM-DD.json
//
// 原理：
//   透過 fetch() 直接 POST 到 SearchList，每次改 PageIndex 取得下一頁
//   HTML，在瀏覽器內解析，不需要重載頁面，也不需要 CDP / Playwright
// ============================================================

// ── 欄位索引（每列直接 <td> 的位置，由 debug 確認）──────────────
const IDX = {
  groupNo:    2,   // 團號（取第一行）
  airline:    3,   // 航空公司
  remark:     10,  // 團控說明
  totalSeats: 11,  // 團位
  hl:         13,  // HL
  hk:         16,  // HK（確認：BRA=37, BRG=21）
  kk:         17,  // KK（確認：BRG=2）
  reserved:   18,  // 保留
  available:  19,  // 可賣（確認：BRA=37, BRG=21）
  join:       20,  // JOIN
};

const MIN_CELLS = 20;

// ── 工具函式 ─────────────────────────────────────────────────
const sleep = ms => new Promise(r => setTimeout(r, ms));

function isValidGroupNo(text) {
  // 月份可能是數字（1-9月：523, 601）或字母（10月以後：O01, N15, D25）
  return /^\d{2}[A-Z]{2}[A-Z\d]{3}[A-Z]{2}/.test(text);
}

// ── 從任意 Document 物件擷取資料列 ──────────────────────────────
// 同時支援目前頁面（document）和 fetch 回來的解析 HTML（DOMParser doc）
function extractRowsFromDoc(doc) {
  const tables = [...doc.querySelectorAll('table')];
  const dataTable = tables.reduce((best, t) => {
    const n = t.querySelectorAll(':scope > tbody > tr').length;
    return n > (best?.count || 0) ? { t, count: n } : best;
  }, null)?.t;

  if (!dataTable) return [];

  const result = [];
  for (const tr of dataTable.querySelectorAll(':scope > tbody > tr')) {
    const cells = [...tr.querySelectorAll(':scope > td')];
    if (cells.length < MIN_CELLS) continue;

    // 用 textContent（對 DOMParser doc 和 live doc 都可靠）
    const cellTxt = i => (cells[i]?.textContent || '').replace(/\n/g, ' ').trim();
    const cellInt = i => {
      const n = parseInt((cells[i]?.textContent || '').replace(/,/g, '').trim(), 10);
      return isNaN(n) ? 0 : n;
    };

    // 團號取第一行（去除 "T\n   \n聯結" 等附加文字）
    // 注意：textContent 開頭可能有 \n，要先 trim() 再 split
    const grp = (cells[IDX.groupNo]?.textContent || '').trim().split('\n')[0].trim();
    if (!isValidGroupNo(grp)) continue;

    result.push({
      groupNo:    grp,
      airline:    cellTxt(IDX.airline),
      remark:     cellTxt(IDX.remark),
      totalSeats: cellInt(IDX.totalSeats),
      hl:         cellInt(IDX.hl),
      hk:         cellInt(IDX.hk),
      kk:         cellInt(IDX.kk),
      reserved:   cellInt(IDX.reserved),
      available:  cellInt(IDX.available),
      join:       cellInt(IDX.join),
    });
  }
  return result;
}

// ── Fetch 指定頁的 HTML（不重載目前頁面）─────────────────────────
// prevDoc: 上一次 fetch 回來的 parsed Document（用來取最新的 ViewState 等隱藏欄位）
// 首次傳 null → 直接用目前頁面的表單
async function fetchPageHtml(pageIndex, prevDoc) {
  const form = document.querySelector('form#SearchListForm');
  if (!form) throw new Error('找不到表單 SearchListForm');

  // 以目前表單為基礎建立 FormData
  const formData = new FormData(form);

  // 若有上一頁的回應 HTML，用裡面最新的隱藏欄位覆蓋（維持 ViewState 鏈）
  if (prevDoc) {
    for (const input of prevDoc.querySelectorAll('input[type="hidden"]')) {
      if (input.name) formData.set(input.name, input.value);
    }
  }

  // 覆蓋目標頁碼
  formData.set('PageIndex', String(pageIndex));

  const res = await fetch(form.action, {
    method:      'POST',
    body:        formData,
    credentials: 'include',   // 帶 session cookie
  });

  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

// ── 主程式 ───────────────────────────────────────────────────
(async () => {
  const pageSelect = document.querySelector('select[id="PageIndex"]');
  if (!pageSelect) {
    console.error('❌ 找不到頁碼選單（PageIndex），請確認 SearchList 頁面已載入');
    return;
  }

  const totalPages = pageSelect.querySelectorAll('option').length;
  const startPage  = parseInt(pageSelect.value, 10);

  console.log(`共 ${totalPages} 頁，從第 ${startPage} 頁開始擷取...`);
  console.log('請勿關閉視窗，擷取中...');

  const allRows = [];
  const parser  = new DOMParser();
  let   prevDoc = null;  // 記住上一頁的 parsed doc，供 ViewState 鏈使用

  // ── 第一頁：直接從目前 document 讀，不需 fetch ─────────────────
  const firstRows = extractRowsFromDoc(document);
  allRows.push(...firstRows);
  console.log(`第 ${String(startPage).padStart(2)} 頁：${firstRows.length} 筆（累計 ${allRows.length} 筆）`);

  // ── 後續頁：逐頁 fetch，每次帶最新 ViewState ─────────────────────
  for (let page = startPage + 1; page <= totalPages; page++) {
    await sleep(1200 + Math.random() * 1500);   // 隨機延遲 1.2 ～ 2.7 秒

    try {
      const html  = await fetchPageHtml(page, prevDoc);
      const doc   = parser.parseFromString(html, 'text/html');
      prevDoc     = doc;  // 保留給下一頁用
      const rows  = extractRowsFromDoc(doc);
      allRows.push(...rows);
      console.log(`第 ${String(page).padStart(2)} 頁：${rows.length} 筆（累計 ${allRows.length} 筆）`);
    } catch (e) {
      console.error(`❌ 第 ${page} 頁擷取失敗：${e.message}`);
      break;
    }
  }

  // ── 統計 ────────────────────────────────────────────────────
  const byAirline = {};
  for (const r of allRows) byAirline[r.airline] = (byAirline[r.airline] || 0) + 1;

  console.log('\n=== 擷取結果 ===');
  console.log(`總計：${allRows.length} 筆`);
  for (const [al, cnt] of Object.entries(byAirline).sort())
    console.log(`  ${al}：${cnt} 筆`);

  // ── 下載 JSON ───────────────────────────────────────────────
  const today  = new Date().toISOString().slice(0, 10);
  const output = {
    capturedAt: new Date().toISOString(),
    totalRows:  allRows.length,
    byAirline,
    rows:       allRows,
  };

  const blob = new Blob([JSON.stringify(output, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;  a.download = `erp-snapshot-${today}.json`;
  document.body.appendChild(a);  a.click();
  document.body.removeChild(a);  URL.revokeObjectURL(url);

  console.log(`\n✓ 已下載：erp-snapshot-${today}.json`);
})();
