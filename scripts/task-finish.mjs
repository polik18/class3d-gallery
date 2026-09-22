import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { atomicWriteText, getNextTask, optionValues, parseArguments, pathExists, REPO_ROOT, updateCheckpoint } from './lib/project-state.mjs';

function git(args) {
  return execFileSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
}

const { positionals, options } = parseArguments(process.argv.slice(2));
const taskId = positionals[0];
const deliveryCommit = options.get('commit');
const evidence = optionValues(options, 'evidence');

if (!taskId || typeof deliveryCommit !== 'string' || evidence.length === 0) {
  console.error('Usage: npm run task:finish -- <task-id> --commit <40-char-sha> --evidence <path>');
  process.exit(2);
}

try {
  if (!/^[a-f0-9]{40}$/.test(deliveryCommit)) throw new Error('Delivery commit must be a full 40-character SHA');
  git(['cat-file', '-e', `${deliveryCommit}^{commit}`]);
  for (const item of evidence) {
    if (!(await pathExists(item))) throw new Error(`Evidence does not exist: ${item}`);
  }

  const state = await updateCheckpoint((checkpoint, manifest) => {
    if (checkpoint.current_task !== taskId) throw new Error(`Current task is ${checkpoint.current_task}, not ${taskId}`);
    if (checkpoint.status !== 'VERIFYING') throw new Error(`${taskId} is ${checkpoint.status}, expected VERIFYING`);
    if (checkpoint.last_verified.result !== 'PASS') throw new Error('Last verification result is not PASS');
    checkpoint.task_states[taskId] = 'ACCEPTED';
    checkpoint.delivery_commit = deliveryCommit;
    checkpoint.lease = null;
    checkpoint.owner = null;
    checkpoint.blockers = [];
    checkpoint.last_verified.evidence = [...new Set([...checkpoint.last_verified.evidence, ...evidence])];

    const nextTask = getNextTask(manifest, taskId);
    if (nextTask) {
      checkpoint.current_phase = nextTask.phase;
      checkpoint.current_task = nextTask.id;
      checkpoint.status = checkpoint.task_states[nextTask.id];
      checkpoint.started_at = null;
      checkpoint.expected_files = [];
      checkpoint.next_step = `執行 npm run task:start -- ${nextTask.id}`;
    } else {
      checkpoint.status = 'ACCEPTED';
      checkpoint.next_step = '所有計畫任務已完成；執行最終發布確認';
    }
  }, 'TASK_ACCEPTED', `${taskId} accepted at ${deliveryCommit}`);

  const archivePath = `project/handoffs/archive/${taskId}-accepted-r${state.checkpoint.revision}.md`;
  const archive = `# ${taskId} 驗收交接\n\n- 狀態：ACCEPTED\n- Delivery commit：${deliveryCommit}\n- Evidence：${evidence.map((item) => `\`${item}\``).join('、')}\n- 驗證命令：${state.checkpoint.last_verified.commands.map((item) => `\`${item}\``).join('、')}\n- 下一個任務：${state.checkpoint.current_task}\n- 下一步：${state.checkpoint.next_step}\n`;
  await atomicWriteText(archivePath, archive);
  console.log(`ACCEPTED ${taskId}; next ${state.checkpoint.current_task}; archive ${path.normalize(archivePath)}`);
} catch (error) {
  console.error(`TASK_FINISH_ERROR: ${error.message}`);
  process.exitCode = 1;
}
