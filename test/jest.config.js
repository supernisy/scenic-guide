const path = require('path');

module.exports = {
  // 坑：jest 必须配置为浏览器式 DOM 测试环境（jsdom）。
  // miniprogram-simulate / j-component 内部依赖 DOM 接口，在纯 Node 环境下会直接报「window 未定义」。
  rootDir: path.resolve(__dirname, '..'),
  testEnvironment: 'jsdom',
  testMatch: ['<rootDir>/test/**/*.test.js'],
  // 每个测试文件使用 jest 独立的模块注册表，天然满足「不要依赖清除模块缓存重复加载」（坑2）。
  // setupFiles 在任何测试文件加载前执行，用于在 jest 沙箱里补全 Node 内置全局（TextEncoder 等）。
  setupFiles: ['<rootDir>/test/setup.js'],
  verbose: true,
};
