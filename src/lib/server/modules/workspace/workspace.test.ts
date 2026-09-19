import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { testDb } from '$test/helpers/db.js';
import { cleanup, commitFile, git, makeRepo, scratchDir } from '$test/helpers/repo.js';
import type { Card } from '../cards/types.js';
import type { Db } from '../persistence/db.js';
import type { Project } from '../projects/types.js';
import { WorkspaceService } from './service.js';
import { WorkspaceError } from './types.js';

const created: string[] = [];
afterEach(() => cleanup(...created.splice(0)));

function track(dir: string): string {
	created.push(dir);
	return dir;
}

interface Fixture {
	db: Db;
	workspace: WorkspaceService;
	project: Project;
	card: Card;
}

/** Worktree punya FK ke card, jadi project + card harus benar-benar ada di DB. */
function fixture(repoPath: string): Fixture {
	const db = testDb();
	const worktreesRoot = track(scratchDir('agent-o-wt-root-'));

	const project: Project = {
		id: 'p1',
		name: 'Demo',
		rootPath: repoPath,
		defaultBranch: 'main',
		defaultAgentId: null,
		wipLimit: 3,
		permissionPolicyId: null,
		available: true,
		createdAt: 1
	};
	const card: Card = {
		id: 'card1234-abcd',
		projectId: project.id,
		title: 'Tambah fitur login',
		instruction: 'kerjakan',
		status: 'backlog',
		position: 0,
		agentId: null,
		createdAt: 1,
		updatedAt: 1
	};

	db.run(
		`INSERT INTO project (id, name, root_path, default_branch, wip_limit, available, created_at)
		 VALUES (?, ?, ?, ?, ?, 1, ?)`,
		[project.id, project.name, project.rootPath, project.defaultBranch, project.wipLimit, project.createdAt]
	);
	db.run(
		`INSERT INTO card (id, project_id, title, instruction, status, position, created_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		[card.id, card.projectId, card.title, card.instruction, card.status, card.position, card.createdAt, card.updatedAt]
	);

	return { db, workspace: new WorkspaceService(db, { worktreesRoot }), project, card };
}

describe('WS-01/WS-02/WS-03 — pembuatan worktree', () => {
	it('membuat satu worktree + branch dari branch utama dan mencatat base_sha', async () => {
		const repo = track(makeRepo());
		const { workspace, project, card } = fixture(repo);

		const worktree = await workspace.create(card, project);

		expect(worktree.branch).toBe('agent-o/tambah-fitur-login-card1234');
		expect(worktree.state).toBe('active');
		expect(worktree.baseSha).toBe(git(repo, ['rev-parse', 'main']).trim());
		expect(worktree.headSha).toBe(worktree.baseSha);
		expect(existsSync(worktree.path)).toBe(true);
	});

	it('menaruh worktree di luar folder project (WS-03)', async () => {
		const repo = track(makeRepo());
		const root = track(scratchDir('agent-o-wt-root-'));
		const { db, project, card } = fixture(repo);
		const workspace = new WorkspaceService(db, { worktreesRoot: root });

		const worktree = await workspace.create(card, project);

		expect(worktree.path.startsWith(repo)).toBe(false);
		expect(worktree.path.startsWith(root)).toBe(true);
	});

	it('menghasilkan branch berbeda bila nama branch sudah dipakai', async () => {
		const repo = track(makeRepo());
		git(repo, ['branch', 'agent-o/tambah-fitur-login-card1234']);
		const { workspace, project, card } = fixture(repo);

		const worktree = await workspace.create(card, project);
		expect(worktree.branch).not.toBe('agent-o/tambah-fitur-login-card1234');
		expect(worktree.branch.startsWith('agent-o/tambah-fitur-login-card1234')).toBe(true);
	});

	it('menolak bila working tree project kotor (WS-04)', async () => {
		const repo = track(makeRepo());
		writeFileSync(join(repo, 'kotor.txt'), 'x');
		const { workspace, project, card } = fixture(repo);

		await expect(workspace.create(card, project)).rejects.toThrow(WorkspaceError);
	});

	it('mengembalikan worktree yang sama bila card sudah punya worktree', async () => {
		const repo = track(makeRepo());
		const { workspace, project, card } = fixture(repo);

		const first = await workspace.create(card, project);
		const second = await workspace.create(card, project);
		expect(second.id).toBe(first.id);
	});
});

describe('WS-06 / DONE-08 — commit di worktree dan freeze', () => {
	it('menghitung commit di atas base_sha', async () => {
		const repo = track(makeRepo());
		const { workspace, project, card } = fixture(repo);
		const worktree = await workspace.create(card, project);

		expect(await workspace.commitCount(worktree)).toBe(0);
		commitFile(worktree.path, 'baru.txt', 'halo', 'commit agent');
		expect(await workspace.commitCount(worktree)).toBe(1);
	});

	it('freeze merekam head_sha dan mengubah state, lalu menolak pergerakan', async () => {
		const repo = track(makeRepo());
		const { workspace, project, card } = fixture(repo);
		const worktree = await workspace.create(card, project);
		commitFile(worktree.path, 'baru.txt', 'halo', 'commit agent');

		const frozen = await workspace.freeze(worktree);
		expect(frozen.state).toBe('frozen');
		expect(frozen.headSha).toBe(git(worktree.path, ['rev-parse', 'HEAD']).trim());
		expect(() => workspace.assertActive(frozen)).toThrow(WorkspaceError);
	});
});

describe('WS-05/WS-07 — cleanup idempoten', () => {
	it('menghapus worktree + branch dan aman dipanggil dua kali', async () => {
		const repo = track(makeRepo());
		const { workspace, project, card } = fixture(repo);
		const worktree = await workspace.create(card, project);

		await workspace.remove(worktree, project);
		await workspace.remove(worktree, project);

		expect(existsSync(worktree.path)).toBe(false);
		expect(workspace.findByCard(worktree.cardId)).toBeUndefined();
		expect(git(repo, ['branch', '--list', worktree.branch]).trim()).toBe('');
	});

	it('menyapu worktree yatim yang card-nya sudah tidak ada (PERSIST-10)', async () => {
		const repo = track(makeRepo());
		const { workspace, project, card } = fixture(repo);
		const worktree = await workspace.create(card, project);

		const result = await workspace.sweepOrphans(
			(id) => (id === project.id ? project : undefined),
			() => false
		);

		expect(result.removed).toBe(1);
		expect(existsSync(worktree.path)).toBe(false);
	});

	it('menghapus direktori yatim yang tidak tercatat', async () => {
		const repo = track(makeRepo());
		const { workspace, project, card } = fixture(repo);
		const worktree = await workspace.create(card, project);

		const orphanDir = join(dirname(worktree.path), 'card-yang-tidak-ada');
		mkdirSync(orphanDir, { recursive: true });

		const result = await workspace.sweepOrphans(
			(id) => (id === project.id ? project : undefined),
			() => true
		);

		expect(result.orphanDirs).toBe(1);
		expect(existsSync(orphanDir)).toBe(false);
	});
});
