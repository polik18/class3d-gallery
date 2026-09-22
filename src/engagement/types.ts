import type { LocalComment } from '../exhibition/types.ts';

export type EngagementSource = 'human' | 'automatic';

export interface AssetEngagement {
  assetId: string;
  likedBy: string[];
  humanViews: number;
  interactions: number;
  dwellTimeMs: number;
  comments: LocalComment[];
  updatedAt: number;
}

export interface EngagementDatabase {
  schema: 'class3d-engagement-v1';
  updatedAt: number;
  assets: Record<string, AssetEngagement>;
}

export function createEmptyEngagement(assetId: string, now = Date.now()): AssetEngagement {
  return { assetId, likedBy: [], humanViews: 0, interactions: 0, dwellTimeMs: 0, comments: [], updatedAt: now };
}

export function createEngagementDatabase(now = Date.now()): EngagementDatabase {
  return { schema: 'class3d-engagement-v1', updatedAt: now, assets: {} };
}
