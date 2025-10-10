const express = require('express');
const { exec } = require('child_process');

const app = express();

// 设置 COOP / COEP 头
app.use((req, res, next) => {
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  next();
});

// 提供静态资源
app.use(express.static('.'));

const PORT = 8080;
const URL = `http://localhost:${PORT}/index.html`;

app.listen(PORT, () => {
  console.log(`Server running on ${URL}`);

  // 自动打开浏览器
//   const start =
//     process.platform === 'darwin'
//       ? 'open'
//       : process.platform === 'win32'
//       ? 'start'
//       : 'xdg-open';
//   exec(`${start} ${URL}`);

    // 自动打开浏览器并启动开发者工具
  if (process.platform === 'win32') {
    // Windows 下使用 Edge 浏览器并打开开发者工具
    exec(`start msedge --auto-open-devtools-for-tabs ${URL}`);
  } else if (process.platform === 'darwin') {
    // macOS 下使用 Chrome 浏览器并打开开发者工具
    exec(`open -a "Google Chrome" --args --auto-open-devtools-for-tabs ${URL}`);
  } else {
    // Linux 下使用 Chrome 浏览器并打开开发者工具
    exec(`google-chrome --auto-open-devtools-for-tabs ${URL}`);
  }
});
