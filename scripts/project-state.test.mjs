import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  atomicWriteJson,
  calculateProgress,
  createLease,
  leaseIsStale,
  loadProjectState,
  parseArguments,
  PROJECT_PATHS,
  renderHandoff,
  updateCheckpoint,
  validateCheckpoint,
  validateManifest
} from './lib/project-state.mjs';

const BASELINE = 'a'.repeat(40);

function fixtureManifest() {
  return {
    schema: 'class3d-task-manifest-v1',
    project: 'class3d-gallery-v2',
    baseline_commit: BASELINE,
    branch: 'feature/multimedia-gallery-v2',
    tasks: [{
      id: 'P00-T01',
      phase: 'P00',
      title: 'Fixture task',
      weight: 100,
      depends_on: [],
      task_doc: 'project/tasks/P00-T01.md',
      outputs: ['one.txt'],
      acceptance: ['state survives restart']
    }]
  };
}

function fixtureCheckpoint() {
  return {
    schema: 'class3d-checkpoint-v1',
    project: 'class3d-gallery-v2',
    revision: 0,
    baseline_commit: BASELINE,
    branch: 'feature/multimedia-gallery-v2',
    current_phase: 'P00',
    current_task: 'P00-T01',
    status: 'PENDING',
    progress_percent: 0,
    owner: null,
    started_at: null,
    updated_at: '2026-09-22T00:00:00.000Z',
    base_commit: BASELINE,
    delivery_commit: null,
    lease: null,
    expected_files: [],
    last_verified: { commit: BASELINE, commands: [], result: 'NOT_RUN', evidence: [] },
    next_step: 'Start fixture task',
    blockers: [],
    task_states: { 'P00-T01': 'PENDING' }
  };
}

async function fixtureRoot() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'class3d-state-'));
  await atomicWriteJson(PROJECT_PATHS.manifest, fixtureManifest(), root);
  await atomicWriteJson(PROJECT_PATHS.checkpoint, fixtureCheckpoint(), root);
  return root;
}

test('validates a complete manifest and checkpoint', () => {
  const manifest = validateManifest(fixtureManifest());
  const checkpoint = validateCheckpoint(fixtureCheckpoint(), manifest);
  assert.equal(checkpoint.current_task, 'P00-T01');
});

test('rejects a manifest whose weights do not total 100', () => {
  const manifest = fixtureManifest();
  manifest.tasks[0].weight = 99;
  assert.throws(() => validateManifest(manifest), /weights total/);
});

test('calculates progress only from accepted tasks', () => {
  const manifest = fixtureManifest();
  assert.equal(calculateProgress(manifest, { 'P00-T01': 'PENDING' }), 0);
  assert.equal(calculateProgress(manifest, { 'P00-T01': 'ACCEPTED' }), 100);
});

test('detects active and expired task leases', () => {
  const checkpoint = fixtureCheckpoint();
  checkpoint.lease = createLease('agent', new Date('2026-09-22T00:00:00.000Z'));
  assert.equal(leaseIsStale(checkpoint, Date.parse('2026-09-22T00:10:00.000Z')), false);
  assert.equal(leaseIsStale(checkpoint, Date.parse('2026-09-22T00:31:00.000Z')), true);
});

test('parses repeatable CLI options without losing values', () => {
  const parsed = parseArguments(['P00-T01', '--evidence', 'one.json', '--evidence', 'two.json', '--status', 'VERIFYING']);
  assert.deepEqual(parsed.positionals, ['P00-T01']);
  assert.deepEqual(parsed.options.get('evidence'), ['one.json', 'two.json']);
  assert.equal(parsed.options.get('status'), 'VERIFYING');
});

test('atomic checkpoint survives an abandoned temporary file', async () => {
  const root = await fixtureRoot();
  try {
    await writeFile(path.join(root, `${PROJECT_PATHS.checkpoint}.tmp-abandoned`), '{broken', 'utf8');
    const { checkpoint } = await loadProjectState(root);
    assert.equal(checkpoint.revision, 0);
    assert.equal(checkpoint.next_step, 'Start fixture task');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('interrupted task state and next step are recoverable from disk', async () => {
  const root = await fixtureRoot();
  try {
    await updateCheckpoint((checkpoint) => {
      checkpoint.status = 'IN_PROGRESS';
      checkpoint.task_states['P00-T01'] = 'IN_PROGRESS';
      checkpoint.owner = 'agent-before-disconnect';
      checkpoint.started_at = '2026-09-22T00:00:00.000Z';
      checkpoint.lease = createLease('agent-before-disconnect', new Date('2026-09-22T00:00:00.000Z'));
      checkpoint.expected_files = ['one.txt'];
      checkpoint.next_step = 'Continue from the saved parser test';
    }, 'TASK_CHECKPOINTED', 'Simulated disconnect checkpoint', root);

    const { manifest, checkpoint } = await loadProjectState(root);
    assert.equal(checkpoint.revision, 1);
    assert.equal(checkpoint.status, 'IN_PROGRESS');
    assert.equal(checkpoint.next_step, 'Continue from the saved parser test');
    assert.match(renderHandoff(checkpoint, manifest), /Continue from the saved parser test/);

    const journal = await readFile(path.join(root, PROJECT_PATHS.journal), 'utf8');
    assert.match(journal, /TASK_CHECKPOINTED/);
    const handoff = await readFile(path.join(root, PROJECT_PATHS.handoff), 'utf8');
    assert.match(handoff, /agent-before-disconnect/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('concurrent checkpoint writers serialize without losing a revision', async () => {
  const root = await fixtureRoot();
  try {
    await Promise.all([
      updateCheckpoint((checkpoint) => {
        checkpoint.next_step = 'Writer one completed';
      }, 'TASK_CHECKPOINTED', 'writer one', root),
      updateCheckpoint((checkpoint) => {
        checkpoint.next_step = 'Writer two completed';
      }, 'TASK_CHECKPOINTED', 'writer two', root)
    ]);
    const { checkpoint } = await loadProjectState(root);
    assert.equal(checkpoint.revision, 2);
    const journal = await readFile(path.join(root, PROJECT_PATHS.journal), 'utf8');
    assert.equal(journal.trim().split(/\r?\n/).length, 2);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('status mismatch is rejected instead of silently repaired', () => {
  const checkpoint = fixtureCheckpoint();
  checkpoint.status = 'IN_PROGRESS';
  assert.throws(() => validateCheckpoint(checkpoint, fixtureManifest()), /Current task status mismatch/);
});
