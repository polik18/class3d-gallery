import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { loadProjectState, pathExists, PROJECT_PATHS, readJson, REPO_ROOT } from './lib/project-state.mjs';

function git(args) {
  return execFileSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
}

try {
  const { manifest, checkpoint } = await loadProjectState();
  if (await pathExists(PROJECT_PATHS.lock)) throw new Error('Checkpoint lock exists; inspect for an active or interrupted writer');
  await readJson('project/schemas/checkpoint.schema.json');
  await readJson('project/schemas/task.schema.json');

  for (const task of manifest.tasks) {
    if (!(await pathExists(task.task_doc))) throw new Error(`Missing task document: ${task.task_doc}`);
  }
  if (!(await pathExists(PROJECT_PATHS.handoff))) throw new Error('Missing current handoff');

  const journalText = await readFile(path.join(REPO_ROOT, PROJECT_PATHS.journal), 'utf8');
  const events = journalText.split(/\r?\n/).filter(Boolean).map((line, index) => {
    try {
      return JSON.parse(line);
    } catch {
      throw new Error(`Invalid journal JSON at line ${index + 1}`);
    }
  });
  if (events.length === 0) throw new Error('Project journal is empty');
  const latestRevision = Math.max(...events.map((event) => event.revision));
  if (latestRevision !== checkpoint.revision) throw new Error(`Journal revision ${latestRevision} does not match checkpoint ${checkpoint.revision}`);

  const branch = git(['branch', '--show-current']);
  if (branch !== checkpoint.branch) throw new Error(`Current branch ${branch} does not match checkpoint ${checkpoint.branch}`);
  git(['cat-file', '-e', `${checkpoint.baseline_commit}^{commit}`]);
  if (checkpoint.delivery_commit) git(['cat-file', '-e', `${checkpoint.delivery_commit}^{commit}`]);

  for (const evidence of checkpoint.last_verified.evidence) {
    if (!(await pathExists(evidence))) throw new Error(`Missing evidence: ${evidence}`);
  }

  console.log(`PASS project state revision ${checkpoint.revision}`);
  console.log(`Current ${checkpoint.current_task} ${checkpoint.status}; progress ${checkpoint.progress_percent}%`);
} catch (error) {
  console.error(`PROJECT_STATE_INVALID: ${error.message}`);
  process.exitCode = 1;
}
