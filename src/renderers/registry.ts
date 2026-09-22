import type { MountedRenderer, RenderableAsset, RenderableKind } from './types.ts';

export const SUPPORTED_RENDERER_KINDS: readonly RenderableKind[] = ['image', 'video', 'audio', 'pdf', 'model3d'];
export async function mountRenderer(container: HTMLElement, asset: RenderableAsset, status: HTMLElement): Promise<MountedRenderer> {
  if (!SUPPORTED_RENDERER_KINDS.includes(asset.kind)) throw new Error(`不支援的展示類型：${asset.kind}`);
  if (asset.kind === 'model3d') {
    const { mountModel3dRenderer } = await import('./model3d.ts');
    return mountModel3dRenderer(container, asset, status);
  }
  const { mountNativeRenderer } = await import('./native.ts');
  return mountNativeRenderer(container, asset);
}
