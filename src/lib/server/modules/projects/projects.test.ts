import { realpathSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { testDb } from '$test/helpers/db.js';
import { cleanup, makeRepo } from '$test/helpers/repo.js';
import { AgentService } from '../agents/index.js';
import type { Db } from '../persistence/db.js';
import { ProjectRepository } from './repository.js';
import { ProjectService } from './service.js';

const created: string[] = [];

afterEach(() => {
	cleanup(...created.splice(0));
});

/** `git rev-parse --show-toplevel` mengembalikan path real, jadi symlink /var dinormalkan dulu. */
function track(dir: string): string {
	created.push(dir);
	return realpathSync(dir);
}

describe('default agent project', () => {
	let db: Db;
	let projects: ProjectService;

	beforeEach(() => {
		db = testDb();
		projects = new ProjectService(db);
	});

	afterEach(() => db.close());

	it('menyimpan agent ACP bawaan sebagai default_agent_id', async () => {
		const agent = new AgentService(db).ensureDefault();

		const project = await projects.add(track(makeRepo()), { defaultAgentId: agent.id });

		expect(project.defaultAgentId).toBe(agent.id);
		expect(projects.get(project.id)?.defaultAgentId).toBe(agent.id);
	});

	it('null bila default agent tidak ditentukan', async () => {
		const project = await projects.add(track(makeRepo()));

		expect(project.defaultAgentId).toBeNull();
	});

	it('backfill mengisi project yang belum punya default agent', () => {
		const agent = new AgentService(db).ensureDefault();
		new ProjectRepository(db).insert({
			id: 'p1',
			name: 'Demo',
			rootPath: '/tmp/agent-o-demo',
			defaultBranch: 'main',
			defaultAgentId: null,
			wipLimit: 3,
			permissionPolicyId: null,
			available: true,
			createdAt: Date.now()
		});

		projects.adoptDefaultAgent(agent.id);

		expect(projects.get('p1')?.defaultAgentId).toBe(agent.id);
	});

	it('backfill tidak menimpa default agent yang sudah diisi', () => {
		const agents = new AgentService(db);
		const bawaan = agents.ensureDefault();
		const lain = agents.create({ name: 'Lain', command: 'lain' });
		new ProjectRepository(db).insert({
			id: 'p2',
			name: 'Demo',
			rootPath: '/tmp/agent-o-demo-2',
			defaultBranch: 'main',
			defaultAgentId: lain.id,
			wipLimit: 3,
			permissionPolicyId: null,
			available: true,
			createdAt: Date.now()
		});

		projects.adoptDefaultAgent(bawaan.id);

		expect(projects.get('p2')?.defaultAgentId).toBe(lain.id);
	});
});
