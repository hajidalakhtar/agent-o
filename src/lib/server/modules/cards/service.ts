import { randomUUID } from 'node:crypto';
import type { Db } from '../persistence/db.js';
import { CardRepository } from './repository.js';
import type { Card, CardMessage, MessageRole, Run } from './types.js';

export class CardError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'CardError';
	}
}

export class CardService {
	private readonly repository: CardRepository;

	constructor(db: Db) {
		this.repository = new CardRepository(db);
	}

	get(id: string): Card | undefined {
		return this.repository.findById(id);
	}

	require(id: string): Card {
		const card = this.repository.findById(id);
		if (!card) throw new CardError(`Card ${id} tidak ditemukan.`);
		return card;
	}

	listByProject(projectId: string): Card[] {
		return this.repository.listByProject(projectId);
	}

	create(projectId: string, title: string, instruction = ''): Card {
		if (title.trim().length === 0) {
			throw new CardError('Judul card tidak boleh kosong.');
		}
		const now = Date.now();
		const card: Card = {
			id: randomUUID(),
			projectId,
			title: title.trim(),
			instruction,
			status: 'backlog',
			position: this.repository.nextPosition(projectId, 'backlog'),
			agentId: null,
			createdAt: now,
			updatedAt: now
		};
		return this.repository.insert(card);
	}

	nextPosition(projectId: string, status: Card['status']): number {
		return this.repository.nextPosition(projectId, status);
	}

	update(
		id: string,
		changes: Partial<Pick<Card, 'title' | 'instruction' | 'agentId' | 'position' | 'status'>>
	): Card {
		if (changes.title !== undefined && changes.title.trim().length === 0) {
			throw new CardError('Judul card tidak boleh kosong.');
		}
		this.repository.update(id, changes);
		return this.require(id);
	}

	remove(id: string): void {
		this.repository.delete(id);
	}

	addMessage(cardId: string, role: MessageRole, content: string, runId: string | null = null): CardMessage {
		const message: CardMessage = {
			id: randomUUID(),
			cardId,
			runId,
			role,
			content,
			createdAt: Date.now()
		};
		return this.repository.insertMessage(message);
	}

	listMessages(cardId: string): CardMessage[] {
		return this.repository.listMessages(cardId);
	}

	listRuns(cardId: string): Run[] {
		return this.repository.listRuns(cardId);
	}

	getRun(id: string): Run | undefined {
		return this.repository.findRun(id);
	}

	createRun(run: Run): Run {
		return this.repository.insertRun(run);
	}

	updateRun(
		id: string,
		changes: Partial<Pick<Run, 'sessionId' | 'worktreeId' | 'status' | 'stopReason' | 'reason' | 'endedAt'>>
	): Run | undefined {
		this.repository.updateRun(id, changes);
		return this.repository.findRun(id);
	}

	nextAttemptNo(cardId: string): number {
		return this.repository.nextAttemptNo(cardId);
	}
}
