import type { AssetRecord } from '../assets/types.ts';
import type { AutoShowcaseSettings } from '../exhibition/types.ts';

export type ShowcasePhase = 'inactive' | 'title' | 'carousel' | 'overview' | 'popular';
export type ShowcaseTransition = 'none' | 'curtain' | 'gallery-slide' | 'mosaic' | 'spotlight';

export function showcaseTransition(phase: ShowcasePhase, reducedMotion = false): ShowcaseTransition {
  if (phase === 'inactive' || reducedMotion) return 'none';
  if (phase === 'title') return 'curtain';
  if (phase === 'carousel') return 'gallery-slide';
  if (phase === 'overview') return 'mosaic';
  return 'spotlight';
}

export function showcaseAssetDuration(asset: Pick<AssetRecord, 'kind'>, settings: AutoShowcaseSettings) {
  if (asset.kind === 'model3d') return settings.modelDurationMs;
  if (asset.kind === 'video') return settings.videoMaxDurationMs;
  return settings.imageDurationMs;
}

export function phaseDuration(phase: Exclude<ShowcasePhase, 'inactive' | 'carousel'>, settings: AutoShowcaseSettings) {
  if (phase === 'title') return settings.titleDurationMs;
  if (phase === 'overview') return settings.overviewDurationMs;
  return settings.popularDurationMs;
}

export function prefersReducedShowcaseMotion(media = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')) {
  return media?.matches ?? false;
}
