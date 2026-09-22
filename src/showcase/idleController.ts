import type { AssetRecord } from '../assets/types.ts';
import type { AutoShowcaseSettings } from '../exhibition/types.ts';
import { showcaseAssetDuration, type ShowcasePhase } from './transitions.ts';

export interface ShowcaseSnapshot {
  active: boolean;
  phase: ShowcasePhase;
  assetIndex: number;
  cycle: number;
  durationMs: number;
  manual: boolean;
  mode: 'single' | 'multiple';
  reason: 'idle' | 'manual' | 'activity' | 'disabled' | 'suspended' | 'timer';
}

export interface ShowcaseScheduler {
  setTimeout(callback: () => void, delayMs: number): unknown;
  clearTimeout(handle: unknown): void;
}

const browserScheduler: ShowcaseScheduler = {
  setTimeout: (callback, delayMs) => globalThis.setTimeout(callback, delayMs),
  clearTimeout: (handle) => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>)
};

const activityEvents = ['pointerdown', 'keydown', 'wheel', 'touchstart', 'input'] as const;

export class IdleShowcaseController {
  private settings: AutoShowcaseSettings;
  private assets: AssetRecord[] = [];
  private readonly scheduler: ShowcaseScheduler;
  private timer: unknown | null = null;
  private snapshot: ShowcaseSnapshot = { active: false, phase: 'inactive', assetIndex: 0, cycle: 0, durationMs: 0, manual: false, mode: 'single', reason: 'disabled' };
  private listeners = new Set<(snapshot: Readonly<ShowcaseSnapshot>) => void>();
  private carouselElapsedMs = 0;
  private suspended = false;
  private activityTarget: EventTarget | null = null;
  private readonly onActivity = () => this.recordActivity();

  constructor(settings: AutoShowcaseSettings, scheduler: ShowcaseScheduler = browserScheduler) {
    this.settings = { ...settings };
    this.scheduler = scheduler;
  }

  getState() { return { ...this.snapshot }; }

  subscribe(listener: (snapshot: Readonly<ShowcaseSnapshot>) => void) {
    this.listeners.add(listener);
    listener(this.getState());
    return () => this.listeners.delete(listener);
  }

  private emit() {
    const snapshot = this.getState();
    this.listeners.forEach((listener) => listener(snapshot));
  }

  private clearTimer() {
    if (this.timer !== null) this.scheduler.clearTimeout(this.timer);
    this.timer = null;
  }

  private schedule(callback: () => void, delayMs: number) {
    this.clearTimer();
    this.timer = this.scheduler.setTimeout(() => {
      this.timer = null;
      callback();
    }, Math.max(1, delayMs));
  }

  private canRun() {
    return this.settings.enabled && !this.suspended && this.assets.length > 0;
  }

  private armIdle() {
    this.clearTimer();
    if (!this.canRun() || this.snapshot.active) return;
    this.schedule(() => this.begin(), this.settings.idleDelayMs);
  }

  private setPhase(phase: Exclude<ShowcasePhase, 'inactive'>, durationMs: number, reason: ShowcaseSnapshot['reason']) {
    this.snapshot = { ...this.snapshot, active: true, phase, durationMs, reason };
    this.emit();
    this.schedule(() => this.advance(), durationMs);
  }

  private begin() {
    if (!this.canRun()) return;
    this.carouselElapsedMs = 0;
    this.snapshot = { ...this.snapshot, assetIndex: 0, manual: false, mode: 'single' };
    this.setPhase('title', this.settings.titleDurationMs, 'idle');
  }

  private advance() {
    if (!this.snapshot.active || this.snapshot.manual || !this.canRun()) return;
    if (this.snapshot.phase === 'title') {
      this.carouselElapsedMs = 0;
      const duration = Math.min(showcaseAssetDuration(this.assets[0], this.settings), this.settings.carouselDurationMs);
      this.setPhase('carousel', duration, 'timer');
      return;
    }
    if (this.snapshot.phase === 'carousel') {
      this.carouselElapsedMs += this.snapshot.durationMs;
      if (this.carouselElapsedMs >= this.settings.carouselDurationMs) {
        this.setPhase('overview', this.settings.overviewDurationMs, 'timer');
        return;
      }
      const assetIndex = (this.snapshot.assetIndex + 1) % this.assets.length;
      const remaining = this.settings.carouselDurationMs - this.carouselElapsedMs;
      const duration = Math.min(showcaseAssetDuration(this.assets[assetIndex], this.settings), remaining);
      this.snapshot = { ...this.snapshot, assetIndex };
      this.setPhase('carousel', duration, 'timer');
      return;
    }
    if (this.snapshot.phase === 'overview') {
      this.setPhase('popular', this.settings.popularDurationMs, 'timer');
      return;
    }
    this.snapshot = { ...this.snapshot, cycle: this.snapshot.cycle + 1, assetIndex: 0 };
    this.setPhase('title', this.settings.titleDurationMs, 'timer');
  }

