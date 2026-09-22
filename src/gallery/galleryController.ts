import type { AssetRecord, AssetSort } from '../assets/types.ts';
import { createDefaultGalleryState, type ExhibitionMode, type GalleryState } from '../exhibition/types.ts';
import { sortAssets } from './sort.ts';

export type GalleryListener = (state: Readonly<GalleryState>, visibleAssets: readonly AssetRecord[]) => void;

export class GalleryController {
  private assets: AssetRecord[];
  private state: GalleryState;
  private readonly listeners = new Set<GalleryListener>();

  constructor(assets: AssetRecord[] = [], state: GalleryState = createDefaultGalleryState()) {
    this.assets = [...assets];
    this.state = { ...state, sort: { ...state.sort }, selectedAssetIds: [...state.selectedAssetIds] };
    this.normalizeState();
  }

  private normalizeState() {
    const ids = new Set(this.assets.map((asset) => asset.id));
    this.state.selectedAssetIds = this.state.selectedAssetIds.filter((id) => ids.has(id));
    if (this.state.focusedAssetId && !ids.has(this.state.focusedAssetId)) this.state.focusedAssetId = undefined;
    const categories = this.getCategories();
    if (this.state.category && !categories.includes(this.state.category)) this.state.category = undefined;
  }

  private emit() {
    const state = this.getState();
    const assets = this.getVisibleAssets();
    this.listeners.forEach((listener) => listener(state, assets));
  }

  getState(): GalleryState {
    return { ...this.state, sort: { ...this.state.sort }, selectedAssetIds: [...this.state.selectedAssetIds] };
  }

  getAssets() { return [...this.assets]; }

  getCategories() {
    return [...new Set(this.assets.map((asset) => asset.category).filter(Boolean))].sort(textCompare);
  }

  getVisibleAssets() {
    let visible = this.assets;
    if (this.state.mode === 'category') visible = this.state.category ? visible.filter((asset) => asset.category === this.state.category) : [];
    if (this.state.mode === 'selection') {
      const selected = new Set(this.state.selectedAssetIds);
      visible = visible.filter((asset) => selected.has(asset.id));
    }
    if (this.state.mode === 'solo') visible = this.state.focusedAssetId ? visible.filter((asset) => asset.id === this.state.focusedAssetId) : [];
    return sortAssets(visible, this.state.sort);
  }

  setAssets(assets: AssetRecord[]) {
    this.assets = [...assets];
    this.normalizeState();
    this.emit();
  }

  setMode(mode: ExhibitionMode) {
    this.state.mode = mode;
    if (mode === 'category' && !this.state.category) this.state.category = this.getCategories()[0];
    if (mode === 'solo' && !this.state.focusedAssetId) this.state.focusedAssetId = this.getVisibleAssets()[0]?.id ?? this.assets[0]?.id;
    this.emit();
  }

  setCategory(category: string) {
    if (!this.getCategories().includes(category)) throw new Error(`找不到分類：${category}`);
    this.state.category = category;
    if (this.state.mode !== 'category') this.state.mode = 'category';
    this.emit();
  }

  setSelection(assetIds: string[]) {
    const existing = new Set(this.assets.map((asset) => asset.id));
    this.state.selectedAssetIds = [...new Set(assetIds.filter((id) => existing.has(id)))];
    this.emit();
  }

  toggleSelection(assetId: string) {
    if (!this.assets.some((asset) => asset.id === assetId)) throw new Error(`找不到作品：${assetId}`);
    const selected = new Set(this.state.selectedAssetIds);
    if (selected.has(assetId)) selected.delete(assetId);
    else selected.add(assetId);
    this.state.selectedAssetIds = [...selected];
    this.emit();
  }

  focusAsset(assetId: string) {
    if (!this.assets.some((asset) => asset.id === assetId)) throw new Error(`找不到作品：${assetId}`);
    this.state.focusedAssetId = assetId;
    this.state.mode = 'solo';
    this.emit();
  }

  setSort(sort: AssetSort) {
    this.state.sort = { ...sort };
    this.emit();
  }

  subscribe(listener: GalleryListener) {
    this.listeners.add(listener);
    listener(this.getState(), this.getVisibleAssets());
    return () => this.listeners.delete(listener);
  }
}

function textCompare(left: string, right: string) {
  return left.localeCompare(right, 'zh-Hant', { numeric: true, sensitivity: 'base' });
}
