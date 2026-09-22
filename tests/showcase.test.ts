import assert from 'node:assert/strict';
import test from 'node:test';
import { createAssetRecord, type AssetRecord } from '../src/assets/types.ts';
import { DEFAULT_AUTO_SHOWCASE } from '../src/exhibition/types.ts';
import { IdleShowcaseController, type ShowcaseScheduler } from '../src/showcase/idleController.ts';
import { phaseDuration, showcaseAssetDuration, showcaseTransition } from '../src/showcase/transitions.ts';

class FakeScheduler implements ShowcaseScheduler {
  now = 0;
  id = 0;
  timers = new Map<number, { at: number; callback: () => void }>();
  setTimeout(callback: () => void, delayMs: number) {
    const id = ++this.id;
    this.timers.set(id, { at: this.now + delayMs, callback });
    return id;
  }
  clearTimeout(handle: unknown) { this.timers.delete(Number(handle)); }
  advance(durationMs: number) {
    const end = this.now + durationMs;
    while (true) {
      const next = [...this.timers.entries()].sort((left, right) => left[1].at - right[1].at)[0];
      if (!next || next[1].at > end) break;
      this.now = next[1].at;
      this.timers.delete(next[0]);
      next[1].callback();
    }
    this.now = end;
  }
}

function asset(id: string, kind: AssetRecord['kind'] = 'image') {
  return { ...createAssetRecord({ id, originalFileName: `${id}.jpg`, kind, importOrder: 0 }), status: 'ready' as const };
}

function fixture() {
  const scheduler = new FakeScheduler();
  const controller = new IdleShowcaseController({ ...DEFAULT_AUTO_SHOWCASE }, scheduler);
  controller.setAssets([asset('image'), asset('model', 'model3d'), asset('video', 'video')]);
  return { scheduler, controller };
}

test('enters the title showcase after the configured 30 second idle delay', () => {
  const { scheduler, controller } = fixture();
  scheduler.advance(29_999);
  assert.equal(controller.getState().active, false);
  scheduler.advance(1);
  assert.deepEqual({ phase: controller.getState().phase, reason: controller.getState().reason }, { phase: 'title', reason: 'idle' });
});

test('activity resets the idle timer before entry and immediately exits an active showcase', () => {
  const { scheduler, controller } = fixture();
  scheduler.advance(20_000);
  controller.recordActivity();
  scheduler.advance(20_000);
  assert.equal(controller.getState().active, false);
  scheduler.advance(10_000);
  assert.equal(controller.getState().phase, 'title');
  controller.recordActivity();
  assert.deepEqual({ active: controller.getState().active, reason: controller.getState().reason }, { active: false, reason: 'activity' });
});

test('cycles through title, timed artwork carousel, overview and popular phases', () => {
  const settings = { ...DEFAULT_AUTO_SHOWCASE, carouselDurationMs: 28_000 };
  const scheduler = new FakeScheduler();
  const controller = new IdleShowcaseController(settings, scheduler);
  controller.setAssets([asset('image'), asset('model', 'model3d'), asset('video', 'video')]);
  controller.startAutomaticNow();
  assert.equal(controller.getState().phase, 'title');
  scheduler.advance(settings.titleDurationMs);
  assert.deepEqual({ phase: controller.getState().phase, index: controller.getState().assetIndex }, { phase: 'carousel', index: 0 });
  scheduler.advance(settings.imageDurationMs);
  assert.equal(controller.getState().assetIndex, 1);
  scheduler.advance(settings.modelDurationMs);
  assert.equal(controller.getState().assetIndex, 2);
  scheduler.advance(8_000);
  assert.equal(controller.getState().phase, 'overview');
  scheduler.advance(settings.overviewDurationMs);
  assert.equal(controller.getState().phase, 'popular');
  scheduler.advance(settings.popularDurationMs);
  assert.deepEqual({ phase: controller.getState().phase, cycle: controller.getState().cycle }, { phase: 'title', cycle: 1 });
});

test('disabled or suspended showcase never starts until re-enabled and resumed', () => {
  const { scheduler, controller } = fixture();
  controller.configure({ ...DEFAULT_AUTO_SHOWCASE, enabled: false });
  scheduler.advance(60_000);
  assert.equal(controller.getState().active, false);
  controller.configure({ ...DEFAULT_AUTO_SHOWCASE, enabled: true });
  controller.suspend();
  scheduler.advance(60_000);
  assert.equal(controller.getState().active, false);
  controller.resume();
  scheduler.advance(DEFAULT_AUTO_SHOWCASE.idleDelayMs);
  assert.equal(controller.getState().active, true);
});

test('manual exhibition switches between single work, multiple works and direct selection', () => {
  const { controller } = fixture();
  controller.startExhibition('single');
  assert.deepEqual(
    { active: controller.getState().active, phase: controller.getState().phase, manual: controller.getState().manual, mode: controller.getState().mode },
    { active: true, phase: 'carousel', manual: true, mode: 'single' }
  );
  controller.showNext();
  assert.equal(controller.getState().assetIndex, 1);
  controller.showPrevious();
  assert.equal(controller.getState().assetIndex, 0);
  controller.setExhibitionMode('multiple');
  assert.deepEqual({ phase: controller.getState().phase, mode: controller.getState().mode }, { phase: 'overview', mode: 'multiple' });
  controller.showAsset(2);
  assert.deepEqual({ phase: controller.getState().phase, mode: controller.getState().mode, index: controller.getState().assetIndex }, { phase: 'carousel', mode: 'single', index: 2 });
});

test('manual exhibition stays open during interaction and closes explicitly', () => {
  const { controller } = fixture();
  controller.configure({ ...DEFAULT_AUTO_SHOWCASE, enabled: false });
  controller.startExhibition('multiple');
  controller.recordActivity();
  assert.equal(controller.getState().active, true);
  controller.stopExhibition();
  assert.deepEqual({ active: controller.getState().active, manual: controller.getState().manual }, { active: false, manual: false });
});

test('multiple-work exhibition pages through more than twelve works', () => {
  const controller = new IdleShowcaseController({ ...DEFAULT_AUTO_SHOWCASE }, new FakeScheduler());
  controller.setAssets(Array.from({ length: 25 }, (_, index) => asset(`work-${index + 1}`)));
  controller.startExhibition('multiple');
  controller.showNext();
  assert.equal(controller.getState().assetIndex, 12);
  controller.showNext();
  assert.equal(controller.getState().assetIndex, 24);
  controller.showNext();
  assert.equal(controller.getState().assetIndex, 0);
  controller.showPrevious();
  assert.equal(controller.getState().assetIndex, 24);
});

test('transition and asset timing helpers respect media type and reduced motion', () => {
  assert.equal(showcaseAssetDuration(asset('model', 'model3d'), DEFAULT_AUTO_SHOWCASE), 12_000);
  assert.equal(showcaseAssetDuration(asset('video', 'video'), DEFAULT_AUTO_SHOWCASE), 30_000);
  assert.equal(phaseDuration('overview', DEFAULT_AUTO_SHOWCASE), 20_000);
  assert.equal(showcaseTransition('overview'), 'mosaic');
  assert.equal(showcaseTransition('overview', true), 'none');
});
