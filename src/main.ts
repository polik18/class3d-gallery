import './style.css';
import { createGuestUser } from './backend/auth';
import type { CloudRecord } from './backend/database';
import { calculateDashboard } from './dashboard/dashboard';
import type { AssetRecord, AssetSortKey, SortDirection } from './assets/types';
import { createAssetRecord } from './assets/types';
import type { ExhibitionMode } from './exhibition/types';
import type { ExhibitionSettings } from './exhibition/types';
import { ExhibitionSettingsStore } from './exhibition/settings';
import { mountSettingsView } from './exhibition/settingsView';
import { EngagementController } from './engagement/controller';
import { getVisitorSession, startNewVisitorSession } from './engagement/session';
import { mountEngagementView } from './engagement/view';
import { GalleryController } from './gallery/galleryController';
import { CardPreviewManager } from './gallery/cardPreview';
import { popularityScore } from './gallery/sort';
import { generateArtworkURL } from './qrcode/share';
import { mountMediaViewer, type ImportedMediaAsset } from './renderers/mediaViewer';
import type { RenderableAsset, RenderableKind } from './renderers/types';
import { IdleShowcaseController } from './showcase/idleController';
import { mountShowcaseView } from './showcase/view';
import { exportGalleryArchive, importGalleryArchive } from './storage/export';
import { GalleryStorage, requestPersistentStorage, type StoredAsset } from './storage/indexedDb';
import { createProfile } from './student/profile';

const records: CloudRecord[] = [
  { id: 'class-301', type: 'class', data: { name: '三年一班' }, updatedAt: Date.now() },
  { id: 'class-302', type: 'class', data: { name: '三年二班' }, updatedAt: Date.now() },
  { id: 'student-01', type: 'student', data: createProfile('01', '林同學'), updatedAt: Date.now() },
  { id: 'student-02', type: 'student', data: createProfile('02', '陳同學'), updatedAt: Date.now() },
  { id: 'student-03', type: 'student', data: createProfile('03', '張同學'), updatedAt: Date.now() },
  { id: 'artwork-light', type: 'artwork', data: { title: '光的房間', author: '林同學' }, updatedAt: Date.now() },
  { id: 'artwork-city', type: 'artwork', data: { title: '漂浮城市', author: '陳同學' }, updatedAt: Date.now() },
  { id: 'artwork-seed', type: 'artwork', data: { title: '一顆種子的旅行', author: '張同學' }, updatedAt: Date.now() }
];

const user = createGuestUser('訪客教師');
const stats = calculateDashboard(records);
const artworks = records.filter((record) => record.type === 'artwork');
const demoCategories = ['光影', '3D', '插畫'];
const demoAssets = artworks.map((artwork, index) => {
  const record = createAssetRecord({
    id: artwork.id,
    originalFileName: `${String(artwork.data.title)}.jpg`,
    title: String(artwork.data.title),
    description: String(artwork.data.title),
    category: demoCategories[index],
    kind: index === 1 ? 'model3d' : 'image',
    importedAt: Date.now() - (artworks.length - index) * 60_000,
    importOrder: index
  });
  Object.assign(record, {
    displayNumber: index + 1,
    numberType: 'seat' as const,
    author: String(artwork.data.author),
    manualOrder: index,
    status: 'ready' as const,
    popularity: { humanViews: 12 - index * 2, likes: [8, 13, 5][index], approvedComments: [2, 4, 1][index], interactions: [14, 21, 9][index], dwellTimeMs: [80_000, 140_000, 60_000][index] }
  });
  return record;
});
const app = document.querySelector<HTMLDivElement>('#app');

if (!app) throw new Error('找不到應用程式掛載點');

