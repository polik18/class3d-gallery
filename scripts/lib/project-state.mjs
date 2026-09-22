import { appendFile, mkdir, open, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(scriptDirectory, '../..');

export const PROJECT_PATHS = {
  checkpoint: 'project/checkpoint.json',
  manifest: 'project/task-manifest.json',
  handoff: 'project/handoffs/current.md',
  journal: 'project/journal/events.jsonl',
  lock: 'project/.checkpoint.lock'
};

export const TASK_STATUSES = new Set([
  'PENDING',
  'IN_PROGRESS',
  'VERIFYING',
  'ACCEPTED',
  'NEEDS_FIX',
  'BLOCKED',
  'RECOVERY_REQUIRED'
]);

const SHA40 = /^[a-f0-9]{40}$/;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function isTimestamp(value) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

export async function readJson(relativePath, root = REPO_ROOT) {
  const data = await readFile(path.join(root, relativePath), 'utf8');
  return JSON.parse(data);
}

export function validateManifest(manifest) {
  assert(manifest?.schema === 'class3d-task-manifest-v1', 'Invalid manifest schema');
  assert(manifest.project === 'class3d-gallery-v2', 'Invalid manifest project');
  assert(SHA40.test(manifest.baseline_commit), 'Invalid manifest baseline commit');
  assert(typeof manifest.branch === 'string' && manifest.branch.length > 0, 'Invalid manifest branch');
  assert(Array.isArray(manifest.tasks) && manifest.tasks.length > 0, 'Manifest has no tasks');

  const ids = new Set();
  let totalWeight = 0;
  for (const task of manifest.tasks) {
    assert(/^P\d{2}-T\d{2}$/.test(task.id), `Invalid task id: ${task.id}`);
    assert(!ids.has(task.id), `Duplicate task id: ${task.id}`);
    ids.add(task.id);
    assert(/^P\d{2}$/.test(task.phase), `Invalid phase for ${task.id}`);
    assert(task.id.startsWith(`${task.phase}-`), `Task phase mismatch: ${task.id}`);
    assert(typeof task.title === 'string' && task.title.length > 0, `Missing task title: ${task.id}`);
    assert(Number.isInteger(task.weight) && task.weight > 0, `Invalid task weight: ${task.id}`);
    assert(Array.isArray(task.depends_on), `Invalid task dependencies: ${task.id}`);
    assert(Array.isArray(task.outputs), `Invalid task outputs: ${task.id}`);
    assert(Array.isArray(task.acceptance) && task.acceptance.length > 0, `Missing acceptance: ${task.id}`);
    assert(typeof task.task_doc === 'string' && task.task_doc.startsWith('project/tasks/'), `Invalid task doc: ${task.id}`);
    totalWeight += task.weight;
  }

  for (const task of manifest.tasks) {
    for (const dependency of task.depends_on) {
      assert(ids.has(dependency), `Unknown dependency ${dependency} for ${task.id}`);
      assert(manifest.tasks.findIndex((item) => item.id === dependency) < manifest.tasks.findIndex((item) => item.id === task.id), `Dependency order error for ${task.id}`);
    }
  }
  assert(totalWeight === 100, `Task weights total ${totalWeight}, expected 100`);
  return manifest;
}

export function calculateProgress(manifest, taskStates) {
  return manifest.tasks
    .filter((task) => taskStates[task.id] === 'ACCEPTED')
    .reduce((total, task) => total + task.weight, 0);
}

export function validateCheckpoint(checkpoint, manifest) {
  assert(checkpoint?.schema === 'class3d-checkpoint-v1', 'Invalid checkpoint schema');
  assert(checkpoint.project === manifest.project, 'Checkpoint project mismatch');
  assert(checkpoint.baseline_commit === manifest.baseline_commit, 'Checkpoint baseline mismatch');
  assert(checkpoint.branch === manifest.branch, 'Checkpoint branch mismatch');
  assert(Number.isInteger(checkpoint.revision) && checkpoint.revision >= 0, 'Invalid checkpoint revision');
  assert(isTimestamp(checkpoint.updated_at), 'Invalid checkpoint updated_at');
  assert(manifest.tasks.some((task) => task.id === checkpoint.current_task), 'Unknown current task');
  const currentTask = manifest.tasks.find((task) => task.id === checkpoint.current_task);
  assert(checkpoint.current_phase === currentTask.phase, 'Current phase does not match task');
  assert(TASK_STATUSES.has(checkpoint.status), 'Invalid checkpoint status');
  assert(checkpoint.task_states && typeof checkpoint.task_states === 'object', 'Missing task states');

  const taskIds = manifest.tasks.map((task) => task.id);
  assert(Object.keys(checkpoint.task_states).length === taskIds.length, 'Task state count mismatch');
  for (const taskId of taskIds) {
    assert(TASK_STATUSES.has(checkpoint.task_states[taskId]), `Invalid state for ${taskId}`);
  }
  assert(checkpoint.status === checkpoint.task_states[checkpoint.current_task], 'Current task status mismatch');

  const expectedProgress = calculateProgress(manifest, checkpoint.task_states);
  assert(checkpoint.progress_percent === expectedProgress, `Progress mismatch: ${checkpoint.progress_percent} != ${expectedProgress}`);
  assert(Array.isArray(checkpoint.expected_files), 'Invalid expected files');
  assert(Array.isArray(checkpoint.blockers), 'Invalid blockers');
  assert(typeof checkpoint.next_step === 'string' && checkpoint.next_step.length > 0, 'Missing next step');
  assert(checkpoint.last_verified && Array.isArray(checkpoint.last_verified.commands), 'Invalid verification state');
  assert(Array.isArray(checkpoint.last_verified.evidence), 'Invalid evidence list');
  if (checkpoint.base_commit !== null) assert(SHA40.test(checkpoint.base_commit), 'Invalid base commit');
  if (checkpoint.delivery_commit !== null) assert(SHA40.test(checkpoint.delivery_commit), 'Invalid delivery commit');
  if (checkpoint.lease !== null) {
    assert(typeof checkpoint.lease.owner === 'string' && checkpoint.lease.owner.length > 0, 'Invalid lease owner');
    assert(isTimestamp(checkpoint.lease.acquired_at), 'Invalid lease acquired_at');
    assert(isTimestamp(checkpoint.lease.heartbeat_at), 'Invalid lease heartbeat_at');
    assert(isTimestamp(checkpoint.lease.expires_at), 'Invalid lease expires_at');
  }
  return checkpoint;
}

export async function loadProjectState(root = REPO_ROOT) {
  const manifest = validateManifest(await readJson(PROJECT_PATHS.manifest, root));
  const checkpoint = validateCheckpoint(await readJson(PROJECT_PATHS.checkpoint, root), manifest);
  return { manifest, checkpoint };
}

export function getTask(manifest, taskId) {
  const task = manifest.tasks.find((item) => item.id === taskId);
  if (!task) throw new Error(`Unknown task: ${taskId}`);
  return task;
}

export function getNextTask(manifest, taskId) {
  const index = manifest.tasks.findIndex((item) => item.id === taskId);
  if (index < 0) throw new Error(`Unknown task: ${taskId}`);
  return manifest.tasks[index + 1] ?? null;
}

export function leaseIsStale(checkpoint, now = Date.now()) {
  return checkpoint.lease !== null && Date.parse(checkpoint.lease.expires_at) <= now;
}

export function createLease(owner, acquiredAt = new Date()) {
  const expiresAt = new Date(acquiredAt.getTime() + 30 * 60 * 1000);
  return {
    owner,
    acquired_at: acquiredAt.toISOString(),
    heartbeat_at: acquiredAt.toISOString(),
    expires_at: expiresAt.toISOString()
  };
}

export function refreshLease(lease, now = new Date()) {
  if (!lease) return null;
  return {
    ...lease,
    heartbeat_at: now.toISOString(),
    expires_at: new Date(now.getTime() + 30 * 60 * 1000).toISOString()
  };
}

export async function atomicWriteText(relativePath, content, root = REPO_ROOT) {
  const target = path.join(root, relativePath);
  await mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(temporary, content, 'utf8');
  await rename(temporary, target);
}

export async function atomicWriteJson(relativePath, value, root = REPO_ROOT) {
  await atomicWriteText(relativePath, `${JSON.stringify(value, null, 2)}\n`, root);
}

export function renderHandoff(checkpoint, manifest) {
  const task = getTask(manifest, checkpoint.current_task);
  const verification = checkpoint.last_verified.result;
  const blockers = checkpoint.blockers.length > 0 ? checkpoint.blockers.join('；') : '無';
  const expected = checkpoint.expected_files.length > 0 ? checkpoint.expected_files.map((item) => `\`${item}\``).join('、') : '尚未記錄';
  return `# Class3D Gallery 當前交接\n\n- 當前階段：${checkpoint.current_phase}\n- 當前任務：${checkpoint.current_task} ${task.title}\n- 狀態：${checkpoint.status}\n- 完成度：${checkpoint.progress_percent}%\n- owner：${checkpoint.owner ?? '無'}\n- 基線：${checkpoint.base_commit ?? checkpoint.baseline_commit}\n- 上次驗證：${verification}\n- 預期修改：${expected}\n- 下一步：${checkpoint.next_step}\n- 阻塞：${blockers}\n\n本檔由 checkpoint 自動產生；狀態衝突時以 \`project/checkpoint.json\` 為準。\n`;
}

export async function appendProjectEvent(checkpoint, event, detail, root = REPO_ROOT) {
  const target = path.join(root, PROJECT_PATHS.journal);
  await mkdir(path.dirname(target), { recursive: true });
  const row = {
    schema: 'class3d-project-event-v1',
    revision: checkpoint.revision,
    event,
    task: checkpoint.current_task,
    status: checkpoint.status,
    at: checkpoint.updated_at,
    detail
  };
  await appendFile(target, `${JSON.stringify(row)}\n`, 'utf8');
}

async function acquireStateLock(root = REPO_ROOT) {
  const target = path.join(root, PROJECT_PATHS.lock);
  await mkdir(path.dirname(target), { recursive: true });
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const handle = await open(target, 'wx');
      await handle.writeFile(`${JSON.stringify({ pid: process.pid, acquired_at: new Date().toISOString() })}\n`, 'utf8');
      await handle.close();
      return async () => {
        try {
          await unlink(target);
        } catch (error) {
          if (error?.code !== 'ENOENT') throw error;
        }
      };
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
      const lockStat = await stat(target);
      if (Date.now() - lockStat.mtimeMs > 30_000) {
        await unlink(target);
        continue;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  throw new Error('STATE_LOCKED: another agent is updating the checkpoint');
}

export async function updateCheckpoint(mutator, event, detail, root = REPO_ROOT) {
  const release = await acquireStateLock(root);
  try {
    const { manifest, checkpoint } = await loadProjectState(root);
    const next = structuredClone(checkpoint);
    await mutator(next, manifest);
    next.revision = checkpoint.revision + 1;
    next.updated_at = new Date().toISOString();
    next.progress_percent = calculateProgress(manifest, next.task_states);
    validateCheckpoint(next, manifest);
    await atomicWriteJson(PROJECT_PATHS.checkpoint, next, root);
    await atomicWriteText(PROJECT_PATHS.handoff, renderHandoff(next, manifest), root);
    await appendProjectEvent(next, event, detail, root);
    return { manifest, checkpoint: next };
  } finally {
    await release();
  }
}

export async function pathExists(relativePath, root = REPO_ROOT) {
  try {
    await stat(path.join(root, relativePath));
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

export function parseArguments(argv) {
  const positionals = [];
  const options = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith('--')) {
      positionals.push(value);
      continue;
    }
    const key = value.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) {
      options.set(key, true);
      continue;
    }
    const previous = options.get(key);
    if (previous === undefined) options.set(key, next);
    else if (Array.isArray(previous)) previous.push(next);
    else options.set(key, [previous, next]);
    index += 1;
  }
  return { positionals, options };
}

export function optionValues(options, key) {
  const value = options.get(key);
  if (value === undefined || value === true) return [];
  return Array.isArray(value) ? value : [value];
}
