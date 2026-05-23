// ════════════════════════════════════════════════════════════
// capture.mjs
//   og_*.html を開いて #capture を 1600×900 の PNG にする。
//   ・__OG_READY__ が true になるまで待ってから撮る
//   ・引数で「どのページ」「保存先」を指定できる
//
// 使い方:
//   node scripts/capture.mjs --url "http://localhost:8080/og_result.html" --out "previews/result.png"
//
//   --base を渡すと og 側の ?base= に転送（data の場所を変えたいとき）
//   例: --base "data"  →  ...og_result.html?base=data
// ════════════════════════════════════════════════════════════
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

// ── 引数パース（軽量に自前で） ──
function getArg(name, def = null) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

const url  = getArg('url');
const out  = getArg('out');
const base = getArg('base'); // 任意

if (!url || !out) {
  console.error('必須引数が足りません: --url <URL> --out <出力PNGパス>');
  process.exit(1);
}

// ?base= を付与（既に ? があれば & で繋ぐ）
let targetUrl = url;
if (base) {
  targetUrl += (url.includes('?') ? '&' : '?') + 'base=' + encodeURIComponent(base);
}

const VIEWPORT = { width: 1600, height: 900 };
const READY_TIMEOUT_MS = 20000; // フラグ待ちの上限（保険）

(async () => {
  // 出力ディレクトリを用意
  fs.mkdirSync(path.dirname(out), { recursive: true });

  const browser = await chromium.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox'], // CI環境向け
  });
  try {
    const page = await browser.newPage({
      viewport: VIEWPORT,
      deviceScaleFactor: 2, // 2倍解像度で撮る（X上で精細に見える）
    });

    // コンソールエラーを拾って表示（デバッグ用）
    page.on('console', msg => {
      if (msg.type() === 'error') console.log('  [page error]', msg.text());
    });

    console.log(`→ open: ${targetUrl}`);
    await page.goto(targetUrl, { waitUntil: 'networkidle', timeout: READY_TIMEOUT_MS });

    // __OG_READY__ が立つまで待つ（Step 1で仕込んだフラグ）
    await page.waitForFunction('window.__OG_READY__ === true', { timeout: READY_TIMEOUT_MS });

    // データ取得失敗していたら警告（PNGは一応撮る）
    const ogError = await page.evaluate('window.__OG_ERROR__ || null');
    if (ogError) {
      console.warn(`  ⚠ ページ側でエラー: ${ogError}（PNGは撮りますが内容を確認してください）`);
    }

    // #capture だけを撮る（余白の黒帯を含めない）
    const el = await page.$('#capture');
    if (!el) throw new Error('#capture 要素が見つかりません');

    await el.screenshot({ path: out });
    console.log(`✓ 保存: ${out}`);
  } finally {
    await browser.close();
  }
})().catch(err => {
  console.error('✗ キャプチャ失敗:', err.message);
  process.exit(1);
});
