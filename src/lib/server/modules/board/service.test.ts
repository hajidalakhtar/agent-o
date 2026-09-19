import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { testDb } from '$test/helpers/db.js';
import { CardService } from '../cards/service.js';
import type { Card } from '../cards/types.js';
import { EventService } from '../events/service.js';
import { ProjectRepository } from '../projects/repository.js';
import type { Project } from '../projects/types.js';
import type { Db } from '../persistence/db.js';
import type { BoardContext } from './machine.js';
import { BoardError, BoardService } from './service.js';

describe('BOARD-02 — transisi mencatat event moved', () => {
	let db: Db;
	let cards: CardService;
	let events: EventService;
	let board: BoardService;
	let project: Project;
	let card: Card;

	beforeEach(() => {
		db = testDb();
		project = new ProjectRepository(db).insert({
			id: 'p1',
			name: 'Demo',
			rootPath: '/tmp/demo',
			defaultBranch: 'main',
			defaultAgentId: 'a1',
			wipLimit: 3,
			permissionPolicyId: null,
			available: true,
			createdAt: Date.now()
		});
		cards = new CardService(db);
		events = new EventService(db);
		board = new BoardService(cards, events);
		card = cards.create('p1', 'Card', 'kerjakan ini');
	});

	afterEach(() => db.close());

	function context(overrides: Partial<BoardContext> = {}): BoardContext {
		return {
			card,
			project,
			projectDirtyFiles: [],
			slot: { available: true },
			agent: { determined: true, usable: true },
			branchCommits: 1,
			...overrides
		};
	}

	it('memindahkan card dan mencatat pelaku serta alasan', () => {
		const outcome = board.transition({
			card,
			to: 'in_progress',
			actor: 'user',
			reason: 'drag',
			context: context()
		});

		expect(outcome.card.status).toBe('in_progress');
		const moved = events.listByCard(card.id).at(-1);
		expect(moved?.type).toBe('moved');
		expect(moved?.payload).toMatchObject({ from: 'backlog', to: 'in_progress', actor: 'user' });
	});

	it('menolak transisi saat guard gagal dan card tidak berpindah', () => {
		expect(() =>
			board.transition({
				card,
				to: 'in_progress',
				actor: 'user',
				context: context({ card: { ...card, instruction: '' } })
			})
		).toThrow(BoardError);
		expect(cards.get(card.id)?.status).toBe('backlog');
	});

	it('menolak transisi yang tidak terdaftar', () => {
		expect(() =>
			board.transition({ card, to: 'in_review', actor: 'user', context: context() })
		).toThrow(BoardError);
	});

	it('menghapus card dengan konfirmasi dan mencatat event', () => {
		board.transition({
			card,
			to: 'deleted',
			actor: 'user',
			context: context({ confirmed: true })
		});
		expect(cards.get(card.id)).toBeUndefined();
	});
});
