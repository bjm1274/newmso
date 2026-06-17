import sharp from 'sharp';
import path from 'path';

const root = process.cwd();
const SRC = path.join(root, 'electron-app', 'app-icon2.png');

async function makeSquare(logoBuf, size, marginRatio, outPath) {
  const inner = Math.round(size * (1 - marginRatio * 2));
  const resized = await sharp(logoBuf)
    .resize(inner, inner, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
    .toBuffer();
  await sharp({ create: { width: size, height: size, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 0 } } })
    .composite([{ input: resized, gravity: 'centre' }])
    .png()
    .toFile(outPath);
  console.log(`Generated ${outPath}`);
}

async function run() {
  try {
    const trimmed = await sharp(SRC).trim({ threshold: 10 }).toBuffer();
    const meta = await sharp(trimmed).metadata();
    
    // Extract top triangle part
    const cropHeight = Math.floor(meta.height * 0.7);
    const triangleOnly = await sharp(trimmed)
      .extract({ left: 0, top: 0, width: meta.width, height: cropHeight })
      .trim({ threshold: 10 })
      .toBuffer();

    // Generate PWA icons with a bit of padding (e.g. 10%) so it sits nicely in the splash screen
    await makeSquare(triangleOnly, 192, 0.1, path.join(root, 'public', 'icon-192x192.png'));
    await makeSquare(triangleOnly, 512, 0.15, path.join(root, 'public', 'icon-512x512.png'));
    await makeSquare(triangleOnly, 180, 0.15, path.join(root, 'public', 'apple-touch-icon.png'));
    
  } catch (err) {
    console.error(err);
  }
}
run();
