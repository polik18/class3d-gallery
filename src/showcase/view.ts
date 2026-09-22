import type { AssetRecord } from '../assets/types.ts';
import type { ExhibitionSettings } from '../exhibition/types.ts';
import { CardPreviewManager } from '../gallery/cardPreview.ts';
import { popularityScore } from '../gallery/sort.ts';
import { mountRenderer } from '../renderers/registry.ts';
import { RendererSession } from '../renderers/session.ts';
import type { RenderableAsset } from '../renderers/types.ts';
import type { ShowcaseSnapshot } from './idleController.ts';
import { prefersReducedShowcaseMotion, showcaseTransition } from './transitions.ts';

interface ShowcaseViewOptions {
  container: HTMLElement;
  getAssets(): AssetRecord[];
  getRenderable(assetId: string): RenderableAsset | undefined;
  getSettings(): ExhibitionSettings;
  onClose(): void;
  onModeChange(mode: ShowcaseSnapshot['mode']): void;
  onPrevious(): void;
  onNext(): void;
  onSelectAsset(index: number): void;
}

const phaseNames = { title: '展覽開場', carousel: '作品輪播', overview: '全體作品', popular: '人氣精選' } as const;

export function mountShowcaseView(options: ShowcaseViewOptions) {
  const session = new RendererSession();
  const tilePreviews = new CardPreviewManager();
  let mountedAssetId: string | null = null;
  let renderGeneration = 0;

  const text = (tag: keyof HTMLElementTagNameMap, className: string, value: string) => {
    const element = document.createElement(tag);
    element.className = className;
    element.textContent = value;
    return element;
  };

  const artworkTile = (asset: AssetRecord, index: number, prominent = false, selectable = false) => {
    const tile = document.createElement('article');
    tile.className = `showcase-tile showcase-tile--${index % 5 + 1}${prominent ? ' showcase-tile--prominent' : ''}`;
    const visual = document.createElement('div');
    visual.className = 'showcase-tile-visual';
    const renderable = options.getRenderable(asset.id);
    if (renderable) {
      tile.classList.add('has-preview');
      const preview = document.createElement('div');
      preview.className = 'work-preview-layer';
      preview.setAttribute('aria-label', `${asset.title} 作品預覽`);
      visual.append(preview);
      tilePreviews.observe(preview, renderable);
    }
    visual.append(text('span', '', String(asset.displayNumber ?? index + 1).padStart(2, '0')), text('small', '', asset.kind.toUpperCase()));
    const copy = document.createElement('div');
    copy.append(text('strong', '', asset.title), text('span', '', [asset.author, asset.category].filter(Boolean).join(' · ')));
    tile.append(visual, copy);
    if (selectable) {
      tile.classList.add('showcase-tile--selectable');
      tile.tabIndex = 0;
      tile.role = 'button';
      tile.setAttribute('aria-label', `單獨展出 ${asset.title}`);
      tile.addEventListener('click', () => options.onSelectAsset(index));
      tile.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          options.onSelectAsset(index);
        }
      });
    }
    return tile;
  };

  const renderCarousel = async (snapshot: ShowcaseSnapshot, assets: AssetRecord[], stage: HTMLElement) => {
    const asset = assets[snapshot.assetIndex % assets.length];
    const layout = document.createElement('div');
    layout.className = 'showcase-carousel-layout';
    const media = document.createElement('div');
    media.className = 'showcase-media';
    const status = text('p', 'showcase-media-status', `正在展示 ${asset.title}`);
    const renderable = options.getRenderable(asset.id);
    if (!renderable) media.append(artworkTile(asset, snapshot.assetIndex, true));
    const copy = document.createElement('div');
    copy.className = 'showcase-artwork-copy';
    copy.append(
      text('p', 'showcase-kicker', `${String(snapshot.assetIndex + 1).padStart(2, '0')} / ${String(assets.length).padStart(2, '0')} · ${asset.category}`),
      text('h2', '', asset.title),
      text('p', 'showcase-description', asset.description),
      text('span', 'showcase-author', asset.author ?? '')
    );
    layout.append(media, copy);
    stage.append(layout, status);
    if (!renderable) {
      if (mountedAssetId !== null) {
        mountedAssetId = null;
        renderGeneration += 1;
        session.clear();
      }
      return;
    }
    mountedAssetId = asset.id;
    const generation = ++renderGeneration;
    await session.show(() => mountRenderer(media, renderable, status));
    if (generation !== renderGeneration) return;
    const video = media.querySelector('video');
    if (video) {
      video.muted = true;
      video.loop = true;
      void video.play().catch(() => undefined);
    }
    media.querySelector<HTMLButtonElement>('[data-action=rotate]')?.click();
    for (let attempt = 0; attempt < 20 && generation === renderGeneration; attempt += 1) {
      const animationButton = media.querySelector<HTMLButtonElement>('[data-action=animation]');
      if (animationButton && !animationButton.disabled) {
        animationButton.click();
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  };

  const manualChrome = (snapshot: ShowcaseSnapshot, assets: AssetRecord[]) => {
    const chrome = document.createElement('div');
    chrome.className = 'showcase-chrome showcase-chrome--manual';
    chrome.append(text('span', 'showcase-brand', 'CLASS3D / 正式展覽'));

    const controls = document.createElement('div');
    controls.className = 'showcase-controls';
    const single = document.createElement('button');
    single.type = 'button';
    single.textContent = '單件展出';
    single.dataset.active = String(snapshot.mode === 'single');
    single.addEventListener('click', () => options.onModeChange('single'));
    const multiple = document.createElement('button');
    multiple.type = 'button';
    multiple.textContent = '多件同展';
    multiple.dataset.active = String(snapshot.mode === 'multiple');
    multiple.addEventListener('click', () => options.onModeChange('multiple'));
    const previous = document.createElement('button');
    previous.type = 'button';
    previous.textContent = snapshot.mode === 'single' ? '← 上一件' : '← 上一頁';
    previous.disabled = snapshot.mode === 'multiple' && assets.length <= 12;
    previous.addEventListener('click', options.onPrevious);
    const next = document.createElement('button');
    next.type = 'button';
    next.textContent = snapshot.mode === 'single' ? '下一件 →' : '下一頁 →';
    next.disabled = snapshot.mode === 'multiple' && assets.length <= 12;
    next.addEventListener('click', options.onNext);
    controls.append(single, multiple, previous, next);

    if (snapshot.mode === 'single') {
      const select = document.createElement('select');
      select.setAttribute('aria-label', '切換展出作品');
      assets.forEach((asset, index) => {
        const option = document.createElement('option');
        option.value = String(index);
        option.textContent = `${String(asset.displayNumber ?? index + 1).padStart(2, '0')} · ${asset.title}`;
        option.selected = index === snapshot.assetIndex;
        select.append(option);
      });
      select.addEventListener('change', () => options.onSelectAsset(Number(select.value)));
      controls.append(select);
    }

    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'showcase-close';
    close.textContent = '結束展覽 ×';
    close.addEventListener('click', options.onClose);
    controls.append(close);
    chrome.append(controls);
    return chrome;
  };

  const render = (snapshot: ShowcaseSnapshot) => {
    const assets = options.getAssets();
    const settings = options.getSettings();
    const active = snapshot.active && assets.length > 0;
    tilePreviews.clear();
    options.container.hidden = !active;
    options.container.setAttribute('aria-hidden', String(!active));
    document.body.dataset.showcaseActive = String(active);
    if (!active) {
      mountedAssetId = null;
      renderGeneration += 1;
      session.clear();
      options.container.replaceChildren();
      return;
    }

    const stage = document.createElement('div');
    const transition = showcaseTransition(snapshot.phase, prefersReducedShowcaseMotion());
    stage.className = `showcase-stage showcase-stage--${snapshot.phase} transition-${transition}${snapshot.manual ? ' showcase-stage--manual' : ''}`;
    stage.style.setProperty('--showcase-duration', `${snapshot.durationMs}ms`);
    const chrome = snapshot.manual ? manualChrome(snapshot, assets) : document.createElement('div');
    if (!snapshot.manual) {
      chrome.className = 'showcase-chrome';
      chrome.append(text('span', '', `CLASS3D / ${phaseNames[snapshot.phase as keyof typeof phaseNames]}`), text('span', '', '點擊、滾動或按鍵即退出'));
    }
    const progress = document.createElement('div');
    progress.className = 'showcase-progress';
    progress.append(document.createElement('i'));
    options.container.replaceChildren(chrome, stage, ...(snapshot.manual ? [] : [progress]));

    if (snapshot.phase === 'title') {
      mountedAssetId = null;
      renderGeneration += 1;
      session.clear();
      const copy = document.createElement('div');
      copy.className = 'showcase-title-card';
      copy.append(
        text('p', 'showcase-kicker', settings.className || 'CLASSROOM EXHIBITION'),
        text('h1', '', settings.title),
        text('p', 'showcase-title-subtitle', settings.subtitle || settings.description || `${assets.length} 件作品正在展出`),
        text('span', 'showcase-author', settings.curator ? `策展：${settings.curator}` : '')
      );
      stage.append(copy);
    } else if (snapshot.phase === 'carousel') {
      void renderCarousel(snapshot, assets, stage);
    } else if (snapshot.phase === 'overview') {
      mountedAssetId = null;
      renderGeneration += 1;
      session.clear();
      const pageStart = snapshot.manual ? Math.floor(snapshot.assetIndex / 12) * 12 : 0;
      const visibleAssets = assets.slice(pageStart, pageStart + 12);
      stage.append(
        text('p', 'showcase-kicker', snapshot.manual ? `${pageStart + 1}–${Math.min(pageStart + visibleAssets.length, assets.length)} / ${assets.length}` : `ALL WORKS / ${assets.length}`),
        text('h2', '', snapshot.manual ? '多件同展' : '全體作品')
      );
      const grid = document.createElement('div');
      grid.className = 'showcase-overview-grid';
      grid.append(...visibleAssets.map((asset, index) => artworkTile(asset, pageStart + index, false, snapshot.manual)));
      stage.append(grid);
    } else {
      mountedAssetId = null;
      renderGeneration += 1;
      session.clear();
      const popular = [...assets].sort((left, right) => popularityScore(right) - popularityScore(left)).slice(0, 3);
      stage.append(text('p', 'showcase-kicker', 'VISITORS\' CHOICE'), text('h2', '', '人氣精選'));
      const grid = document.createElement('div');
      grid.className = 'showcase-popular-grid';
      grid.append(...popular.map((asset, index) => artworkTile(asset, index)));
      stage.append(grid);
    }
  };

  return { render, destroy() { tilePreviews.clear(); session.clear(); options.container.replaceChildren(); document.body.dataset.showcaseActive = 'false'; } };
}
