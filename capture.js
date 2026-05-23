// capture.js — ERP SearchList 資料擷取主程式
// 使用方式：
//   1. 用桌面捷徑「Chrome (ERP)」開啟 Chrome（含 --remote-debugging-port=9222）
//   2. 登入 ERP，開啟 SearchList 頁面，停在第一頁
//   3. node capture.js           → 正常擷取，存 data/latest.json
//   4. node capture.js --debug   → debug 模式，印出第一列所有 cell 內容，不存檔
'use strict';

const { chromium } = require(
  'C:\\Users\\ericlin\\nodejs\\node-v22.15.0-win-x64\\node_modules\\playwright'
);
const fs   = require('fs');
const path = require('path');
const cfg  = require('./config');

const IS_DEBUG = process.argv.includes('--debug');

// ── 工具函式 ────────────────────────────────────────────────────────────────

function randomDelay(min, max) {
  return new Promise(r => setTimeout(r, min + Math.random() * (max - min)));
}

function pad(n) { return String(n).padStart(2, '0'); }

function nowStr() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} `
       + `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

// ── 在頁面內執行：找資料主表並擷取所有列 ────────────────────────────────────
// 此函式會透過 page.evaluate() 注入瀏覽器執行，不能引用外部變數
function _extractRowsInPage() {
  // 找 tr 數量最多的 table（即資料表，約 100 列 / 頁）
  const tables = [...document.querySelectorAll('table')];
  const dataTable = tables.reduce((best, t) => {
    const n = t.querySelectorAll(':scope > tbody > tr').length;
    return n > (best?.count || 0) ? { t, count: n } : best;
  }, null)?.t;

  if (!dataTable) return [];

  const result = [];
  for (const tr of dataTable.querySelectorAll(':scope > tbody > tr')) {
    const cells = [...tr.querySelectorAll(':scope > td')];
    if (cells.length < 20) continue;

    // 團號在 cells[2]，取第一行（去除「T\n   聯結」等附加文字）
    const grp = (cells[2]?.innerText || '').split('\n')[0].trim();
    if (!/^\d{2}[A-Z]{2}\d{3}[A-Z]{2}/.test(grp)) continue;

    const toInt = i => {
      const txt = (cells[i]?.innerText || '').trim().replace(/,/g, '');
      const n = parseInt(txt, 10);
      return isNaN(n) ? 0 : n;
    };
    const toStr = i => (cells[i]?.innerText || '').replace(/\n/g, ' ').trim();

    result.push({
      groupNo:    grp,
      airline:    toStr(3),   // 航空公司
      remark:     toStr(10),  // 團控說明
      totalSeats: toInt(11),  // 團位
      hl:         toInt(13),  // HL
      hk:         toInt(16),  // HK（確認：BRA=37, BRG=21）
      kk:         toInt(17),  // KK（確認：BRG=2）
      reserved:   toInt(18),  // 保留
      available:  toInt(19),  // 可賣（確認：BRA=37, BRG=21）
      join:       toInt(20),  // JOIN
    });
  }
  return result;
}

// ── 在頁面內執行：debug 模式，印出前 3 列 cell 結構 ─────────────────────────
function _extractDebugInPage() {
  const tables = [...document.querySelectorAll('table')];
  const dataTable = tables.reduce((best, t) => {
    const n = t.querySelectorAll(':scope > tbody > tr').length;
    return n > (best?.count || 0) ? { t, count: n } : best;
  }, null)?.t;

  if (!dataTable) return null;

  const trs = [...dataTable.querySelectorAll(':scope > tbody > tr')]
    .filter(tr => tr.querySelectorAll(':scope > td').length >= 10);

  return trs.slice(0, 3).map(tr => {
    const cells = [...tr.querySelectorAll(':scope > td')];
    return cells.map((td, i) => ({
      index: i,
      text: td.innerText.trim().replace(/\n/g, '↵').substring(0, 60),
    }));
  });
}

// ── 主程式 ────────────────────────────────────────────────────────────────────