app.innerHTML = `
  <header class="topbar">
    <a class="brand" href="#top" aria-label="Class3D Gallery 首頁">
      <span class="brand-mark">C3</span>
      <span>Class3D <strong>Gallery</strong></span>
    </a>
    <div class="topbar-actions">
      <span class="topbar-exhibition-title" id="topbar-exhibition-title">我的多媒體展覽</span>
      <button class="settings-button" id="start-showcase" type="button">展示預覽</button>
      <button class="settings-button" id="open-settings" type="button">展覽設定</button>
      <div class="user-chip"><span class="online-dot"></span>${user.name} · ${user.role === 'teacher' ? '教師模式' : '學生模式'}</div>
    </div>
  </header>

  <main id="top">
    <section class="hero" aria-labelledby="hero-title">
      <div class="hero-copy">
        <p class="eyebrow">CLASSROOMS BECOME GALLERIES</p>
        <h1 id="hero-title">我的多媒體展覽</h1>
        <p class="exhibition-subtitle" id="exhibition-subtitle"></p>
        <p class="hero-intro" id="exhibition-description">從電腦選擇圖片、影片、音訊、PDF 或 3D 作品，直接在瀏覽器裡展示。3D 可旋轉、縮放、平移與播放模型動畫，檔案不會上傳到任何伺服器。</p>
        <p class="exhibition-byline" id="exhibition-byline"></p>
        <div class="hero-actions">
          <label class="primary-button model-upload-button" for="media-file-input">
            選擇多媒體作品
            <input id="media-file-input" type="file" accept="image/*,video/*,audio/*,application/pdf,.glb,.gltf,model/gltf-binary,model/gltf+json" multiple />
          </label>
          <a class="text-link" href="#works">瀏覽示範作品 <span>↓</span></a>
        </div>
        <p class="upload-help">可一次選取多個檔案；GLTF 請連同它引用的 BIN 與貼圖一起選取。</p>
        <p class="sync-state" id="media-status" aria-live="polite">可選取檔案或直接拖放到右側展台。</p>
      </div>
      <div class="scene-shell" id="media-drop-zone" aria-label="互動式多媒體展台，可拖放圖片、影片、音訊、PDF 或 3D 檔案">
        <div class="media-stage" id="media-stage">
          <div class="stage-placeholder" aria-hidden="true"><span>IMAGE</span><span>VIDEO</span><span>3D</span><strong>DROP TO EXHIBIT</strong></div>
        </div>
        <span class="drop-hint">放開以載入作品</span>
      </div>
    </section>

    <section class="dashboard" aria-labelledby="dashboard-title">
      <div>
        <p class="section-index">01 / DASHBOARD</p>
        <h2 id="dashboard-title">班級創作，一眼掌握</h2>
      </div>
      <div class="stats" aria-label="內容統計">
        <article><strong>${stats.classes}</strong><span>班級</span></article>
        <article><strong>${stats.students}</strong><span>學生</span></article>
        <article id="artwork-count-stat"><strong id="artwork-count">${stats.artworks}</strong><span>作品</span></article>
      </div>
    </section>

    <section class="works-section" id="works" aria-labelledby="works-title">
      <div class="section-heading">
        <div><p class="section-index">02 / EXHIBITION</p><h2 id="works-title">我的多媒體展覽 · 作品</h2></div>
        <div class="mode-switcher" aria-label="展覽範圍">
          <button class="mode-button active" data-gallery-mode="all" type="button">全展</button>
          <button class="mode-button" data-gallery-mode="category" type="button">分類展</button>
          <button class="mode-button" data-gallery-mode="selection" type="button">自選展</button>
          <button class="mode-button" data-gallery-mode="solo" type="button">獨展</button>
        </div>
      </div>
      <div class="gallery-toolbar" aria-label="作品篩選與排序">
        <label>排序方式
          <select id="gallery-sort">
            <option value="number">座號／序號</option>
            <option value="category">分類</option>
            <option value="importedAt">匯入時間</option>
            <option value="popularity">人氣</option>
            <option value="manual">手動順序</option>
            <option value="title">作品名稱</option>
          </select>
        </label>
        <label>方向
          <select id="gallery-direction"><option value="ascending">正序</option><option value="descending">倒序</option></select>
        </label>
        <label id="number-type-control">號碼類型
          <select id="gallery-number-type"><option value="seat">座號</option><option value="sequence">序號</option></select>
        </label>
        <label>作品分類
          <select id="gallery-category"></select>
        </label>
        <p id="gallery-count" aria-live="polite"></p>
      </div>
      <div class="library-toolbar" aria-label="本機作品庫">
        <div><strong>本機作品庫</strong><span>只儲存在這台電腦的瀏覽器</span></div>
        <button id="save-local-gallery" type="button">保存目前作品</button>
        <button id="load-local-gallery" type="button">載入已保存作品</button>
        <button id="export-local-gallery" type="button">匯出展覽檔</button>
        <label class="library-import-button" for="import-local-gallery">匯入展覽檔<input id="import-local-gallery" type="file" accept=".c3dg,application/x-class3d-gallery" /></label>
        <button class="library-clear-button" id="clear-local-gallery" type="button">清除已保存作品</button>
        <p id="library-status" aria-live="polite"></p>
      </div>
      <div class="work-grid" id="work-grid"></div>
      <p class="gallery-empty" id="gallery-empty" hidden></p>
      <p class="share-state" id="share-state" aria-live="polite"></p>
    </section>

    <section class="architecture" aria-labelledby="architecture-title">
      <div><p class="section-index">03 / FOUNDATION</p><h2 id="architecture-title">已接好的架構基線</h2></div>
      <ul>
        <li><span>01</span><strong>角色模型</strong><small>教師 / 學生</small></li>
        <li><span>02</span><strong>本機載入</strong><small>GLB / GLTF，不上傳伺服器</small></li>
        <li><span>03</span><strong>互動操作</strong><small>旋轉 / 縮放 / 平移 / 重設</small></li>
        <li><span>04</span><strong>動態模型</strong><small>內建動畫 / 自動旋轉</small></li>
      </ul>
    </section>
  </main>

  <a class="portfolio-home-link" href="https://polik18.github.io/" aria-label="回到 Polik 專案總覽">← 回專案總覽</a>

  <dialog class="settings-dialog" id="settings-dialog" aria-label="展覽設定">
    <div id="settings-view"></div>
  </dialog>
  <dialog class="engagement-dialog" id="engagement-dialog" aria-label="作品按讚與留言"></dialog>
  <section class="showcase-overlay" id="showcase-overlay" aria-label="自動展示" aria-hidden="true" hidden></section>

  <footer><span>Class3D Gallery v1.2</span><span>Architecture Preview · Local Data</span></footer>
`;

