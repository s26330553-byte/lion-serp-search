// install-bookmark.js
// 將 ERP 機位報告書籤直接寫入 Chrome 書籤列
//
// 使用方式：
//   1. 完全關閉 Chrome（工作列也不能有）
//   2. node install-bookmark.js
//   3. 重新開啟 Chrome，書籤列就有「ERP 機位報告」
'use strict';

const fs   = require('fs');
const path = require('path');

// ── 路徑 ─────────────────────────────────────────────────────
const BOOKMARKS = path.join(
  process.env.LOCALAPPDATA,
  'Google', 'Chrome', 'User Data', 'Default', 'Bookmarks'
);
const HTML_FILE = path.join(__dirname, 'erp-report-tool.html');

// ── 確認檔案存在 ──────────────────────────────────────────────
if (!fs.existsSync(BOOKMARKS)) {
  console.error('❌ 找不到 Chrome 書籤檔案：' + BOOKMARKS);
  process.exit(1);
}
if (!fs.existsSync(HTML_FILE)) {
  console.error('❌ 找不到 erp-report-tool.html：' + HTML_FILE);
  process.exit(1);
}

// ── 從 HTML 擷取書籤腳本 ──────────────────────────────────────
const html  = fs.readFileSync(HTML_FILE, 'utf8');
const match = html.match(/<script type="text\/plain" id="bm-code">([\s\S]*?)<\/script>/);
if (!match) {
  console.error('❌ 無法從 HTML 擷取書籤腳本（找不到 id="bm-code"）');
  process.exit(1);
}
const code = match[1].trim();
const bookmarkUrl = 'javascript:void(' + code + ')';
console.log('✓ 腳本擷取成功（' + bookmarkUrl.length + ' 字元）');

// ── 備份原始書籤 ───────────────────────────────────────────────
const backup = BOOKMARKS + '.bak';
fs.copyFileSync(BOOKMARKS, backup);
console.log('✓ 書籤已備份至：' + backup);

// ── 讀取並解析書籤 JSON ───────────────────────────────────────
let data;
try {
  data = JSON.parse(fs.readFileSync(BOOKMARKS, 'utf8'));
} catch (e) {
  console.error('❌ 書籤 JSON 解析失敗：' + e.message);
  process.exit(1);
}

// ── 找最大 id（Chrome 需要唯一 id） ───────────────────────────
let maxId = 100;
function scanMaxId(node) {
  if (node && node.id) {
    const n = parseInt(node.id, 10);
    if (!isNaN(n) && n > maxId) maxId = n;
  }
  if (node && node.children) node.children.forEach(scanMaxId);
}
Object.values(data.roots || {}).forEach(scanMaxId);

// ── 移除舊的同名書籤（避免重複） ─────────────────────────────
const bar = data.roots.bookmark_bar;
if (!bar.children) bar.children = [];
bar.children = bar.children.filter(function (b) {
  return !b.name.includes('ERP') || !b.name.includes('機位');
});

// ── Windows FILETIME（Chrome 用這個格式記錄時間） ─────────────
// 100-奈秒 intervals since 1601-01-01
const winFiletime = (BigInt(Date.now()) * 10000n + 116444736000000000n).toString();

// ── 產生 UUID v4 ──────────────────────────────────────────────
function uuid4() {
  const b = require('crypto').randomBytes(16);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = b.toString('hex');
  return [h.slice(0,8), h.slice(8,12), h.slice(12,16), h.slice(16,20), h.slice(20)].join('-');
}

// ── 新增書籤 ──────────────────────────────────────────────────
const newBookmark = {
  date_added:   winFiletime,
  date_modified: '0',
  guid:         uuid4(),
  id:           String(maxId + 1),
  name:         'ERP 機位報告',
  type:         'url',
  url:          bookmarkUrl,
};
bar.children.push(newBookmark);

// ── 寫回（UTF-8，不加 BOM） ────────────────────────────────────
const json = JSON.stringify(data);
fs.writeFileSync(BOOKMARKS, json, { encoding: 'utf8' });

console.log('');
console.log('✅ 書籤安裝成功！');
console.log('   名稱：ERP 機位報告');
console.log('   網址：javascript:void(... ' + bookmarkUrl.length + ' 字元 ...)');
console.log('');
console.log('👉 現在重新開啟 Chrome，書籤列就有「ERP 機位報告」了');
