import { classifyCandidates } from '../assets/classifier.ts';
import { resolveAssetBundles } from '../assets/dependencyResolver.ts';
import { parseArtworkFileName } from '../assets/fileNameParser.ts';
import { collectDroppedFiles, collectInputFiles, type ImportCandidate } from '../assets/ingest.ts';
import { mountRenderer } from './registry.ts';
import { RendererSession } from './session.ts';
import type { RenderableAsset, RenderableKind } from './types.ts';

interface MediaViewerElements {
  container: HTMLElement;
  shell: HTMLElement;
  input: HTMLInputElement;
  status: HTMLElement;
}

function toRenderableAsset(bundle: Awaited<ReturnType<typeof resolveAssetBundles>>[number]): RenderableAsset {
  const parsed = parseArtworkFileName(bundle.primary.file.name);
  return {
    kind: bundle.primary.kind as RenderableKind,
    title: parsed.title,
    files: [bundle.primary, ...bundle.dependencies].map((candidate) => ({
      blob: candidate.file,
      name: candidate.file.name,
      relativePath: candidate.relativePath,
      mimeType: candidate.file.type
    }))
  };
}

export function mountMediaViewer({ container, shell, input, status }: MediaViewerElements) {
  const session = new RendererSession();
  let generation = 0;
  let destroyed = false;
  const showCandidates = async (candidates: ImportCandidate[]) => {
    const requestId = ++generation;
    if (candidates.length === 0) return;
    status.textContent = `正在分析 ${candidates.length} 個檔案…`;
    try {
      const bundles = await resolveAssetBundles(await classifyCandidates(candidates));
      if (requestId !== generation || destroyed) return;
      const bundle = bundles.find((item) => item.primary.kind !== 'unsupported');
      if (!bundle) throw new Error('沒有可展示的圖片、影片、音訊、PDF、GLB 或 GLTF 檔案');
      if (bundle.errors.length > 0) throw new Error(`GLTF 解析失敗：${bundle.errors[0]}`);
      if (bundle.missingDependencies.length > 0) throw new Error(`缺少 GLTF 相依檔：${bundle.missingDependencies.join('、')}`);
      if (bundle.externalDependencies.length > 0) throw new Error('GLTF 含有外部網址資源；本展覽不連線下載');
      const asset = toRenderableAsset(bundle);
      await session.show(() => mountRenderer(container, asset, status));
      if (requestId !== generation || destroyed) return;
      if (asset.kind !== 'model3d') {
        const extra = bundles.length > 1 ? `；本階段先預覽第 1 件，共偵測到 ${bundles.length} 件` : '';
        status.textContent = `已載入 ${asset.title}（${asset.kind}）${extra}。檔案只存在這個瀏覽器。`;
      }
    } catch (error) {
      if (requestId !== generation || destroyed) return;
      session.clear();
      status.textContent = error instanceof Error ? error.message : '媒體載入失敗';
    }
  };
  const onInput = () => {
    void showCandidates(collectInputFiles(input.files ?? []));
    input.value = '';
  };
  const onDrag = (event: DragEvent) => {
    event.preventDefault();
    shell.classList.add('is-dragging');
  };
  const onDragLeave = (event: DragEvent) => {
    event.preventDefault();
    if (event.type === 'drop' || !shell.contains(event.relatedTarget as Node | null)) shell.classList.remove('is-dragging');
  };
  const onDrop = (event: DragEvent) => {
    onDragLeave(event);
    if (event.dataTransfer) {
      void collectDroppedFiles(event.dataTransfer)
        .then(showCandidates)
        .catch((error: unknown) => {
          status.textContent = error instanceof Error ? `無法讀取拖放內容：${error.message}` : '無法讀取拖放內容';
        });
    }
  };
  const onVisibility = () => session.setFocused(!document.hidden);
  const onPageHide = () => session.clear();
  input.addEventListener('change', onInput);
  shell.addEventListener('dragenter', onDrag);
  shell.addEventListener('dragover', onDrag);
  shell.addEventListener('dragleave', onDragLeave);
  shell.addEventListener('drop', onDrop);
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('pagehide', onPageHide);
  return {
    showFiles(files: Iterable<File>) { return showCandidates(collectInputFiles(files)); },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      generation += 1;
      session.clear();
      input.removeEventListener('change', onInput);
      shell.removeEventListener('dragenter', onDrag);
      shell.removeEventListener('dragover', onDrag);
      shell.removeEventListener('dragleave', onDragLeave);
      shell.removeEventListener('drop', onDrop);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onPageHide);
    }
  };
}
