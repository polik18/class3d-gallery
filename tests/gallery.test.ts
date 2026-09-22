import assert from 'node:assert/strict';
import test from 'node:test';
import { createAssetRecord, type AssetRecord } from '../src/assets/types.ts';
import { GalleryController } from '../src/gallery/galleryController.ts';
import { popularityScore, sortAssets } from '../src/gallery/sort.ts';

function asset(id: string, input: Partial<AssetRecord> = {}) {
  return {
    ...createAssetRecord({ id, originalFileName: `${id}.jpg`, kind: 'image', importOrder: Number(id.replace(/\D/g, '')) || 0, importedAt: 100 }),
    ...input
  } as AssetRecord;
}

const fixtures = () => [
  asset('a1', { title: '作品 10', category: '繪畫', displayNumber: 10, numberType: 'seat', importedAt: 300, manualOrder: 2, popularity: { humanViews: 2, likes: 1, approvedComments: 0, interactions: 2, dwellTimeMs: 0 } }),
  asset('a2', { title: '作品 2', category: '攝影', displayNumber: 2, numberType: 'seat', importedAt: 100, manualOrder: 3, popularity: { humanViews: 3, likes: 5, approvedComments: 2, interactions: 4, dwellTimeMs: 20_000 } }),
  asset('a3', { title: '作品 3', category: '繪畫', displayNumber: 3, numberType: 'sequence', importedAt: 200, manualOrder: 1, popularity: { humanViews: 1, likes: 2, approvedComments: 1, interactions: 1, dwellTimeMs: 10_000 } }),
  asset('a4', { title: '沒有編號', category: '3D', importedAt: 400 })
];

test('seat-number sorting prioritizes matching number type and leaves missing numbers last', () => {
  assert.deepEqual(sortAssets(fixtures(), { key: 'number', direction: 'ascending', numberType: 'seat' }).map((item) => item.id), ['a2', 'a1', 'a3', 'a4']);
  assert.deepEqual(sortAssets(fixtures(), { key: 'number', direction: 'descending', numberType: 'seat' }).map((item) => item.id), ['a1', 'a2', 'a3', 'a4']);
});

test('category and title sorting uses natural Traditional Chinese comparison', () => {
  assert.deepEqual(sortAssets(fixtures(), { key: 'category', direction: 'ascending' }).map((item) => item.id), ['a4', 'a3', 'a1', 'a2']);
});

test('import time and manual order can be sorted independently', () => {
  assert.deepEqual(sortAssets(fixtures(), { key: 'importedAt', direction: 'descending' }).map((item) => item.id), ['a4', 'a1', 'a3', 'a2']);
  assert.deepEqual(sortAssets(fixtures(), { key: 'manual', direction: 'ascending' }).map((item) => item.id), ['a3', 'a1', 'a2', 'a4']);
  assert.deepEqual(sortAssets(fixtures(), { key: 'manual', direction: 'descending' }).map((item) => item.id), ['a2', 'a1', 'a3', 'a4']);
});

test('popularity score includes likes, approved comments, views, interactions and dwell time', () => {
  const items = fixtures();
  assert.equal(popularityScore(items[1]), 40);
  assert.deepEqual(sortAssets(items, { key: 'popularity', direction: 'descending' }).map((item) => item.id), ['a2', 'a3', 'a1', 'a4']);
});

test('sorting is stable and never mutates the source array', () => {
  const items = [asset('a1'), asset('a2')];
  const result = sortAssets(items, { key: 'importedAt', direction: 'ascending' });
  assert.deepEqual(result.map((item) => item.id), ['a1', 'a2']);
  assert.notEqual(result, items);
});

test('controller switches among all, category, selection and solo exhibitions', () => {
  const controller = new GalleryController(fixtures());
  assert.equal(controller.getVisibleAssets().length, 4);
  controller.setCategory('繪畫');
  assert.deepEqual(controller.getVisibleAssets().map((item) => item.id), ['a1', 'a3']);
  controller.setSelection(['a2', 'a4']);
  controller.setMode('selection');
  assert.deepEqual(controller.getVisibleAssets().map((item) => item.id), ['a2', 'a4']);
  controller.focusAsset('a3');
  assert.deepEqual(controller.getVisibleAssets().map((item) => item.id), ['a3']);
  controller.setMode('all');
  assert.equal(controller.getVisibleAssets().length, 4);
});

test('controller removes stale selections when the asset collection changes', () => {
  const controller = new GalleryController(fixtures());
  controller.setSelection(['a1', 'a2', 'missing']);
  controller.setAssets([fixtures()[0]]);
  assert.deepEqual(controller.getState().selectedAssetIds, ['a1']);
});

test('controller reports invalid category and artwork targets', () => {
  const controller = new GalleryController(fixtures());
  assert.throws(() => controller.setCategory('不存在'), /找不到分類/);
  assert.throws(() => controller.focusAsset('missing'), /找不到作品/);
  assert.throws(() => controller.toggleSelection('missing'), /找不到作品/);
});
