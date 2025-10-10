/**
 * MP4 转 Lottie 动画工具
 * 主要功能：将 MP4 视频文件拆分为帧图片，然后转换为 Lottie 动画格式并在页面上预览
 */

// 从全局对象获取 FFmpeg 创建函数和文件获取函数
const ffmpeg = window.createFFmpeg || FFmpeg.createFFmpeg;
const fetchFile = window.fetchFile || FFmpeg.fetchFile;

console.log('FFmpeg 实例:', ffmpeg);

// 创建 FFmpeg 实例并配置核心路径
const ffmpegInstance = ffmpeg({
  log: true,  // 启用日志记录
  corePath: 'https://unpkg.com/@ffmpeg/core@0.11.0/dist/ffmpeg-core.js'  // FFmpeg 核心库路径
});

/**
 * 加载 FFmpeg 核心库和相关资源
 * @async
 * @returns {Promise<void>}
 */
async function loadFFmpegCore() {
  const base = 'https://unpkg.com/@ffmpeg/core@0.11.0/dist';
  await ffmpegInstance.load({
    coreURL: `${base}/ffmpeg-core.js`,    // 核心 JS 文件
    wasmURL: `${base}/ffmpeg-core.wasm`,  // WebAssembly 文件
    workerURL: `${base}/ffmpeg-core.worker.js`,  // Worker 文件
  });
}

// 获取 DOM 元素引用
const fileInput = document.getElementById('file');           // 文件选择输入框
const runBtn = document.getElementById('run');               // 开始转换按钮
const fpsEl = document.getElementById('fps');                // 帧率输入
const scaleEl = document.getElementById('scale');            // 缩放比例输入
const maxFramesEl = document.getElementById('maxFrames');    // 最大帧数输入
const progressEl = document.getElementById('progress');      // 进度条
const progressText = document.getElementById('progressText');// 进度文本
const statusEl = document.getElementById('status');          // 状态文本
const lottieContainer = document.getElementById('lottieContainer'); // 动画容器

/**
 * 设置状态文本
 * @param {string} txt - 要显示的状态文本
 */
function setStatus(txt) { statusEl.textContent = txt; }

/**
 * 设置进度条状态
 * @param {number} v - 进度值（0-100）
 * @param {string} text - 进度文本描述
 */
function setProgress(v, text = '') {
  progressEl.value = v;
  progressText.textContent = text;
}

/**
 * 将 ArrayBuffer 转换为 Data URL
 * @async
 * @param {ArrayBuffer} buffer - 二进制数据
 * @param {string} mime - MIME 类型，默认为 'image/png'
 * @returns {Promise<string>} - 转换后的 Data URL
 */
async function arrayBufferToDataURL(buffer, mime='image/png') {
  const blob = new Blob([buffer], { type: mime });
  return await new Promise((res) => {
    const reader = new FileReader();
    reader.onload = () => res(reader.result);
    reader.readAsDataURL(blob);
  });
}

/**
 * 点击 "开始转换" 按钮的事件处理函数
 */
