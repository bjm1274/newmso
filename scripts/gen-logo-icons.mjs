/**
 * gen-logo-icons.mjs
 *
 * 신규 AllERP 로고(electron-app/app-icon2.png, 512x512)를 소스로
 * 웹 favicon / PWA / apple-touch / badge / 로그인·사이드바 브랜드 로고를 생성한다.
 *
 * - 흰 여백을 trim 한 뒤 정사각 캔버스(흰 배경)에 일정 마진으로 재배치 → favicon 가독성 확보.
 * - maskable(192/512)은 안전영역 내에 들어가도록 마진을 둔다.
 * - 전자결재/증명서 문서용 sy-logo.png 는 건드리지 않는다.
 *
 * 실행: node scripts/gen-logo-icons.mjs
 */
import sharp from 'sharp';
import path from 'path';

const root = process.cwd();
const SRC = path.join(root, 'electron-app', 'app-icon2.png');
const WHITE = { r: 255, g: 255, b: 255, alpha: 1 };

async function tightLogo() {
  // alpha → 흰색 평탄화 후, 흰 여백 trim 으로 로고 bbox 추출
  return sharp(SRC).flatten({ background: WHITE }).trim({ threshold: 10 }).png().toBuffer();
}

async function makeSquare(logoBuf, size, marginRatio, outPath) {
  const inner = Math.round(size * (1 - marginRatio * 2));
  const resized = await sharp(logoBuf)
    .resize(inner, inner, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
    .toBuffer();
  await sharp({ create: { width: size, height: size, channels: 4, background: WHITE } })
    .composite([{ input: resized, gravity: 'centre' }])
    .png()
    .toFile(outPath);
  console.log('wrote', path.relative(root, outPath), `${size}x${size}`);
}

const logo = await tightLogo();
const m = await sharp(logo).metadata();
console.log('tight logo bbox:', `${m.width}x${m.height}`);

// 웹 favicon / PWA / 모바일
await makeSquare(logo, 256, 0.02, path.join(root, 'app', 'icon.png'));
await makeSquare(logo, 192, 0.02, path.join(root, 'public', 'icon-192x192.png'));
await makeSquare(logo, 512, 0.02, path.join(root, 'public', 'icon-512x512.png'));
await makeSquare(logo, 180, 0.02, path.join(root, 'public', 'apple-touch-icon.png'));
await makeSquare(logo, 72, 0.02, path.join(root, 'public', 'badge-72x72.png'));

// 로그인 / PC 사이드바 브랜드 로고 (object-contain + mixBlendMode multiply, 흰 배경 필요)
await makeSquare(logo, 512, 0.08, path.join(root, 'public', 'aiierp-logo.png'));

console.log('done');
