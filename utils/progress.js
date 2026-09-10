// 本地缓存读写（进度 + 打卡）。被列表页与浏览页共用，避免键名与兜底逻辑各写一遍。
//
// 约束③：一律使用小程序的「同步」本地缓存接口（wx.getStorageSync / wx.setStorageSync）。
// 不用内存变量 / 全局变量 —— 小程序被销毁后内存数据会丢失，进度与打卡就都没了。
//
// 注意：键不存在时 wx.getStorageSync 返回的是「空字符串 ''」，不是 undefined 也不是 null，
// 所以每次取值后都必须做默认值兜底，否则后续按数组/对象使用会出错。

// 浏览进度键：存「已浏览到的景点序号」（0 基）
const PROGRESS_KEY = (id) => `sg_progress_${id}`;
// 打卡键：存「已打卡景点的序号数组」
const VISITED_KEY = (id) => `sg_visited_${id}`;

// 读取某景区已浏览到的景点序号（0 基）。
// 用 -1 作为「从未浏览（缓存缺失）」的哨兵值，与「已浏览到第 1 个（序号 0）」区分开。
function readProgress(id) {
  const raw = wx.getStorageSync(PROGRESS_KEY(id));
  if (raw === '' || raw === undefined || raw === null) return -1;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0) return -1;
  return n;
}

function writeProgress(id, index) {
  wx.setStorageSync(PROGRESS_KEY(id), index);
}

// 读取已打卡的景点序号数组。缓存缺失 / 数据损坏时返回空数组。
function readVisited(id) {
  const raw = wx.getStorageSync(VISITED_KEY(id));
  if (raw === '' || raw === undefined || raw === null) return [];
  if (Array.isArray(raw)) {
    return raw.filter((n) => Number.isInteger(n) && n >= 0);
  }
  // 真机读出来是数组（小程序会自动序列化/反序列化）；这里额外兼容字符串形态。
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.filter((n) => Number.isInteger(n) && n >= 0);
    } catch (e) {
      return [];
    }
  }
  return [];
}

function writeVisited(id, list) {
  wx.setStorageSync(VISITED_KEY(id), list);
}

// 打卡 / 取消打卡：返回切换之后的最新数组。
function toggleVisited(id, index) {
  const list = readVisited(id);
  const at = list.indexOf(index);
  if (at >= 0) list.splice(at, 1);
  else list.push(index);
  writeVisited(id, list);
  return list;
}

// 进度百分比：
//   - 从未浏览（缓存缺失）→ 0%（需求三明确要求「从未浏览过的景区显示已浏览 0%」）
//   - 已浏览到第 N 个（N 为 1 基序号，即缓存序号 index+1）→ floor(N / 总数 * 100)
// 例：西湖共 5 个景点，浏览到第 2 个 → floor(2/5*100)=40% →「已浏览 40%」。
function calcPercent(index, total) {
  if (!total) return 0;
  if (index < 0) return 0;
  return Math.floor(((index + 1) / total) * 100);
}

module.exports = {
  PROGRESS_KEY,
  VISITED_KEY,
  readProgress,
  writeProgress,
  readVisited,
  writeVisited,
  toggleVisited,
  calcPercent,
};