runBtn.addEventListener('click', async () => {
  // 获取用户选择的文件
  const file = fileInput.files[0];
  if (!file) return alert('请选择一个 MP4 文件');

  // 获取用户设置的参数
  const targetFps = Number(fpsEl.value) || 15;      // 目标帧率，默认为15
  const scale = Number(scaleEl.value) || 1;          // 缩放比例，默认为1
  const maxFrames = Number(maxFramesEl.value) || 150; // 最大帧数，默认为150

  // 加载 FFmpeg 核心库
  setStatus('加载 ffmpeg 核心...');
  console.log('FFmpeg 实例:', ffmpegInstance);
  if (!ffmpegInstance.isLoaded()) await loadFFmpegCore();

  // 将视频文件写入 FFmpeg 文件系统
  setStatus('写入视频文件...');
  ffmpegInstance.FS('writeFile', 'input.mp4', await fetchFile(file));

  // 构建视频滤镜参数
  const scaleFilter = scale < 1 ? `,scale=iw*${scale}:ih*${scale}` : '';
  const vf = `fps=${targetFps}${scaleFilter}`;

  // 执行 FFmpeg 命令进行视频拆帧
  setStatus('开始拆帧...');
  await ffmpegInstance.run(
    '-i', 'input.mp4',     // 输入文件
    '-vf', vf,             // 视频滤镜（帧率和缩放）
    '-vsync', '0',         // 禁用同步
    'frame_%04d.png'       // 输出文件格式
  );

  // 读取拆分后的帧文件
  setStatus('读取帧文件...');
  let files = ffmpegInstance.FS('readdir', '/').filter(f => f.endsWith('.png')).sort();

  // 限制最大帧数
  if (files.length > maxFrames) {
    setStatus(`超过最大帧数限制 (${files.length} > ${maxFrames})，仅保留前 ${maxFrames} 帧`);
    files = files.slice(0, maxFrames);
  }

  const totalFrames = files.length;
  setProgress(0, `读取 ${totalFrames} 帧`);

  // 获取第一帧图片尺寸
  const firstBuf = ffmpegInstance.FS('readFile', files[0]);
  const firstDataURL = await arrayBufferToDataURL(firstBuf.buffer, 'image/png');
  const img = new Image();
  await new Promise(res => { img.onload = res; img.src = firstDataURL; });
  const W = img.width, H = img.height;

  // 处理所有帧，转换为 Data URL 并构建 Lottie 资源对象
  const assets = [];
  for (let i = 0; i < totalFrames; i++) {
    setProgress((i / totalFrames) * 100, `帧 ${i + 1}/${totalFrames}`);
    const buf = ffmpegInstance.FS('readFile', files[i]);
    const dataURL = await arrayBufferToDataURL(buf.buffer, 'image/png');
    assets.push({
      id: `img_${i}`,        // 资源ID
      w: W,                  // 宽度
      h: H,                  // 高度
      u: "",                  // 路径前缀
      p: dataURL,            // Data URL
      e: 0                   // 资源类型（0表示图片）
    });
  }

  // 为每个资源创建 Lottie 图层对象
  const layers = assets.map((asset, idx) => ({
    ddd: 0,                 // 3D 图层标志（0表示2D）
    ind: idx + 1,           // 图层索引
    ty: 2,                  // 图层类型（2表示图片图层）
    nm: `frame_${idx}`,     // 图层名称
    refId: asset.id,        // 引用的资源ID
    ks: {                   // 变换属性
      o: { a: 0, k: 100 },  // 不透明度
      r: { a: 0, k: 0 },    // 旋转角度
      p: { a: 0, k: [W / 2, H / 2, 0] }, // 位置
      a: { a: 0, k: [W / 2, H / 2, 0] }, // 锚点
      s: { a: 0, k: [100, 100, 100] }    // 缩放
    },
    ip: idx,                // 入点帧
    op: idx + 1,            // 出点帧
    st: idx,                // 开始时间
    bm: 0                   // 混合模式
  }));

  // 构建完整的 Lottie 动画数据对象
  const animation = {
    v: "5.7.1",             // Lottie 版本
    fr: targetFps,          // 帧率
    ip: 0,                  // 入点帧
    op: totalFrames,        // 出点帧
    w: W,                   // 宽度
    h: H,                   // 高度
    nm: "Video Frame Sequence", // 动画名称
    assets,                 // 资源数组
    layers                  // 图层数组
  };

  // 更新进度和状态
  setProgress(100, '播放中...');
  setStatus(`完成 ${totalFrames} 帧 (${W}x${H})`);

  // 清空容器并加载动画
  lottieContainer.innerHTML = '';
  lottie.loadAnimation({
    container: lottieContainer,  // 动画容器
    renderer: 'svg',             // 渲染方式（SVG）
    loop: true,                  // 循环播放
    autoplay: true,              // 自动播放
    animationData: animation     // 动画数据
  });
});
