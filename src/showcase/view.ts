import type { AssetRecord } from '../assets/types.ts';
import type { ExhibitionSettings } from '../exhibition/types.ts';
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
}

const phaseNames = { title: '展覽開場', carousel: '作品輪播', overview: '全體作品', popular: '人氣精選' } as const;

export function mountShowcaseView(options: ShowcaseViewOptions) {
  const session = new RendererSession();
  let mountedAssetId: string | null = null;
  let renderGeneration = 0;

  const text = (tag: keyof HTMLElementTagNameMap, className: string, value: string) => {
    const element = document.createElement(tag);
    element.className = className;
    element.textContent = value;
    return element;
  };

  const artworkTile = (asset: AssetRecord, index: number, prominent = false) => {
    const tile = document.createElement('article');
    tile.className = `showcase-tile showcase-tile--${index % 5 + 1}${prominent ? ' showcase-tile--prominent' : ''}`;
    const visual = document.createElement('div');
    visual.className = 'showcase-tile-visual';
    visual.append(text('span', '', String(asset.displayNumber ?? index + 1).padStart(2, '0')), text('small', '', asset.kind.toUpperCase()));
    const copy = document.createElement('div');
    copy.append(text('strong', '', asset.title), text('span', '', [asset.author, asset.category].filter(Boolean).join(' · ')));
    tile.append(visual, copy);
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
    if (!renderable || mountedAssetId === asset.id) return;
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
    media.querySelector<HTMLButtonElement>('[data-action=animation]:not(:disabled)')?.click();
  };

  const render = (snapshot: ShowcaseSnapshot) => {
    const assets = options.getAssets();
    const settings = options.getSettings();
    const active = snapshot.active && assets.length > 0;
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
    stage.className = `showcase-stage showcase-stage--${snapshot.phase} transition-${transition}`;
    stage.style.setProperty('--showcase-duration', `${snapshot.durationMs}ms`);
    const chrome = document.createElement('div');
    chrome.className = 'showcase-chrome';
    chrome.append(text('span', '', `CLASS3D / ${phaseNames[snapshot.phase as keyof typeof phaseNames]}`), text('span', '', '點擊、滾動或按鍵即退出'));
    const progress = document.createElement('div');
    progress.className = 'showcase-progress';
    progress.append(document.createElement('i'));
    options.container.replaceChildren(chrome, stage, progress);

    if (snapshot.phase === 'title') {
      mountedAssetId = null;
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
      session.clear();
      stage.append(text('p', 'showcase-kicker', `ALL WORKS / ${assets.length}`), text('h2', '', '全體作品'));
      const grid = document.createElement('div');
      grid.className = 'showcase-overview-grid';
      grid.append(...assets.slice(0, 12).map((asset, index) => artworkTile(asset, index)));
      stage.append(grid);
    } else {
      mountedAssetId = null;
      session.clear();
      const popular = [...assets].sort((left, right) => popularityScore(right) - popularityScore(left)).slice(0, 3);
      stage.append(text('p', 'showcase-kicker', 'VISITORS\' CHOICE'), text('h2', '', '人氣精選'));
      const grid = document.createElement('div');
      grid.className = 'showcase-popular-grid';
      grid.append(...popular.map((asset, index) => artworkTile(asset, index)));
      stage.append(grid);
    }
  };

  return { render, destroy() { session.clear(); options.container.replaceChildren(); document.body.dataset.showcaseActive = 'false'; } };
}
