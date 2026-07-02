import sharp from 'sharp';
import path from 'path';

const root = process.cwd();
const SRC = path.join(root, 'electron-app', 'app-icon2.png');

async function run() {
  try {
    // 텍스트를 자르지 않고, 전체 로고 영역의 투명 여백만 잘라내어 바운딩 박스를 추출합니다.
    const trimmed = await sharp(SRC).trim({ threshold: 10 }).toBuffer();
    const meta = await sharp(trimmed).metadata();
    console.log('Trimmed full logo with text:', meta.width, 'x', meta.height);

    // favicon을 만들기 위해 256x256 크기의 투명한 캔버스를 준비합니다.
    const size = 256;
    const resized = await sharp(trimmed)
      .resize(size, size, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
      .toBuffer();
      
    await sharp({ create: { width: size, height: size, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 0 } } })
      .composite([{ input: resized, gravity: 'centre' }])
      .png()
      .toFile(path.join(root, 'public', 'favicon-tab.png'));
      
    console.log('Generated public/favicon-tab.png with only the triangle symbol!');
  } catch (err) {
    console.error(err);
  }
}
run();
