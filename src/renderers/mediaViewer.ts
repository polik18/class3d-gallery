import { classifyCandidates } from '../assets/classifier.ts';
import { resolveAssetBundles } from '../assets/dependencyResolver.ts';
import { parseArtworkFileName } from '../assets/fileNameParser.ts';
import { collectDroppedFiles, collectInputFiles, type ImportCandidate } from '../assets/ingest.ts';
import { createAssetRecord, type AssetFileDescriptor, type AssetRecord } from '../assets/types.ts';
import { mountRenderer } from './registry.ts';
import { RendererSession } from './session.ts';
import type { RenderableAsset, RenderableKind } from './types.ts';

interface MediaViewerElements {
  container: HTMLElement;
  shell: HTMLElement;
  input: HTMLInputElement;
  status: HTMLElement;
  onImport?: (assets: ImportedMediaAsset[]) => void;
}

export interface ImportedMediaAsset {
  record: AssetRecord;
  renderable: RenderableAsset;
}

const CATEGORY_LABELS: Record<RenderableKind, string> = {
  image: '圖片',
  video: '影片',
  audio: '音訊',
  pdf: 'PDF',
  model3d: '3D'
};

function toImportedMediaAsset(bundle: Awaited<ReturnType<typeof resolveAssetBundles>>[number], importOrder: number, importedAt: number): ImportedMediaAsset {
  const parsed = parseArtworkFileName(bundle.primary.file.name);
  const candidates = [bundle.primary, ...bundle.dependencies];
  const sourceFiles: AssetFileDescriptor[] = candidates.map((candidate, index) => ({
    id: crypto.randomUUID(),
    name: candidate.file.name,
    relativePath: candidate.relativePath,
    mimeType: candidate.file.type,
    size: candidate.file.size,
    lastModified: candidate.file.lastModified,
    role: index === 0 ? 'primary' : 'dependency'
  }));
  const record = createAssetRecord({
    originalFileName: bundle.primary.file.name,
    kind: bundle.primary.kind as RenderableKind,
    title: parsed.title,
    description: parsed.description,
    category: CATEGORY_LABELS[bundle.primary.kind as RenderableKind],
    importedAt,
    importOrder,
    sourceFiles
  });
  Object.assign(record, {
    displayNumber: parsed.displayNumber,
    numberType: parsed.numberType,
    author: parsed.author,
    status: 'ready' as const
  });
  return {
    record,
    renderable: {
      kind: bundle.primary.kind as RenderableKind,
      title: parsed.title,
      files: candidates.map((candidate) => ({
      blob: candidate.file,
      name: candidate.file.name,
      relativePath: candidate.relativePath,
      mimeType: candidate.file.type
      }))
    }
  };
}

export function mountMediaViewer({ container, shell, input, status, onImport }: MediaViewerElements) {
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
      const supported = bundles.filter((item) => item.primary.kind !== 'unsupported');
      if (supported.length === 0) throw new Error('沒有可展示的圖片、影片、音訊、PDF、GLB 或 GLTF 檔案');
      const invalid = supported.find((bundle) => bundle.errors.length > 0 || bundle.missingDependencies.length > 0 || bundle.externalDependencies.length > 0);
      if (invalid?.errors.length) throw new Error(`GLTF 解析失敗：${invalid.errors[0]}`);
      if (invalid?.missingDependencies.length) throw new Error(`缺少 GLTF 相依檔：${invalid.missingDependencies.join('、')}`);
      if (invalid?.externalDependencies.length) throw new Error('GLTF 含有外部網址資源；本展覽不連線下載');
      const importedAt = Date.now();
      const imported = supported.map((bundle, index) => toImportedMediaAsset(bundle, index, importedAt));
      onImport?.(imported);
      const asset = imported[0].renderable;
      await session.show(() => mountRenderer(container, asset, status));
      if (requestId !== generation || destroyed) return;
      if (asset.kind !== 'model3d') {
        const extra = imported.length > 1 ? `；已加入展覽共 ${imported.length} 件，目前預覽第 1 件` : '';
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
    showAsset(asset: RenderableAsset) { return session.show(() => mountRenderer(container, asset, status)); },
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