const mediaStage = document.querySelector<HTMLElement>('#media-stage');
const mediaInput = document.querySelector<HTMLInputElement>('#media-file-input');
const mediaStatus = document.querySelector<HTMLElement>('#media-status');
const mediaDropZone = document.querySelector<HTMLElement>('#media-drop-zone');
const workGrid = document.querySelector<HTMLElement>('#work-grid');
const galleryEmpty = document.querySelector<HTMLElement>('#gallery-empty');
const galleryCount = document.querySelector<HTMLElement>('#gallery-count');
const gallerySort = document.querySelector<HTMLSelectElement>('#gallery-sort');
const galleryDirection = document.querySelector<HTMLSelectElement>('#gallery-direction');
const galleryNumberType = document.querySelector<HTMLSelectElement>('#gallery-number-type');
const galleryCategory = document.querySelector<HTMLSelectElement>('#gallery-category');
const numberTypeControl = document.querySelector<HTMLElement>('#number-type-control');
const artworkCount = document.querySelector<HTMLElement>('#artwork-count');
const artworkCountStat = document.querySelector<HTMLElement>('#artwork-count-stat');
const shareState = document.querySelector<HTMLElement>('#share-state');
const heroTitle = document.querySelector<HTMLElement>('#hero-title');
const exhibitionSubtitle = document.querySelector<HTMLElement>('#exhibition-subtitle');
const exhibitionDescription = document.querySelector<HTMLElement>('#exhibition-description');
const exhibitionByline = document.querySelector<HTMLElement>('#exhibition-byline');
const topbarExhibitionTitle = document.querySelector<HTMLElement>('#topbar-exhibition-title');
const worksTitle = document.querySelector<HTMLElement>('#works-title');
const settingsDialog = document.querySelector<HTMLDialogElement>('#settings-dialog');
const settingsViewContainer = document.querySelector<HTMLElement>('#settings-view');
const openSettingsButton = document.querySelector<HTMLButtonElement>('#open-settings');
const startShowcaseButton = document.querySelector<HTMLButtonElement>('#start-showcase');
const engagementDialog = document.querySelector<HTMLDialogElement>('#engagement-dialog');
const showcaseOverlay = document.querySelector<HTMLElement>('#showcase-overlay');
const saveLocalGalleryButton = document.querySelector<HTMLButtonElement>('#save-local-gallery');
const loadLocalGalleryButton = document.querySelector<HTMLButtonElement>('#load-local-gallery');
const exportLocalGalleryButton = document.querySelector<HTMLButtonElement>('#export-local-gallery');
const importLocalGalleryInput = document.querySelector<HTMLInputElement>('#import-local-gallery');
const clearLocalGalleryButton = document.querySelector<HTMLButtonElement>('#clear-local-gallery');
const libraryStatus = document.querySelector<HTMLElement>('#library-status');
const gallery = new GalleryController(demoAssets);
const engagement = new EngagementController();
const exhibitionSettingsStore = new ExhibitionSettingsStore();
const galleryStorage = new GalleryStorage();
const renderables = new Map<string, RenderableAsset>();
const cardPreviews = new CardPreviewManager();
let importedOnce = false;
let mediaViewer: ReturnType<typeof mountMediaViewer> | null = null;
let engagementView: ReturnType<typeof mountEngagementView> | null = null;
let idleShowcase: IdleShowcaseController | null = null;
let visitorId = getVisitorSession();
let activeExhibitionSettings = exhibitionSettingsStore.load();

