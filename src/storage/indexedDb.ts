import { clear, createStore, del, get, keys, set } from 'idb-keyval';
import type { AssetFileDescriptor, AssetRecord } from '../assets/types.ts';

export interface StoredAssetFile {
  descriptor: AssetFileDescriptor;
  blob: Blob;
}

export interface StoredAsset {
  schema: 'class3d-stored-asset-v1';
  record: AssetRecord;
  files: StoredAssetFile[];
  storedAt: number;
}

export interface StorageEstimate {
  usage: number;
  quota: number;
  available: number;
}

export interface KeyValueDriver {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<void>;
  keys(): Promise<string[]>;
  clear(): Promise<void>;
}

const ASSET_PREFIX = 'asset:';

export class IndexedDbDriver implements KeyValueDriver {
  private readonly store = createStore('class3d-gallery-v2', 'gallery');
  get<T>(key: string) { return get<T>(key, this.store); }
  set<T>(key: string, value: T) { return set(key, value, this.store); }
  delete(key: string) { return del(key, this.store); }
  async keys() { return (await keys(this.store)).map(String); }
  clear() { return clear(this.store); }
}

export async function estimateBrowserStorage(): Promise<StorageEstimate | null> {
  if (!navigator.storage?.estimate) return null;
  const estimate = await navigator.storage.estimate();
  const usage = estimate.usage ?? 0;
  const quota = estimate.quota ?? 0;
  return { usage, quota, available: Math.max(0, quota - usage) };
}

export async function requestPersistentStorage() {
  return navigator.storage?.persist ? navigator.storage.persist() : false;
}

export class GalleryStorage {
  private readonly driver: KeyValueDriver;
  private readonly estimate: () => Promise<StorageEstimate | null>;

  constructor(
    driver: KeyValueDriver = new IndexedDbDriver(),
    estimate: () => Promise<StorageEstimate | null> = estimateBrowserStorage
  ) {
    this.driver = driver;
    this.estimate = estimate;
  }

  async saveAsset(record: AssetRecord, files: StoredAssetFile[], storedAt = Date.now()) {
    const requiredBytes = files.reduce((total, item) => total + item.blob.size, 0);
    const capacity = await this.estimate();
    if (capacity && capacity.quota > 0 && requiredBytes > capacity.available * 0.9) {
      throw new Error(`本機儲存空間不足：需要 ${requiredBytes} bytes，可安全使用 ${Math.floor(capacity.available * 0.9)} bytes`);
    }
    const value: StoredAsset = { schema: 'class3d-stored-asset-v1', record: { ...record, savedLocally: true }, files, storedAt };
    await this.driver.set(`${ASSET_PREFIX}${record.id}`, value);
    return value;
  }

  getAsset(id: string) { return this.driver.get<StoredAsset>(`${ASSET_PREFIX}${id}`); }
  deleteAsset(id: string) { return this.driver.delete(`${ASSET_PREFIX}${id}`); }

  async listAssets() {
    const assetKeys = (await this.driver.keys()).filter((key) => key.startsWith(ASSET_PREFIX)).sort();
    const values = await Promise.all(assetKeys.map((key) => this.driver.get<StoredAsset>(key)));
    return values.filter((value): value is StoredAsset => value?.schema === 'class3d-stored-asset-v1');
  }

  clearAll() { return this.driver.clear(); }
}
