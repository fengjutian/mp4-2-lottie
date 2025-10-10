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
  const start =
    process.platform === 'darwin'
      ? 'open'
      : process.platform === 'win32'
      ? 'start'
      : 'xdg-open';
  exec(`${start} ${URL}`);
});
