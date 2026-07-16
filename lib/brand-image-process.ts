/**
 * 회사 로고·직인 업로드 전처리 (브라우저 Canvas).
 * - 가장자리 기준 배경 누끼(투명 처리)
 * - 내용물 바운딩 박스 크롭
 * - 용도별 최대 크기 리사이즈 (로고/직인)
 * - 투명 PNG 로 출력
 */

export type BrandImageKind = 'logo' | 'seal';

export type BrandImageProcessOptions = {
  kind: BrandImageKind;
  /** 누끼 비활성화 (이미 투명 PNG 인 경우 등) */
  skipNuki?: boolean;
};

export type BrandImageProcessResult = {
  file: File;
  width: number;
  height: number;
  removedBg: boolean;
};

const MAX_EDGE: Record<BrandImageKind, number> = {
  logo: 512,
  seal: 400,
};

const NUKI_COLOR_THRESHOLD: Record<BrandImageKind, number> = {
  // 로고: 흰/밝은 배경 위주
  logo: 42,
  // 직인: 흰 종이 배경 + 약간의 그림자까지 제거
  seal: 48,
};

function colorDistance(r1: number, g1: number, b1: number, r2: number, g2: number, b2: number) {
  const dr = r1 - r2;
  const dg = g1 - g2;
  const db = b1 - b2;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('이미지를 불러오지 못했습니다.'));
    };
    img.src = url;
  });
}

function sampleCornerAverage(data: Uint8ClampedArray, width: number, height: number) {
  const samples: Array<[number, number]> = [
    [0, 0],
    [width - 1, 0],
    [0, height - 1],
    [width - 1, height - 1],
    [Math.floor(width / 2), 0],
    [Math.floor(width / 2), height - 1],
    [0, Math.floor(height / 2)],
    [width - 1, Math.floor(height / 2)],
  ];
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (const [x, y] of samples) {
    if (x < 0 || y < 0 || x >= width || y >= height) continue;
    const i = (y * width + x) * 4;
    // 이미 투명한 코너는 배경 샘플에서 제외
    if (data[i + 3] < 16) continue;
    r += data[i];
    g += data[i + 1];
    b += data[i + 2];
    n += 1;
  }
  if (n === 0) return { r: 255, g: 255, b: 255 };
  return { r: Math.round(r / n), g: Math.round(g / n), b: Math.round(b / n) };
}

function estimateTransparentRatio(data: Uint8ClampedArray) {
  let transparent = 0;
  const total = data.length / 4;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] < 16) transparent += 1;
  }
  return total > 0 ? transparent / total : 0;
}

/**
 * 가장자리에서 시작해 배경색과 유사한 픽셀을 flood-fill 로 투명 처리.
 * (로고 내부의 흰색 글자/영역은 가장자리와 연결되지 않으면 보존)
 */
function applyEdgeNuki(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  bg: { r: number; g: number; b: number },
  threshold: number,
) {
  const total = width * height;
  const visited = new Uint8Array(total);
  const queue = new Int32Array(total);
  let qh = 0;
  let qt = 0;

  const pushIfBg = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const idx = y * width + x;
    if (visited[idx]) return;
    const i = idx * 4;
    if (data[i + 3] < 8) {
      visited[idx] = 1;
      return;
    }
    const dist = colorDistance(data[i], data[i + 1], data[i + 2], bg.r, bg.g, bg.b);
    if (dist > threshold) return;
    visited[idx] = 1;
    queue[qt++] = idx;
  };

  for (let x = 0; x < width; x += 1) {
    pushIfBg(x, 0);
    pushIfBg(x, height - 1);
  }
  for (let y = 0; y < height; y += 1) {
    pushIfBg(0, y);
    pushIfBg(width - 1, y);
  }

  while (qh < qt) {
    const idx = queue[qh++];
    const i = idx * 4;
    data[i + 3] = 0;
    const x = idx % width;
    const y = (idx / width) | 0;
    pushIfBg(x + 1, y);
    pushIfBg(x - 1, y);
    pushIfBg(x, y + 1);
    pushIfBg(x, y - 1);
  }
}

