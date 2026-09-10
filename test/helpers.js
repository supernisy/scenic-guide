// 验收测试脚手架。集中处理文档列出的四个已知环境问题：
//   坑1 · 测试工具不提供页面构造函数（Page/App）→ 读取页面 JS 源码，在受控作用域里执行，
//         注入我们自己的 Page 捕获配置对象，再映射成组件形式交给 miniprogram-simulate。
//   坑2 · 不要依赖清除模块缓存重复加载 → 每次都是全新的 vm 执行，不碰 require 缓存。
//   坑3 · 测试环境本地缓存是空实现 → 我们自己实现内存版替代实现（Map 存取，缺失返回空字符串）。
//   坑4 · 节点对象没有直接的 className 等属性 → 一律通过 node.dom（真实 DOM）读取类名/文本。

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const simulate = require('miniprogram-simulate');

const DATA_MODULE_PATH = require.resolve(path.resolve(__dirname, '../data/spots.js'));

// 页面 JS 里用相对路径 require 数据模块；在 vm 作用域里提供可控的 require。
function makeRequire(basePath, { emptyData }) {
  return function (reqPath) {
    if (reqPath.startsWith('.')) {
      const resolved = require.resolve(path.resolve(path.dirname(basePath), reqPath));
      // 空数据测试：定向把数据模块替换成空数组，其它情况走真实模块。
      if (emptyData && resolved === DATA_MODULE_PATH) {
        return { spots: [] };
      }
      return require(resolved);
    }
    return require(reqPath);
  };
}

// 读取页面 JS 源码并在受控作用域执行，捕获传给 Page 的配置对象。
function loadPageConfig(pageJsPath, { wx, emptyData }) {
  const src = fs.readFileSync(pageJsPath, 'utf8');
  let captured = null;
  const sandbox = {
    Page: (config) => {
      captured = config;
    },
    Component: (config) => {
      captured = config;
    },
    App: () => {},
    getApp: () => ({}),
    wx, // 注入我们自己的 wx（含内存版缓存替代实现，见 createWx）
    require: makeRequire(pageJsPath, { emptyData }),
    module: { exports: {} },
    console,
    setTimeout,
    clearTimeout,
  };
  sandbox.exports = sandbox.module.exports;
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox, { filename: pageJsPath });
  if (!captured) {
    throw new Error(`未捕获到页面配置（Page 未被调用）：${pageJsPath}`);
  }
  return captured;
}

// 把页面配置映射成 miniprogram-simulate 能加载的组件形式：
//   data → data；所有函数（事件方法 + 生命周期 onLoad 等）→ methods。
// 生命周期不会被自动触发（坑1），测试里手工调用 node.instance.onLoad(...)。
function pageToComponent(pageJsPath, opts) {
  const config = loadPageConfig(pageJsPath, opts);
  const wxmlPath = pageJsPath.replace(/\.js$/, '.wxml');
  const wxml = fs.readFileSync(wxmlPath, 'utf8');

  const data = config.data || {};
  const methods = {};
  Object.keys(config).forEach((key) => {
    if (key === 'data') return;
    if (typeof config[key] === 'function') {
      methods[key] = config[key];
    }
  });

  const componentConfig = {
    data,
    methods,
    template: wxml,
  };
  const id = simulate.load(componentConfig);
  return { id, config };
}

// 渲染一个页面为组件节点（RootComponent）。
function renderPage(pageJsPath, opts = {}) {
  // 真实小程序里 wx 是全局对象，被 require 的模块（如 utils/progress.js）同样直接依赖全局 wx。
  // 测试沙箱里把注入的 wx 挂到 Node 全局，让这些模块能正常工作（不改变任何断言语义）。
  if (opts.wx) global.wx = opts.wx;
  const { id } = pageToComponent(pageJsPath, opts);
  const node = simulate.render(id);
  if (typeof node.attach === 'function' && typeof document !== 'undefined') {
    // 挂到 document 上，确保 DOM 子节点可被查询。
    node.attach(document.body);
  }
  return node;
}

// 坑3：测试环境缓存替代实现（内存版）。写入存入 Map，读取从 Map 取，
// 键不存在时返回空字符串以保持与真机一致。这不是小程序的真实行为，仅用于测试。
function createWx() {
  const store = new Map();
  const api = {
    getStorageSync(key) {
      if (!store.has(key)) return ''; // 缺失返回空字符串，与真机一致
      return store.get(key);
    },
    setStorageSync(key, value) {
      store.set(key, value);
    },
    navigateTo() {}, // 列表页跳转用，测试里无需真实跳转
    _store: store,
  };
  return new Proxy(api, {
    get(target, prop) {
      if (prop in target) return target[prop];
      // 任何未定义的 wx.xxx 都返回 no-op 函数，避免页面调用时报错
      return () => {};
    },
  });
}

const LIST_JS = path.resolve(__dirname, '../pages/list/list.js');
const SPOT_JS = path.resolve(__dirname, '../pages/spot/spot.js');

module.exports = {
  renderPage,
  createWx,
  LIST_JS,
  SPOT_JS,
};