function applyExhibitionSettings(settings: ExhibitionSettings) {
  activeExhibitionSettings = settings;
  const defaultDescription = '從電腦選擇圖片、影片、音訊、PDF 或 3D 作品，直接在瀏覽器裡展示。3D 可旋轉、縮放、平移與播放模型動畫，檔案不會上傳到任何伺服器。';
  if (heroTitle) heroTitle.textContent = settings.title;
  if (topbarExhibitionTitle) topbarExhibitionTitle.textContent = settings.title;
  if (worksTitle) worksTitle.textContent = `${settings.title} · 作品`;
  if (exhibitionSubtitle) {
    exhibitionSubtitle.textContent = settings.subtitle;
    exhibitionSubtitle.hidden = !settings.display.showSubtitle || !settings.subtitle;
  }
  if (exhibitionDescription) {
    exhibitionDescription.textContent = settings.description || defaultDescription;
    exhibitionDescription.hidden = !settings.display.showDescription;
  }
  if (exhibitionByline) {
    exhibitionByline.textContent = [settings.className, settings.curator ? `策展：${settings.curator}` : ''].filter(Boolean).join(' · ');
    exhibitionByline.hidden = !settings.display.showCurator || !exhibitionByline.textContent;
  }
  if (artworkCountStat) artworkCountStat.hidden = !settings.display.showArtworkCount;
  if (galleryCount) galleryCount.hidden = !settings.display.showArtworkCount;
  document.body.dataset.showCategories = String(settings.display.showCategories);
  document.title = `${settings.title} | Class3D Gallery`;
  idleShowcase?.configure(settings.autoShowcase);
  renderGallery();
  engagementView?.refresh();
}

function categoryOptions(categories: string[], selected?: string) {
  if (!galleryCategory) return;
  galleryCategory.replaceChildren(...categories.map((category) => {
    const option = document.createElement('option');
    option.value = category;
    option.textContent = category;
    option.selected = category === selected;
    return option;
  }));
}

