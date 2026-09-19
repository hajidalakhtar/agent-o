import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const GIT_ENV = {
	...process.env,
	GIT_AUTHOR_NAME: 'agent-o test',
	GIT_AUTHOR_EMAIL: 'test@agent-o.local',
	GIT_COMMITTER_NAME: 'agent-o test',
	GIT_COMMITTER_EMAIL: 'test@agent-o.local'
};

export function scratchDir(prefix = 'agent-o-test-'): string {
	return mkdtempSync(join(tmpdir(), prefix));
}

export function git(dir: string, args: string[]): string {
	return execFileSync('git', args, { cwd: dir, env: GIT_ENV, encoding: 'utf8' });
}

export interface RepoOptions {
	branch?: string;
	commit?: boolean;
	file?: string;
	content?: string;
}

/** Membuat repo git nyata di disk untuk menguji validasi dan operasi worktree. */
export function makeRepo(options: RepoOptions = {}): string {
	const { branch = 'main', commit = true, file = 'README.md', content = '# repo\n' } = options;
	const dir = scratchDir('agent-o-repo-');
	git(dir, ['init']);
	// git 2.25 tidak mendukung `git init -b`, jadi branch di-set eksplisit.
	git(dir, ['symbolic-ref', 'HEAD', `refs/heads/${branch}`]);
	writeFileSync(join(dir, file), content);
	if (commit) {
		git(dir, ['add', '.']);
		git(dir, ['commit', '-m', 'initial']);
	}
	return dir;
}

export function makeEmptyDir(): string {
	const dir = scratchDir('agent-o-dir-');
	mkdirSync(join(dir, 'sub'), { recursive: true });
	return dir;
}

export function cleanup(...dirs: string[]): void {
	for (const dir of dirs) {
		rmSync(dir, { recursive: true, force: true });
	}
}

export function commitFile(dir: string, file: string, content: string, message = 'change'): void {
	writeFileSync(join(dir, file), content);
	git(dir, ['add', '.']);
	git(dir, ['commit', '-m', message]);
}
