// 生成移动端预览页（390px 视口）并尽量截图存档（可选加分项）。
//
// 同时产出两个页面，便于在浏览器里「演示功能」：
//   preview/index.html + preview.png  → 景区列表页（西湖 40%、灵隐/良渚 0%）
//   preview/spot.html  + preview/spot.png → 景点浏览页（以西湖第 2 个「白堤」为例）
//
// 两个预览都复用验收测试的同一套渲染脚手架（renderPage），所见即断言验证的产物。
//
// 运行：npm run preview

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { JSDOM } = require('jsdom');

// 在加载 miniprogram-simulate 之前，先准备好 DOM 全局（与 jest 的 jsdom 环境等价）。
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', { pretendToBeVisual: true });
global.window = dom.window;
global.document = dom.window.document;
global.navigator = dom.window.navigator;
global.HTMLElement = dom.window.HTMLElement;
const { TextEncoder, TextDecoder } = require('util');
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

const { renderPage, createWx, LIST_JS, SPOT_JS } = require('../test/helpers');
const { spots } = require('../data/spots.js');

const OUT_DIR = path.resolve(__dirname, '../preview');
fs.mkdirSync(OUT_DIR, { recursive: true });

// 进度口径（与小程序一致）：缓存缺失 → 0%；已浏览第 N 个 → floor((N)/总数*100)
function progressOf(spotId, store) {
  const raw = store.get(`sg_progress_${spotId}`);
  if (raw === undefined || raw === '' || raw === null) return 0;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0) return 0;
  const total = spots.find((s) => s.id === spotId).attractions.length;
  return Math.floor(((n + 1) / total) * 100);
}

// 视口固定 390px，容器用 390px + overflow:hidden，避免被 headless 默认视口拉伸。
const BASE_CSS = `
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; width: 390px; overflow-x: hidden; }
  body { font-family: -apple-system, "PingFang SC", Arial, sans-serif; background: #e6ebe8; }
  .preview { width: 390px; background: #f2f5f3; min-height: 780px; }
  /* j-component 把 <view>/<text> 渲染成 wx-view/wx-text 自定义标签，
     浏览器默认 display:inline，会导致 padding/margin/background 全部失效。
     强制声明 display:block，结构与样式才能正常生效。 */
  wx-view, wx-text, wx-image { display: block; }
`;

// 列表页样式：与 pages/list/list.wxss 视觉等价（rpx 折算为 px）
const LIST_CSS = `
  .page { padding: 0; }
  .hero { position: relative; padding: 30px 20px 24px; background: linear-gradient(160deg, #17503f 0%, #2e8b6f 52%, #57b096 100%); border-bottom-left-radius: 20px; border-bottom-right-radius: 20px; overflow: hidden; }
  .hero::before { content: ""; position: absolute; right: -38px; bottom: -48px; width: 178px; height: 178px; border-radius: 50%; background: rgba(255,255,255,.09); }
  .hero::after { content: ""; position: absolute; left: -26px; bottom: -36px; width: 130px; height: 130px; border-radius: 50%; background: rgba(255,255,255,.06); }
  .hero-title { position: relative; font-size: 26px; font-weight: 600; color: #fff; letter-spacing: 3px; }
  .hero-sub { position: relative; margin-top: 7px; font-size: 13px; color: rgba(255,255,255,.84); }
  .hero-badge { position: relative; display: inline-block; margin-top: 12px; padding: 4px 11px; font-size: 11px; color: #fff; background: rgba(255,255,255,.18); border-radius: 999px; }
  .spot-list { padding: 15px 13px 22px; }
  .item { position: relative; margin-bottom: 13px; padding: 16px 15px 19px; background-color: #fff; border-radius: 11px; box-shadow: 0 2px 10px rgba(23,80,63,.09); }
  .item::before { content: ""; position: absolute; left: 0; top: 14px; bottom: 14px; width: 4px; background: #2e8b6f; border-radius: 0 4px 4px 0; }
  .item .name { display: block; font-size: 19px; font-weight: 600; color: #1b2b26; letter-spacing: 1px; }
  .item .meta { display: block; margin-top: 11px; font-size: 12px; color: #2e8b6f; }
  .item .cover { display: block; width: 100%; height: 104px; margin-bottom: 12px; border-radius: 8px; background-size: cover; background-position: center; background-color: #dfe7e3; }
  .empty-tip { padding: 78px 0; text-align: center; }
  .empty-ill { width: 90px; height: 90px; margin: 0 auto 20px; border-radius: 50%; background: radial-gradient(circle at 50% 65%, #cfe2da 0%, #eef3f0 62%, #f5f8f6 100%); }
  .empty-text { font-size: 16px; color: #9aa6a2; letter-spacing: 1px; }
`;

