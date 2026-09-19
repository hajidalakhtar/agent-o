import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { testDb } from '$test/helpers/db.js';
import { AgentService } from '../agents/index.js';
import { BoardService } from '../board/index.js';
import { CardService } from '../cards/index.js';
import { EventService } from '../events/index.js';
import type { Db } from '../persistence/db.js';
import { ProjectRepository } from '../projects/repository.js';
import { ProjectService } from '../projects/service.js';
import { Scheduler } from '../scheduler/index.js';
import { applyTransition, type TransitionDeps } from './service.js';

const PROJECT_ID = 'p1';

let db: Db;
let deps: TransitionDeps;
let cards: CardService;
let scheduler: Scheduler;
let agentId: string;

function newCard(title: string, instruction = 'kerjakan ini') {
	const card = cards.create(PROJECT_ID, title, instruction);
	cards.update(card.id, { agentId });
	return cards.get(card.id)!;
}

beforeEach(() => {
	db = testDb();
	const projects = new ProjectService(db);
	new ProjectRepository(db).insert({
		id: PROJECT_ID,
		name: 'Demo',
		rootPath: '/tmp/agent-o-tidak-ada',
		defaultBranch: 'main',
		defaultAgentId: null,
		wipLimit: 3,
		permissionPolicyId: null,
		available: true,
		createdAt: Date.now()
	});

	cards = new CardService(db);
	const events = new EventService(db);
	const agents = new AgentService(db);
	agentId = agents.create({ name: 'Dummy', command: 'dummy' }).id;
	scheduler = new Scheduler({
		globalLimit: () => 1,
		projectLimit: () => 3,
		agentLimit: () => null
	});
	deps = { projects, scheduler, agents, board: new BoardService(cards, events) };
});

afterEach(() => db.close());

describe('SCHED-04 — transisi ke in_progress mengambil slot WIP', () => {
	it('memindahkan card ke in_progress dan menahan slot', async () => {
		const card = newCard('Card');
		const moved = await applyTransition(deps, card, { to: 'in_progress' });

		expect(moved.status).toBe('in_progress');
		expect(scheduler.isRunning(card.id)).toBe(true);
	});

	it('menolak saat WIP penuh tanpa meninggalkan entri antrean', async () => {
		const first = newCard('Pertama');
		const second = newCard('Kedua');
		await applyTransition(deps, first, { to: 'in_progress' });

		await expect(applyTransition(deps, second, { to: 'in_progress' })).rejects.toThrow(
			/Batas WIP global/
		);
		expect(cards.get(second.id)?.status).toBe('backlog');
		expect(scheduler.isRunning(second.id)).toBe(false);
		expect(scheduler.position(second.id)).toBe(0);
	});

	it('melepas slot yang sudah diambil bila guard lain gagal', async () => {
		const card = newCard('Tanpa instruksi', '   ');

		await expect(applyTransition(deps, card, { to: 'in_progress' })).rejects.toThrow(
			/Instruksi card masih kosong/
		);
		expect(scheduler.isRunning(card.id)).toBe(false);
	});

	it('melepas slot saat card meninggalkan in_progress (SCHED-03)', async () => {
		const card = newCard('Card');
		await applyTransition(deps, card, { to: 'in_progress' });

		await applyTransition(deps, cards.get(card.id)!, { to: 'blocked' });

		expect(scheduler.isRunning(card.id)).toBe(false);
	});
});
