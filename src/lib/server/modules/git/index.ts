import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface GitResult {
	stdout: string;
	stderr: string;
	code: number;
}

export class GitError extends Error {
	readonly args: string[];
	readonly code: number;
	readonly stderr: string;

	constructor(args: string[], code: number, stderr: string, message?: string) {
		super(message ?? `git ${args.join(' ')} gagal (exit ${code}): ${stderr.trim() || 'tanpa pesan'}`);
		this.name = 'GitError';
		this.args = args;
		this.code = code;
		this.stderr = stderr;
	}
}

async function git(
	cwd: string,
	args: string[],
	allowFailure = false
): Promise<GitResult> {
	try {
		const { stdout, stderr } = await execFileAsync('git', args, {
			cwd,
			maxBuffer: 64 * 1024 * 1024,
			env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_OPTIONAL_LOCKS: '0' }
		});
		return { stdout, stderr, code: 0 };
	} catch (error) {
		const e = error as NodeJS.ErrnoException & { stdout?: string; stderr?: string };
		const code = typeof e.code === 'number' ? e.code : 1;
		const result = { stdout: e.stdout ?? '', stderr: e.stderr ?? '', code };
		if (allowFailure) return result;
		throw new GitError(args, code, result.stderr, e.code === 'ENOENT' ? 'git tidak ditemukan di PATH' : undefined);
	}
}

export async function isInsideWorkTree(path: string): Promise<boolean> {
	const result = await git(path, ['rev-parse', '--is-inside-work-tree'], true);
	return result.code === 0 && result.stdout.trim() === 'true';
}

export async function showToplevel(path: string): Promise<string | null> {
	const result = await git(path, ['rev-parse', '--show-toplevel'], true);
	return result.code === 0 ? result.stdout.trim() : null;
}

/** null berarti detached HEAD. */
export async function currentBranch(path: string): Promise<string | null> {
	const result = await git(path, ['symbolic-ref', '-q', '--short', 'HEAD'], true);
	return result.code === 0 ? result.stdout.trim() : null;
}

export async function hasCommit(path: string): Promise<boolean> {
	const result = await git(path, ['rev-parse', '--verify', 'HEAD'], true);
	return result.code === 0;
}

export async function statusPorcelain(path: string): Promise<string[]> {
	const result = await git(path, ['status', '--porcelain']);
	return result.stdout
		.split('\n')
		.map((line) => line.trimEnd())
		.filter((line) => line.length > 0);
}

