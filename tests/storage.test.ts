import assert from 'node:assert/strict';
import test from 'node:test';
import { createAssetRecord } from '../src/assets/types.ts';
import { exportGalleryArchive, parseGalleryArchive } from '../src/storage/export.ts';
import { GalleryStorage, type KeyValueDriver } from '../src/storage/indexedDb.ts';

class MemoryDriver implements KeyValueDriver {
  data = new Map<string, unknown>();
  async get<T>(key: string) { return this.data.get(key) as T | undefined; }
  async set<T>(key: string, value: T) { this.data.set(key, value); }
  async delete(key: string) { this.data.delete(key); }
  async keys() { return [...this.data.keys()]; }
  async clear() { this.data.clear(); }
}

function fixture() {
  const blob = new Blob(['model-data'], { type: 'model/gltf-binary' });
  const descriptor = { id: 'file-1', name: '作品.glb', relativePath: '作品.glb', mimeType: blob.type, size: blob.size, lastModified: 1, role: 'primary' as const };
  const record = createAssetRecord({ id: 'asset-1', originalFileName: descriptor.name, kind: 'model3d', importOrder: 0, sourceFiles: [descriptor] });
  return { blob, descriptor, record };
}

test('saves, lists, restores and clears browser-local assets', async () => {
  const driver = new MemoryDriver();
  const storage = new GalleryStorage(driver, async () => ({ usage: 0, quota: 1_000, available: 1_000 }));
  const item = fixture();
  await storage.saveAsset(item.record, [{ descriptor: item.descriptor, blob: item.blob }], 100);
  assert.equal((await storage.getAsset('asset-1'))?.record.savedLocally, true);
  assert.equal((await storage.listAssets()).length, 1);
  await storage.clearAll();
  assert.equal((await storage.listAssets()).length, 0);
});

test('rejects a save that exceeds the safe quota margin', async () => {
  const storage = new GalleryStorage(new MemoryDriver(), async () => ({ usage: 95, quota: 100, available: 5 }));
  const item = fixture();
  await assert.rejects(() => storage.saveAsset(item.record, [{ descriptor: item.descriptor, blob: item.blob }]), /空間不足/);
});

test('full archive preserves records and binary file bytes', async () => {
  const item = fixture();
  const stored = { schema: 'class3d-stored-asset-v1' as const, record: item.record, files: [{ descriptor: item.descriptor, blob: item.blob }], storedAt: 100 };
  const parsed = await parseGalleryArchive(exportGalleryArchive([stored], 200));
  assert.equal(parsed.exportedAt, 200);
  assert.equal(parsed.assets[0].record.id, 'asset-1');
  assert.equal(await parsed.assets[0].files[0].blob.text(), 'model-data');
});

test('corrupt archives are rejected', async () => {
  await assert.rejects(() => parseGalleryArchive(new Blob(['not-an-archive'])), /不是有效/);
});
