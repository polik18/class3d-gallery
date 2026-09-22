import type { AssetSort } from '../assets/types.ts';

export type ExhibitionMode = 'all' | 'category' | 'selection' | 'solo' | 'presentation';

export interface EngagementSettings {
  likesEnabled: boolean;
  commentsEnabled: boolean;
  commentModeration: boolean;
  showPopularity: boolean;
}

export interface AutoShowcaseSettings {
  enabled: boolean;
  idleDelayMs: number;
  titleDurationMs: number;
  carouselDurationMs: number;
  overviewDurationMs: number;
  popularDurationMs: number;
  imageDurationMs: number;
  modelDurationMs: number;
  videoMaxDurationMs: number;
}

export interface ExhibitionDisplaySettings {
  showSubtitle: boolean;
  showDescription: boolean;
  showCurator: boolean;
  showArtworkCount: boolean;
  showCategories: boolean;
}

export interface ExhibitionSettings {
  schema: 'class3d-exhibition-v1';
  id: string;
  title: string;
  subtitle: string;
  description: string;
  curator: string;
  className: string;
  startDate?: string;
  endDate?: string;
  createdAt: number;
  updatedAt: number;
  engagement: EngagementSettings;
  autoShowcase: AutoShowcaseSettings;
  display: ExhibitionDisplaySettings;
}

export interface GalleryState {
  mode: ExhibitionMode;
  sort: AssetSort;
  category?: string;
  selectedAssetIds: string[];
  focusedAssetId?: string;
}

export interface LocalComment {
  schema: 'class3d-comment-v1';
  id: string;
  exhibitionId: string;
  assetId: string;
  displayName?: string;
  body: string;
  approved: boolean;
  createdAt: number;
}

export const DEFAULT_AUTO_SHOWCASE: AutoShowcaseSettings = {
  enabled: true,
  idleDelayMs: 30_000,
  titleDurationMs: 6_000,
  carouselDurationMs: 90_000,
  overviewDurationMs: 20_000,
  popularDurationMs: 30_000,
  imageDurationMs: 8_000,
  modelDurationMs: 12_000,
  videoMaxDurationMs: 30_000
};

export function createExhibitionSettings(
  input: Partial<Pick<ExhibitionSettings, 'id' | 'title' | 'subtitle' | 'description' | 'curator' | 'className'>> = {},
  now = Date.now()
): ExhibitionSettings {
  return {
    schema: 'class3d-exhibition-v1',
    id: input.id ?? crypto.randomUUID(),
    title: input.title?.trim() || '我的多媒體展覽',
    subtitle: input.subtitle?.trim() || '',
    description: input.description?.trim() || '',
    curator: input.curator?.trim() || '',
    className: input.className?.trim() || '',
    createdAt: now,
    updatedAt: now,
    engagement: {
      likesEnabled: true,
      commentsEnabled: true,
      commentModeration: true,
      showPopularity: true
    },
    autoShowcase: { ...DEFAULT_AUTO_SHOWCASE },
    display: {
      showSubtitle: true,
      showDescription: true,
      showCurator: true,
      showArtworkCount: true,
      showCategories: true
    }
  };
}

export function createDefaultGalleryState(): GalleryState {
  return {
    mode: 'all',
    sort: { key: 'number', direction: 'ascending', numberType: 'seat' },
    selectedAssetIds: []
  };
}

function validatePositiveDuration(name: string, value: unknown) {
  if (!Number.isFinite(value) || Number(value) <= 0) throw new Error(`Invalid ${name}`);
}

export function parseExhibitionSettings(serialized: string): ExhibitionSettings {
  const parsed = JSON.parse(serialized) as Partial<ExhibitionSettings>;
  const defaults = createExhibitionSettings({ id: typeof parsed.id === 'string' ? parsed.id : undefined }, 0);
  const value: Partial<ExhibitionSettings> = {
    ...defaults,
    ...parsed,
    engagement: { ...defaults.engagement, ...parsed.engagement },
    autoShowcase: { ...defaults.autoShowcase, ...parsed.autoShowcase },
    display: { ...defaults.display, ...parsed.display },
    className: typeof parsed.className === 'string' ? parsed.className : ''
  };
  if (value.schema !== 'class3d-exhibition-v1') throw new Error('Invalid exhibition schema');
  if (typeof value.id !== 'string' || !value.id) throw new Error('Invalid exhibition id');
  if (typeof value.title !== 'string' || !value.title.trim()) throw new Error('Exhibition title is required');
  if (!Number.isFinite(value.createdAt) || !Number.isFinite(value.updatedAt)) throw new Error('Invalid exhibition timestamps');
  if (!value.engagement || !value.autoShowcase || !value.display) throw new Error('Incomplete exhibition settings');
  for (const key of [
    'idleDelayMs',
    'titleDurationMs',
    'carouselDurationMs',
    'overviewDurationMs',
    'popularDurationMs',
    'imageDurationMs',
    'modelDurationMs',
    'videoMaxDurationMs'
  ] as const) {
    validatePositiveDuration(key, value.autoShowcase[key]);
  }
  return value as ExhibitionSettings;
}

export function serializeExhibitionSettings(settings: ExhibitionSettings) {
  return JSON.stringify(settings);
}
