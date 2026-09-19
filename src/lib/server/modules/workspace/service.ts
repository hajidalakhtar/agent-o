import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { Card } from '../cards/types.js';
import * as git from '../git/index.js';
import type { Db } from '../persistence/db.js';
import type { Project } from '../projects/types.js';
import { WorktreeRepository } from './repository.js';
import { WorkspaceError, type Worktree } from './types.js';

export interface WorkspaceOptions {
	/** Direktori induk seluruh worktree (<app_data>/worktrees). */
	worktreesRoot: string;
}

function slugify(value: string): string {
	return (
		value
			.toLowerCase()
			.normalize('NFKD')
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-+|-+$/g, '')
			.slice(0, 40) || 'card'
	);
}

export class WorkspaceService {
	private readonly repository: WorktreeRepository;

	constructor(
		db: Db,
		private readonly options: WorkspaceOptions
	) {
		this.repository = new WorktreeRepository(db);
	}

	/** branch: agent-o/<slug-card>-<short-id> (spesifikasi penamaan). */
	branchName(card: Card): string {
		return `agent-o/${slugify(card.title)}-${card.id.slice(0, 8)}`;
	}

	/** worktree: <app_data>/worktrees/<project-id>/<card-id> — di luar folder project (WS-03). */
	worktreePath(project: Project, card: Card): string {
		return join(this.options.worktreesRoot, project.id, card.id);
	}

	findByCard(cardId: string): Worktree | undefined {
		return this.repository.findByCard(cardId);
	}

	list(): Worktree[] {
		return this.repository.list();
	}

	listByState(state: Worktree['state']): Worktree[] {
		return this.repository.listByState(state);
	}

	/**
	 * WS-01/WS-02/WS-04: membuat worktree + branch dari branch utama, dengan
	 * pemeriksaan ulang kondisi project (PROJECT-06).
	 */
	async create(card: Card, project: Project): Promise<Worktree> {
		if (!project.available) {
			throw new WorkspaceError('Project tidak tersedia.');
		}

		const dirty = await git.statusPorcelain(project.rootPath);
		if (dirty.length > 0) {
			throw new WorkspaceError(
				`Working tree project kotor: ${dirty
					.map((line) => line.slice(3))
					.slice(0, 5)
					.join(', ')}`
			);
		}

		const existing = this.repository.findByCard(card.id);
		if (existing) return existing;

		const baseSha = await git.revParse(project.rootPath, project.defaultBranch);
		const desiredBranch = this.branchName(card);
		let branch = desiredBranch;
		if (await git.branchExists(project.rootPath, branch)) {
			branch = `${desiredBranch}-${Date.now().toString(36)}`;
		}
		const path = this.worktreePath(project, card);

		mkdirSync(dirname(path), { recursive: true });

		try {
			await git.addWorktree(project.rootPath, path, branch, project.defaultBranch);
		} catch (error) {
			// Bersihkan sisa worktree setengah jadi agar tidak meninggalkan sampah.
			await git.removeWorktree(project.rootPath, path).catch(() => {});
			await git.deleteBranch(project.rootPath, branch).catch(() => {});
			rmSync(path, { recursive: true, force: true });
			throw new WorkspaceError(`Gagal membuat worktree: ${(error as Error).message}`);
		}

		const worktree: Worktree = {
			id: randomUUID(),
			cardId: card.id,
			path,
			branch,
			baseSha,
			headSha: baseSha,
			state: 'active',
			createdAt: Date.now()
		};
		return this.repository.insert(worktree);
	}

	/** Jumlah commit di atas base_sha pada branch card (guard DONE-08). */
	async commitCount(worktree: Worktree): Promise<number> {
		if (!worktree.baseSha) return 0;
		return git.revListCount(worktree.path, `${worktree.baseSha}..HEAD`);
	}

	async headSha(worktree: Worktree): Promise<string> {
		return git.revParse(worktree.path, 'HEAD');
	}

	/** WS-06: worktree frozen tidak boleh menerima commit/rebase baru. */
	assertActive(worktree: Worktree): void {
		if (worktree.state !== 'active') {
			throw new WorkspaceError(
				`Worktree berstatus ${worktree.state}; hanya worktree active yang boleh bergerak.`
			);
		}
	}

	async refreshHead(worktree: Worktree): Promise<Worktree> {
		const head = await this.headSha(worktree);
		this.repository.update(worktree.id, { headSha: head });
		return { ...worktree, headSha: head };
	}

	async freeze(worktree: Worktree): Promise<Worktree> {
		const head = await this.headSha(worktree);
		this.repository.update(worktree.id, { headSha: head, state: 'frozen' });
		return { ...worktree, headSha: head, state: 'frozen' };
	}

	async updateBase(worktree: Worktree, baseSha: string): Promise<Worktree> {
		this.repository.update(worktree.id, { baseSha, headSha: await this.headSha(worktree) });
		return { ...worktree, baseSha };
	}

	/**
	 * WS-05/WS-07: hapus worktree + branch. Idempoten — boleh dipanggil
	 * berulang tanpa efek samping.
	 */
	async remove(worktree: Worktree, project: Project): Promise<void> {
		await git.removeWorktree(project.rootPath, worktree.path).catch(() => {});
		rmSync(worktree.path, { recursive: true, force: true });
		await git.deleteBranch(project.rootPath, worktree.branch).catch(() => {});
		await git.pruneWorktrees(project.rootPath).catch(() => {});
		this.repository.update(worktree.id, { state: 'removed' });
	}

	markMerged(worktree: Worktree): void {
		this.repository.update(worktree.id, { state: 'merged' });
	}

	/**
	 * WS-07/PERSIST-10: sapu worktree yatim saat aplikasi start. Worktree
	 * dicocokkan lewat metadata, bukan nama folder.
	 */
	async sweepOrphans(
		resolveProject: (projectId: string) => Project | undefined,
		cardExists: (cardId: string) => boolean
	): Promise<{ removed: number; orphanDirs: number }> {
		let removed = 0;

		for (const worktree of this.repository.list()) {
			if (worktree.state === 'removed') {
				rmSync(worktree.path, { recursive: true, force: true });
				continue;
			}
			const card = cardExists(worktree.cardId);
			const stale = !card || worktree.state === 'merged';
			if (!stale) continue;

			const project = resolveProject(this.projectIdOf(worktree));
			if (project) await this.remove(worktree, project);
			else {
				rmSync(worktree.path, { recursive: true, force: true });
				this.repository.update(worktree.id, { state: 'removed' });
			}
			removed += 1;
		}

		// Direktori yatim: ada di disk tapi tidak tercatat di metadata.
		let orphanDirs = 0;
		const known = new Set(this.repository.list().map((worktree) => worktree.path));
		const root = this.options.worktreesRoot;
		if (existsSync(root)) {
			const projectRoots = this.listProjectDirs(root);
			for (const projectDir of projectRoots) {
				for (const cardDir of this.listProjectDirs(projectDir)) {
					if (known.has(cardDir)) continue;
					rmSync(cardDir, { recursive: true, force: true });
					orphanDirs += 1;
				}
			}
		}

		return { removed, orphanDirs };
	}

	private listProjectDirs(dir: string): string[] {
		try {
			return readdirSync(dir)
				.map((name) => join(dir, name))
				.filter((candidate) => statSync(candidate).isDirectory());
		} catch {
			return [];
		}
	}

	private projectIdOf(worktree: Worktree): string {
		// <root>/<project-id>/<card-id>
		const parts = worktree.path.split(/[\\/]/);
		return parts.at(-2) ?? '';
	}
}
