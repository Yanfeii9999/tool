import {applyVideoResidualCleanup} from './vendor/gemini/src/video/videoCleanupBackends.js';

let scratch = null;

/**
 * Polish residual Gemini logo edges after reverse-alpha removal.
 * For best context, pass a padded source patch and the logo's local position.
 * Omitting position treats the supplied image as the exact logo template ROI.
 */
export function cleanupGeminiRoi(roi, alphaMap, position = null) {
  if (!roi?.data || !Number.isInteger(roi.width) || !Number.isInteger(roi.height) || roi.width <= 0 || roi.height <= 0) {
    throw new TypeError('Vùng ảnh Gemini không hợp lệ.');
  }
  const p = position || {x: 0, y: 0, width: roi.width, height: roi.height};
  if (![p.x, p.y, p.width, p.height].every(Number.isInteger) || p.x < 0 || p.y < 0 || p.width <= 0 || p.height <= 0 || p.x + p.width > roi.width || p.y + p.height > roi.height || alphaMap?.length !== p.width * p.height) {
    throw new RangeError('Mẫu alpha Gemini không khớp vùng logo.');
  }
  if (!scratch) {
    if (typeof OffscreenCanvas !== 'undefined') scratch = new OffscreenCanvas(roi.width, roi.height);
    else if (typeof document !== 'undefined') scratch = document.createElement('canvas');
    else throw new Error('Trình duyệt không hỗ trợ canvas xử lý Gemini.');
  }
  if (scratch.width !== roi.width) scratch.width = roi.width;
  if (scratch.height !== roi.height) scratch.height = roi.height;
  const ctx = scratch.getContext('2d', {willReadFrequently: true});
  if (!ctx) throw new Error('Không mở được canvas xử lý Gemini.');
  const image = ctx.createImageData(roi.width, roi.height);
  image.data.set(roi.data);
  ctx.putImageData(image, 0, 0);
  applyVideoResidualCleanup(ctx, p, alphaMap, {
    denoiseBackend: 'canvas-footprint-polish',
    edgeDenoiseStrength: 1,
    residualCleanupStrength: 1.2,
    highQualityCleanup: false,
  });
  return ctx.getImageData(0, 0, roi.width, roi.height);
}
