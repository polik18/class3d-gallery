import type { AssetKind } from '../assets/types.ts';

export type RenderableKind = Exclude<AssetKind, 'unsupported'>;
export interface RenderableFile {
  blob: Blob;
  name: string;
  relativePath: string;
  mimeType: string;
}
export interface RenderableAsset {
  kind: RenderableKind;
  title: string;
  files: RenderableFile[];
}
export interface MountedRenderer {
  pause(): void;
  resume(): void;
  destroy(): void;
}
export type RendererFactory = () => MountedRenderer | Promise<MountedRenderer>;
