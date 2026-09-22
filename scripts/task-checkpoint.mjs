import { execFileSync } from 'node:child_process';
import { optionValues, parseArguments, pathExists, refreshLease, REPO_ROOT, TASK_STATUSES, updateCheckpoint } from './lib/project-state.mjs';

function git(args) {
  return execFileSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
}

const { options } = parseArguments(process.argv.slice(2));
const nextStep = options.get('next');
const requestedStatus = options.get('status');
const commands = optionValues(options, 'command');
const evidence = optionValues(options, 'evidence');
const files = optionValues(options, 'file');
const resultText = options.get('result');

if (typeof nextStep !== 'string' || nextStep.length === 0) {
  console.error('Usage: npm run task:checkpoint -- --next "next step" [--status VERIFYING] [--command cmd] [--result PASS] [--evidence path]');
  process.exit(2);
}

try {
  for (const item of evidence) {
    if (!(await pathExists(item))) throw new Error(`Evidence does not exist: ${item}`);
  }
  const head = git(['rev-parse', 'HEAD']);
  const state = await updateCheckpoint((checkpoint) => {
    if (!['IN_PROGRESS', 'VERIFYING', 'NEEDS_FIX', 'BLOCKED', 'RECOVERY_REQUIRED'].includes(checkpoint.status)) {
      throw new Error(`Cannot checkpoint task in ${checkpoint.status}`);
    }
    const status = requestedStatus || checkpoint.status;
    if (!TASK_STATUSES.has(status) || status === 'PENDING' || status === 'ACCEPTED') throw new Error(`Invalid checkpoint status: ${status}`);
    checkpoint.status = status;
    checkpoint.task_states[checkpoint.current_task] = status;
    checkpoint.next_step = nextStep;
    checkpoint.lease = refreshLease(checkpoint.lease);
    if (files.length > 0) checkpoint.expected_files = [...new Set([...checkpoint.expected_files, ...files])];
    if (commands.length > 0 || evidence.length > 0 || resultText) {
      checkpoint.last_verified = {
        commit: head,
        commands: commands.length > 0 ? commands : checkpoint.last_verified.commands,
        result: resultText || checkpoint.last_verified.result,
        evidence: evidence.length > 0 ? evidence : checkpoint.last_verified.evidence
      };
    }
  }, 'TASK_CHECKPOINTED', nextStep);
  console.log(`CHECKPOINTED ${state.checkpoint.current_task} ${state.checkpoint.status} revision ${state.checkpoint.revision}`);
} catch (error) {
  console.error(`TASK_CHECKPOINT_ERROR: ${error.message}`);
  process.exitCode = 1;
}
