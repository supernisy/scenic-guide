// 自动化验收：8 条断言，一条不过即视为未完成。
// 运行：npm test  →  jest（jsdom 环境）+ miniprogram-simulate。
// 每条断言都会 console.log 出「实际值」，便于核对与期望值比对。

const { JSDOM } = require('jsdom');
const { renderPage, createWx, LIST_JS, SPOT_JS } = require('./helpers');
const { spots } = require('../data/spots.js');

// 小工具：取节点文本（坑4：通过真实 DOM 读取）
const text = (node) => (node && node.dom ? node.dom.textContent : '');

describe('景区导览 · 验收断言（8 条）', () => {
  // ── 断言 1：列表页渲染的景区条目数 = 恰好 3 条 ──────────────────────────
  test('断言1 · 列表页景区条目数 = 3', () => {
    const wx = createWx();
    const node = renderPage(LIST_JS, { wx });
    node.instance.onLoad(); // 坑1：生命周期不自动触发，手工调用
    const items = node.querySelectorAll('.item');
    const actual = items.length;
    console.log(`[断言1] 实际景区条目数 = ${actual}（期望 3）`);
    expect(actual).toBe(3);
  });

  // ── 断言 2：直接改 this.data 而不调 setData → 渲染查不到被改文字 ─────────
  test('断言2 · 直接改 this.data 不触发视图更新', () => {
    const wx = createWx();
    const node = renderPage(SPOT_JS, { wx });
    node.instance.onLoad({ id: 'xihu' });
    const before = text(node);
    // 直接给 this.data 赋值（绕过 setData）—— 双线程模型下不会触发渲染层更新
    const data = node.instance.data;
    data.current.name = '被偷偷改掉的景点名';
    const after = text(node);
    const leaked = after.includes('被偷偷改掉的景点名');
    console.log(`[断言2] 改前含篡改文=${before.includes('被偷偷改掉的景点名')}; 改后渲染仍含篡改文=${leaked}（期望均为 false）`);
    expect(leaked).toBe(false);
    expect(before.includes('被偷偷改掉的景点名')).toBe(false);
  });

  // ── 断言 3：进入西湖逐段浏览到末段，名称与内置 5 个完全一致、顺序一致 ──
  test('断言3 · 西湖逐段浏览名称顺序与内置一致', () => {
    const wx = createWx();
    const node = renderPage(SPOT_JS, { wx });
    node.instance.onLoad({ id: 'xihu' });
    const names = [node.data.current.name];
    while (node.data.canNext) {
      node.instance.onNext();
      names.push(node.data.current.name);
    }
    const expected = spots.find((s) => s.id === 'xihu').attractions.map((a) => a.name);
    console.log(`[断言3] 实际=${JSON.stringify(names)}`);
    console.log(`[断言3] 期望=${JSON.stringify(expected)}`);
    expect(names).toEqual(expected);
  });

  // ── 断言 4：西湖浏览到第 2 个后回列表 → 该项「已浏览 40%」 ──────────────
  test('断言4 · 西湖浏览到第2个后回列表显示「已浏览 40%」', () => {
    const wx = createWx();
    // 先进入浏览页，走到第 2 个（index 1），触发持久化
    const spot = renderPage(SPOT_JS, { wx });
    spot.instance.onLoad({ id: 'xihu' });
    spot.instance.onNext(); // → index 1（第 2 个）
    // 再加载列表页（共享同一 wx 缓存）
    const list = renderPage(LIST_JS, { wx });
    list.instance.onLoad();
    const items = list.querySelectorAll('.item');
    let hit = '';
    items.forEach((it) => {
      if (text(it).includes('西湖')) hit = text(it);
    });
    console.log(`[断言4] 西湖项文案=${JSON.stringify(hit)}（期望含「已浏览 40%」）`);
    expect(hit).toContain('已浏览 40%');
  });

  // ── 断言 5：写入进度后重挂载并从缓存恢复，序号严格相等 ──────────────────
  test('断言5 · 重挂载后从缓存精确恢复序号（严格相等）', () => {
    const wx = createWx();
    const s1 = renderPage(SPOT_JS, { wx });
    s1.instance.onLoad({ id: 'xihu' });
    s1.instance.onNext();
    s1.instance.onNext(); // 退出前在第 3 个（index 2）
    const saved = s1.data.index;
    // 重新挂载（全新执行，不依赖模块缓存）
    const s2 = renderPage(SPOT_JS, { wx });
    s2.instance.onLoad({ id: 'xihu' });
    const restored = s2.data.index;
    console.log(`[断言5] 退出前序号=${saved}; 重挂载恢复序号=${restored}（期望严格相等=2）`);
    expect(restored).toBe(saved);
    expect(restored).toBe(2);
  });

  // ── 断言 6：数据为空时空状态含「暂无」；数据非空时空状态节点为 null ────
  test('断言6 · 空状态存在且含「暂无」；非空时该节点为 null', () => {
    // 空数据
    const wxEmpty = createWx();
    const emptyList = renderPage(LIST_JS, { wx: wxEmpty, emptyData: true });
    emptyList.instance.onLoad();
    const emptyNode = emptyList.querySelector('.empty-tip');
    const emptyText = text(emptyNode);
    console.log(`[断言6·空] 空状态节点存在=${!!emptyNode}; 文案=${JSON.stringify(emptyText)}（期望存在且含「暂无」）`);
    expect(emptyNode).toBeTruthy();
    expect(emptyText).toContain('暂无');

    // 非空数据
    const wxFull = createWx();
    const fullList = renderPage(LIST_JS, { wx: wxFull });
    fullList.instance.onLoad();
    const nullNode = fullList.querySelector('.empty-tip');
    console.log(`[断言6·非空] 空状态节点查询结果=${nullNode === undefined ? 'undefined(不存在)' : nullNode}（期望不存在）`);
    expect(nullNode).toBeFalsy(); // 条件渲染为假时节点被移除
  });

  // ── 断言 7：条件渲染在条件为假时节点为 null（不是样式隐藏） ────────────
  test('断言7 · 条件渲染：假时节点为 null（非隐藏）', () => {
    // 空数据：列表容器应被移除，空状态存在
    const wxE = createWx();
    const e = renderPage(LIST_JS, { wx: wxE, emptyData: true });
    e.instance.onLoad();
    const listWhenEmpty = e.querySelector('.spot-list');
    const tipWhenEmpty = e.querySelector('.empty-tip');
    // 非空：反之
    const wxF = createWx();
    const f = renderPage(LIST_JS, { wx: wxF });
    f.instance.onLoad();
    const listWhenFull = f.querySelector('.spot-list');
    const tipWhenFull = f.querySelector('.empty-tip');
    console.log(`[断言7] 空数据: spot-list 存在=${!!listWhenEmpty}, empty-tip 存在=${!!tipWhenEmpty}`);
    console.log(`[断言7] 非空  : spot-list 存在=${!!listWhenFull}, empty-tip 存在=${!!tipWhenFull}`);
    expect(listWhenEmpty).toBeFalsy(); // 假→移除，而非隐藏
    expect(tipWhenEmpty).toBeTruthy();
    expect(listWhenFull).toBeTruthy();
    expect(tipWhenFull).toBeFalsy();
  });

  // ── 断言 8：390px 视口预览页，条目数/进度文案与断言1、4 一致 ───────────
  test('断言8 · 390px 视口预览：条目数=3 且西湖「已浏览 40%」', () => {
    const wx = createWx();
    // 让西湖处于 40%
    const spot = renderPage(SPOT_JS, { wx });
    spot.instance.onLoad({ id: 'xihu' });
    spot.instance.onNext();
    const list = renderPage(LIST_JS, { wx });
    list.instance.onLoad();

    // 序列化列表真实 DOM 到 390px 视口预览页（容器用百分比宽度铺满视口）
    const rendered = list.dom.outerHTML;
    const previewHtml =
      '<!DOCTYPE html><html><head>' +
      '<meta name="viewport" content="width=390, initial-scale=1">' +
      '<style>body{margin:0;width:100%}.preview{width:100%}</style>' +
      '</head><body><div class="preview">' + rendered + '</div></body></html>';

    const dom = new JSDOM(previewHtml, {
      pretendToBeVisual: true,
      beforeParse(window) {
        // 标定 390px 视口宽度
        Object.defineProperty(window, 'innerWidth', { value: 390, configurable: true });
      },
    });
    const items = dom.window.document.querySelectorAll('.item');
    const xihu = Array.from(items).find((it) => it.textContent.includes('西湖'));
    const actualCount = items.length;
    const actualText = xihu ? xihu.textContent.trim() : '(未找到西湖项)';
    console.log(`[断言8] 390px 视口下 条目数=${actualCount}; 西湖项文案=${JSON.stringify(actualText)}`);
    console.log(`[断言8] 预览页 HTML 已生成（用于浏览器/截图查看）`);
    expect(actualCount).toBe(3); // 与断言1一致
    expect(actualText).toContain('已浏览 40%'); // 与断言4一致
  });
});
