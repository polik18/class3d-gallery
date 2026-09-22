import type { StoredAsset, StoredAssetFile } from './indexedDb.ts';

const MAGIC = new TextEncoder().encode('C3DGV1\n\0');

interface ArchiveManifest {
  schema: 'class3d-gallery-archive-v1';
  exportedAt: number;
  assets: Array<{
    record: StoredAsset['record'];
    storedAt: number;
    files: Array<{ descriptor: StoredAssetFile['descriptor']; offset: number; length: number; type: string }>;
  }>;
}

export function exportGalleryArchive(assets: StoredAsset[], exportedAt = Date.now()) {
  let offset = 0;
  const blobs: Blob[] = [];
  const manifest: ArchiveManifest = {
    schema: 'class3d-gallery-archive-v1',
    exportedAt,
    assets: assets.map((asset) => ({
      record: asset.record,
      storedAt: asset.storedAt,
      files: asset.files.map(({ descriptor, blob }) => {
        const entry = { descriptor, offset, length: blob.size, type: blob.type };
        offset += blob.size;
        blobs.push(blob);
        return entry;
      })
    }))
  };
  const manifestBytes = new TextEncoder().encode(JSON.stringify(manifest));
  const length = new Uint8Array(4);
  new DataView(length.buffer).setUint32(0, manifestBytes.length, true);
  return new Blob([MAGIC, length, manifestBytes, ...blobs], { type: 'application/x-class3d-gallery' });
}

export async function parseGalleryArchive(archive: Blob): Promise<{ exportedAt: number; assets: StoredAsset[] }> {
  if (archive.size < MAGIC.length + 4) throw new Error('展覽封裝檔過短');
  const header = new Uint8Array(await archive.slice(0, MAGIC.length + 4).arrayBuffer());
  if (!MAGIC.every((value, index) => header[index] === value)) throw new Error('不是有效的 Class3D 展覽封裝');
  const manifestLength = new DataView(header.buffer, MAGIC.length, 4).getUint32(0, true);
  const manifestStart = MAGIC.length + 4;
  const payloadStart = manifestStart + manifestLength;
  if (payloadStart > archive.size) throw new Error('展覽封裝 manifest 已損壞');
  const manifest = JSON.parse(await archive.slice(manifestStart, payloadStart).text()) as ArchiveManifest;
  if (manifest.schema !== 'class3d-gallery-archive-v1' || !Array.isArray(manifest.assets)) throw new Error('展覽封裝 schema 不相容');
  const assets = manifest.assets.map((asset): StoredAsset => ({
    schema: 'class3d-stored-asset-v1',
    record: asset.record,
    storedAt: asset.storedAt,
    files: asset.files.map((file) => {
      if (file.offset < 0 || file.length < 0 || payloadStart + file.offset + file.length > archive.size) throw new Error('展覽封裝檔案範圍已損壞');
      return { descriptor: file.descriptor, blob: archive.slice(payloadStart + file.offset, payloadStart + file.offset + file.length, file.type) };
    })
  }));
  return { exportedAt: manifest.exportedAt, assets };
}
