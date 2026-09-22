import assert from 'node:assert/strict';
import test from 'node:test';
import { EngagementController } from '../src/engagement/controller.ts';
import { exportCommentsCsv, exportEngagementJson } from '../src/engagement/export.ts';
import { getVisitorSession, startNewVisitorSession } from '../src/engagement/session.ts';
import { EngagementStore, ENGAGEMENT_STORAGE_KEY } from '../src/storage/engagement.ts';
import type { StringStorage } from '../src/exhibition/settings.ts';

class MemoryStorage implements StringStorage {
  values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

function fixture() {
  let now = 100;
  let id = 0;
  const memory = new MemoryStorage();
  const store = new EngagementStore(memory, () => ++now);
  return { memory, store, controller: new EngagementController(store, () => ++now, () => `comment-${++id}`) };
}

test('one visitor can like and cancel a like while interactions remain auditable', () => {
  const { controller } = fixture();
  assert.equal(controller.toggleLike('asset-1', 'visitor-1').likedBy.length, 1);
  assert.equal(controller.toggleLike('asset-1', 'visitor-1').likedBy.length, 0);
  assert.equal(controller.getAsset('asset-1').interactions, 2);
});

test('different local visitor sessions count as separate likes', () => {
  const { controller } = fixture();
  controller.toggleLike('asset-1', 'visitor-1');
  controller.toggleLike('asset-1', 'visitor-2');
  assert.equal(controller.popularity('asset-1').likes, 2);
});

test('moderated comments stay pending until a teacher approves them', () => {
  const { controller } = fixture();
  const comment = controller.addComment({ exhibitionId: 'show', assetId: 'asset-1', body: ' 很棒！ ', displayName: ' 小明 ', moderate: true });
  assert.equal(comment.approved, false);
  assert.equal(controller.popularity('asset-1').approvedComments, 0);
  controller.approveComment('asset-1', comment.id);
  assert.equal(controller.popularity('asset-1').approvedComments, 1);
});

test('comments can bypass moderation and can be deleted', () => {
  const { controller } = fixture();
  const comment = controller.addComment({ exhibitionId: 'show', assetId: 'asset-1', body: 'Nice', moderate: false });
  assert.equal(comment.approved, true);
  controller.deleteComment('asset-1', comment.id);
  assert.equal(controller.getAsset('asset-1').comments.length, 0);
});

test('automatic showcase views and dwell time never change human popularity', () => {
  const { controller } = fixture();
  controller.recordView('asset-1', 'automatic');
  controller.recordDwell('asset-1', 60_000, 'automatic');
  assert.deepEqual(controller.popularity('asset-1'), { humanViews: 0, likes: 0, approvedComments: 0, interactions: 0, dwellTimeMs: 0 });
});

test('human views and bounded dwell time are persisted locally', () => {
  const { controller, store } = fixture();
  controller.recordView('asset-1', 'human');
  controller.recordDwell('asset-1', 99_999_999, 'human');
  const restored = new EngagementController(store, () => 999, () => 'unused').popularity('asset-1');
  assert.equal(restored.humanViews, 1);
  assert.equal(restored.dwellTimeMs, 30 * 60_000);
});

test('visitor sessions persist until explicitly advanced', () => {
  const memory = new MemoryStorage();
  assert.equal(getVisitorSession(memory, () => 'visitor-1'), 'visitor-1');
  assert.equal(getVisitorSession(memory, () => 'unused'), 'visitor-1');
  assert.equal(startNewVisitorSession(memory, () => 'visitor-2'), 'visitor-2');
});

test('JSON and CSV exports preserve data and neutralize spreadsheet formulas', () => {
  const { controller } = fixture();
  controller.addComment({ exhibitionId: 'show', assetId: 'asset-1', body: '=HYPERLINK("bad")', displayName: '+name', moderate: false });
  const database = controller.getAll();
  assert.equal(JSON.parse(exportEngagementJson(database)).schema, 'class3d-engagement-v1');
  const csv = exportCommentsCsv(database);
  assert.match(csv, /"'=HYPERLINK/);
  assert.match(csv, /"'\+name"/);
});

test('corrupt engagement storage is removed without touching unrelated local data', () => {
  const memory = new MemoryStorage();
  memory.setItem(ENGAGEMENT_STORAGE_KEY, '{broken');
  memory.setItem('other', 'keep');
  const database = new EngagementStore(memory, () => 10).load();
  assert.deepEqual(database.assets, {});
  assert.equal(memory.getItem(ENGAGEMENT_STORAGE_KEY), null);
  assert.equal(memory.getItem('other'), 'keep');
});