(async () => {
  console.log(`[${nowStr()}] erp-scraper 啟動${IS_DEBUG ? '（debug 模式）' : ''}`);

  // 1. 連線到現有 Chrome
  let browser;
  try {
    browser = await chromium.connectOverCDP(cfg.CDP_URL);
  } catch (e) {
    console.error(`\n❌ 無法連線到 Chrome（${cfg.CDP_URL}）`);
    console.error('   請確認 Chrome 是用桌面捷徑「Chrome (ERP)」開啟');
    console.error('   錯誤訊息:', e.message);
    process.exit(1);
  }

  // 2. 找到 SearchList 分頁
  let page = null;
  for (const ctx of browser.contexts()) {
    page = ctx.pages().find(p => p.url().includes(cfg.TARGET_URL_KEYWORD));
    if (page) break;
  }

  if (!page) {
    console.error(`❌ 找不到 SearchList 分頁（URL 需包含 "${cfg.TARGET_URL_KEYWORD}"）`);
    for (const ctx of browser.contexts())
      for (const p of ctx.pages())
        console.error('   目前分頁:', p.url());
    await browser.close();
    process.exit(1);
  }

  console.log(`✓ 找到 SearchList 分頁：${page.url()}`);

  // 等表格載入
  try {
    await page.waitForSelector('table', { timeout: cfg.PAGE_LOAD_TIMEOUT });
  } catch {
    console.error('❌ 等待表格逾時，請確認頁面已正確顯示資料');
    await browser.close();
    process.exit(1);
  }

  // ── Debug 模式 ──────────────────────────────────────────────────────────
  if (IS_DEBUG) {
    const debugData = await page.evaluate(_extractDebugInPage);
    if (!debugData || debugData.length === 0) {
      console.error('❌ 找不到資料列');
    } else {
      for (let r = 0; r < debugData.length; r++) {
        console.log(`\n=== 第 ${r + 1} 列 ===`);
        for (const { index, text } of debugData[r])
          console.log(`  cells[${String(index).padStart(2)}] = "${text}"`);
      }
    }
    await browser.close();
    process.exit(0);
  }

  // ── 正式擷取：翻頁迴圈 ────────────────────────────────────────────────────
  const allRows = [];
  let pageNum = 1;

  while (true) {
    // 等表格資料載入
    try {
      await page.waitForSelector('table', { timeout: cfg.PAGE_LOAD_TIMEOUT });
      await randomDelay(500, 800);  // 給頁面稍微穩定
    } catch {
      console.error(`❌ 第 ${pageNum} 頁等待逾時`);
      break;
    }

    // 擷取當頁資料
    const rows = await page.evaluate(_extractRowsInPage);
    allRows.push(...rows);
    console.log(`  第 ${String(pageNum).padStart(2, ' ')} 頁：${rows.length} 筆（累計 ${allRows.length} 筆）`);

    // 隨機等待（模擬人工閱讀）
    await randomDelay(cfg.DELAY_MIN, cfg.DELAY_MAX);

    // 找「下頁」按鈕（div#Pager_Next）
    const nextBtn = await page.$('#Pager_Next');
    if (!nextBtn) {
      console.log('  → 已到最後一頁（找不到 #Pager_Next）');
      break;
    }

    // 確認按鈕是否 disabled
    const isDisabled = await nextBtn.evaluate(el =>
      el.classList.contains('disabled') ||
      el.classList.contains('Disabled') ||
      el.style.pointerEvents === 'none' ||
      el.style.display === 'none' ||
      el.getAttribute('disabled') !== null
    );
    if (isDisabled) {
      console.log('  → 已到最後一頁（#Pager_Next disabled）');
      break;
    }

    // 點擊「下頁」並等待頁面載入
    try {
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 }),
        nextBtn.click(),
      ]);
    } catch {
      // waitForNavigation timeout 不一定是錯誤（有些 ERP 用 pushState）
      await randomDelay(2000, 3000);
    }

    pageNum++;
  }

  await browser.close();

  // ── 統計 ────────────────────────────────────────────────────────────────
  const byAirline = {};
  for (const row of allRows)
    byAirline[row.airline] = (byAirline[row.airline] || 0) + 1;

  console.log(`\n=== 擷取完成 ===`);
  console.log(`  總計：${allRows.length} 筆`);
  for (const [airline, count] of Object.entries(byAirline).sort())
    console.log(`  ${airline}：${count} 筆`);

  // ── 存檔 ────────────────────────────────────────────────────────────────
  if (!fs.existsSync(cfg.DATA_DIR))
    fs.mkdirSync(cfg.DATA_DIR, { recursive: true });

  const output = {
    capturedAt:      new Date().toISOString(),
    capturedAtLocal: nowStr(),
    totalRows:       allRows.length,
    byAirline,
    rows:            allRows,
  };

  const outPath = path.join(cfg.DATA_DIR, 'latest.json');
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2), 'utf8');
  console.log(`\n✓ 已存至：${outPath}`);
})();
