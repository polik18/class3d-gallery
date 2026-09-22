import { execFileSync } from 'node:child_process';
import { createLease, getTask, parseArguments, REPO_ROOT, updateCheckpoint } from './lib/project-state.mjs';

function git(args) {
  return execFileSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
}

const { positionals, options } = parseArguments(process.argv.slice(2));
const taskId = positionals[0];
const owner = options.get('owner') || process.env.USER || 'cli-agent';

if (!taskId) {
  console.error('Usage: npm run task:start -- <task-id> [--owner name]');
  process.exit(2);
}

try {
  const head = git(['rev-parse', 'HEAD']);
  const result = await updateCheckpoint((checkpoint, manifest) => {
    const task = getTask(manifest, taskId);
    if (checkpoint.task_states[taskId] !== 'PENDING') throw new Error(`${taskId} is ${checkpoint.task_states[taskId]}, expected PENDING`);
    for (const dependency of task.depends_on) {
      if (checkpoint.task_states[dependency] !== 'ACCEPTED') throw new Error(`Dependency ${dependency} is not ACCEPTED`);
    }
    const now = new Date();
    checkpoint.current_phase = task.phase;
    checkpoint.current_task = task.id;
    checkpoint.status = 'IN_PROGRESS';
    checkpoint.task_states[task.id] = 'IN_PROGRESS';
    checkpoint.owner = String(owner);
    checkpoint.started_at = now.toISOString();
    checkpoint.base_commit = head;
    checkpoint.delivery_commit = null;
    checkpoint.lease = createLease(String(owner), now);
    checkpoint.expected_files = task.outputs;
    checkpoint.next_step = `執行 ${task.id}：${task.title}`;
    checkpoint.blockers = [];
  }, 'TASK_STARTED', `${taskId} started by ${owner}`);
  console.log(`STARTED ${result.checkpoint.current_task} revision ${result.checkpoint.revision}`);
} catch (error) {
  console.error(`TASK_START_ERROR: ${error.message}`);
  process.exitCode = 1;
}