// 浏览页样式：与 pages/spot/spot.wxss 视觉等价（rpx 折算为 px）
const SPOT_CSS = `
  .spot { padding: 0 0 24px; }
  .spot-head { padding: 22px 20px 14px; background: linear-gradient(160deg, #17503f 0%, #2e8b6f 100%); border-bottom-left-radius: 18px; border-bottom-right-radius: 18px; }
  .spot-title { font-size: 22px; font-weight: 600; color: #fff; letter-spacing: 2px; }
  .dots { display: flex; margin-top: 15px; }
  .dot { position: relative; width: 32px; height: 32px; margin-right: 10px; line-height: 32px; text-align: center; font-size: 13px; color: #8a9b95; background: rgba(255,255,255,.16); border-radius: 50%; }
  .dot.is-current { color: #1b5e4b; background: #fff; font-weight: 600; }
  .dot.is-visited::after { content: ""; position: absolute; right: -1px; top: -1px; width: 9px; height: 9px; background: #c8452f; border-radius: 50%; }
  .intro { margin: 15px 15px 0; padding: 13px 14px; background: #eef4f1; border-left: 3px solid #2e8b6f; border-radius: 7px; }
  .intro-text { display: block; font-size: 12.5px; line-height: 1.75; color: #5c6f68; }
  .spot-card { position: relative; margin: 17px 15px 0; padding: 22px 17px 18px; background: #fff; border-radius: 11px; box-shadow: 0 2px 10px rgba(23,80,63,.09); overflow: hidden; }
  .card-bar { position: absolute; left: 0; top: 0; width: 100%; height: 4px; background: linear-gradient(to right, #2e8b6f 0%, #57b096 100%); }
  .spot-name { font-size: 21px; font-weight: 600; color: #1b2b26; letter-spacing: 2px; }
  .spot-body { margin-top: 13px; }
  .body-text { display: block; font-size: 14px; line-height: 1.85; color: #4a5c56; }
  .visit { margin-top: 19px; padding: 11px 0; text-align: center; font-size: 13.5px; color: #2e8b6f; background: #eaf3ef; border-radius: 999px; }
  .visit.is-visited { color: #fff; background: #c8452f; }
  .pager { display: flex; align-items: center; justify-content: space-between; margin: 19px 15px 0; }
  .nav-btn { padding: 11px 23px; font-size: 14px; color: #fff; background: #2e8b6f; border-radius: 999px; box-shadow: 0 2px 8px rgba(46,139,111,.25); }
  .nav-btn.is-disabled { color: #a9b5b1; background: #e6ebe9; box-shadow: none; }
  .pager-state { font-size: 13px; color: #7c8a86; }
`;

function buildListPreviewHtml() {
  const wx = createWx();
  // 西湖浏览到第 2 个（与断言 4 / 8 一致）
  const spot = renderPage(SPOT_JS, { wx });
  spot.instance.onLoad({ id: 'xihu' });
  spot.instance.onNext();
  // 顺带打个卡，让列表页的「已游」计数在预览里可见
  spot.instance.onToggleVisit();
  const list = renderPage(LIST_JS, { wx });
  list.instance.onLoad();
  // j-component 的 image 组件不会把 src 写进 DOM，这里从 data 补回封面图（仅预览演示用）
  const spotMap = {};
  (list.instance.data.spots || []).forEach((s) => { spotMap[s.id] = s.cover; });
  list.dom.querySelectorAll('.item').forEach((el) => {
    const cover = spotMap[el.getAttribute('data-id')];
    if (!cover) return;
    const img = el.querySelector('wx-image');
    if (img) img.style.backgroundImage = `url("${cover.replace(/^\//, '../')}")`;
  });
  const rendered = list.dom.outerHTML;
  return wrapPreview(rendered, LIST_CSS, '景区导览 · 列表页预览');
}

function buildSpotPreviewHtml() {
  const wx = createWx();
  // 以「西湖第 2 个景点（白堤）」为例：先浏览到第 2 个，再渲染
  const spot = renderPage(SPOT_JS, { wx });
  spot.instance.onLoad({ id: 'xihu' });
  spot.instance.onNext(); // → 白堤（index 1）
  const rendered = spot.dom.outerHTML;
  return wrapPreview(rendered, SPOT_CSS, '景区导览 · 浏览页预览（西湖·白堤）');
}

function wrapPreview(rendered, extraCss, title) {
  return (
    '<!DOCTYPE html>' +
    '<html><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=390, initial-scale=1">' +
    `<title>${title}</title><style>${BASE_CSS}${extraCss}</style></head>` +
    `<body><div class="preview">${rendered}</div></body></html>`
  );
}

function findEdge() {
  const candidates = [
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
  ];
  return candidates.find((p) => fs.existsSync(p));
}

function tryScreenshot(htmlFile, outFile) {
  const edge = findEdge();
  if (!edge) {
    console.log(`[预览] 截图跳过（${path.basename(outFile)}）：未找到可用的 Chromium 内核浏览器（Edge/Chrome）。预览 HTML 仍可正常打开查看。`);
    return;
  }
  const userData = path.join(OUT_DIR, '.edge-profile');
  const fileUrl = 'file:///' + htmlFile.replace(/\\/g, '/');
  try {
    execFileSync(
      edge,
      [
        '--headless=new',
        '--no-sandbox',
        '--disable-gpu',
        '--user-data-dir=' + userData,
        '--window-size=390,844',
        '--force-device-scale-factor=1',
        '--hide-scrollbars',
        '--screenshot=' + outFile,
        fileUrl,
      ],
      { timeout: 30000, stdio: 'ignore' }
    );
    console.log(fs.existsSync(outFile) ? `[预览] 截图已生成：${outFile}` : `[预览] 截图未生成（${path.basename(outFile)}），不影响主交付。`);
  } catch (e) {
    console.log(`[预览] 截图未成功（${path.basename(outFile)}，不影响主交付）：${e.message}`);
  }
}

const listHtml = buildListPreviewHtml();
const listPath = path.join(OUT_DIR, 'index.html');
fs.writeFileSync(listPath, listHtml, 'utf8');

const spotHtml = buildSpotPreviewHtml();
const spotPath = path.join(OUT_DIR, 'spot.html');
fs.writeFileSync(spotPath, spotHtml, 'utf8');

console.log(`[预览] 列表页预览：${listPath}`);
console.log(`[预览] 浏览页预览：${spotPath}`);
tryScreenshot(listPath, path.join(OUT_DIR, 'preview.png'));
tryScreenshot(spotPath, path.join(OUT_DIR, 'spot.png'));