  setAssets(assets: AssetRecord[]) {
    this.assets = [...assets];
    if (this.assets.length === 0 && this.snapshot.active) {
      this.deactivate('disabled', false);
      return;
    }
    if (this.snapshot.assetIndex >= this.assets.length) this.snapshot = { ...this.snapshot, assetIndex: 0 };
    if (this.snapshot.active) this.emit();
    else this.armIdle();
  }

  configure(settings: AutoShowcaseSettings) {
    this.settings = { ...settings };
    if (!settings.enabled && !this.snapshot.manual) this.deactivate('disabled', false);
    else if (!this.snapshot.active) this.armIdle();
  }

  startAutomaticNow() {
    this.begin();
  }

  startExhibition(mode: ShowcaseSnapshot['mode'] = 'single') {
    if (this.suspended || this.assets.length === 0) return;
    this.clearTimer();
    const assetIndex = mode === 'multiple' ? Math.floor(this.snapshot.assetIndex / 12) * 12 : this.snapshot.assetIndex;
    this.snapshot = {
      ...this.snapshot,
      active: true,
      phase: mode === 'single' ? 'carousel' : 'overview',
      assetIndex,
      durationMs: 0,
      manual: true,
      mode,
      reason: 'manual'
    };
    this.emit();
  }

  setExhibitionMode(mode: ShowcaseSnapshot['mode']) {
    if (!this.snapshot.active || !this.snapshot.manual || this.snapshot.mode === mode) return;
    this.startExhibition(mode);
  }

  showNext() {
    if (!this.snapshot.active || !this.snapshot.manual || this.assets.length === 0) return;
    const assetIndex = this.snapshot.mode === 'multiple'
      ? ((Math.floor(this.snapshot.assetIndex / 12) + 1) % Math.ceil(this.assets.length / 12)) * 12
      : (this.snapshot.assetIndex + 1) % this.assets.length;
    this.snapshot = { ...this.snapshot, assetIndex };
    this.emit();
  }

  showPrevious() {
    if (!this.snapshot.active || !this.snapshot.manual || this.assets.length === 0) return;
    const pageCount = Math.ceil(this.assets.length / 12);
    const assetIndex = this.snapshot.mode === 'multiple'
      ? ((Math.floor(this.snapshot.assetIndex / 12) - 1 + pageCount) % pageCount) * 12
      : (this.snapshot.assetIndex - 1 + this.assets.length) % this.assets.length;
    this.snapshot = { ...this.snapshot, assetIndex };
    this.emit();
  }

  showAsset(assetIndex: number) {
    if (!this.snapshot.active || !this.snapshot.manual || this.assets.length === 0) return;
    const normalized = Math.max(0, Math.min(this.assets.length - 1, Math.trunc(assetIndex)));
    this.snapshot = { ...this.snapshot, phase: 'carousel', assetIndex: normalized, mode: 'single' };
    this.emit();
  }

  stopExhibition() {
    if (this.snapshot.manual) this.deactivate('manual', true);
  }

  private deactivate(reason: ShowcaseSnapshot['reason'], rearm: boolean) {
    this.clearTimer();
    const wasActive = this.snapshot.active;
    this.snapshot = { ...this.snapshot, active: false, phase: 'inactive', durationMs: 0, manual: false, reason };
    if (wasActive) this.emit();
    if (rearm) this.armIdle();
  }

  recordActivity() {
    if (this.suspended || this.snapshot.manual) return;
    this.deactivate('activity', true);
  }

  suspend() {
    this.suspended = true;
    this.deactivate('suspended', false);
  }

  resume() {
    if (!this.suspended) return;
    this.suspended = false;
    this.armIdle();
  }

  attachActivity(target: EventTarget) {
    if (this.activityTarget === target) return;
    this.detachActivity();
    this.activityTarget = target;
    activityEvents.forEach((eventName) => target.addEventListener(eventName, this.onActivity, { capture: true, passive: true }));
  }

  detachActivity() {
    if (!this.activityTarget) return;
    activityEvents.forEach((eventName) => this.activityTarget?.removeEventListener(eventName, this.onActivity, { capture: true }));
    this.activityTarget = null;
  }

  destroy() {
    this.clearTimer();
    this.detachActivity();
    this.listeners.clear();
  }
}