function findContentBounds(data: Uint8ClampedArray, width: number, height: number, alphaMin = 12) {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const a = data[(y * width + x) * 4 + 3];
      if (a < alphaMin) continue;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0 || maxY < 0) {
    return { minX: 0, minY: 0, maxX: width - 1, maxY: height - 1 };
  }
  // 살짝 여백
  const pad = Math.max(2, Math.round(Math.min(width, height) * 0.02));
  return {
    minX: Math.max(0, minX - pad),
    minY: Math.max(0, minY - pad),
    maxX: Math.min(width - 1, maxX + pad),
    maxY: Math.min(height - 1, maxY + pad),
  };
}

function canvasToPngFile(canvas: HTMLCanvasElement, baseName: string): Promise<File> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('PNG 변환에 실패했습니다.'));
          return;
        }
        const safe = baseName.replace(/\.[^.]+$/, '').replace(/[^\w가-힣-]+/g, '_') || 'brand';
        resolve(new File([blob], `${safe}.png`, { type: 'image/png' }));
      },
      'image/png',
      1,
    );
  });
}

/**
 * 로고/직인 파일을 누끼·크롭·리사이즈 후 투명 PNG File 로 반환.
 */
export async function processBrandImage(
  file: File,
  options: BrandImageProcessOptions,
): Promise<BrandImageProcessResult> {
  if (typeof window === 'undefined') {
    throw new Error('이미지 처리는 브라우저에서만 가능합니다.');
  }
  if (!file.type.startsWith('image/')) {
    throw new Error('이미지 파일만 업로드할 수 있습니다.');
  }

  const kind = options.kind;
  const img = await loadImageFromFile(file);
  const srcW = Math.max(1, img.naturalWidth || img.width);
  const srcH = Math.max(1, img.naturalHeight || img.height);

  const work = document.createElement('canvas');
  work.width = srcW;
  work.height = srcH;
  const ctx = work.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas 를 사용할 수 없습니다.');
  ctx.clearRect(0, 0, srcW, srcH);
  ctx.drawImage(img, 0, 0);

  const imageData = ctx.getImageData(0, 0, srcW, srcH);
  const data = imageData.data;
  const alreadyTransparent = estimateTransparentRatio(data) > 0.08;
  let removedBg = false;

  if (!options.skipNuki && !alreadyTransparent) {
    const bg = sampleCornerAverage(data, srcW, srcH);
    applyEdgeNuki(data, srcW, srcH, bg, NUKI_COLOR_THRESHOLD[kind]);
    ctx.putImageData(imageData, 0, 0);
    removedBg = true;
  }

  // 크롭
  const bounds = findContentBounds(data, srcW, srcH);
  const cropW = Math.max(1, bounds.maxX - bounds.minX + 1);
  const cropH = Math.max(1, bounds.maxY - bounds.minY + 1);

  const cropped = document.createElement('canvas');
  cropped.width = cropW;
  cropped.height = cropH;
  const cctx = cropped.getContext('2d');
  if (!cctx) throw new Error('Canvas 를 사용할 수 없습니다.');
  cctx.clearRect(0, 0, cropW, cropH);
  cctx.drawImage(work, bounds.minX, bounds.minY, cropW, cropH, 0, 0, cropW, cropH);

  // 용도별 최대 변 길이로 리사이즈 (비율 유지)
  const maxEdge = MAX_EDGE[kind];
  const scale = Math.min(1, maxEdge / Math.max(cropW, cropH));
  const outW = Math.max(1, Math.round(cropW * scale));
  const outH = Math.max(1, Math.round(cropH * scale));

  const out = document.createElement('canvas');
  out.width = outW;
  out.height = outH;
  const octx = out.getContext('2d');
  if (!octx) throw new Error('Canvas 를 사용할 수 없습니다.');
  octx.imageSmoothingEnabled = true;
  octx.imageSmoothingQuality = 'high';
  octx.clearRect(0, 0, outW, outH);
  octx.drawImage(cropped, 0, 0, outW, outH);

  const processed = await canvasToPngFile(out, file.name || kind);
  return {
    file: processed,
    width: outW,
    height: outH,
    removedBg: removedBg || alreadyTransparent,
  };
}
