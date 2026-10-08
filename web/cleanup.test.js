import test from 'node:test';
import assert from 'node:assert/strict';
import {buildFootprintPolishWeightMap, buildGradientWeightMap} from './vendor/gemini/src/video/videoCleanupBackends.js';
import {cleanupGeminiRoi} from './cleanup.js';

test('residual cleanup follows the alpha footprint and leaves distant corners unweighted', () => {
  const size = 72, alpha = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const distance = Math.abs(x - 35.5) + Math.abs(y - 35.5);
    alpha[y * size + x] = Math.max(0, Math.min(.24, (26 - distance) * .03));
  }
  const original = new Float32Array(alpha);
  const weights = buildFootprintPolishWeightMap(alpha, size, size, 1);
  assert.deepEqual(alpha, original);
  assert.equal(weights[0], 0);
  assert.equal(weights[size - 1], 0);
  assert.equal(weights[size * size - 1], 0);
  assert.ok(weights[35 * size + 35] > .4);
  assert.ok(weights.every(value => value >= 0 && value <= 1));
  assert.ok(weights.filter(value => value > .01).length < size * size / 2);
});

test('absent alpha produces no cleanup footprint or edge weights', () => {
  const alpha = new Float32Array(72 * 72);
  for (const weights of [buildFootprintPolishWeightMap(alpha, 72, 72, 1), buildGradientWeightMap(alpha, 72, 72, 1.2)]) {
    assert.ok(weights.every(value => value === 0));
  }
});

test('cleanup rejects a mismatched template before opening a canvas', () => {
  const image = {width: 16, height: 16, data: new Uint8ClampedArray(16 * 16 * 4)};
  assert.throws(() => cleanupGeminiRoi(image, new Float32Array(8 * 8)), /khớp vùng logo/);
  assert.throws(() => cleanupGeminiRoi(image, new Float32Array(8 * 8), {x: 12, y: 0, width: 8, height: 8}), /khớp vùng logo/);
});
