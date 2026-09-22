import assert from 'node:assert/strict';
import test from 'node:test';
import { ObjectUrlPool } from '../src/renderers/objectUrls.ts';
import { SUPPORTED_RENDERER_KINDS } from '../src/renderers/registry.ts';
import { RendererSession } from '../src/renderers/session.ts';
import type { MountedRenderer } from '../src/renderers/types.ts';

function trackedRenderer(events: string[], name: string): MountedRenderer {
  return {
    pause: () => events.push(`${name}:pause`),
    resume: () => events.push(`${name}:resume`),
    destroy: () => events.push(`${name}:destroy`)
  };
}

test('registry covers every supported multimedia category', () => {
  assert.deepEqual(SUPPORTED_RENDERER_KINDS, ['image', 'video', 'audio', 'pdf', 'model3d']);
});

test('object URL pool revokes every generated browser URL once', () => {
  const revoked: string[] = [];
  let sequence = 0;
  const pool = new ObjectUrlPool({
    createObjectURL: () => `blob:test-${++sequence}`,
    revokeObjectURL: (url) => revoked.push(url)
  });
  assert.equal(pool.create(new Blob(['one'])), 'blob:test-1');
  assert.equal(pool.create(new Blob(['two'])), 'blob:test-2');
  assert.equal(pool.size, 2);
  pool.revokeAll();
  pool.revokeAll();
  assert.deepEqual(revoked, ['blob:test-1', 'blob:test-2']);
  assert.equal(pool.size, 0);
});

test('switching artwork destroys the previous renderer and clearing destroys the current one', async () => {
  const events: string[] = [];
  const session = new RendererSession();
  await session.show(() => trackedRenderer(events, 'image'));
  await session.show(() => trackedRenderer(events, 'video'));
  session.clear();
  assert.deepEqual(events, ['image:destroy', 'video:destroy']);
});

test('hidden and visible states pause and resume the active renderer', async () => {
  const events: string[] = [];
  const session = new RendererSession();
  await session.show(() => trackedRenderer(events, 'audio'));
  session.setFocused(false);
  session.setFocused(true);
  assert.deepEqual(events, ['audio:pause', 'audio:resume']);
});

test('a renderer finishing after a newer request is immediately released', async () => {
  const events: string[] = [];
  const session = new RendererSession();
  let finishSlow: ((renderer: MountedRenderer) => void) | undefined;
  const slow = session.show(() => new Promise<MountedRenderer>((resolve) => { finishSlow = resolve; }));
  const fast = session.show(() => trackedRenderer(events, 'fast'));
  finishSlow?.(trackedRenderer(events, 'slow'));
  await Promise.all([slow, fast]);
  session.clear();
  assert.deepEqual(events, ['slow:destroy', 'fast:destroy']);
});
