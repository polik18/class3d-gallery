import { execFileSync } from 'node:child_process';
import { leaseIsStale, loadProjectState, REPO_ROOT } from './lib/project-state.mjs';

function git(args) {
  return execFileSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
}

try {
  const { checkpoint } = await loadProjectState();
  const branch = git(['branch', '--show-current']);
  const head = git(['rev-parse', 'HEAD']);
  const changes = git(['status', '--short']);
  const stale = leaseIsStale(checkpoint);

  console.log(`專案：${checkpoint.project}`);
  console.log(`階段／任務：${checkpoint.current_phase} / ${checkpoint.current_task}`);
  console.log(`狀態／進度：${checkpoint.status} / ${checkpoint.progress_percent}%`);
  console.log(`分支：${branch}${branch === checkpoint.branch ? '' : `（checkpoint 預期 ${checkpoint.branch}）`}`);
  console.log(`HEAD：${head}`);
  console.log(`Owner：${checkpoint.owner ?? '無'}`);
  console.log(`Lease：${checkpoint.lease ? (stale ? '已過期，可進行恢復稽核' : `有效至 ${checkpoint.lease.expires_at}`) : '無'}`);
  console.log(`上次驗證：${checkpoint.last_verified.result}`);
  console.log(`下一步：${checkpoint.next_step}`);
  console.log(`工作樹：${changes ? '有未提交修改' : '乾淨'}`);
  if (changes) console.log(changes);

  if (branch !== checkpoint.branch || stale || (checkpoint.status === 'IN_PROGRESS' && !changes && head === checkpoint.base_commit)) {
    console.log('恢復提示：執行 npm run project:validate，再依 handoff 判斷續作。');
  }
} catch (error) {
  console.error(`PROJECT_STATUS_ERROR: ${error.message}`);
  process.exitCode = 1;
}
