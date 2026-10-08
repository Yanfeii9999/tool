import {pixelBox} from './repair.js';

// A cropped video ROI still uses selections normalized to the full source frame.
export function restrictRestoration(original, restored, regions = [], options = {}) {
  const roiWidth = original?.width, roiHeight = original?.height;
  const byteLength = roiWidth * roiHeight * 4;
  if (!Number.isInteger(roiWidth) || !Number.isInteger(roiHeight) || roiWidth <= 0 || roiHeight <= 0 ||
      restored?.width !== roiWidth || restored?.height !== roiHeight ||
      original?.data?.length !== byteLength || restored?.data?.length !== byteLength) {
    throw new RangeError('Original and restored pixels must have the same dimensions.');
  }
  if (!regions.length) return true;

  const {x = 0, y = 0, width = roiWidth, height = roiHeight} = options;
  if (![x, y, width, height].every(Number.isInteger) || width <= 0 || height <= 0) {
    throw new RangeError('ROI origin and full-frame dimensions must use integer pixels.');
  }
  const processed = new Uint8ClampedArray(restored.data);
  restored.data.set(original.data);
  let changed = false;
  for (const region of regions) {
    if (![region.x, region.y, region.w, region.h].every(Number.isFinite) || region.w <= 0 || region.h <= 0) continue;
    const box = pixelBox(region, width, height);
    const left = Math.max(0, box.x - x), top = Math.max(0, box.y - y);
    const right = Math.min(roiWidth, box.x + box.w - x), bottom = Math.min(roiHeight, box.y + box.h - y);
    if (left >= right || top >= bottom) continue;
    for (let row = top; row < bottom; row++) {
      const start = (row * roiWidth + left) * 4, end = (row * roiWidth + right) * 4;
      if (!changed) {
        for (let i = start; i < end; i++) {
          if (processed[i] !== original.data[i]) { changed = true; break; }
        }
      }
      restored.data.set(processed.subarray(start, end), start);
    }
  }
  return changed;
}
