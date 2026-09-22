import { mountModel3dRenderer } from './model3d.ts';
import { mountNativeRenderer } from './native.ts';
import type { MountedRenderer, RenderableAsset, RenderableKind } from './types.ts';

export const SUPPORTED_RENDERER_KINDS: readonly RenderableKind[] = ['image', 'video', 'audio', 'pdf', 'model3d'];
export function mountRenderer(container: HTMLElement, asset: RenderableAsset, status: HTMLElement): MountedRenderer {
  if (!SUPPORTED_RENDERER_KINDS.includes(asset.kind)) throw new Error(`不支援的展示類型：${asset.kind}`);
  return asset.kind === 'model3d' ? mountModel3dRenderer(container, asset, status) : mountNativeRenderer(container, asset);
}
