const { spots } = require('../../data/spots.js');
const {
  readProgress,
  writeProgress,
  readVisited,
  toggleVisited,
} = require('../../utils/progress.js');

// 构建顶部「目录」小圆点：序号 / 名称 / 是否当前 / 是否已打卡。
// 在 JS 里预先算好，wxml 只负责渲染（wxml 里不好做「数组是否包含某值」的判断）。
function buildDots(attractions, currentIndex, visited) {
  return attractions.map((a, i) => ({
    i,
    name: a.name,
    current: i === currentIndex,
    visited: visited.indexOf(i) >= 0,
  }));
}

Page({
  data: {
    spotId: '',
    spotName: '',
    intro: '',
    total: 0,
    index: 0,
    // 给渲染层用的 1 基序号（避免 wxml 里写 index + 1 与 wx:for 的 index 变量冲突）。
    displayIndex: 1,
    current: { name: '', body: '' },
    canPrev: false,
    canNext: false,
    dots: [], // 顶部目录圆点
    visited: [], // 已打卡的景点序号
    isVisited: false, // 当前景点是否已打卡
  },

  onLoad(options) {
    // 需求三注：页面参数在小程序里取到的值都是「字符串」，用序号做参数要自行转换类型。
    const spotId = options && options.id ? String(options.id) : '';
    const spot = spots.find((s) => s.id === spotId);
    if (!spot) return;
    const total = spot.attractions.length;

    // 约束③：从同步缓存恢复上次浏览到的景点序号。键不存在时返回空字符串 ''，必须兜底。
    const idx = readProgress(spotId);
    let index = 0;
    if (idx >= 0 && idx < total) index = idx;

    const visited = readVisited(spotId);

    // 约束①：所有数据变更必须通过 setData（逻辑层与渲染层是两个独立环境，
    // setData 是它们之间唯一的数据通道；直接给 this.data 赋值不会触发视图更新）。
    this.setData({
      spotId,
      spotName: spot.name,
      intro: spot.intro,
      total,
      visited,
      dots: buildDots(spot.attractions, index, visited),
    });
    // 应用当前段：会再次 setData 写入 current / canPrev / canNext；首屏不持久化。
    this.applyIndex(index, false);
  },

  // 应用第 index 段。persist=true 时把当前序号写回同步本地缓存（每次切换景点都写，见需求三）。
  applyIndex(index, persist) {
    const spot = spots.find((s) => s.id === this.data.spotId);
    if (!spot) return;
    const current = spot.attractions[index];
    if (!current) return;

    // 约束①：current / 边界标志一律通过 setData 下发，绝不直接给 this.data 赋值。
    this.setData({
      index,
      displayIndex: index + 1,
      current,
      canPrev: index > 0, // 首段时上一段不可用
      canNext: index < this.data.total - 1, // 末段时下一段不可用
      isVisited: this.data.visited.indexOf(index) >= 0,
      dots: buildDots(spot.attractions, index, this.data.visited),
    });

    if (persist) {
      // 约束③：同步本地缓存持久化浏览进度。
      writeProgress(this.data.spotId, index);
    }
  },

  onPrev() {
    if (this.data.index <= 0) return; // 边界守卫：首段不可再往前
    this.applyIndex(this.data.index - 1, true);
  },

  onNext() {
    if (this.data.index >= this.data.total - 1) return; // 边界守卫：末段不可再往后
    this.applyIndex(this.data.index + 1, true);
  },

  // 顶部「目录」直达：点序号跳到任意景点。
  onJump(e) {
    const idx = Number(e.currentTarget.dataset.index);
    if (!Number.isInteger(idx)) return;
    if (idx < 0 || idx >= this.data.total) return;
    if (idx === this.data.index) return;
    this.applyIndex(idx, true);
  },

  // 打卡 / 取消打卡：同样用同步本地缓存持久化（约束③）。
  onToggleVisit() {
    const id = this.data.spotId;
    const index = this.data.index;
    const list = toggleVisited(id, index);
    const spot = spots.find((s) => s.id === id);
    // 约束①：通过 setData 下发，不直接改 this.data。
    this.setData({
      visited: list,
      isVisited: list.indexOf(index) >= 0,
      dots: spot ? buildDots(spot.attractions, index, list) : [],
    });
  },
});
