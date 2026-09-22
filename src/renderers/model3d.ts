import { mountModelViewer } from '../exhibition/modelViewer.ts';
import type { MountedRenderer, RenderableAsset } from './types.ts';

export function mountModel3dRenderer(container: HTMLElement, asset: RenderableAsset, status: HTMLElement): MountedRenderer {
  const frame = document.createElement('div');
  frame.className = 'model-renderer';
  frame.innerHTML = `
    <canvas class="model-renderer__canvas" tabindex="0" aria-label="3D 模型操作區"></canvas>
    <span class="scene-label">INTERACTIVE 3D VIEWER</span>
    <div class="viewer-toolbar" aria-label="3D 檢視控制">
      <button data-action="reset" type="button">重設視角</button>
      <button data-action="rotate" type="button" aria-pressed="false">自動旋轉</button>
      <button data-action="animation" type="button" aria-pressed="false" disabled>播放動畫</button>
    </div>
    <span class="scene-hint">左鍵旋轉 · 滾輪縮放 · 右鍵平移</span>
  `;
  container.replaceChildren(frame);
  const canvas = frame.querySelector<HTMLCanvasElement>('canvas');
  const resetButton = frame.querySelector<HTMLButtonElement>('[data-action="reset"]');
  const autoRotateButton = frame.querySelector<HTMLButtonElement>('[data-action="rotate"]');
  const animationButton = frame.querySelector<HTMLButtonElement>('[data-action="animation"]');
  if (!canvas || !resetButton || !autoRotateButton || !animationButton) throw new Error('3D viewer 控制元件建立失敗');
  const viewer = mountModelViewer({ canvas, status, resetButton, autoRotateButton, animationButton });
  viewer.loadSources(asset.files.map((file) => ({ blob: file.blob, name: file.name, relativePath: file.relativePath })));
  return {
    pause: () => viewer.pause(),
    resume: () => viewer.resume(),
    destroy() {
      viewer.destroy();
      frame.remove();
    }
  };
}
