import sharp from 'sharp';

/**
 * Makes a texture tile without seams: the image shifted by half its size (which wraps
 * cleanly at its edges) shows at the borders, and the original shows in the middle,
 * where the shifted copy has its seam. A smooth falloff joins the two.
 */
export async function makeSeamless(png: Buffer): Promise<Buffer> {
  const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h, channels: ch } = info;
  const out = Buffer.alloc(data.length);
  const edge = (t: number) => Math.min(1, Math.min(t, 1 - t) / 0.25);
  const smooth = (t: number) => t * t * (3 - 2 * t);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const k = smooth(Math.min(edge((x + 0.5) / w), edge((y + 0.5) / h)));
      const i = (y * w + x) * ch;
      const j = (((y + (h >> 1)) % h) * w + ((x + (w >> 1)) % w)) * ch;
      for (let c = 0; c < ch; c++) out[i + c] = Math.round(data[i + c]! * k + data[j + c]! * (1 - k));
    }
  }
  return sharp(out, { raw: { width: w, height: h, channels: ch } }).png().toBuffer();
}