function cardForAsset(asset: AssetRecord, index: number, selected: boolean) {
  const article = document.createElement('article');
  article.className = `work-card work-${index % 3 + 1}`;
  article.dataset.assetId = asset.id;
  const visual = document.createElement('div');
  visual.className = 'work-visual';
  const renderable = renderables.get(asset.id);
  if (renderable) {
    article.classList.add('has-preview');
    const previewLayer = document.createElement('div');
    previewLayer.className = 'work-preview-layer';
    previewLayer.setAttribute('aria-label', `${asset.title} 作品預覽`);
    visual.append(previewLayer);
    cardPreviews.observe(previewLayer, renderable);
  }
  const number = document.createElement('span');
  number.textContent = asset.displayNumber ? String(asset.displayNumber).padStart(2, '0') : '—';
  const category = document.createElement('strong');
  category.className = 'work-category';
  category.textContent = asset.category;
  const kind = document.createElement('small');
  kind.className = 'work-kind';
  kind.textContent = asset.kind.toUpperCase();
  visual.append(number, category, kind);

  const meta = document.createElement('div');
  meta.className = 'work-meta';
  const copy = document.createElement('div');
  const title = document.createElement('h3');
  title.textContent = asset.title;
  const byline = document.createElement('p');
  byline.textContent = [asset.author, activeExhibitionSettings.engagement.showPopularity ? `人氣 ${Math.round(popularityScore(asset))}` : ''].filter(Boolean).join(' · ');
  copy.append(title, byline);
  const actions = document.createElement('div');
  actions.className = 'work-actions';
  const localEngagement = engagement.getAsset(asset.id);
  const liked = localEngagement.likedBy.includes(visitorId);
  const like = document.createElement('button');
  like.type = 'button';
  like.className = 'card-like';
  like.textContent = `${liked ? '♥' : '♡'} ${localEngagement.likedBy.length}`;
  like.setAttribute('aria-pressed', String(liked));
  like.setAttribute('aria-label', `${liked ? '取消讚' : '按讚'} ${asset.title}`);
  like.disabled = !activeExhibitionSettings.engagement.likesEnabled;
  like.addEventListener('click', () => {
    engagement.toggleLike(asset.id, visitorId);
    syncEngagement(asset.id);
  });
  const comments = document.createElement('button');
  comments.type = 'button';
  comments.textContent = `留言 ${localEngagement.comments.filter((comment) => comment.approved).length}`;
  comments.disabled = !activeExhibitionSettings.engagement.commentsEnabled;
  comments.addEventListener('click', () => engagementView?.open(asset.id, asset.title));
  const choose = document.createElement('label');
  choose.className = 'selection-toggle';
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.checked = selected;
  checkbox.setAttribute('aria-label', `選取 ${asset.title}`);
  checkbox.addEventListener('change', () => gallery.toggleSelection(asset.id));
  choose.append(checkbox, document.createTextNode(' 自選'));
  const solo = document.createElement('button');
  solo.type = 'button';
  solo.textContent = '獨展';
  solo.addEventListener('click', () => {
    engagement.recordView(asset.id, 'human');
    syncEngagement(asset.id);
    gallery.focusAsset(asset.id);
  });
  actions.append(like, comments, choose, solo);
  if (renderable) {
    const preview = document.createElement('button');
    preview.type = 'button';
    preview.textContent = '播放';
    preview.addEventListener('click', () => {
      engagement.recordView(asset.id, 'human');
      syncEngagement(asset.id);
      if (mediaStatus) mediaStatus.textContent = `正在開啟 ${asset.title}…`;
      void mediaViewer?.showAsset(renderable).then(() => {
        if (renderable.kind !== 'model3d' && mediaStatus) mediaStatus.textContent = `正在展示 ${asset.title}，檔案只存在這個瀏覽器。`;
      });
      document.querySelector('#top')?.scrollIntoView({ behavior: 'smooth' });
    });
    actions.append(preview);
  }
  const share = document.createElement('button');
  share.type = 'button';
  share.textContent = '分享 ↗';
  share.addEventListener('click', async () => {
    const url = generateArtworkURL(asset.id);
    try {
      await navigator.clipboard.writeText(url);
      if (shareState) shareState.textContent = `已複製作品連結：${url}`;
    } catch {
      if (shareState) shareState.textContent = `作品連結：${url}`;
    }
  });
  actions.append(share);
  meta.append(copy, actions);
  article.append(visual, meta);
  return article;
}

function renderGallery() {
  if (!workGrid || !galleryEmpty || !galleryCount) return;
  cardPreviews.clear();
  const state = gallery.getState();
  const visible = gallery.getVisibleAssets();
  const selected = new Set(state.selectedAssetIds);
  workGrid.replaceChildren(...visible.map((asset, index) => cardForAsset(asset, index, selected.has(asset.id))));
  galleryEmpty.hidden = visible.length > 0;
  galleryEmpty.textContent = state.mode === 'selection' ? '尚未選取作品；請回到全展勾選要放入自選展的作品。' : '這個展覽範圍目前沒有作品。';
  galleryCount.textContent = `顯示 ${visible.length} / ${gallery.getAssets().length} 件 · 已選 ${selected.size} 件`;
  if (artworkCount) artworkCount.textContent = String(gallery.getAssets().length);
  document.querySelectorAll<HTMLButtonElement>('[data-gallery-mode]').forEach((button) => button.classList.toggle('active', button.dataset.galleryMode === state.mode));
  categoryOptions(gallery.getCategories(), state.category);
  if (gallerySort) gallerySort.value = state.sort.key;
  if (galleryDirection) galleryDirection.value = state.sort.direction;
  if (galleryNumberType) galleryNumberType.value = state.sort.numberType ?? 'seat';
  if (numberTypeControl) numberTypeControl.hidden = state.sort.key !== 'number';
  idleShowcase?.setAssets(gallery.getAssets());
}

function syncEngagement(assetId?: string) {
  gallery.setAssets(gallery.getAssets().map((asset) => (
    !assetId || asset.id === assetId ? { ...asset, popularity: engagement.popularity(asset.id) } : asset
  )));
}

