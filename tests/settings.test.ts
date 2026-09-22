import assert from 'node:assert/strict';
import test from 'node:test';
import { ExhibitionSettingsStore, EXHIBITION_SETTINGS_KEY, type StringStorage } from '../src/exhibition/settings.ts';
import { createExhibitionSettings, parseExhibitionSettings } from '../src/exhibition/types.ts';

class MemoryStorage implements StringStorage {
  values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

test('empty local storage returns complete exhibition defaults', () => {
  const settings = new ExhibitionSettingsStore(new MemoryStorage(), () => 100).load();
  assert.equal(settings.title, '我的多媒體展覽');
  assert.equal(settings.createdAt, 100);
  assert.equal(settings.display.showArtworkCount, true);
});

test('save trims teacher fields and reloads the same local settings', () => {
  const memory = new MemoryStorage();
  const store = new ExhibitionSettingsStore(memory, () => 200);
  const settings = createExhibitionSettings({ id: 'show-1', title: ' 航向未來 ', subtitle: ' 學期成果 ', className: ' 三年一班 ', curator: ' 王老師 ' }, 100);
  const saved = store.save(settings);
  assert.equal(saved.title, '航向未來');
  assert.equal(saved.className, '三年一班');
  assert.equal(saved.updatedAt, 200);
  assert.deepEqual(store.load(), saved);
});

test('blank title is rejected without overwriting existing settings', () => {
  const memory = new MemoryStorage();
  const store = new ExhibitionSettingsStore(memory, () => 200);
  const settings = createExhibitionSettings({ id: 'show-2', title: '原標題' }, 100);
  store.save(settings);
  assert.throws(() => store.save({ ...settings, title: '   ' }), /不可空白/);
  assert.equal(store.load().title, '原標題');
});

test('clear removes only the exhibition settings key', () => {
  const memory = new MemoryStorage();
  memory.setItem('unrelated', 'keep');
  const store = new ExhibitionSettingsStore(memory, () => 100);
  store.save(createExhibitionSettings({ id: 'show-3' }, 100));
  store.clear();
  assert.equal(memory.getItem(EXHIBITION_SETTINGS_KEY), null);
  assert.equal(memory.getItem('unrelated'), 'keep');
});

test('legacy v1 settings are migrated with class and display defaults', () => {
  const legacy = createExhibitionSettings({ id: 'legacy', title: '舊展覽' }, 100) as unknown as Record<string, unknown>;
  delete legacy.className;
  delete legacy.display;
  const migrated = parseExhibitionSettings(JSON.stringify(legacy));
  assert.equal(migrated.className, '');
  assert.equal(migrated.display.showSubtitle, true);
});

test('corrupt local settings recover to defaults and remove the bad value', () => {
  const memory = new MemoryStorage();
  memory.setItem(EXHIBITION_SETTINGS_KEY, '{broken');
  const settings = new ExhibitionSettingsStore(memory, () => 300).load();
  assert.equal(settings.title, '我的多媒體展覽');
  assert.equal(memory.getItem(EXHIBITION_SETTINGS_KEY), null);
});
