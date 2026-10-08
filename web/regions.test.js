import test from 'node:test';
import assert from 'node:assert/strict';
import {restrictRestoration} from './regions.js';

function fixture(width, height) {
  const original = {width, height, data: new Uint8ClampedArray(width * height * 4)};
  const restored = {width, height, data: new Uint8ClampedArray(width * height * 4)};
  for (let i = 0; i < original.data.length; i++) {
    original.data[i] = i % 113;
    restored.data[i] = 150 + i % 100;
  }
  return {original, restored};
}

function assertPixels(original, restored, processed, selected) {
  for (let y = 0; y < original.height; y++) for (let x = 0; x < original.width; x++) {
    const i = (y * original.width + x) * 4;
    const expected = selected(x, y) ? processed : original.data;
    assert.deepEqual(restored.data.subarray(i, i + 4), expected.subarray(i, i + 4), `pixel ${x},${y}, including alpha`);
  }
}

test('selected restoration preserves every original channel outside the selected area', () => {
  const {original, restored} = fixture(8, 6), before = new Uint8ClampedArray(original.data), processed = new Uint8ClampedArray(restored.data);
  assert.equal(restrictRestoration(original, restored, [{x: .25, y: 1 / 6, w: .5, h: .5}]), true);
  assertPixels(original, restored, processed, (x, y) => x >= 2 && x < 6 && y >= 1 && y < 4);
  assert.deepEqual(original.data, before, 'input original remains unchanged');
});

test('overlapping selections preserve their union without applying restoration twice', () => {
  const {original, restored} = fixture(8, 8), processed = new Uint8ClampedArray(restored.data);
  assert.equal(restrictRestoration(original, restored, [
    {x: .125, y: .125, w: .5, h: .5},
    {x: .375, y: .375, w: .5, h: .5},
  ]), true);
  assertPixels(original, restored, processed, (x, y) => (x >= 1 && x < 5 && y >= 1 && y < 5) || (x >= 3 && x < 7 && y >= 3 && y < 7));
});

test('fractional selections map to full source pixels and clip a cropped video ROI', () => {
  const {original, restored} = fixture(4, 4), processed = new Uint8ClampedArray(restored.data);
  // A 4x4 ROI at source (5,2) in a 13x7 frame; selection covers source x=6..9,y=1..4.
  assert.equal(restrictRestoration(original, restored, [{x: .5, y: .2, w: .2, h: .4}], {x: 5, y: 2, width: 13, height: 7}), true);
  assertPixels(original, restored, processed, (x, y) => x >= 1 && x < 4 && y >= 0 && y < 3);
});

test('a selection outside the video ROI restores the original and reports no applied pixels', () => {
  const {original, restored} = fixture(4, 3);
  assert.equal(restrictRestoration(original, restored, [{x: 0, y: 0, w: .1, h: .1}], {x: 40, y: 20, width: 100, height: 60}), false);
  assert.deepEqual(restored.data, original.data);
});

test('selection alone does not report restoration when selected pixels did not change', () => {
  const {original, restored} = fixture(4, 4);
  // Only unselected pixels were changed by the candidate processor.
  for (let y = 0; y < 2; y++) restored.data.set(original.data.subarray(y * 16, y * 16 + 8), y * 16);
  assert.equal(restrictRestoration(original, restored, [{x: 0, y: 0, w: .5, h: .5}]), false);
  assert.deepEqual(restored.data, original.data);
});

test('empty selections preserve unrestricted restoration, while mismatched sizes fail', () => {
  const {original, restored} = fixture(3, 2), processed = new Uint8ClampedArray(restored.data);
  assert.equal(restrictRestoration(original, restored, []), true);
  assert.deepEqual(restored.data, processed);
  assert.throws(() => restrictRestoration(original, {...restored, width: 4}, []), RangeError);
});