function acceptImported(imported: ImportedMediaAsset[], replaceCurrent = !importedOnce) {
  const current = replaceCurrent ? [] : gallery.getAssets();
  if (replaceCurrent) renderables.clear();
  const offset = current.length;
  imported.forEach(({ record, renderable }, index) => {
    record.importOrder = offset + index;
    record.manualOrder = offset + index;
    renderables.set(record.id, renderable);
  });
  importedOnce = true;
  gallery.setAssets([...current, ...imported.map((item) => item.record)]);
  gallery.setMode('all');
}

function storedToImported(asset: StoredAsset): ImportedMediaAsset | null {
  if (asset.record.kind === 'unsupported') return null;
  return {
    record: { ...asset.record, savedLocally: true },
    renderable: {
      kind: asset.record.kind as RenderableKind,
      title: asset.record.title,
      files: asset.files.map(({ descriptor, blob }) => ({
        blob,
        name: descriptor.name,
        relativePath: descriptor.relativePath,
        mimeType: descriptor.mimeType
      }))
    }
  };
}

async function loadSavedGallery(showEmptyMessage = true) {
  if (libraryStatus) libraryStatus.textContent = '正在讀取本機作品庫…';
  try {
    const stored = await galleryStorage.listAssets();
    const imported = stored.map(storedToImported).filter((asset): asset is ImportedMediaAsset => asset !== null);
    if (imported.length > 0) {
      acceptImported(imported, true);
      if (libraryStatus) libraryStatus.textContent = `已從這台電腦載入 ${imported.length} 件作品。`;
    } else if (libraryStatus) {
      libraryStatus.textContent = showEmptyMessage ? '這台電腦還沒有已保存的作品。' : '';
    }
    return imported.length;
  } catch (error) {
    if (libraryStatus) libraryStatus.textContent = error instanceof Error ? error.message : '無法讀取本機作品庫';
    return 0;
  }
}

async function saveCurrentGallery() {
  const candidates = gallery.getAssets().flatMap((record) => {
    const renderable = renderables.get(record.id);
    if (!renderable) return [];
    const files = renderable.files.flatMap((file, index) => {
      const descriptor = record.sourceFiles.find((item) => item.relativePath === file.relativePath) ?? record.sourceFiles[index];
      return descriptor ? [{ descriptor, blob: file.blob }] : [];
    });
    return files.length === renderable.files.length ? [{ record, files }] : [];
  });
  if (candidates.length === 0) {
    if (libraryStatus) libraryStatus.textContent = '目前沒有可保存的匯入作品。';
    return;
  }
  if (libraryStatus) libraryStatus.textContent = `正在保存 ${candidates.length} 件作品…`;
  try {
    await requestPersistentStorage();
    for (const candidate of candidates) await galleryStorage.saveAsset(candidate.record, candidate.files);
    const saved = new Set(candidates.map((candidate) => candidate.record.id));
    gallery.setAssets(gallery.getAssets().map((asset) => saved.has(asset.id) ? { ...asset, savedLocally: true } : asset));
    if (libraryStatus) libraryStatus.textContent = `已將 ${candidates.length} 件作品保存在這台電腦。`;
  } catch (error) {
    if (libraryStatus) libraryStatus.textContent = error instanceof Error ? error.message : '作品保存失敗';
  }
}

