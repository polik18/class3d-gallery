import { mountRenderer } from '../renderers/registry.ts';
import type { MountedRenderer, RenderableAsset } from '../renderers/types.ts';

interface PreviewEntry {
  asset: RenderableAsset;
  generation: number;
  mounted: MountedRenderer | null;
  mounting: boolean;
  status: HTMLElement;
}

/**
 * Keeps gallery cards visual without keeping every video, PDF and WebGL scene
 * alive at once. Nearby cards are mounted eagerly and released after they
 * leave the viewport.
 */
export class CardPreviewManager {
  private readonly entries = new Map<HTMLElement, PreviewEntry>();
  private readonly observer: IntersectionObserver | null;

  constructor() {
    this.observer = typeof IntersectionObserver === 'undefined'
      ? null
      : new IntersectionObserver((items) => {
        items.forEach((item) => {
          const target = item.target as HTMLElement;
          if (item.isIntersecting) void this.mount(target);
          else this.unmount(target);
        });
      }, { rootMargin: '600px 0px' });
  }

  observe(target: HTMLElement, asset: RenderableAsset) {
    target.dataset.previewState = 'loading';
    this.entries.set(target, {
      asset,
      generation: 0,
      mounted: null,
      mounting: false,
      status: document.createElement('span')
    });
    if (this.observer) this.observer.observe(target);
    else void this.mount(target);
  }

  clear() {
    this.observer?.disconnect();
    [...this.entries.keys()].forEach((target) => this.unmount(target, true));
    this.entries.clear();
  }

  private async mount(target: HTMLElement) {
    const entry = this.entries.get(target);
    if (!entry || entry.mounted || entry.mounting) return;
    entry.mounting = true;
    target.dataset.previewState = 'loading';
    const generation = ++entry.generation;
    try {
      const mounted = await mountRenderer(target, entry.asset, entry.status);
      const current = this.entries.get(target);
      if (!current || current !== entry || current.generation !== generation) {
        mounted.destroy();
        return;
      }
      entry.mounted = mounted;
      this.prepareCardMedia(target);
      target.dataset.previewState = 'ready';
    } catch (error) {
      if (this.entries.get(target) === entry && entry.generation === generation) {
        target.dataset.previewState = 'error';
        target.dataset.previewError = error instanceof Error ? error.message : String(error);
      }
    } finally {
      if (this.entries.get(target) === entry && entry.generation === generation) entry.mounting = false;
    }
  }

  private unmount(target: HTMLElement, remove = false) {
    const entry = this.entries.get(target);
    if (!entry) return;
    entry.generation += 1;
    entry.mounting = false;
    entry.mounted?.destroy();
    entry.mounted = null;
    target.replaceChildren();
    target.dataset.previewState = 'deferred';
    if (remove) this.entries.delete(target);
  }

  private prepareCardMedia(target: HTMLElement) {
    const video = target.querySelector<HTMLVideoElement>('video');
    if (video) {
      video.controls = false;
      video.muted = true;
      video.preload = 'auto';
      const seekToPreviewFrame = () => {
        if (Number.isFinite(video.duration) && video.duration > 0) video.currentTime = Math.min(0.1, video.duration / 10);
      };
      if (video.readyState >= HTMLMediaElement.HAVE_METADATA) seekToPreviewFrame();
      else video.addEventListener('loadedmetadata', seekToPreviewFrame, { once: true });
      video.load();
    }
    const audio = target.querySelector<HTMLAudioElement>('audio');
    if (audio) audio.controls = false;
    const iframe = target.querySelector<HTMLIFrameElement>('iframe');
    if (iframe) iframe.src = iframe.src.replace(/#.*$/, '#toolbar=0&navpanes=0');
    target.querySelector<HTMLButtonElement>('[data-action="rotate"]')?.click();
  }
}
