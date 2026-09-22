import { ExhibitionSettingsStore } from './settings.ts';
import type { ExhibitionSettings } from './types.ts';

interface SettingsViewOptions {
  container: HTMLElement;
  store: ExhibitionSettingsStore;
  onApply(settings: ExhibitionSettings): void;
  onClose(): void;
}

export function mountSettingsView({ container, store, onApply, onClose }: SettingsViewOptions) {
  container.innerHTML = `
    <form class="settings-form" id="exhibition-settings-form">
      <div class="settings-heading"><div><p>EXHIBITION SETTINGS</p><h2>展覽設定</h2></div><button class="settings-close" type="button" aria-label="關閉設定">×</button></div>
      <label>展覽總標題<input name="title" required maxlength="80" /></label>
      <label>副標題<input name="subtitle" maxlength="120" /></label>
      <label>展覽介紹<textarea name="description" rows="4" maxlength="600"></textarea></label>
      <div class="settings-columns">
        <label>班級<input name="className" maxlength="80" /></label>
        <label>策展人<input name="curator" maxlength="80" /></label>
      </div>
      <fieldset><legend>顯示內容</legend>
        <label><input name="showSubtitle" type="checkbox" /> 副標題</label>
        <label><input name="showDescription" type="checkbox" /> 展覽介紹</label>
        <label><input name="showCurator" type="checkbox" /> 班級與策展人</label>
        <label><input name="showArtworkCount" type="checkbox" /> 作品數量</label>
        <label><input name="showCategories" type="checkbox" /> 作品分類</label>
      </fieldset>
      <fieldset><legend>訪客互動</legend>
        <label><input name="likesEnabled" type="checkbox" /> 允許按讚</label>
        <label><input name="commentsEnabled" type="checkbox" /> 允許留言</label>
        <label><input name="commentModeration" type="checkbox" /> 留言需核准</label>
        <label><input name="showPopularity" type="checkbox" /> 顯示人氣</label>
      </fieldset>
      <fieldset class="settings-timing"><legend>閒置自動展示（秒）</legend>
        <label class="settings-wide"><input name="autoShowcaseEnabled" type="checkbox" /> 開啟自動展示</label>
        <label>開始閒置時間<input name="idleDelay" type="number" min="5" max="3600" step="1" /></label>
        <label>標題畫面<input name="titleDuration" type="number" min="1" max="600" step="1" /></label>
        <label>作品輪播<input name="carouselDuration" type="number" min="1" max="3600" step="1" /></label>
        <label>全體縮圖<input name="overviewDuration" type="number" min="1" max="600" step="1" /></label>
        <label>人氣精選<input name="popularDuration" type="number" min="1" max="600" step="1" /></label>
        <label>圖片／一般作品<input name="imageDuration" type="number" min="1" max="600" step="1" /></label>
        <label>3D 作品<input name="modelDuration" type="number" min="1" max="600" step="1" /></label>
        <label>影片上限<input name="videoMaxDuration" type="number" min="1" max="3600" step="1" /></label>
      </fieldset>
      <p class="settings-status" aria-live="polite"></p>
      <div class="settings-actions"><button class="secondary-button" data-action="reset" type="button">恢復預設</button><button class="primary-button" type="submit">保存並套用</button></div>
    </form>
  `;
  const form = container.querySelector<HTMLFormElement>('form');
  const status = container.querySelector<HTMLElement>('.settings-status');
  const closeButton = container.querySelector<HTMLButtonElement>('.settings-close');
  const resetButton = container.querySelector<HTMLButtonElement>('[data-action="reset"]');
  if (!form || !status || !closeButton || !resetButton) throw new Error('展覽設定表單建立失敗');

  let current = store.load();
  const field = <T extends HTMLInputElement | HTMLTextAreaElement>(name: string) => {
    const element = form.elements.namedItem(name);
    if (!(element instanceof HTMLInputElement) && !(element instanceof HTMLTextAreaElement)) throw new Error(`缺少設定欄位：${name}`);
    return element as T;
  };
  const fill = (settings: ExhibitionSettings) => {
    field<HTMLInputElement>('title').value = settings.title;
    field<HTMLInputElement>('subtitle').value = settings.subtitle;
    field<HTMLTextAreaElement>('description').value = settings.description;
    field<HTMLInputElement>('className').value = settings.className;
    field<HTMLInputElement>('curator').value = settings.curator;
    (['showSubtitle', 'showDescription', 'showCurator', 'showArtworkCount', 'showCategories'] as const)
      .forEach((key) => { field<HTMLInputElement>(key).checked = settings.display[key]; });
    (['likesEnabled', 'commentsEnabled', 'commentModeration', 'showPopularity'] as const)
      .forEach((key) => { field<HTMLInputElement>(key).checked = settings.engagement[key]; });
    field<HTMLInputElement>('autoShowcaseEnabled').checked = settings.autoShowcase.enabled;
    const durations = {
      idleDelay: settings.autoShowcase.idleDelayMs,
      titleDuration: settings.autoShowcase.titleDurationMs,
      carouselDuration: settings.autoShowcase.carouselDurationMs,
      overviewDuration: settings.autoShowcase.overviewDurationMs,
      popularDuration: settings.autoShowcase.popularDurationMs,
      imageDuration: settings.autoShowcase.imageDurationMs,
      modelDuration: settings.autoShowcase.modelDurationMs,
      videoMaxDuration: settings.autoShowcase.videoMaxDurationMs
    };
    Object.entries(durations).forEach(([name, milliseconds]) => { field<HTMLInputElement>(name).value = String(milliseconds / 1000); });
  };
  const seconds = (name: string, fallback: number) => {
    const value = Number(field<HTMLInputElement>(name).value) * 1000;
    return Number.isFinite(value) && value > 0 ? value : fallback;
  };
  const read = (): ExhibitionSettings => ({
      ...current,
      title: field<HTMLInputElement>('title').value,
      subtitle: field<HTMLInputElement>('subtitle').value,
      description: field<HTMLTextAreaElement>('description').value,
      className: field<HTMLInputElement>('className').value,
      curator: field<HTMLInputElement>('curator').value,
      engagement: {
        likesEnabled: field<HTMLInputElement>('likesEnabled').checked,
        commentsEnabled: field<HTMLInputElement>('commentsEnabled').checked,
        commentModeration: field<HTMLInputElement>('commentModeration').checked,
        showPopularity: field<HTMLInputElement>('showPopularity').checked
      },
      autoShowcase: {
        enabled: field<HTMLInputElement>('autoShowcaseEnabled').checked,
        idleDelayMs: seconds('idleDelay', current.autoShowcase.idleDelayMs),
        titleDurationMs: seconds('titleDuration', current.autoShowcase.titleDurationMs),
        carouselDurationMs: seconds('carouselDuration', current.autoShowcase.carouselDurationMs),
        overviewDurationMs: seconds('overviewDuration', current.autoShowcase.overviewDurationMs),
        popularDurationMs: seconds('popularDuration', current.autoShowcase.popularDurationMs),
        imageDurationMs: seconds('imageDuration', current.autoShowcase.imageDurationMs),
        modelDurationMs: seconds('modelDuration', current.autoShowcase.modelDurationMs),
        videoMaxDurationMs: seconds('videoMaxDuration', current.autoShowcase.videoMaxDurationMs)
      },
      display: {
        showSubtitle: field<HTMLInputElement>('showSubtitle').checked,
        showDescription: field<HTMLInputElement>('showDescription').checked,
        showCurator: field<HTMLInputElement>('showCurator').checked,
        showArtworkCount: field<HTMLInputElement>('showArtworkCount').checked,
        showCategories: field<HTMLInputElement>('showCategories').checked
      }
    });

  fill(current);
  form.addEventListener('input', () => {
    const preview = read();
    if (preview.title.trim()) onApply({ ...preview, title: preview.title.trim() });
  });
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    try {
      current = store.save(read());
      fill(current);
      onApply(current);
      status.textContent = '已保存在這台電腦的瀏覽器。';
    } catch (error) {
      status.textContent = error instanceof Error ? error.message : '設定保存失敗';
    }
  });
  resetButton.addEventListener('click', () => {
    store.clear();
    current = store.load();
    fill(current);
    onApply(current);
    status.textContent = '已恢復預設設定。';
  });
  closeButton.addEventListener('click', onClose);
  onApply(current);
  return {
    getSettings: () => current,
    reload() {
      current = store.load();
      fill(current);
      status.textContent = '';
      onApply(current);
    }
  };
}
