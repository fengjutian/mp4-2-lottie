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

// 全局变量，用于存储生成的动画数据
let currentAnimationJSON = null;

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
const imageQualityEl = document.getElementById('imageQuality'); // 图片质量输入
const qualityValueEl = document.getElementById('qualityValue'); // 质量值显示
const progressEl = document.getElementById('progress');      // 进度条
const progressText = document.getElementById('progressText');// 进度文本
const statusEl = document.getElementById('status');          // 状态文本
const lottieContainer = document.getElementById('lottieContainer'); // 动画容器
const exportBtn = document.getElementById('exportBtn');      // 导出按钮

// 添加质量值显示更新事件
imageQualityEl.addEventListener('input', function() {
  qualityValueEl.textContent = this.value;
});

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
// async function arrayBufferToDataURL(buffer, mime='image/png') {
//   const blob = new Blob([buffer], { type: mime });
//   return await new Promise((res) => {
//     const reader = new FileReader();
//     reader.onload = () => res(reader.result);
//     reader.readAsDataURL(blob);
//   });
// }

async function arrayBufferToDataURL(buffer, mime='image/jpeg', quality=0.8) {
  // 如果不需要压缩或不是支持压缩的格式，直接转换
  if (quality >= 1 || !['image/jpeg', 'image/webp'].includes(mime)) {
    const blob = new Blob([buffer], { type: mime });
    return await new Promise((res) => {
      const reader = new FileReader();
      reader.onload = () => res(reader.result);
      reader.readAsDataURL(blob);
    });
  }

    // 使用 canvas 进行图片质量压缩
  return new Promise((resolve, reject) => {
    const img = new Image();
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    img.onload = () => {
      // 设置 canvas 尺寸
      canvas.width = img.width;
      canvas.height = img.height;
      
      // 在 canvas 上绘制图片
      ctx.drawImage(img, 0, 0);
      
      // 使用指定质量导出 Data URL
      try {
        const dataURL = canvas.toDataURL(mime, quality);
        resolve(dataURL);
      } catch (e) {
        reject(e);
      }
    };
    
    img.onerror = reject;

    // 将 ArrayBuffer 转换为临时 URL 加载图片
    const blob = new Blob([buffer], { type: 'image/png' });
    const url = URL.createObjectURL(blob);
    img.src = url;
    // 清理临时 URL
    img.onload = function() {
      URL.revokeObjectURL(url);
      // 继续原来的 onload 逻辑
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);
      const dataURL = canvas.toDataURL(mime, quality);
      resolve(dataURL);
    };
  });
}


/**
 * 导出 Lottie 动画 JSON 数据为文件
 */
function exportLottieJSON() {
  if (!currentAnimationJSON) {
    alert('没有可导出的动画数据，请先完成转换');
    return;
  }

  // 压缩JSON字符串 - 移除所有空格、换行符和不必要的字符
  const compressedJSON = JSON.stringify(JSON.parse(currentAnimationJSON));
  
  // 创建 Blob 对象
  const blob = new Blob([compressedJSON], { type: 'application/json' });
  
  // 创建下载链接
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `animation_compressed_${new Date().getTime()}.json`;  // 文件名
  
  // 触发下载
  document.body.appendChild(a);
  a.click();
  
  // 清理
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

    // 计算压缩率
  const originalSize = new Blob([currentAnimationJSON]).size;
  const compressedSize = blob.size;
  const compressionRatio = ((1 - compressedSize / originalSize) * 100).toFixed(2);
  
  setStatus(`动画数据已导出 (压缩率: ${compressionRatio}%)`);
  
  setStatus('动画数据已导出');
}

/**
 * 点击 "开始转换" 按钮的事件处理函数
 */
runBtn.addEventListener('click', async () => {
  // 获取用户选择的文件
  const file = fileInput.files[0];
  if (!file) return alert('请选择一个 MP4 文件');

  // 获取用户设置的参数
  const targetFps = Number(fpsEl.value) || 15;
  const scale = Number(scaleEl.value) || 1;
  const maxFrames = Number(maxFramesEl.value) || 150;
  // 添加图片质量参数
  const imageQuality = Number(imageQualityEl.value) || 0.8; // 默认为0.8

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
    // 使用JPEG格式和指定质量进行压缩
    const dataURL = await arrayBufferToDataURL(buf.buffer, 'image/jpeg', imageQuality);
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

  // 动画数据转换为 JSON 字符串
  const animationJSON = JSON.stringify(animation);
  
  // 存储到全局变量，供导出按钮使用
  currentAnimationJSON = animationJSON;

  // 计算原始大小并显示
  const originalSizeKB = (new Blob([animationJSON]).size / 1024).toFixed(2);
  setStatus(`完成 ${totalFrames} 帧 (${W}x${H}) - 文件大小: ${originalSizeKB}KB ${originalSizeKB/1024}M (压缩质量: ${imageQuality})`);
  
  // 启用导出按钮
  exportBtn.disabled = false;

  // 打印 JSON 字符串
  console.log(animationJSON);
});

// 导出按钮事件监听
exportBtn.addEventListener('click', exportLottieJSON);

// 检查是否在Electron环境中
const isElectron = typeof window !== 'undefined' && window.process && window.process.type === 'renderer';
let ipcRenderer;

if (isElectron) {
  ipcRenderer = window.require('electron').ipcRenderer;
  // 设置Electron环境下的文件保存回调
  ipcRenderer.on('save-file-success', () => {
    setStatus('文件保存成功！');
  });
  ipcRenderer.on('save-file-error', (event, error) => {
    setStatus(`保存文件失败: ${error}`);
  });
}

// 修改导出JSON函数以支持Electron
function exportJSON() {
  if (!animationJSON) {
    setStatus('请先完成转换');
    return;
  }

  if (isElectron) {
    // 使用Electron的对话框
    const { dialog } = window.require('electron').remote;
    const options = {
      title: '保存Lottie JSON文件',
      defaultPath: 'animation.json',
      filters: [{ name: 'JSON Files', extensions: ['json'] }]
    };
    
    dialog.showSaveDialog(options).then(result => {
      if (!result.canceled && result.filePath) {
        ipcRenderer.send('save-file', { 
          filePath: result.filePath, 
          content: animationJSON 
        });
      }
    });
  } else {
    // 保持原有的Web导出逻辑
    const blob = new Blob([animationJSON], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'animation.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setStatus('JSON文件已导出');
  }
}
