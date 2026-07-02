import sharp from 'sharp';
import path from 'path';

const root = process.cwd();
const SRC = path.join(root, 'electron-app', 'app-icon2.png');

async function run() {
  try {
    // We only want the triangle part. The text "AllERP" is at the bottom.
    // Let's first trim the whole image to find the bounding box of the non-transparent area.
    const trimmed = await sharp(SRC).trim({ threshold: 10 }).toBuffer();
    const meta = await sharp(trimmed).metadata();
    console.log('Trimmed full logo:', meta.width, 'x', meta.height);
    
    // Now, we assume the triangle is the top part. The text is at the bottom.
    // We can extract just the top 70% or something.
    // Actually, let's extract the top part. We'll cut off the bottom 30% of the trimmed image, then trim again.
    const cropHeight = Math.floor(meta.height * 0.7);
    const triangleOnly = await sharp(trimmed)
      .extract({ left: 0, top: 0, width: meta.width, height: cropHeight })
      .trim({ threshold: 10 })
      .toBuffer();
      
    const triMeta = await sharp(triangleOnly).metadata();
    console.log('Triangle only:', triMeta.width, 'x', triMeta.height);

    // Make a square for the favicon (0 margin)
    const size = 256;
    const resized = await sharp(triangleOnly)
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
