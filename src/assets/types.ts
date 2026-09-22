export const ASSET_KINDS = ['image', 'video', 'audio', 'pdf', 'model3d', 'unsupported'] as const;
export type AssetKind = typeof ASSET_KINDS[number];

export const ASSET_STATUSES = ['queued', 'processing', 'ready', 'error'] as const;
export type AssetStatus = typeof ASSET_STATUSES[number];

export type NumberType = 'sequence' | 'seat';
export type AssetFileRole = 'primary' | 'dependency';

export interface AssetFileDescriptor {
  id: string;
  name: string;
  relativePath: string;
  mimeType: string;
  size: number;
  lastModified: number;
  role: AssetFileRole;
}

export interface AssetMetadata {
  width?: number;
  height?: number;
  durationMs?: number;
  pageCount?: number;
  animationCount?: number;
  codec?: string;
}

export interface PopularityStats {
  humanViews: number;
  likes: number;
  approvedComments: number;
  interactions: number;
  dwellTimeMs: number;
  lastHumanInteractionAt?: number;
}

export interface AssetRecord {
  schema: 'class3d-asset-v1';
  id: string;
  originalFileName: string;
  displayNumber?: number;
  numberType?: NumberType;
  title: string;
  author?: string;
  description: string;
  category: string;
  kind: AssetKind;
  importedAt: number;
  importOrder: number;
  manualOrder?: number;
  sourceFiles: AssetFileDescriptor[];
  metadata: AssetMetadata;
  tags: string[];
  popularity: PopularityStats;
  status: AssetStatus;
  error?: string;
  savedLocally: boolean;
}

export interface CreateAssetInput {
  id?: string;
  originalFileName: string;
  kind: AssetKind;
  importedAt?: number;
  importOrder: number;
  title?: string;
  description?: string;
  category?: string;
  sourceFiles?: AssetFileDescriptor[];
}

export interface AssetCollection {
  schema: 'class3d-asset-collection-v1';
  exportedAt: number;
  assets: AssetRecord[];
}

export type AssetSortKey = 'number' | 'category' | 'importedAt' | 'popularity' | 'title' | 'manual';
export type SortDirection = 'ascending' | 'descending';

export interface AssetSort {
  key: AssetSortKey;
  direction: SortDirection;
  numberType?: NumberType;
}

export function createEmptyPopularity(): PopularityStats {
  return {
    humanViews: 0,
    likes: 0,
    approvedComments: 0,
    interactions: 0,
    dwellTimeMs: 0
  };
}

export function displayNameFromFileName(fileName: string) {
  const withoutExtension = fileName.replace(/\.[^.]+$/, '');
  return withoutExtension.trim() || '未命名作品';
}

export function createAssetRecord(input: CreateAssetInput): AssetRecord {
  const displayName = displayNameFromFileName(input.originalFileName);
  return {
    schema: 'class3d-asset-v1',
    id: input.id ?? crypto.randomUUID(),
    originalFileName: input.originalFileName,
    title: input.title?.trim() || displayName,
    description: input.description?.trim() || displayName,
    category: input.category?.trim() || input.kind,
    kind: input.kind,
    importedAt: input.importedAt ?? Date.now(),
    importOrder: input.importOrder,
    sourceFiles: input.sourceFiles ?? [],
    metadata: {},
    tags: [],
    popularity: createEmptyPopularity(),
    status: 'queued',
    savedLocally: false
  };
}

function assertRecord(value: unknown, index: number): asserts value is AssetRecord {
  if (!value || typeof value !== 'object') throw new Error(`Asset ${index} is not an object`);
  const record = value as Partial<AssetRecord>;
  if (record.schema !== 'class3d-asset-v1') throw new Error(`Asset ${index} has an invalid schema`);
  if (typeof record.id !== 'string' || !record.id) throw new Error(`Asset ${index} has no id`);
  if (typeof record.originalFileName !== 'string') throw new Error(`Asset ${index} has no original filename`);
  if (typeof record.title !== 'string' || !record.title) throw new Error(`Asset ${index} has no title`);
  if (!ASSET_KINDS.includes(record.kind as AssetKind)) throw new Error(`Asset ${index} has an invalid kind`);
  if (!ASSET_STATUSES.includes(record.status as AssetStatus)) throw new Error(`Asset ${index} has an invalid status`);
  if (!Number.isFinite(record.importedAt) || !Number.isInteger(record.importOrder)) throw new Error(`Asset ${index} has invalid import data`);
  if (!Array.isArray(record.sourceFiles) || !Array.isArray(record.tags)) throw new Error(`Asset ${index} has invalid arrays`);
  if (!record.popularity || typeof record.popularity.likes !== 'number') throw new Error(`Asset ${index} has invalid popularity`);
}

export function serializeAssetCollection(assets: AssetRecord[], exportedAt = Date.now()) {
  const collection: AssetCollection = {
    schema: 'class3d-asset-collection-v1',
    exportedAt,
    assets
  };
  return JSON.stringify(collection);
}

export function parseAssetCollection(serialized: string): AssetCollection {
  const value = JSON.parse(serialized) as Partial<AssetCollection>;
  if (value.schema !== 'class3d-asset-collection-v1') throw new Error('Invalid asset collection schema');
  if (!Number.isFinite(value.exportedAt)) throw new Error('Invalid asset collection timestamp');
  if (!Array.isArray(value.assets)) throw new Error('Invalid asset collection contents');
  value.assets.forEach(assertRecord);
  return value as AssetCollection;
}
