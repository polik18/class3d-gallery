import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createAssetRecord,
  parseAssetCollection,
  serializeAssetCollection
} from '../src/assets/types.ts';
import {
  createDefaultGalleryState,
  createExhibitionSettings,
  DEFAULT_AUTO_SHOWCASE,
  parseExhibitionSettings,
  serializeExhibitionSettings
} from '../src/exhibition/types.ts';

test('filename becomes the default artwork title and description', () => {
  const asset = createAssetRecord({
    id: 'asset-1',
    originalFileName: '用回收材料打造的未來城市.glb',
    kind: 'model3d',
    importedAt: 100,
    importOrder: 0
  });
  assert.equal(asset.title, '用回收材料打造的未來城市');
  assert.equal(asset.description, '用回收材料打造的未來城市');
  assert.equal(asset.popularity.likes, 0);
});

test('asset collection survives serialization and restoration', () => {
  const asset = createAssetRecord({
    id: 'asset-2',
    originalFileName: '12__未來城市__王小明.jpg',
    kind: 'image',
    importedAt: 200,
    importOrder: 1
  });
  const restored = parseAssetCollection(serializeAssetCollection([asset], 300));
  assert.deepEqual(restored.assets, [asset]);
  assert.equal(restored.exportedAt, 300);
});

test('asset collection rejects an unknown asset kind', () => {
  const asset = createAssetRecord({
    id: 'asset-3',
    originalFileName: 'work.bin',
    kind: 'unsupported',
    importOrder: 2
  });
  const payload = JSON.parse(serializeAssetCollection([asset]));
  payload.assets[0].kind = 'executable';
  assert.throws(() => parseAssetCollection(JSON.stringify(payload)), /invalid kind/);
});

test('exhibition defaults match the approved local showcase plan', () => {
  const settings = createExhibitionSettings({ id: 'exhibition-1', title: '三年一班創意展' }, 1_000);
  assert.equal(settings.title, '三年一班創意展');
  assert.equal(settings.engagement.commentModeration, true);
  assert.equal(settings.autoShowcase.idleDelayMs, 30_000);
  assert.equal(settings.autoShowcase.carouselDurationMs, 90_000);
  assert.deepEqual(settings.autoShowcase, DEFAULT_AUTO_SHOWCASE);
});

test('exhibition settings survive serialization and restoration', () => {
  const settings = createExhibitionSettings({ id: 'exhibition-2', title: '數位藝術展', curator: '三年一班' }, 2_000);
  assert.deepEqual(parseExhibitionSettings(serializeExhibitionSettings(settings)), settings);
});

test('invalid automatic showcase durations are rejected', () => {
  const settings = createExhibitionSettings({ id: 'exhibition-3' }, 3_000);
  settings.autoShowcase.titleDurationMs = 0;
  assert.throws(() => parseExhibitionSettings(JSON.stringify(settings)), /titleDurationMs/);
});

test('gallery state starts in seat-number all-exhibition mode', () => {
  const state = createDefaultGalleryState();
  assert.equal(state.mode, 'all');
  assert.deepEqual(state.sort, { key: 'number', direction: 'ascending', numberType: 'seat' });
});