function downloadBlob(fileName: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

if (mediaStage && mediaInput && mediaStatus && mediaDropZone) {
  mediaViewer = mountMediaViewer({ container: mediaStage, shell: mediaDropZone, input: mediaInput, status: mediaStatus, onImport: acceptImported });
}

saveLocalGalleryButton?.addEventListener('click', () => { void saveCurrentGallery(); });
loadLocalGalleryButton?.addEventListener('click', () => { void loadSavedGallery(); });
exportLocalGalleryButton?.addEventListener('click', () => {
  void galleryStorage.listAssets().then((assets) => {
    if (assets.length === 0) {
      if (libraryStatus) libraryStatus.textContent = '沒有已保存的作品可匯出。';
      return;
    }
    downloadBlob('class3d-gallery.c3dg', exportGalleryArchive(assets));
    if (libraryStatus) libraryStatus.textContent = `已匯出 ${assets.length} 件作品的本機展覽檔。`;
  }).catch((error: unknown) => { if (libraryStatus) libraryStatus.textContent = error instanceof Error ? error.message : '匯出失敗'; });
});
importLocalGalleryInput?.addEventListener('change', () => {
  const archive = importLocalGalleryInput.files?.[0];
  importLocalGalleryInput.value = '';
  if (!archive) return;
  if (libraryStatus) libraryStatus.textContent = '正在匯入展覽檔…';
  void importGalleryArchive(galleryStorage, archive)
    .then(({ importedCount }) => loadSavedGallery(false).then(() => {
      if (libraryStatus) libraryStatus.textContent = `已匯入並載入 ${importedCount} 件作品。`;
    }))
    .catch((error: unknown) => { if (libraryStatus) libraryStatus.textContent = error instanceof Error ? error.message : '匯入失敗'; });
});
clearLocalGalleryButton?.addEventListener('click', () => {
  if (!window.confirm('確定清除這台電腦上已保存的作品？目前畫面可繼續展示到關閉頁籤。')) return;
  void galleryStorage.clearAll().then(() => {
    gallery.setAssets(gallery.getAssets().map((asset) => ({ ...asset, savedLocally: false })));
    if (libraryStatus) libraryStatus.textContent = '已清除本機作品庫；未上傳任何資料。';
  }).catch((error: unknown) => { if (libraryStatus) libraryStatus.textContent = error instanceof Error ? error.message : '清除失敗'; });
});

document.querySelectorAll<HTMLButtonElement>('[data-gallery-mode]').forEach((button) => {
  button.addEventListener('click', () => gallery.setMode(button.dataset.galleryMode as ExhibitionMode));
});
gallerySort?.addEventListener('change', () => {
  const key = gallerySort.value as AssetSortKey;
  const direction: SortDirection = ['popularity', 'importedAt'].includes(key) ? 'descending' : 'ascending';
  gallery.setSort({ key, direction, ...(key === 'number' ? { numberType: galleryNumberType?.value as 'seat' | 'sequence' } : {}) });
});
galleryDirection?.addEventListener('change', () => gallery.setSort({ ...gallery.getState().sort, direction: galleryDirection.value as SortDirection }));
galleryNumberType?.addEventListener('change', () => gallery.setSort({ key: 'number', direction: gallery.getState().sort.direction, numberType: galleryNumberType.value as 'seat' | 'sequence' }));
galleryCategory?.addEventListener('change', () => gallery.setCategory(galleryCategory.value));
gallery.subscribe(renderGallery);

if (showcaseOverlay) {
  const showcaseView = mountShowcaseView({
    container: showcaseOverlay,
    getAssets: () => gallery.getAssets(),
    getRenderable: (assetId) => renderables.get(assetId),
    getSettings: () => activeExhibitionSettings
  });
  idleShowcase = new IdleShowcaseController(activeExhibitionSettings.autoShowcase);
  idleShowcase.setAssets(gallery.getAssets());
  idleShowcase.subscribe((snapshot) => {
    if (snapshot.active && snapshot.phase === 'carousel') {
      const asset = gallery.getAssets()[snapshot.assetIndex % gallery.getAssets().length];
      if (asset) engagement.recordView(asset.id, 'automatic');
    }
    showcaseView.render(snapshot);
  });
  idleShowcase.attachActivity(document);
  startShowcaseButton?.addEventListener('click', () => idleShowcase?.startNow());
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) idleShowcase?.suspend();
    else idleShowcase?.resume();
  });
  window.addEventListener('pagehide', () => {
    idleShowcase?.destroy();
    showcaseView.destroy();
  }, { once: true });
}

if (settingsDialog && settingsViewContainer && openSettingsButton) {
  const settingsView = mountSettingsView({
    container: settingsViewContainer,
    store: exhibitionSettingsStore,
    onApply: applyExhibitionSettings,
    onClose: () => settingsDialog.close()
  });
  openSettingsButton.addEventListener('click', () => {
    settingsView.reload();
    settingsDialog.showModal();
  });
  settingsDialog.addEventListener('click', (event) => {
    if (event.target === settingsDialog) settingsDialog.close();
  });
  settingsDialog.addEventListener('close', () => settingsView.reload());
}

if (engagementDialog) {
  engagementView = mountEngagementView({
    dialog: engagementDialog,
    controller: engagement,
    getVisitorId: () => visitorId,
    startNewVisitor: () => {
      visitorId = startNewVisitorSession();
      syncEngagement();
      return visitorId;
    },
    getSettings: () => activeExhibitionSettings,
    onChange: syncEngagement
  });
}

syncEngagement();
void loadSavedGallery(false);
