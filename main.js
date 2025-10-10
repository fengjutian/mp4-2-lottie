
// 移除错误的解构赋值，直接使用全局FFmpeg对象
// const { createFFmpeg, fetchFile } = FFmpeg;

// 正确初始化FFmpeg并提供完整配置
const ffmpeg = window.createFFmpeg || FFmpeg.createFFmpeg;
const fetchFile = window.fetchFile || FFmpeg.fetchFile;

console.log('FFmpeg 版本:', ffmpeg);

// 使用正确的方式创建实例并提供corePath配置
const ffmpegInstance = ffmpeg({
  log: true,
  corePath: 'https://unpkg.com/@ffmpeg/core@0.11.0/dist/ffmpeg-core.js'
});

// 修改loadFFmpegCore函数以使用正确的实例
async function loadFFmpegCore() {
  const base = 'https://unpkg.com/@ffmpeg/core@0.11.0/dist';
  await ffmpegInstance.load({
    coreURL: `${base}/ffmpeg-core.js`,
    wasmURL: `${base}/ffmpeg-core.wasm`
  });
}

const fileInput = document.getElementById('file');
const runBtn = document.getElementById('run');
const fpsEl = document.getElementById('fps');
const scaleEl = document.getElementById('scale');
const maxFramesEl = document.getElementById('maxFrames');
const progressEl = document.getElementById('progress');
const progressText = document.getElementById('progressText');
const statusEl = document.getElementById('status');
const lottieContainer = document.getElementById('lottieContainer');


function setStatus(txt) { statusEl.textContent = txt; }
function setProgress(v, text = '') {
  progressEl.value = v;
  progressText.textContent = text;
}

async function arrayBufferToDataURL(buffer, mime='image/png') {
  const blob = new Blob([buffer], { type: mime });
  return await new Promise((res) => {
    const reader = new FileReader();
    reader.onload = () => res(reader.result);
    reader.readAsDataURL(blob);
  });
}

runBtn.addEventListener('click', async () => {
  const file = fileInput.files[0];
  if (!file) return alert('请选择一个 MP4 文件');

  const targetFps = Number(fpsEl.value) || 15;
  const scale = Number(scaleEl.value) || 1;
  const maxFrames = Number(maxFramesEl.value) || 150;

 setStatus('加载 ffmpeg 核心...');
 console.log('FFmpeg 实例:', ffmpegInstance);
  if (!ffmpegInstance.isLoaded()) await loadFFmpegCore();


  setStatus('写入视频文件...');
  ffmpegInstance.FS('writeFile', 'input.mp4', await fetchFile(file));

  const scaleFilter = scale < 1 ? `,scale=iw*${scale}:ih*${scale}` : '';
  const vf = `fps=${targetFps}${scaleFilter}`;

  setStatus('开始拆帧...');
  await ffmpeg.run(
    '-i', 'input.mp4',
    '-vf', vf,
    '-vsync', '0',
    'frame_%04d.png'
  );

  setStatus('读取帧文件...');
  let files = ffmpeg.FS('readdir', '/').filter(f => f.endsWith('.png')).sort();

  if (files.length > maxFrames) {
    setStatus(`超过最大帧数限制 (${files.length} > ${maxFrames})，仅保留前 ${maxFrames} 帧`);
    files = files.slice(0, maxFrames);
  }

  const totalFrames = files.length;
  setProgress(0, `读取 ${totalFrames} 帧`);

  const firstBuf = ffmpeg.FS('readFile', files[0]);
  const firstDataURL = await arrayBufferToDataURL(firstBuf.buffer, 'image/png');
  const img = new Image();
  await new Promise(res => { img.onload = res; img.src = firstDataURL; });
  const W = img.width, H = img.height;

  const assets = [];
  for (let i = 0; i < totalFrames; i++) {
    setProgress((i / totalFrames) * 100, `帧 ${i + 1}/${totalFrames}`);
    const buf = ffmpeg.FS('readFile', files[i]);
    const dataURL = await arrayBufferToDataURL(buf.buffer, 'image/png');
    assets.push({
      id: `img_${i}`,
      w: W,
      h: H,
      u: "",
      p: dataURL,
      e: 0
    });
  }

  const layers = assets.map((asset, idx) => ({
    ddd: 0,
    ind: idx + 1,
    ty: 2,
    nm: `frame_${idx}`,
    refId: asset.id,
    ks: {
      o: { a: 0, k: 100 },
      r: { a: 0, k: 0 },
      p: { a: 0, k: [W / 2, H / 2, 0] },
      a: { a: 0, k: [W / 2, H / 2, 0] },
      s: { a: 0, k: [100, 100, 100] }
    },
    ip: idx,
    op: idx + 1,
    st: idx,
    bm: 0
  }));

  const animation = {
    v: "5.7.1",
    fr: targetFps,
    ip: 0,
    op: totalFrames,
    w: W,
    h: H,
    nm: "Video Frame Sequence",
    assets,
    layers
  };

  setProgress(100, '播放中...');
  setStatus(`完成 ${totalFrames} 帧 (${W}x${H})`);

  lottieContainer.innerHTML = '';
  lottie.loadAnimation({
    container: lottieContainer,
    renderer: 'svg',
    loop: true,
    autoplay: true,
    animationData: animation
  });
});
