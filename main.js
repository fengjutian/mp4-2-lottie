
const { createFFmpeg, fetchFile } = FFmpeg; 

const ffmpeg = createFFmpeg({ log: true });

async function loadFFmpegCore() {
  const base = 'https://app.unpkg.com/@ffmpeg/core@0.12.6/files/dist/esm';
  await ffmpeg.load({
    coreURL: `${base}/ffmpeg-core.js`,
    wasmURL: `${base}/ffmpeg-core.wasm`,
//     workerURL: `${base}/ffmpeg-core.worker.js`
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

//const baseURL = 'https://unpkg.com/@ffmpeg/core-mt@0.12.6/dist';

// const ffmpeg = createFFmpeg({ log: true });

// const ffmpeg = createFFmpeg({ log: true, corePath: 'ffmpeg-core.js' });

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
  if (!ffmpeg.isLoaded()) await loadFFmpegCore();

//   setStatus('加载 ffmpeg.wasm...');
//   if (!ffmpeg.isLoaded()) await ffmpeg.load();

  setStatus('写入视频文件...');
  ffmpeg.FS('writeFile', 'input.mp4', await fetchFile(file));

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
