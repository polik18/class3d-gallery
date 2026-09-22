import { ObjectUrlPool } from './objectUrls.ts';
import type { MountedRenderer, RenderableAsset } from './types.ts';

function cleanupMedia(element: HTMLMediaElement) {
  element.pause();
  element.removeAttribute('src');
  element.load();
}

export function mountNativeRenderer(container: HTMLElement, asset: RenderableAsset): MountedRenderer {
  const source = asset.files[0];
  if (!source) throw new Error('作品沒有可顯示的來源檔案');
  const urls = new ObjectUrlPool();
  const url = urls.create(source.blob);
  const frame = document.createElement('div');
  frame.className = `native-renderer native-renderer--${asset.kind}`;
  let media: HTMLMediaElement | null = null;
  let iframe: HTMLIFrameElement | null = null;
  let image: HTMLImageElement | null = null;
  let resumePlayback = false;
  if (asset.kind === 'image') {
    image = document.createElement('img');
    image.src = url;
    image.alt = asset.title;
    frame.append(image);
  } else if (asset.kind === 'video') {
    const video = document.createElement('video');
    video.src = url;
    video.controls = true;
    video.preload = 'metadata';
    video.playsInline = true;
    media = video;
    frame.append(video);
  } else if (asset.kind === 'audio') {
    const cover = document.createElement('div');
    cover.className = 'audio-cover';
    const label = document.createElement('span');
    label.textContent = 'NOW PLAYING';
    const title = document.createElement('strong');
    title.textContent = asset.title;
    const icon = document.createElement('i');
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = '♪';
    cover.append(label, title, icon);
    media = document.createElement('audio');
    media.src = url;
    media.controls = true;
    media.preload = 'metadata';
    frame.append(cover, media);
  } else if (asset.kind === 'pdf') {
    iframe = document.createElement('iframe');
    iframe.src = `${url}#toolbar=1&navpanes=0`;
    iframe.title = `${asset.title} PDF 預覽`;
    frame.append(iframe);
  } else {
    throw new Error(`原生 renderer 不支援 ${asset.kind}`);
  }
  container.replaceChildren(frame);
  return {
    pause() {
      if (!media) return;
      resumePlayback = !media.paused;
      media.pause();
    },
    resume() {
      if (media && resumePlayback) void media.play().catch(() => undefined);
      resumePlayback = false;
    },
    destroy() {
      if (media) cleanupMedia(media);
      if (iframe) iframe.src = 'about:blank';
      if (image) image.removeAttribute('src');
      frame.remove();
      urls.revokeAll();
    }
  };
}
