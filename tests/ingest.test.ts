import assert from 'node:assert/strict';
import test from 'node:test';
import { collectDroppedFiles, collectInputFiles, normalizeRelativePath } from '../src/assets/ingest.ts';
import { ImportQueue } from '../src/assets/importQueue.ts';

function makeFile(name: string, lastModified = 1) {
  return new File([name], name, { type: 'application/octet-stream', lastModified });
}

function candidate(name: string, lastModified = 1) {
  const file = makeFile(name, lastModified);
  return { file, relativePath: name };
}

test('collects and processes more than thirty mixed files in their original order', async () => {
  const extensions = ['jpg', 'mp4', 'mp3', 'pdf', 'glb'];
  const files = Array.from({ length: 35 }, (_, index) => {
    const extension = extensions[index % extensions.length];
    return makeFile(`${String(index + 1).padStart(2, '0')}.${extension}`, index);
  });
  const collected = collectInputFiles(files);
  assert.equal(collected.length, 35);
  assert.equal(collected[0].relativePath, '01.jpg');
  assert.equal(collected[34].relativePath, '35.glb');
  const queue = new ImportQueue(async (item) => item.relativePath);
  const summary = await queue.run(collected, { concurrency: 4 });
  assert.equal(summary.succeeded, 35);
  assert.equal(summary.failed, 0);
});

test('normalizes safe folder paths and rejects traversal', () => {
  assert.equal(normalizeRelativePath('/class-a\\models/./work.glb'), 'class-a/models/work.glb');
  assert.throws(() => normalizeRelativePath('../private.txt'), /Unsafe relative path/);
});

test('queue respects its concurrency limit and preserves result order', async () => {
  let active = 0;
  let maximumActive = 0;
  const queue = new ImportQueue<string>(async (item) => {
    active += 1;
    maximumActive = Math.max(maximumActive, active);
    await new Promise((resolve) => setTimeout(resolve, 5));
    active -= 1;
    return item.file.name;
  });
  const summary = await queue.run(Array.from({ length: 12 }, (_, index) => candidate(`${index}.jpg`)), { concurrency: 3 });
  assert.equal(maximumActive, 3);
  assert.equal(summary.succeeded, 12);
  assert.deepEqual(summary.items.map((item) => item.result), Array.from({ length: 12 }, (_, index) => `${index}.jpg`));
});

test('one rejected file does not stop the rest of the batch', async () => {
  const queue = new ImportQueue<string>(async (item) => {
    if (item.file.name === 'broken.mov') throw new Error('Unsupported codec');
    return item.file.name;
  });
  const summary = await queue.run([
    candidate('one.jpg'),
    candidate('broken.mov'),
    candidate('two.glb')
  ]);
  assert.equal(summary.succeeded, 2);
  assert.equal(summary.failed, 1);
  assert.equal(summary.items[1].error, 'Unsupported codec');
});

test('progress snapshots are monotonic and finish at the batch total', async () => {
  const completed: number[] = [];
  const queue = new ImportQueue(async (item) => item.file.name);
  const summary = await queue.run([candidate('a.jpg'), candidate('b.mp4'), candidate('c.pdf')], {
    concurrency: 2,
    onProgress: (progress) => completed.push(progress.completed)
  });
  assert.deepEqual([...completed].sort((a, b) => a - b), completed);
  assert.equal(completed.at(-1), 3);
  assert.equal(summary.completed, 3);
});

test('aborting a queue marks files that have not started as cancelled', async () => {
  const controller = new AbortController();
  const queue = new ImportQueue(async (item) => {
    if (item.file.name === 'first.jpg') controller.abort();
    return item.file.name;
  });
  const summary = await queue.run([
    candidate('first.jpg'),
    candidate('second.jpg'),
    candidate('third.jpg')
  ], { concurrency: 1, signal: controller.signal });
  assert.equal(summary.succeeded, 1);
  assert.equal(summary.cancelled, 2);
});

test('directory traversal reads every browser batch and deduplicates fallback files', async () => {
  const first = makeFile('first.jpg');
  const second = makeFile('second.glb');
  let readCount = 0;
  const directoryEntry = {
    isFile: false,
    isDirectory: true,
    name: 'works',
    fullPath: '/works',
    createReader: () => ({
      readEntries: (success: (entries: unknown[]) => void) => {
        const batches = [
          [{ isFile: true, isDirectory: false, name: first.name, fullPath: `/works/${first.name}`, file: (done: (file: File) => void) => done(first) }],
          [{ isFile: true, isDirectory: false, name: second.name, fullPath: `/works/${second.name}`, file: (done: (file: File) => void) => done(second) }],
          []
        ];
        success(batches[readCount++] ?? []);
      }
    })
  };
  const transfer = {
    items: [{ kind: 'file', webkitGetAsEntry: () => directoryEntry, getAsFile: () => null }],
    files: [first, second]
  } as unknown as DataTransfer;
  const collected = await collectDroppedFiles(transfer);
  assert.deepEqual(collected.map((item) => item.relativePath), ['works/first.jpg', 'works/second.glb']);
});

test('queue refuses a second run while processing is active', async () => {
  let release!: () => void;
  const waiting = new Promise<void>((resolve) => { release = resolve; });
  const queue = new ImportQueue(async (item) => {
    await waiting;
    return item.file.name;
  });
  const firstRun = queue.run([candidate('one.jpg')]);
  await assert.rejects(() => queue.run([candidate('two.jpg')]), /already running/);
  release();
  await firstRun;
});
