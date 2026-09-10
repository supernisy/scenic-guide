const { spots } = require('../../data/spots.js');
const {
  readProgress,
  readVisited,
  calcPercent,
} = require('../../utils/progress.js');

Page({
  data: {
    spots: [],
  },

  onLoad() {
    // 初次构建列表（结构 + 景点总数 + 初始进度/打卡 0 + 封面图路径），一次性 setData。
    // 这里不带景区简介：简介里可能包含其它景区的名字，会让按名称定位条目产生歧义。
    // 封面图按景区 id 选取：每个景区一张，全部本地内置（images/），无需网络。
    const COVER = { xihu: '/images/xihu_1.jpg', lingyin: '/images/lingyin_1.jpg', liangzhu: '/images/liangzhu_1.jpg' };
    const list = spots.map((s) => ({
      id: s.id,
      name: s.name,
      cover: COVER[s.id] || '',
      total: s.attractions.length,
      progress: 0,
      visited: 0,
    }));
    this.setData({ spots: list });
    // 之后逐条用「路径式 setData」刷新进度与打卡，不重传整个数组。见约束②。
    this.refreshProgress();
  },

  onShow() {
    // 从浏览页返回时列表页不会被重建，仅 onShow 触发：用路径式 setData 只更新变化项。
    this.refreshProgress();
  },

  // 约束②：修改列表中单条数据时，使用 setData 的路径写法（"数组名[下标].字段名" 的字符串键），
  // 不要把整个数组重新传一遍。setData 的内容要序列化后跨线程传输，全量重传一个长数组与只传
  // 一个字段，数据量可以相差几百倍，是小程序卡顿的首要来源。
  refreshProgress() {
    const items = this.data.spots;
    items.forEach((item, i) => {
      const idx = readProgress(item.id);
      const percent = calcPercent(idx, item.total);
      const visited = readVisited(item.id).length;
      // 关键：路径式写入单条数据的字段
      this.setData({
        [`spots[${i}].progress`]: percent,
        [`spots[${i}].visited`]: visited,
      });
    });
  },

  onTapItem(e) {
    const id = e.currentTarget.dataset.id;
    // 把景区 id 通过页面参数传过去（字符串）。见需求三。
    wx.navigateTo({ url: `/pages/spot/spot?id=${id}` });
  },
});