export async function branchExists(path: string, branch: string): Promise<boolean> {
	const result = await git(path, ['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`], true);
	return result.code === 0;
}

/** Deteksi branch utama, urutan mengikuti spec/project.md. */
export async function detectDefaultBranch(path: string): Promise<string | null> {
	const originHead = await git(path, ['symbolic-ref', '-q', '--short', 'refs/remotes/origin/HEAD'], true);
	if (originHead.code === 0) {
		const name = originHead.stdout.trim().replace(/^origin\//, '');
		if (name) return name;
	}

	const configured = await git(path, ['config', '--get', 'init.defaultBranch'], true);
	if (configured.code === 0) {
		const name = configured.stdout.trim();
		if (name && (await branchExists(path, name))) return name;
	}

	for (const candidate of ['main', 'master']) {
		if (await branchExists(path, candidate)) return candidate;
	}
	return null;
}

export async function revParse(path: string, ref: string): Promise<string> {
	const result = await git(path, ['rev-parse', ref]);
	return result.stdout.trim();
}

export async function mergeBase(path: string, a: string, b: string): Promise<string> {
	const result = await git(path, ['merge-base', a, b]);
	return result.stdout.trim();
}

export async function revListCount(path: string, range: string): Promise<number> {
	const result = await git(path, ['rev-list', '--count', range]);
	return Number.parseInt(result.stdout.trim(), 10) || 0;
}

export interface WorktreeInfo {
	path: string;
	head: string | null;
	branch: string | null;
}

export async function listWorktrees(path: string): Promise<WorktreeInfo[]> {
	const result = await git(path, ['worktree', 'list', '--porcelain']);
	const entries: WorktreeInfo[] = [];
	let current: Partial<WorktreeInfo> | null = null;

	for (const line of result.stdout.split('\n')) {
		if (line.startsWith('worktree ')) {
			if (current?.path) entries.push(current as WorktreeInfo);
			current = { path: line.slice('worktree '.length).trim(), head: null, branch: null };
		} else if (line.startsWith('HEAD ') && current) {
			current.head = line.slice('HEAD '.length).trim();
		} else if (line.startsWith('branch ') && current) {
			current.branch = line.slice('branch '.length).trim().replace(/^refs\/heads\//, '');
		}
	}
	if (current?.path) entries.push(current as WorktreeInfo);
	return entries;
}

export async function addWorktree(
	repoPath: string,
	worktreePath: string,
	branch: string,
	startPoint: string
): Promise<void> {
	await git(repoPath, ['worktree', 'add', '-b', branch, worktreePath, startPoint]);
}

export async function removeWorktree(repoPath: string, worktreePath: string): Promise<void> {
	await git(repoPath, ['worktree', 'remove', '--force', worktreePath]);
}

export async function pruneWorktrees(repoPath: string): Promise<void> {
	await git(repoPath, ['worktree', 'prune']);
}

export async function deleteBranch(repoPath: string, branch: string): Promise<void> {
	await git(repoPath, ['branch', '-D', branch]);
}

export interface DiffStat {
	fileCount: number;
	insertions: number;
	deletions: number;
	files: { path: string; insertions: number; deletions: number; binary: boolean }[];
}

/** Diff dari pasangan SHA beku (REVIEW-02), bukan dari nama branch. */
export async function diffStat(repoPath: string, baseSha: string, headSha: string): Promise<DiffStat> {
	const result = await git(repoPath, ['diff', '--numstat', baseSha, headSha]);
	const files: DiffStat['files'] = [];
	let insertions = 0;
	let deletions = 0;

	for (const line of result.stdout.split('\n')) {
		if (!line.trim()) continue;
		const [added, removed, ...rest] = line.split('\t');
		const path = rest.join('\t');
		const binary = added === '-' || removed === '-';
		const adds = binary ? 0 : Number.parseInt(added, 10) || 0;
		const dels = binary ? 0 : Number.parseInt(removed, 10) || 0;
		insertions += adds;
		deletions += dels;
		files.push({ path, insertions: adds, deletions: dels, binary });
	}

	return { fileCount: files.length, insertions, deletions, files };
}

export async function diffPatch(repoPath: string, baseSha: string, headSha: string, path?: string): Promise<string> {
	const args = ['diff', baseSha, headSha];
	if (path) args.push('--', path);
	const result = await git(repoPath, args);
	return result.stdout;
}

export interface MergeResult {
	ok: boolean;
	conflicted: boolean;
	mergeSha: string | null;
	message: string;
}

/** Merge `--no-ff` (REVIEW-05). Konflik dikembalikan, bukan dilempar. */
export async function mergeNoFf(repoPath: string, branch: string, message: string): Promise<MergeResult> {
	const result = await git(repoPath, ['merge', '--no-ff', '--no-edit', '-m', message, branch], true);
	if (result.code === 0) {
		const sha = await git(repoPath, ['rev-parse', 'HEAD'], true);
		return { ok: true, conflicted: false, mergeSha: sha.stdout.trim() || null, message: result.stdout.trim() };
	}
	const conflicted = result.stdout.includes('CONFLICT') || result.stderr.includes('CONFLICT');
	if (conflicted) {
		await git(repoPath, ['merge', '--abort'], true);
	}
	return { ok: false, conflicted, mergeSha: null, message: (result.stderr || result.stdout).trim() };
}

export { git };
