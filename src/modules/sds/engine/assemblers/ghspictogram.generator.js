// Auto-extracted module: GHSPictogramGenerator
const fs = require('fs');
const path = require('path');

class GHSPictogramGenerator {
  static bufferCache = {};

  static async generatePictogramBuffer(ghsCode, size = 180) {
    const code = (ghsCode || "").toUpperCase().trim();
    const cacheKey = `${code}_${size}`;
    if (this.bufferCache[cacheKey]) return this.bufferCache[cacheKey];

    const assetPath = path.join(__dirname, 'assets', 'pictograms', 'ghs', `${code}.svg`);
    if (fs.existsSync(assetPath)) {
      try {
        const svgContent = fs.readFileSync(assetPath);
        if (sharp) {
          const buffer = await sharp(svgContent).resize(size, size, { fit: 'contain' }).png().toBuffer();
          this.bufferCache[cacheKey] = buffer;
          return buffer;
        }
      } catch (err) {
        console.warn(`[GHSPictogramGenerator] Błąd sharp dla ${code}: ${err.message}. Przełączam na fallback.`);
      }
    }

    // Fallback PurePngEncoder
    const rgba = Buffer.alloc(size * size * 4, 0);
    const cx = Math.floor(size / 2); const cy = Math.floor(size / 2);
    const margin = Math.floor(size * 0.08); const maxDist = cx - margin;
    const borderWidth = Math.max(5, Math.floor(size * 0.07));

    const setPixel = (x, y, r, g, b, a) => {
      if (x >= 0 && x < size && y >= 0 && y < size) {
        const idx = (y * size + x) * 4;
        rgba[idx] = r; rgba[idx+1] = g; rgba[idx+2] = b; rgba[idx+3] = a;
      }
    };

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dist = Math.abs(x - cx) + Math.abs(y - cy);
        if (dist <= maxDist) {
          if (dist >= maxDist - borderWidth) setPixel(x, y, 204, 0, 0, 255);
          else setPixel(x, y, 255, 255, 255, 255);
        }
      }
    }
    const fillRect = (x0, y0, x1, y1) => {
      for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) {
        for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) {
          if (Math.abs(x - cx) + Math.abs(y - cy) < maxDist - borderWidth) setPixel(x, y, 25, 25, 25, 255);
        }
      }
    };
    fillRect(cx - Math.floor(size*0.04), cy - Math.floor(size*0.22), cx + Math.floor(size*0.04), cy + Math.floor(size*0.08));
    fillRect(cx - Math.floor(size*0.045), cy + Math.floor(size*0.13), cx + Math.floor(size*0.045), cy + Math.floor(size*0.21));
    const fallbackBuffer = PurePngEncoder.encodeRGBA(size, size, rgba);
    this.bufferCache[cacheKey] = fallbackBuffer;
    return fallbackBuffer;
  }
}


module.exports = { GHSPictogramGenerator };
