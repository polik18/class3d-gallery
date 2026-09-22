import assert from 'node:assert/strict';
import test from 'node:test';
import { createAssetRecord, displayNameFromFileName } from '../src/assets/types.ts';
import { GalleryController } from '../src/gallery/galleryController.ts';
import { exportCommentsCsv } from '../src/engagement/export.ts';
import { createEngagementDatabase, createEmptyEngagement } from '../src/engagement/types.ts';

test('gallery keeps all 200 works usable across sort, category and selection modes', () => {
  const assets = Array.from({ length: 200 }, (_, index) => {
    const order = index + 1;
    return {
      ...createAssetRecord({
        id: `asset-${order}`,
        originalFileName: `${String(order).padStart(3, '0')}_作品 ${order}.png`,
        kind: 'image',
        category: `分類 ${order % 8}`,
        importOrder: index,
        importedAt: 1_000 + index
      }),
      displayNumber: order,
      numberType: 'sequence' as const,
      status: 'ready' as const
    };
  });
  const gallery = new GalleryController(assets);
  assert.equal(gallery.getVisibleAssets().length, 200);
  gallery.setSort({ key: 'importedAt', direction: 'descending' });
  assert.equal(gallery.getVisibleAssets()[0].id, 'asset-200');
  gallery.setCategory('分類 3');
  assert.equal(gallery.getVisibleAssets().length, 25);
  gallery.setSelection(assets.filter((_, index) => index % 4 === 0).map((asset) => asset.id));
  gallery.setMode('selection');
  assert.equal(gallery.getVisibleAssets().length, 50);
});

test('hostile-looking filenames remain literal display text', () => {
  const hostile = '<img src=x onerror="globalThis.compromised=true">.png';
  assert.equal(displayNameFromFileName(hostile), '<img src=x onerror="globalThis.compromised=true">');
});

test('CSV export neutralizes every spreadsheet formula prefix', () => {
  const database = createEngagementDatabase(1);
  const engagement = createEmptyEngagement('asset-1', 1);
  engagement.comments = ['=', '+', '-', '@'].map((prefix, index) => ({
    schema: 'class3d-comment-v1',
    id: `comment-${index}`,
    exhibitionId: 'show',
    assetId: 'asset-1',
    body: `${prefix}danger`,
    approved: true,
    createdAt: 1
  }));
  database.assets['asset-1'] = engagement;
  const csv = exportCommentsCsv(database);
  for (const prefix of ['=', '+', '-', '@']) assert(csv.includes(`"'${prefix}danger"`));
});
