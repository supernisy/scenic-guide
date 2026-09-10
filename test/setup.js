// jest（jsdom 环境）下补全 Node 内置全局，避免 jsdom 内部 whatwg-url 报
// "TextEncoder is not defined"。这些在纯 Node 下存在，但 jest 的测试沙箱默认未暴露。
const { TextEncoder, TextDecoder } = require('util');
if (typeof global.TextEncoder === 'undefined') global.TextEncoder = TextEncoder;
if (typeof global.TextDecoder === 'undefined') global.TextDecoder = TextDecoder;
