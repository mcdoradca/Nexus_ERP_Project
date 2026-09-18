// Auto-extracted module: ADRPictogramGenerator
const fs = require('fs');
const path = require('path');

class ADRPictogramGenerator {
  static bufferCache = {};

  static async generateAdrLabelBuffer(classCode = '3', size = 180) {
    const norm = String(classCode || '3').trim().replace(/[^0-9]/g, '');
    const cacheKey = `ADR_${norm}_${size}`;
    if (this.bufferCache[cacheKey]) return this.bufferCache[cacheKey];

    const assetPath = path.join(__dirname, 'assets', 'pictograms', 'adr', `ADR_${norm}.svg`);
    if (fs.existsSync(assetPath)) {
      try {
        const svgContent = fs.readFileSync(assetPath);
        if (sharp) {
          const buffer = await sharp(svgContent).resize(size, size, { fit: 'contain' }).png().toBuffer();
          this.bufferCache[cacheKey] = buffer;
          return buffer;
        }
      } catch (err) {
        console.warn(`[ADRPictogramGenerator] Błąd sharp dla ADR_${norm}: ${err.message}`);
      }
    }

    // Fallback PurePngEncoder
    const rgba = Buffer.alloc(size * size * 4, 0);
    const cx = Math.floor(size / 2); const cy = Math.floor(size / 2);
    const margin = Math.floor(size * 0.08); const maxDist = cx - margin;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (Math.abs(x - cx) + Math.abs(y - cy) <= maxDist) {
          const idx = (y * size + x) * 4;
          rgba[idx] = 211; rgba[idx+1] = 47; rgba[idx+2] = 47; rgba[idx+3] = 255;
        }
      }
    }
    const buf = PurePngEncoder.encodeRGBA(size, size, rgba);
    this.bufferCache[cacheKey] = buf;
    return buf;
  }

  static async generateLqMarkBuffer(size = 180) {
    const cacheKey = `ADR_LQ_${size}`;
    if (this.bufferCache[cacheKey]) return this.bufferCache[cacheKey];

    const assetPath = path.join(__dirname, 'assets', 'pictograms', 'adr', 'ADR_LQ.svg');
    if (fs.existsSync(assetPath)) {
      try {
        const svgContent = fs.readFileSync(assetPath);
        if (sharp) {
          const buffer = await sharp(svgContent).resize(size, size, { fit: 'contain' }).png().toBuffer();
          this.bufferCache[cacheKey] = buffer;
          return buffer;
        }
      } catch (err) {
        console.warn(`[ADRPictogramGenerator] Błąd sharp dla ADR_LQ: ${err.message}`);
      }
    }

    // Fallback PurePngEncoder
    const rgba = Buffer.alloc(size * size * 4, 0);
    const cx = Math.floor(size / 2); const cy = Math.floor(size / 2);
    const margin = Math.floor(size * 0.08); const maxDist = cx - margin;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (Math.abs(x - cx) + Math.abs(y - cy) <= maxDist) {
          const idx = (y * size + x) * 4;
          rgba[idx] = 255; rgba[idx+1] = 255; rgba[idx+2] = 255; rgba[idx+3] = 255;
        }
      }
    }
    const buf = PurePngEncoder.encodeRGBA(size, size, rgba);
    this.bufferCache[cacheKey] = buf;
    return buf;
  }
}

// ============================================================================
// 8. G?ÓWNY SILNIK PARSERA I KWARANTANNY
// ============================================================================

module.exports = { ADRPictogramGenerator };
