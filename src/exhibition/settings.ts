import {
  createExhibitionSettings,
  parseExhibitionSettings,
  serializeExhibitionSettings,
  type ExhibitionSettings
} from './types.ts';

export const EXHIBITION_SETTINGS_KEY = 'class3d-gallery:exhibition-settings:v1';

export interface StringStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export class ExhibitionSettingsStore {
  private readonly storage: StringStorage;
  private readonly now: () => number;

  constructor(storage: StringStorage = localStorage, now: () => number = Date.now) {
    this.storage = storage;
    this.now = now;
  }

  load() {
    const serialized = this.storage.getItem(EXHIBITION_SETTINGS_KEY);
    if (!serialized) return createExhibitionSettings({}, this.now());
    try {
      return parseExhibitionSettings(serialized);
    } catch {
      this.storage.removeItem(EXHIBITION_SETTINGS_KEY);
      return createExhibitionSettings({}, this.now());
    }
  }

  save(settings: ExhibitionSettings) {
    const title = settings.title.trim();
    if (!title) throw new Error('展覽標題不可空白');
    const saved: ExhibitionSettings = {
      ...settings,
      title,
      subtitle: settings.subtitle.trim(),
      description: settings.description.trim(),
      curator: settings.curator.trim(),
      className: settings.className.trim(),
      updatedAt: this.now(),
      engagement: { ...settings.engagement },
      autoShowcase: { ...settings.autoShowcase },
      display: { ...settings.display }
    };
    this.storage.setItem(EXHIBITION_SETTINGS_KEY, serializeExhibitionSettings(saved));
    return saved;
  }

  clear() {
    this.storage.removeItem(EXHIBITION_SETTINGS_KEY);
  }
}
