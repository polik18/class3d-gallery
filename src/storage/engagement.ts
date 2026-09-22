import { createEngagementDatabase, type EngagementDatabase } from '../engagement/types.ts';
import type { StringStorage } from '../exhibition/settings.ts';

export const ENGAGEMENT_STORAGE_KEY = 'class3d-gallery:engagement:v1';

function parseDatabase(serialized: string): EngagementDatabase {
  const value = JSON.parse(serialized) as Partial<EngagementDatabase>;
  if (value.schema !== 'class3d-engagement-v1' || !value.assets || typeof value.assets !== 'object') throw new Error('本機互動資料格式不相容');
  for (const [assetId, engagement] of Object.entries(value.assets)) {
    if (!engagement || engagement.assetId !== assetId) throw new Error('作品互動資料識別錯誤');
    if (!Array.isArray(engagement.likedBy) || !Array.isArray(engagement.comments)) throw new Error('作品互動資料內容錯誤');
  }
  return value as EngagementDatabase;
}

export class EngagementStore {
  private readonly storage: StringStorage;
  private readonly now: () => number;

  constructor(storage: StringStorage = localStorage, now: () => number = Date.now) {
    this.storage = storage;
    this.now = now;
  }

  load() {
    const serialized = this.storage.getItem(ENGAGEMENT_STORAGE_KEY);
    if (!serialized) return createEngagementDatabase(this.now());
    try {
      return parseDatabase(serialized);
    } catch {
      this.storage.removeItem(ENGAGEMENT_STORAGE_KEY);
      return createEngagementDatabase(this.now());
    }
  }

  save(database: EngagementDatabase) {
    this.storage.setItem(ENGAGEMENT_STORAGE_KEY, JSON.stringify(database));
    return database;
  }

  update(mutator: (database: EngagementDatabase) => void) {
    const database = this.load();
    mutator(database);
    database.updatedAt = this.now();
    return this.save(database);
  }

  clear() {
    this.storage.removeItem(ENGAGEMENT_STORAGE_KEY);
  }
}
